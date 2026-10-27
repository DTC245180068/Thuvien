"""
Module: ai_reader_agent.py
Chức năng: Trợ lý AI Thông minh cho Độc giả SmartLib tuân thủ chặt chẽ
Mô hình 2: Function Calling (Tool Calling) trong ứng dụng AI tạo sinh.

Cơ chế 5 bước:
(1) Người dùng gửi câu hỏi (Prompt) -> Kiểm soát chặt chẽ các trường hợp biên (Độ dài, Ký tự vô nghĩa, Prompt/SQL Injection, API Key).
(2) Backend gửi Prompt + Danh sách Tool / Function Definitions tới LLM (Google Gemini 2.0/1.5 Flash hoặc OpenAI GPT-4o-mini).
(3) LLM phân tích, KHÔNG THỰC THI HÀM, sinh JSON chứa tên hàm + tham số.
(4) Backend parse JSON, kiểm tra tính hợp lệ & quyền hạn, thực thi hàm truy vấn CSDL.
(5) Gửi kết quả về LLM để sinh phản hồi tự nhiên cuối cùng cho Độc giả (kèm kiểm soát Domain Guardrail cho câu hỏi ngoài phạm vi).
"""

import os
import re
import json
import ast
import operator
import urllib.request
import urllib.error
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db_manager

router = APIRouter(prefix="/api/ai", tags=["AI Reader Function Calling"])

MAX_READER_PROMPT_LENGTH = 1000
MIN_READER_PROMPT_LENGTH = 2

# =========================================================================
# 1. DANH SÁCH FUNCTION DEFINITIONS (JSON SCHEMA CUNG CẤP CHO LLM)
# =========================================================================

READER_FUNCTION_DEFINITIONS = [
    {
        "name": "search_books",
        "description": "Tìm kiếm sách trong kho thư viện theo từ khóa tên sách, thể loại, hoặc tên tác giả.",
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "Từ khóa tìm kiếm trong tên sách hoặc nội dung tóm tắt"
                },
                "category": {
                    "type": "string",
                    "description": "Thể loại sách (ví dụ: Công nghệ, Kỹ năng sống, Kinh tế, Văn học, Kỳ ảo, Khoa học, Lịch sử)"
                },
                "author": {
                    "type": "string",
                    "description": "Tên tác giả cần tìm"
                }
            }
        }
    },
    {
        "name": "check_book_availability",
        "description": "Kiểm tra tình trạng số lượng sách sẵn sàng cho mượn trong kho (available_copies), tổng số bản và vị trí kệ.",
        "parameters": {
            "type": "object",
            "properties": {
                "book_title": {
                    "type": "string",
                    "description": "Tên hoặc từ khóa của cuốn sách cần kiểm tra số lượng tồn kho"
                }
            },
            "required": ["book_title"]
        }
    },
    {
        "name": "get_my_active_borrows",
        "description": "Tra cứu danh sách sách mà chính độc giả đang đăng nhập hiện đang mượn hoặc chờ duyệt, cùng thông tin hạn trả sách và tiền phạt trễ hạn nếu có.",
        "parameters": {
            "type": "object",
            "properties": {
                "status_filter": {
                    "type": "string",
                    "enum": ["Đang mượn", "Chờ duyệt", "Tất cả"],
                    "description": "Lọc theo trạng thái phiếu mượn (mặc định 'Tất cả')"
                }
            }
        }
    },
    {
        "name": "get_library_policy",
        "description": "Tra cứu quy định, chính sách thư viện chính thức: thời hạn mượn, hạn mức số cuốn, phí phạt trễ hạn, đền bù mất sách, mở khóa tài khoản VNPay, giờ mở cửa, địa chỉ liên hệ, quy trình mã QR trả sách tại quầy, đặt trước và gia hạn.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "enum": [
                        "borrow_limits",
                        "due_dates",
                        "fine_policy",
                        "qr_return_process",
                        "renewal_policy",
                        "opening_hours",
                        "lost_book_policy",
                        "account_lock_vnpay",
                        "reservation_policy",
                        "all"
                    ],
                    "description": "Chủ đề quy định cần tra cứu"
                }
            },
            "required": ["topic"]
        }
    },
    {
        "name": "recommend_books",
        "description": "Gợi ý các đầu sách hay, nổi bật hoặc được mượn nhiều nhất theo từng thể loại hoặc chủ đề độc giả quan tâm.",
        "parameters": {
            "type": "object",
            "properties": {
                "genre": {
                    "type": "string",
                    "description": "Chủ đề hoặc thể loại sách muốn nhận gợi ý (ví dụ: 'phát triển bản thân', 'lập trình AI', 'tiểu thuyết')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Số lượng sách tối đa muốn gợi ý (từ 1 đến 5)"
                }
            }
        }
    }
]


# =========================================================================
# 2. KIỂM SOÁT TRƯỜNG HỢP BIÊN & BẢO MẬT ĐẦU VÀO (BOUNDARY & GUARDRAILS)
# =========================================================================

def validate_reader_prompt_boundaries(user_prompt: str) -> None:
    """
    Kiểm soát chặt chẽ các trường hợp biên (Boundary Value Analysis) và Bảo mật AI:
    1. Biên rỗng / chỉ chứa khoảng trắng -> HTTP 400
    2. Biên độ dài tối đa (> 1000 ký tự) -> HTTP 400
    3. Biên độ dài tối thiểu (< 2 ký tự) hoặc chỉ chứa ký tự đặc biệt/dấu câu vô nghĩa -> HTTP 400
    4. Chặn Prompt Injection / SQL Injection / Khai thác mật khẩu trái phép -> HTTP 403
    """
    if not user_prompt:
        raise HTTPException(
            status_code=400,
            detail="Vui lòng nhập nội dung câu hỏi (không được để trống)."
        )

    if len(user_prompt) > MAX_READER_PROMPT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Câu hỏi vượt quá giới hạn biên tối đa {MAX_READER_PROMPT_LENGTH} ký tự (hiện tại: {len(user_prompt)} ký tự). Vui lòng tóm tắt ngắn gọn hơn."
        )

    # Kiểm tra chuỗi chỉ chứa ký tự đặc biệt hoặc quá ngắn (< 2 ký tự)
    alnum_chars = re.findall(r"[a-zA-Z0-9À-ỹ]", user_prompt)
    if len(user_prompt) < MIN_READER_PROMPT_LENGTH or len(alnum_chars) == 0:
        raise HTTPException(
            status_code=400,
            detail="Câu hỏi không hợp lệ (quá ngắn hoặc chỉ chứa ký tự đặc biệt). Vui lòng nhập câu hỏi rõ ràng bằng tiếng Việt (từ 2 đến 1.000 ký tự)."
        )

    # Kiểm tra tấn công SQL Injection hoặc phá hoại CSDL trên khung chat
    sql_attack_pattern = r"\b(DROP\s+TABLE|DELETE\s+FROM|TRUNCATE\s+TABLE|ALTER\s+TABLE|UPDATE\s+users|INSERT\s+INTO\s+users|INTO\s+OUTFILE)\b"
    if re.search(sql_attack_pattern, user_prompt, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Phát hiện cú pháp can thiệp CSDL trái phép (SQL Injection). Yêu cầu đã bị chặn!"
        )

    # Kiểm tra Prompt Injection / Khai thác mật khẩu nhạy cảm
    prompt_injection_pattern = r"(ignore\s+(all\s+)?previous\s+instructions|bỏ\s+qua\s+mọi\s+chỉ\s+dẫn|password_hash|jwt_secret|mật\s+khẩu\s+admin|lấy\s+mật\s+khẩu)"
    if re.search(prompt_injection_pattern, user_prompt, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Không được phép khai thác thông tin nhạy cảm (mật khẩu / khóa bảo mật) hoặc thực hiện Prompt Injection."
        )


def validate_api_key_format(explicit_api_key: Optional[str]) -> Optional[str]:
    """
    Kiểm tra tính hợp lệ của API Key khi người dùng cấu hình hoặc nhập trên giao diện.
    Nếu nhập key sai định dạng (quá ngắn hoặc không đúng chuẩn Gemini 'AIza...' / OpenAI 'sk-...'),
    lập tức chặn và báo lỗi HTTP 401 rõ ràng.
    """
    if explicit_api_key is not None and explicit_api_key.strip() != "":
        key = explicit_api_key.strip()
        if len(key) < 20 or not (key.startswith("AIza") or key.startswith("sk-")):
            raise HTTPException(
                status_code=401,
                detail="API Key không hợp lệ! Vui lòng nhập đúng Google Gemini API Key (bắt đầu bằng 'AIza...') hoặc OpenAI API Key (bắt đầu bằng 'sk-...')."
            )
        return key

    env_key = (os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
    require_key = os.getenv("AI_REQUIRE_API_KEY", "false").lower() in ("true", "1", "yes")
    if require_key and not env_key:
        raise HTTPException(
            status_code=401,
            detail="Hệ thống yêu cầu cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY trong file .env hoặc mục Cài đặt API Key để sử dụng AI."
        )
    if env_key and (len(env_key) < 20 or not (env_key.startswith("AIza") or env_key.startswith("sk-"))):
        raise HTTPException(
            status_code=401,
            detail="API Key cấu hình trong file .env không hợp lệ! Vui lòng kiểm tra lại GEMINI_API_KEY hoặc OPENAI_API_KEY."
        )
    return env_key if env_key else None


# =========================================================================
# 3. HÀM THỰC THI NGHIỆP VỤ TRÊN CSDL (APPLICATION EXECUTORS)
# =========================================================================

def execute_search_books(db: dict, keyword: str = "", category: str = "", author: str = "") -> dict:
    books = db.get("books", [])
    kw = (keyword or "").lower().strip()
    cat = (category or "").lower().strip()
    auth = (author or "").lower().strip()

    matched = []
    for b in books:
        title = (b.get("title") or "").lower()
        desc = (b.get("desc") or b.get("description") or "").lower()
        b_cat = (b.get("category") or "").lower()
        b_auth = (b.get("author") or "").lower()

        match = True
        if kw and (kw not in title and kw not in desc and kw not in b_auth and kw not in b_cat):
            match = False
        if cat and (cat not in b_cat):
            match = False
        if auth and (auth not in b_auth):
            match = False

        if match:
            matched.append({
                "book_id": b.get("id"),
                "title": b.get("title"),
                "author": b.get("author"),
                "category": b.get("category"),
                "available_copies": b.get("available", b.get("available_copies", 0)),
                "total_quantity": b.get("quantity", 0),
                "status": b.get("status", "Sẵn sàng")
            })

    return {
        "success": True,
        "count": len(matched),
        "results": matched[:6]
    }


def execute_check_availability(db: dict, book_title: str) -> dict:
    books = db.get("books", [])
    target = (book_title or "").lower().strip()
    found = []

    for b in books:
        title = (b.get("title") or "").lower()
        if target and (target in title or title in target):
            cat = b.get("category", "")
            shelf = "Khu A - Kệ 01 (Tầng 1)"
            if "Công nghệ" in cat or "Khoa học" in cat:
                shelf = "Khu C - Kệ Công nghệ & AI (Tầng 2)"
            elif "Kinh tế" in cat or "Kinh doanh" in cat:
                shelf = "Khu B - Kệ Kinh tế & Quản trị (Tầng 1)"
            elif "Kỹ năng" in cat or "Tâm lý" in cat:
                shelf = "Khu D - Kệ Kỹ năng sống (Tầng 2)"
            elif "Văn học" in cat or "Tiểu thuyết" in cat:
                shelf = "Khu E - Kệ Văn học & Nghệ thuật (Tầng 3)"

            avail = int(b.get("available", b.get("available_copies", 0)))
            found.append({
                "book_id": b.get("id"),
                "title": b.get("title"),
                "author": b.get("author"),
                "category": b.get("category"),
                "total_quantity": b.get("quantity", 0),
                "available_copies": avail,
                "is_available": avail > 0,
                "shelf_location": shelf,
                "status": "Sẵn sàng cho mượn" if avail > 0 else "Tạm hết sách (Có thể đặt trước)"
            })

    return {
        "success": True,
        "query": book_title,
        "matched_books": found
    }


def execute_get_my_active_borrows(db: dict, user_id: Optional[int], user_name: Optional[str], status_filter: str = "Tất cả") -> dict:
    if not user_id:
        return {
            "success": False,
            "message": "Độc giả hiện chưa đăng nhập vào hệ thống. Vui lòng đăng nhập để tra cứu phiếu mượn cá nhân."
        }

    records = db.get("borrowRecords", [])
    user_records = [
        r for r in records
        if int(r.get("readerId") or r.get("userId") or 0) == int(user_id)
        or (user_name and (r.get("readerName") or "").strip().lower() == user_name.strip().lower())
    ]

    active_records = []
    for r in user_records:
        st = r.get("status")
        if status_filter == "Đang mượn" and st not in ["Đang mượn", "Quá hạn", "Chờ duyệt"]:
            continue
        if status_filter == "Chờ duyệt" and st != "Chờ duyệt":
            continue
        if status_filter == "Tất cả" and st in ["Đã trả", "Đã hủy", "Từ chối"]:
            continue

        due_date_str = r.get("returnDate") or r.get("dueDate")
        overdue_days = 0
        fine = float(r.get("fineAmount", 0) or 0)
        if due_date_str:
            try:
                due_dt = datetime.fromisoformat(due_date_str.replace("Z", ""))
                diff = (datetime.now() - due_dt).days
                if diff > 0:
                    overdue_days = diff
                    fine = max(fine, overdue_days * 2000)
            except Exception:
                pass

        active_records.append({
            "receipt_id": r.get("id"),
            "book_id": r.get("bookId"),
            "book_title": r.get("bookTitle"),
            "borrow_type": r.get("borrowType", "Mượn về nhà"),
            "borrow_date": (r.get("borrowDate") or "")[:10],
            "due_date": (due_date_str or "")[:10],
            "status": "Quá hạn" if overdue_days > 0 else st,
            "overdue_days": overdue_days,
            "fine_amount": fine
        })

    return {
        "success": True,
        "user_id": user_id,
        "user_name": user_name,
        "total_active": len(active_records),
        "borrows": active_records
    }


def execute_get_library_policy(topic: str = "all") -> dict:
    policies = {
        "borrow_limits": {
            "title": "Hạn mức mượn sách",
            "content": "Mỗi độc giả được mượn cùng lúc tối đa 03 - 05 cuốn sách theo cấu hình hệ thống. Thời hạn mượn sách về nhà tối đa là 14 ngày (đọc tại chỗ từ 1 đến 7 ngày)."
        },
        "due_dates": {
            "title": "Thời hạn mượn & gia hạn",
            "content": "Thời hạn mượn tiêu chuẩn là 14 ngày. Độc giả có thể bấm 'Xin gia hạn' trên hệ thống tối đa 02 lần (mỗi lần từ 1 đến 20 ngày) trước khi hết hạn mượn để Thủ thư phê duyệt."
        },
        "fine_policy": {
            "title": "Chính sách phạt trễ hạn",
            "content": "Nếu trả sách quá hạn, phí phạt là 2.000 VNĐ / ngày / cuốn. Nếu quá hạn từ 3 ngày trở lên, tài khoản độc giả sẽ tự động bị khóa cho đến khi nộp phạt xong."
        },
        "qr_return_process": {
            "title": "Quy trình trả sách chuẩn bằng Mã QR tại quầy",
            "content": "Để đảm bảo kiểm kê sách vật lý, độc giả không tự bấm trả từ xa. Quy trình: Độc giả vào mục 'Sách đang mượn', bấm 'Mã QR trả sách' để xuất trình mã phiếu (#receipt_id) trên điện thoại cho Thủ thư tại quầy. Thủ thư sẽ dùng máy quét QR để kiểm tra và nhận sách vào kho trong 1-Click."
        },
        "renewal_policy": {
            "title": "Quy định gia hạn mượn sách",
            "content": "Độc giả được phép gửi yêu cầu gia hạn tối đa 2 lần đối với mỗi cuốn sách đang mượn (mỗi lần từ 1 đến 20 ngày). Sách đã quá hạn hoặc tài khoản đang bị khóa sẽ không thể xin gia hạn."
        },
        "opening_hours": {
            "title": "Giờ mở cửa & Địa chỉ liên hệ Thư viện SmartLib",
            "content": "Giờ mở cửa: 07:30 - 17:30 (Từ Thứ 2 đến Thứ 7 hàng tuần, nghỉ Chủ nhật và ngày lễ). Địa chỉ: Tòa nhà Trung tâm Học liệu SmartLib, Hà Nội. Hotline hỗ trợ: 0987 654 321 | Email: support@smartlib.edu.vn."
        },
        "lost_book_policy": {
            "title": "Quy định đền bù mất sách hoặc hư hỏng sách",
            "content": "Trường hợp làm mất sách hoặc hư hỏng nặng không thể phục hồi, độc giả cần báo ngay tại quầy Thủ thư và nộp mức phí đền bù sách mất theo quy định là 200.000 VNĐ/cuốn (hoặc mua đền đúng ấn phẩm cùng phiên bản)."
        },
        "account_lock_vnpay": {
            "title": "Quy định mở khóa tài khoản & Thanh toán phạt qua VNPay",
            "content": "Tài khoản bị khóa tự động khi có sách quá hạn từ 3 ngày trở lên hoặc còn nợ phí phạt. Độc giả chỉ cần đăng nhập, bấm nút 'Thanh toán ngay qua VNPay' trên hộp thoại thông báo khóa, quét mã VietQR/VNPay Sandbox và chờ Quản trị viên xác nhận để mở khóa tức thì."
        },
        "reservation_policy": {
            "title": "Quy định đặt trước sách (Reservation Queue)",
            "content": "Khi cuốn sách có số bản khả dụng bằng 0 (Tạm hết sách) hoặc sắp phát hành, độc giả được đặt trước tối đa 03 cuốn theo hàng đợi ưu tiên FIFO. Khi sách được trả về kho, hệ thống tự động thông báo và giữ quyền ưu tiên mượn trong vòng 48 giờ."
        }
    }

    if topic in policies:
        return {"topic": topic, "policy": policies[topic]}
    return {"topic": "all", "policies": list(policies.values())}


def execute_recommend_books(db: dict, genre: str = "", limit: int = 3) -> dict:
    books = db.get("books", [])
    g = (genre or "").lower().strip()

    matched = []
    for b in books:
        cat = (b.get("category") or "").lower()
        title = (b.get("title") or "").lower()
        desc = (b.get("desc") or b.get("description") or "").lower()

        if not g or g == "chung":
            matched.append(b)
        elif g in cat or g in title or g in desc:
            matched.append(b)

    matched.sort(key=lambda x: int(x.get("available", x.get("available_copies", 0))), reverse=True)
    selected = matched[:limit] if matched else books[:limit]

    results = [
        {
            "book_id": b.get("id"),
            "title": b.get("title"),
            "author": b.get("author"),
            "category": b.get("category"),
            "available_copies": b.get("available", b.get("available_copies", 0)),
            "reason": f"Sách hay thể loại {b.get('category')}, được bạn đọc đánh giá cao và hiện sẵn sàng cho mượn."
        }
        for b in selected
    ]

    return {
        "success": True,
        "genre_searched": genre or "Tất cả",
        "recommendations": results
    }


def run_tool(name: str, arguments: dict, db: dict, user_id: Optional[int], user_name: Optional[str]) -> dict:
    """Điều phối thực thi hàm nghiệp vụ (Application Dispatcher)"""
    if name == "search_books":
        return execute_search_books(
            db,
            keyword=arguments.get("keyword", ""),
            category=arguments.get("category", ""),
            author=arguments.get("author", "")
        )
    elif name == "check_book_availability":
        return execute_check_availability(
            db,
            book_title=arguments.get("book_title", "")
        )
    elif name == "get_my_active_borrows":
        return execute_get_my_active_borrows(
            db,
            user_id=user_id,
            user_name=user_name,
            status_filter=arguments.get("status_filter", "Tất cả")
        )
    elif name == "get_library_policy":
        return execute_get_library_policy(
            topic=arguments.get("topic", "all")
        )
    elif name == "recommend_books":
        return execute_recommend_books(
            db,
            genre=arguments.get("genre", ""),
            limit=int(arguments.get("limit", 3) or 3)
        )
    else:
        return {"error": f"Không tìm thấy tool: {name}"}


# =========================================================================
# 4. BỘ SUY DIỄN NGỮ NGHĨA FUNCTION CALLING & KIỂM SOÁT CÂU HỎI NGOÀI
# =========================================================================

def semantic_heuristic_function_caller(user_prompt: str, user_id: Optional[int], db: Optional[dict] = None) -> Optional[dict]:
    """
    Phân tích ngữ nghĩa tiếng Việt để ánh xạ vào đúng Function Calling của Thư viện.
    Nếu câu hỏi nằm ngoài phạm vi 5 công cụ CSDL, trả về None để bộ xử lý Out-of-Scope đảm nhiệm.
    """
    p = user_prompt.lower().strip()

    # 1. Tra cứu sách cá nhân đang mượn
    if any(k in p for k in ["mượn gì", "đang mượn", "hạn trả", "sách của tôi", "phiếu mượn của tôi", "phiếu mượn", "quá hạn của tôi", "tiền phạt cá nhân", "danh sách mượn"]):
        status_flt = "Tất cả"
        if "chỉ chờ duyệt" in p:
            status_flt = "Chờ duyệt"
        return {
            "function": "get_my_active_borrows",
            "arguments": {
                "status_filter": status_flt
            }
        }

    # 2. Tra cứu quy chế, nội quy, giờ mở cửa, khóa tài khoản, mất sách, VNPay, đặt trước
    if any(k in p for k in [
        "quy định", "nội quy", "hạn mượn", "thời hạn", "bao lâu", "tối đa mấy cuốn",
        "trả sách", "phạt", "gia hạn", "mã qr", "mở cửa", "mấy giờ", "địa chỉ", "liên hệ",
        "số điện thoại", "hotline", "email", "mất sách", "rách sách", "hư hỏng", "đền bù",
        "bị khóa", "mở khóa", "vnpay", "thanh toán phạt", "đặt trước", "hàng chờ", "giữ sách"
    ]):
        topic = "all"
        if any(k in p for k in ["mở cửa", "mấy giờ", "địa chỉ", "liên hệ", "số điện thoại", "hotline", "email", "ở đâu"]) and not any(k in p for k in ["cuốn", "sách"]):
            topic = "opening_hours"
        elif any(k in p for k in ["mất sách", "rách sách", "hư hỏng", "đền bù", "làm mất"]):
            topic = "lost_book_policy"
        elif any(k in p for k in ["bị khóa", "mở khóa", "vnpay", "thanh toán"]):
            topic = "account_lock_vnpay"
        elif any(k in p for k in ["đặt trước", "hàng chờ", "giữ sách", "hết sách thì sao"]):
            topic = "reservation_policy"
        elif any(k in p for k in ["trả sách", "mã qr", "quét mã"]):
            topic = "qr_return_process"
        elif any(k in p for k in ["hạn mượn", "bao lâu", "thời hạn", "mấy ngày"]):
            topic = "due_dates"
        elif any(k in p for k in ["tối đa", "mấy cuốn", "hạn mức"]):
            topic = "borrow_limits"
        elif any(k in p for k in ["phạt", "tiền phạt", "trễ hạn"]):
            topic = "fine_policy"
        elif any(k in p for k in ["gia hạn"]):
            topic = "renewal_policy"

        return {
            "function": "get_library_policy",
            "arguments": {
                "topic": topic
            }
        }

    # 3. Kiểm tra tình trạng kho / số lượng còn của cuốn sách cụ thể
    if any(k in p for k in ["còn không", "còn bao nhiêu", "còn sách", "sẵn sàng", "kệ nào", "vị trí", "còn mấy cuốn"]):
        book_title = ""
        if db:
            for book in db.get("books", []):
                bt = (book.get("title") or "").strip()
                if bt and len(bt) >= 3 and bt.lower() in p:
                    book_title = bt
                    break

        if not book_title:
            quote_match = re.search(r'["\']([^"\']+)["\']', user_prompt)
            if quote_match:
                book_title = quote_match.group(1).strip()

        if not book_title:
            m = re.search(r'(?:sách|cuốn|tác phẩm)\s+([a-zA-Z0-9\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệđìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]+)', user_prompt, re.IGNORECASE)
            if m:
                extracted = m.group(1).strip()
                for stop in ["còn không", "còn bao nhiêu", "còn trong kho", "ở đâu", "không bạn", "vậy bạn", "hiện", "trong kho và", "còn mấy cuốn"]:
                    extracted = re.sub(rf"\b{stop}\b", "", extracted, flags=re.IGNORECASE).strip()
                book_title = extracted

        if not book_title:
            for sample in ["tru tiên", "python", "đắc nhân tâm", "dế mèn", "nhà giả kim", "giận"]:
                if sample in p:
                    book_title = sample.title()
                    break

        if book_title:
            return {
                "function": "check_book_availability",
                "arguments": {
                    "book_title": book_title
                }
            }

    # 4. Gợi ý sách theo chủ đề
    if any(k in p for k in ["gợi ý", "đề xuất", "sách hay", "tư vấn", "nên đọc", "hot nhất"]):
        genre = "Chung"
        if any(k in p for k in ["phát triển bản thân", "kỹ năng", "tư duy", "tâm lý"]):
            genre = "Kỹ năng sống"
        elif any(k in p for k in ["lập trình", "công nghệ", "ai", "cntt", "python", "khoa học"]):
            genre = "Công nghệ"
        elif any(k in p for k in ["kinh tế", "kinh doanh", "làm giàu", "tài chính", "đầu tư"]):
            genre = "Kinh tế"
        elif any(k in p for k in ["văn học", "tiểu thuyết", "truyện"]):
            genre = "Văn học"
        elif any(k in p for k in ["lịch sử"]):
            genre = "Lịch sử"

        return {
            "function": "recommend_books",
            "arguments": {
                "genre": genre,
                "limit": 3
            }
        }

    # 5. Tìm kiếm sách theo tên sách, tác giả hoặc thể loại có thực trong CSDL
    if db:
        for book in db.get("books", []):
            bt = (book.get("title") or "").strip()
            ba = (book.get("author") or "").strip()
            if bt and len(bt) >= 4 and bt.lower() in p:
                return {
                    "function": "check_book_availability",
                    "arguments": {"book_title": bt}
                }
            if ba and len(ba) >= 4 and ba.lower() in p:
                return {
                    "function": "search_books",
                    "arguments": {"author": ba}
                }

    if any(k in p for k in ["tìm sách", "tra cứu sách", "có sách nào", "tác giả", "thể loại sách"]):
        kw = user_prompt
        for remove_word in ["tìm sách", "tra cứu sách", "có sách nào về", "tìm giúp mình", "cho mình xem", "về chủ đề"]:
            kw = re.sub(rf"\b{remove_word}\b", "", kw, flags=re.IGNORECASE).strip()
        return {
            "function": "search_books",
            "arguments": {
                "keyword": kw
            }
        }

    return None


def _safe_eval_math(expr_str: str) -> Optional[float]:
    """Tính toán an toàn biểu thức số học cơ bản nếu người dùng hỏi toán học"""
    allowed_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
    }

    def _eval(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        elif isinstance(node, ast.BinOp) and type(node.op) in allowed_ops:
            return allowed_ops[type(node.op)](_eval(node.left), _eval(node.right))
        elif isinstance(node, ast.UnaryOp) and type(node.op) in allowed_ops:
            return allowed_ops[type(node.op)](_eval(node.operand))
        raise ValueError("Unsupported expression")

    try:
        tree = ast.parse(expr_str, mode="eval")
        return _eval(tree.body)
    except Exception:
        return None


def handle_out_of_scope_or_general_question(
    user_prompt: str,
    user_name: Optional[str],
    db: dict,
    has_api_key: bool
) -> tuple[str, list, str]:
    """
    Xử lý chuẩn xác các câu hỏi ngoài phạm vi 5 hàm CSDL (Out-of-Scope / General Chat):
    - Nhận diện chào hỏi / hỏi thông tin trợ lý AI.
    - Nhận diện biểu thức toán học cơ bản.
    - Nhận diện câu hỏi ngoài phạm vi thư viện (thời tiết, bóng đá, giá vàng, nấu ăn, viết code, v.v.)
      và trả lời theo đúng Domain Guardrail kèm gợi ý sách liên quan + hướng dẫn cấu hình API Key nếu chưa có.
    """
    p = user_prompt.lower().strip()
    user_display = user_name or "bạn"
    books = db.get("books", [])

    # 1. Nhóm chào hỏi / cảm ơn / hỏi danh tính
    if re.match(r"^(xin chào|chào|hello|hi|hey|alo|chào bạn|chào ad|cảm ơn|thank|thanks|bạn là ai|ai vậy)\b", p):
        reply = (
            f"Chào {user_display}! 👋 Mình là **Thủ thư AI** của Hệ thống Thư viện Thông minh **SmartLib** (hiện đang quản lý **{len(books)} đầu sách**).\n\n"
            f"Mình có thể hỗ trợ bạn ngay lập tức:\n"
            f"- 📋 Kiểm tra **phiếu mượn, hạn trả & tiền phạt** cá nhân\n"
            f"- 🔍 Tra cứu **tồn kho & vị trí kệ** của từng cuốn sách\n"
            f"- 🔄 Hướng dẫn **quy trình trả sách bằng mã QR**, gia hạn, nộp phạt VNPay\n"
            f"- 📚 Tư vấn & **gợi ý sách hay** theo chủ đề bạn yêu thích."
        )
        return reply, [], "general_greeting"

    # 2. Nhóm câu hỏi thống kê tổng số sách trong thư viện
    if any(k in p for k in ["bao nhiêu đầu sách", "tổng số sách", "có bao nhiêu cuốn sách", "mấy cuốn sách trong thư viện"]):
        total_titles = len(books)
        total_copies = sum(int(b.get("quantity", 0)) for b in books)
        avail_copies = sum(int(b.get("available", b.get("available_copies", 0))) for b in books)
        reply = (
            f"Chào {user_display}! 📊 Hiện tại kho dữ liệu **Thư viện SmartLib** đang lưu trữ:\n\n"
            f"- 📚 **Tổng số đầu sách:** **{total_titles} đầu sách**\n"
            f"- 📦 **Tổng số bản sách nhập kho:** **{total_copies} cuốn**\n"
            f"- 🟢 **Số bản sẵn sàng cho mượn ngay:** **{avail_copies} cuốn**\n\n"
            f"Bạn muốn tìm sách thuộc thể loại nào (Công nghệ, Kinh tế, Kỹ năng sống, Văn học...) cứ nhắn mình nhé!"
        )
        return reply, [], "library_stats"

    # 3. Nhóm câu hỏi tính toán toán học cơ bản (ví dụ: "1 + 1 bằng mấy", "25 * 4 = ?")
    math_match = re.search(r"(\d+(?:\.\d+)?\s*[\+\-\*\/xX:]\s*\d+(?:\.\d+)?(?:\s*[\+\-\*\/]\s*\d+(?:\.\d+)?)*)", p)
    if math_match:
        raw_expr = math_match.group(1).replace("x", "*").replace("X", "*").replace(":", "/")
        val = _safe_eval_math(raw_expr)
        if val is not None:
            formatted_val = int(val) if isinstance(val, float) and val.is_integer() else round(val, 4)
            sci_books = [
                {
                    "book_id": b.get("id"),
                    "title": b.get("title"),
                    "author": b.get("author"),
                    "reason": f"Sách {b.get('category')} rèn luyện tư duy logic & khoa học"
                }
                for b in books
                if any(k in (b.get("category") or "").lower() for k in ["khoa học", "công nghệ", "kỹ năng"])
            ][:2]
            reply = (
                f"Chào {user_display}! Kết quả phép tính **{math_match.group(1).strip()} = {formatted_val}** bạn nhé! 🧮✨\n\n"
                f"*(Lưu ý: Mình là **Thủ thư AI chuyên trách nghiệp vụ Thư viện SmartLib**. Nếu bạn yêu thích Toán học, Tư duy Logic & Khoa học, mình gợi ý bạn tham khảo các đầu sách dưới đây trong kho thư viện nha!)*"
            )
            return reply, sci_books, "out_of_scope"

    # 4. Nhóm câu hỏi NGOÀI PHẠM VI THƯ VIỆN (Out-of-Scope Domain Guardrail)
    api_key_note = (
        "\n\n🔑 *Lưu ý cấu hình AI:* Hiện hệ thống đang chạy ở chế độ **Domain Guardrail & Function Calling nội bộ** (chưa nạp `GEMINI_API_KEY` / `OPENAI_API_KEY`). "
        "Để kích hoạt mô hình ngôn ngữ lớn (Google Gemini / OpenAI GPT) trả lời chuyên sâu mọi chủ đề mở, bạn hãy điền `GEMINI_API_KEY` vào file `.env` hoặc bấm nút ⚙️ **Cài đặt API Key** ở góc trên khung chat nhé!"
        if not has_api_key else ""
    )

    # Nếu câu hỏi ngoài liên quan đến lập trình / công nghệ / AI -> điều hướng về sách Công nghệ
    if any(k in p for k in ["viết code", "lập trình", "code ", "c++", "java", "javascript", "html", "sql", "thuật toán", "phần mềm"]):
        tech_books = [
            {
                "book_id": b.get("id"),
                "title": b.get("title"),
                "author": b.get("author"),
                "reason": "Sách chuyên ngành Công nghệ & Lập trình có sẵn tại SmartLib"
            }
            for b in books
            if "công nghệ" in (b.get("category") or "").lower() or "python" in (b.get("title") or "").lower()
        ][:3]
        reply = (
            f"Chào {user_display}! ⚠️ Yêu cầu **\"{user_prompt}\"** thuộc nhóm giải bài tập/viết mã nguồn nằm ngoài phạm vi công cụ nghiệp vụ của **Thủ thư AI SmartLib**.\n\n"
            f"Tuy nhiên, kho thư viện SmartLib hiện có sẵn các đầu sách **Công nghệ & Lập trình** rất hay giúp bạn nắm vững kiến thức này, bạn bấm vào thẻ sách bên dưới để mượn đọc nhé! 💻📚"
            f"{api_key_note}"
        )
        return reply, tech_books, "out_of_scope"

    # Nếu câu hỏi ngoài liên quan đến giá vàng, chứng khoán, bitcoin, tiền tệ -> điều hướng về sách Kinh tế
    if any(k in p for k in ["giá vàng", "chứng khoán", "cổ phiếu", "bitcoin", "tỷ giá", "lãi suất", "bất động sản"]):
        econ_books = [
            {
                "book_id": b.get("id"),
                "title": b.get("title"),
                "author": b.get("author"),
                "reason": "Sách Kinh tế & Đầu tư tài chính tại SmartLib"
            }
            for b in books
            if "kinh tế" in (b.get("category") or "").lower() or "tài chính" in (b.get("title") or "").lower()
        ][:3]
        reply = (
            f"Chào {user_display}! ⚠️ Câu hỏi **\"{user_prompt}\"** yêu cầu dữ liệu thị trường thời gian thực nằm ngoài phạm vi CSDL của **Thư viện SmartLib**.\n\n"
            f"Nếu bạn quan tâm đến kiến thức **Kinh tế, Tài chính & Đầu tư**, mình gợi ý các đầu sách chuyên sâu đang có sẵn tại thư viện bên dưới nhé! 📈📚"
            f"{api_key_note}"
        )
        return reply, econ_books, "out_of_scope"

    # Các câu hỏi ngoài phạm vi khác (thời tiết, bóng đá, nấu ăn, giải trí, chính trị, đời sống...)
    reply = (
        f"Chào {user_display}! ⚠️ Câu hỏi **\"{user_prompt}\"** hiện nằm ngoài phạm vi nghiệp vụ của **Thủ thư AI Thư viện SmartLib**.\n\n"
        f"Mình được thiết kế chuyên biệt với **Chốt chặn Phạm vi (Domain Guardrail)** để hỗ trợ chính xác các nghiệp vụ thư viện:\n"
        f"- 📖 Tra cứu sách theo tên, tác giả, thể loại & vị trí kệ\n"
        f"- 📋 Kiểm tra phiếu mượn, hạn trả & phí phạt cá nhân\n"
        f"- 🔄 Hướng dẫn quy trình trả sách bằng **Mã QR**, xin gia hạn, đặt trước sách và mở khóa tài khoản qua **VNPay**"
        f"{api_key_note}"
    )
    return reply, [], "out_of_scope"


def generate_natural_response_from_tool(tool_name: str, tool_args: dict, tool_result: dict, user_name: Optional[str]) -> tuple[str, list]:
    """
    Bước 5: Tổng hợp kết quả thực thi của Tool thành câu trả lời tự nhiên, chuẩn xác.
    """
    greeting = f"Chào bạn {user_name} nha! ✨" if user_name else "Chào bạn nha! ✨"
    suggested_books = []

    if tool_name == "get_my_active_borrows":
        if not tool_result.get("success"):
            return (
                f"{greeting} {tool_result.get('message', 'Vui lòng đăng nhập để tra cứu sách cá nhân bạn nhé!')} 🔒",
                []
            )

        borrows = tool_result.get("borrows", [])
        if not borrows:
            return (
                f"{greeting} Tuyệt vời luôn! Hiện tại bạn **không có sách nào đang mượn hoặc trễ hạn** cả. 🎉\n\nKho thư viện đang có rất nhiều đầu sách mới thú vị, bạn có muốn mình gợi ý vài cuốn hay để đọc giải trí không nè? 📚",
                []
            )

        lines = [f"{greeting} Mình đã kiểm tra danh sách phiếu mượn của bạn trên hệ thống rồi nè: 📋\n"]
        for b in borrows:
            status_tag = f"🔴 Quá hạn {b['overdue_days']} ngày (Phạt {int(b['fine_amount']):,} đ)" if b['overdue_days'] > 0 else f"🟢 {b['status']}"
            lines.append(
                f"- **{b['book_title']}** (Phiếu #{b['receipt_id']})\n"
                f"  • Hình thức: {b['borrow_type']}\n"
                f"  • Ngày mượn: {b['borrow_date']} | **Hạn trả: {b['due_date']}**\n"
                f"  • Trạng thái: {status_tag}"
            )
            suggested_books.append({
                "book_id": b.get("book_id"),
                "title": b.get("book_title"),
                "reason": f"Hạn trả: {b['due_date']}"
            })

        lines.append("\n👉 **Lưu ý trả sách:** Bạn vui lòng vào mục *'Sách đang mượn'*, bấm *'Mã QR trả sách'* và mang sách đến quầy để Thủ thư quét nhận lại sách vào kho nhé!")
        return ("\n".join(lines), suggested_books)

    elif tool_name == "check_book_availability":
        matched = tool_result.get("matched_books", [])
        if not matched:
            return (
                f"{greeting} Mình đã tra cứu kho sách với từ khóa **'{tool_args.get('book_title')}'** nhưng tạm thời chưa thấy ấn phẩm này trong hệ thống. Bạn thử kiểm tra lại tên sách hoặc tra cứu thể loại khác xem sao nha! 🥺",
                []
            )

        b = matched[0]
        avail = b["available_copies"]
        status_text = f"🟢 **Còn sẵn {avail}/{b['total_quantity']} cuốn** sẵn sàng cho bạn mượn ngay!" if avail > 0 else "🔴 **Hiện đã hết sách sẵn có** (Bạn có thể bấm Đặt trước để xếp hàng nhận sách sớm nhất)."

        reply = (
            f"{greeting} Mình đã kiểm tra trực tiếp kho sách theo yêu cầu của bạn nè: 📚✨\n\n"
            f"- 📖 **Tên sách:** **{b['title']}**\n"
            f"- ✍️ **Tác giả:** {b['author'] or 'Đang cập nhật'}\n"
            f"- 🏷️ **Thể loại:** {b['category']}\n"
            f"- 📦 **Tình trạng:** {status_text}\n"
            f"- 📍 **Vị trí lưu kho:** {b['shelf_location']}\n\n"
            f"Bạn có thể bấm vào thẻ sách bên dưới để xem chi tiết hoặc đăng ký mượn ngay nha!"
        )
        suggested_books = [{
            "book_id": b["book_id"],
            "title": b["title"],
            "author": b["author"],
            "reason": f"Còn sẵn {avail} cuốn tại {b['shelf_location']}"
        }]
        return (reply, suggested_books)

    elif tool_name == "get_library_policy":
        topic = tool_result.get("topic")
        policy_obj = tool_result.get("policy")
        if topic == "qr_return_process":
            reply = (
                f"{greeting} Về **quy trình trả sách chuẩn** tại Thư viện SmartLib thì siêu nhanh gọn và bảo mật luôn bạn nha: 🔄\n\n"
                f"1. **Bước 1:** Bạn truy cập mục **'Sách đang mượn'** trên Cổng Độc giả.\n"
                f"2. **Bước 2:** Bấm nút gradient **[Mã QR trả sách]** tại cuốn sách bạn muốn trả (hệ thống sẽ hiển thị mã QR phiếu mượn).\n"
                f"3. **Bước 3:** Bạn mang sách vật lý đến quầy thư viện và xuất trình mã QR này trên điện thoại (hoặc phiếu in PDF) cho Thủ thư.\n"
                f"4. **Bước 4:** Thủ thư dùng máy quét QR quét mã để kiểm tra tình trạng sách và hoàn tất nhận sách vào kho trong 1-Click.\n\n"
                f"⚠️ *Lưu ý:* Để đảm bảo kiểm kê sách vật lý, độc giả không tự bấm trả từ xa mà cần bàn giao trực tiếp tại quầy thư viện bạn nhé!"
            )
        elif topic in ("due_dates", "borrow_limits", "renewal_policy"):
            reply = (
                f"{greeting} Về **quy định thời hạn, gia hạn & hạn mức mượn sách** của SmartLib: ⏱️📖\n\n"
                f"- 📚 **Số lượng mượn tối đa:** **03 - 05 cuốn sách** cùng lúc.\n"
                f"- ⏳ **Thời hạn mượn:** Tối đa **14 ngày** đối với mượn về nhà (hoặc đọc tại chỗ từ 1 - 7 ngày).\n"
                f"- 🔄 **Gia hạn:** Bạn được phép **Xin gia hạn tối đa 02 lần** (mỗi lần thêm từ 1 đến 20 ngày) khi sách đang trong trạng thái *Đang mượn* và chưa quá hạn.\n"
                f"- 💰 **Phí phạt trễ:** **2.000 đ/ngày/cuốn** nếu trả quá hạn quy định."
            )
        elif topic == "fine_policy":
            reply = (
                f"{greeting} Về **chính sách phạt trễ hạn**: ⚠️\n\n"
                f"- Mức phạt là **2.000 VNĐ / ngày / cuốn** tính từ ngày sau ngày đến hạn.\n"
                f"- Nếu quá hạn **từ 3 ngày trở lên**, tài khoản độc giả sẽ tự động bị tạm khóa chức năng mượn mới.\n"
                f"- Bạn có thể thanh toán tiền phạt trực tuyến qua cổng **VNPay Sandbox** tích hợp sẵn trên hệ thống hoặc nộp tại quầy thủ thư để mở lại tài khoản ngay lập tức."
            )
        elif policy_obj:
            reply = f"{greeting} Dưới đây là thông tin về **{policy_obj['title']}**: 📋✨\n\n{policy_obj['content']}"
        else:
            reply = (
                f"{greeting} Dưới đây là các quy định mượn - trả cơ bản của **Thư viện SmartLib**: 📋✨\n\n"
                f"- 🕒 **Giờ mở cửa:** 07:30 - 17:30 (Thứ 2 - Thứ 7) | Hotline: 0987 654 321.\n"
                f"- 📚 **Hạn mức:** Mượn tối đa 3 - 5 cuốn trong vòng 14 ngày.\n"
                f"- 🔄 **Gia hạn:** Tối đa 2 lần (1 - 20 ngày/lần) trước khi hết hạn.\n"
                f"- 📱 **Trả sách:** Xuất trình **Mã QR trả sách** tại quầy cho Thủ thư quét nhận sách.\n"
                f"- 💰 **Phí trễ hạn:** 2.000 đ/ngày/cuốn (quá hạn $\\ge 3$ ngày tự động khóa tài khoản; hỗ trợ nộp phạt qua **VNPay**).\n"
                f"- 📕 **Đền bù mất sách:** 200.000 VNĐ/cuốn."
            )
        return (reply, [])

    elif tool_name == "recommend_books":
        recs = tool_result.get("recommendations", [])
        genre_name = tool_result.get("genre_searched", "phổ biến")
        lines = [f"{greeting} Đây là những đầu sách **{genre_name}** cực hay và đang có sẵn trong kho SmartLib dành riêng cho bạn: 🌟\n"]
        for idx, r in enumerate(recs, 1):
            lines.append(f"{idx}. **{r['title']}** - *{r['author'] or 'Khuyết danh'}* (Còn {r['available_copies']} cuốn)")
            suggested_books.append({
                "book_id": r["book_id"],
                "title": r["title"],
                "author": r["author"],
                "reason": r["reason"]
            })
        lines.append("\nBạn có thể bấm vào thẻ sách bên dưới để xem tóm tắt nội dung và đặt mượn nhé! ✨")
        return ("\n".join(lines), suggested_books)

    elif tool_name == "search_books":
        books = tool_result.get("results", [])
        if not books:
            return (
                f"{greeting} Mình đã tìm kiếm trong CSDL nhưng chưa thấy cuốn sách nào khớp với từ khóa của bạn. Bạn thử tìm với tên sách hoặc tác giả khác xem sao nha! 🔍",
                []
            )
        lines = [f"{greeting} Mình tìm thấy **{len(books)} cuốn sách** khớp với yêu cầu của bạn: 📚\n"]
        for b in books:
            lines.append(f"- **{b['title']}** - *{b['author']}* ({b['category']}) - Còn sẵn: {b['available_copies']} bản")
            suggested_books.append({
                "book_id": b["book_id"],
                "title": b["title"],
                "author": b["author"],
                "reason": f"Thể loại {b['category']} - Còn sẵn {b['available_copies']} cuốn"
            })
        return ("\n".join(lines), suggested_books)

    return (f"{greeting} Cảm ơn câu hỏi của bạn!", [])


# =========================================================================
# 5. TÍCH HỢP GOOGLE GEMINI API & OPENAI API (NATIVE FUNCTION CALLING)
# =========================================================================

def _call_gemini_function_calling(
    api_key: str,
    user_prompt: str,
    db: dict,
    user_id: Optional[int],
    user_name: Optional[str],
    explicit_user_key: bool = False
) -> tuple[str, Optional[dict], list]:
    """
    Thực thi Function Calling 5 bước trên Google Gemini API (gemini-2.0-flash / gemini-1.5-flash).
    Trả về (final_reply, tool_call_meta, suggested_books).
    """
    system_instruction = (
        "Bạn là Thủ thư AI thân thiện, chuyên nghiệp của Hệ thống Thư viện Thông minh SmartLib (Trường ĐH CNTT & Truyền thông - ICTU). "
        "Nhiệm vụ chính: Hỗ trợ độc giả tìm kiếm sách, kiểm tra tồn kho, tra cứu phiếu mượn cá nhân, giải đáp nội quy thư viện (hạn mượn 14 ngày, phạt 2.000đ/ngày, khóa tài khoản khi quá hạn >= 3 ngày, nộp phạt VNPay, trả sách bằng mã QR tại quầy). "
        "Khi độc giả hỏi dữ liệu cụ thể, BẮT BUỘC gọi Function/Tool tương ứng. "
        "Nếu độc giả hỏi câu hỏi ngoài phạm vi thư viện (ví dụ: toán học, thời tiết, lập trình, đời sống...), hãy trả lời ngắn gọn, chính xác, lịch sự trong 2-3 câu và khéo léo gợi ý họ khám phá kho sách của SmartLib."
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}]
            }
        ],
        "tools": [
            {
                "function_declarations": READER_FUNCTION_DEFINITIONS
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 700
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_json = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as http_err:
        if http_err.code in (400, 401, 403) and explicit_user_key:
            raise HTTPException(
                status_code=401,
                detail="Google Gemini API Key không hợp lệ hoặc đã hết hạn! Vui lòng kiểm tra lại API Key của bạn."
            )
        raise

    candidates = res_json.get("candidates", [])
    if not candidates:
        return "", None, []

    parts = candidates[0].get("content", {}).get("parts", [])
    fn_call_part = next((p.get("functionCall") for p in parts if "functionCall" in p), None)

    if fn_call_part:
        fn_name = fn_call_part.get("name")
        fn_args = fn_call_part.get("args") or {}
        tool_result = run_tool(fn_name, fn_args, db, user_id, user_name)
        tool_call_meta = {
            "name": fn_name,
            "arguments": fn_args,
            "status": "executed",
            "engine": "gemini-2.0-flash"
        }
        final_reply, suggested_books = generate_natural_response_from_tool(
            fn_name, fn_args, tool_result, user_name
        )
        return final_reply, tool_call_meta, suggested_books

    text_reply = "\n".join(p.get("text", "") for p in parts if "text" in p).strip()
    return text_reply, None, []


# =========================================================================
# 6. FASTAPI ENDPOINT: CHATBOT ĐỘC GIẢ (FUNCTION CALLING AGENT)
# =========================================================================

class ReaderChatRequest(BaseModel):
    message: str
    userId: Optional[int] = None
    userName: Optional[str] = None
    role: Optional[str] = "Reader"
    history: Optional[List[Dict[str, Any]]] = None
    apiKey: Optional[str] = None
    provider: Optional[str] = "gemini"


@router.post("/reader-chat")
async def reader_chat_endpoint(req: ReaderChatRequest):
    """
    Endpoint Chatbot Độc giả ứng dụng Mô hình 2: Function Calling (Tool Calling):
    - Kiểm soát chặt chẽ các trường hợp biên (Rỗng, Quá ngắn/Ký tự đặc biệt, Quá dài > 1000 ký tự, SQL/Prompt Injection, API Key sai).
    - Hỗ trợ Google Gemini 2.0 Flash & OpenAI GPT-4o-mini Function Calling.
    - Kiểm soát câu hỏi ngoài phạm vi (Out-of-Scope Guardrail) chuẩn xác.
    """
    user_prompt = (req.message or "").strip()

    # Bước 1: Kiểm soát các trường hợp biên & bảo mật đầu vào
    validate_reader_prompt_boundaries(user_prompt)

    # Bước 2: Kiểm tra tính hợp lệ của API Key (nếu có truyền lên hoặc cấu hình trong .env)
    explicit_user_key = bool(req.apiKey and req.apiKey.strip())
    api_key = validate_api_key_format(req.apiKey)

    db = db_manager.load_db()
    tool_call_meta = None
    final_reply = ""
    suggested_books = []
    intent_name = "general_chat"

    # -------------------------------------------------------------
    # NHÁNH 1A: GOOGLE GEMINI API (NẾU CÓ GEMINI API KEY 'AIza...')
    # -------------------------------------------------------------
    if api_key and api_key.startswith("AIza"):
        try:
            final_reply, tool_call_meta, suggested_books = _call_gemini_function_calling(
                api_key=api_key,
                user_prompt=user_prompt,
                db=db,
                user_id=req.userId,
                user_name=req.userName,
                explicit_user_key=explicit_user_key
            )
            if tool_call_meta:
                intent_name = tool_call_meta["name"]
        except HTTPException:
            raise
        except Exception as ex:
            print(f"[AI Reader Chat] Gemini Tool Calling exception: {ex}. Chuyển sang Semantic Engine.")

    # -------------------------------------------------------------
    # NHÁNH 1B: OPENAI API (NẾU CÓ OPENAI API KEY 'sk-...')
    # -------------------------------------------------------------
    elif api_key and api_key.startswith("sk-"):
        try:
            tools_payload = [
                {"type": "function", "function": fn}
                for fn in READER_FUNCTION_DEFINITIONS
            ]
            system_prompt = (
                "Bạn là Thủ thư AI thân thiện, thông minh của Thư viện SmartLib dành cho Độc giả. "
                "Nhiệm vụ: Hỗ trợ tìm kiếm sách, kiểm tra số lượng tồn kho, tra cứu sách mượn của độc giả, giải đáp quy định thư viện. "
                "Khi độc giả cần thông tin dữ liệu cụ thể, hãy gọi Tool tương ứng thay vì tự đoán dữ liệu. "
                "Nếu câu hỏi nằm ngoài phạm vi thư viện, hãy trả lời ngắn gọn, lịch sự và gợi ý sách liên quan."
            )
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]

            payload = {
                "model": "gpt-4o-mini",
                "messages": messages,
                "tools": tools_payload,
                "tool_choice": "auto",
                "temperature": 0.3
            }

            url = "https://api.openai.com/v1/chat/completions"
            req_data = json.dumps(payload).encode("utf-8")
            request = urllib.request.Request(
                url,
                data=req_data,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
            )

            with urllib.request.urlopen(request, timeout=12) as response:
                res_json = json.loads(response.read().decode("utf-8"))
                choice = res_json.get("choices", [{}])[0]
                res_message = choice.get("message", {})

                if res_message.get("tool_calls"):
                    tool_call = res_message["tool_calls"][0]
                    fn_name = tool_call["function"]["name"]
                    fn_args = json.loads(tool_call["function"]["arguments"] or "{}")

                    tool_result = run_tool(fn_name, fn_args, db, req.userId, req.userName)
                    tool_call_meta = {
                        "name": fn_name,
                        "arguments": fn_args,
                        "status": "executed",
                        "engine": "gpt-4o-mini"
                    }
                    intent_name = fn_name
                    final_reply, suggested_books = generate_natural_response_from_tool(
                        fn_name, fn_args, tool_result, req.userName
                    )
                else:
                    final_reply = res_message.get("content", "")
        except urllib.error.HTTPError as http_err:
            if http_err.code in (401, 403) and explicit_user_key:
                raise HTTPException(
                    status_code=401,
                    detail="OpenAI API Key không hợp lệ hoặc đã hết hạn! Vui lòng kiểm tra lại API Key của bạn."
                )
            print(f"[AI Reader Chat] OpenAI HTTPError: {http_err}. Chuyển sang Semantic Engine.")
        except Exception as ex:
            print(f"[AI Reader Chat] OpenAI Tool Calling exception: {ex}. Chuyển sang Semantic Engine.")

    # -------------------------------------------------------------
    # NHÁNH 2: SEMANTIC FUNCTION CALLING & OUT-OF-SCOPE GUARDRAIL
    # -------------------------------------------------------------
    if not final_reply:
        proposed_tool_call = semantic_heuristic_function_caller(user_prompt, req.userId, db)

        if proposed_tool_call:
            fn_name = proposed_tool_call["function"]
            fn_args = proposed_tool_call["arguments"]

            tool_result = run_tool(fn_name, fn_args, db, req.userId, req.userName)

            tool_call_meta = {
                "name": fn_name,
                "arguments": fn_args,
                "status": "executed",
                "description": next((f["description"] for f in READER_FUNCTION_DEFINITIONS if f["name"] == fn_name), "")
            }
            intent_name = fn_name

            final_reply, suggested_books = generate_natural_response_from_tool(
                fn_name, fn_args, tool_result, req.userName
            )
        else:
            # Xử lý chuẩn xác câu hỏi ngoài phạm vi (Out-of-Scope Guardrail) hoặc hội thoại chung
            final_reply, suggested_books, intent_name = handle_out_of_scope_or_general_question(
                user_prompt=user_prompt,
                user_name=req.userName,
                db=db,
                has_api_key=bool(api_key)
            )

    return {
        "success": True,
        "answer": final_reply,
        "tool_call": tool_call_meta,
        "suggested_books": suggested_books,
        "intent": intent_name,
        "has_api_key": bool(api_key),
        "timestamp": datetime.now().strftime("%H:%M")
    }

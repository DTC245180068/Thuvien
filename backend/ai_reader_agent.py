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
from contextvars import ContextVar
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
        "description": "Tra cứu toàn diện hồ sơ mượn trả cá nhân của chính độc giả đang đăng nhập: danh sách sách đang mượn/chờ duyệt, tình trạng phí phạt cá nhân (có đang bị phạt không, tổng tiền phạt nợ), trạng thái khóa tài khoản, hạn mức số cuốn còn được mượn thêm và danh sách sách đặt trước.",
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
        "description": "Tra cứu quy định, nghiệp vụ, chính sách thư viện chính thức: quy trình đăng ký mượn sách, thời hạn mượn, hạn mức số cuốn, phí phạt trễ hạn, đền bù mất sách, mở khóa tài khoản VNPay, giờ mở cửa, địa chỉ liên hệ, quy trình mã QR trả sách tại quầy, đặt trước, gia hạn và hỗ trợ quên/đổi mật khẩu.",
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
                        "borrow_process",
                        "account_password_help",
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
    sql_attack_pattern = r"\b(DROP\s+TABLE|DROP\s+DATABASE|DELETE\s+FROM|TRUNCATE\s+TABLE|ALTER\s+TABLE|UPDATE\s+users|INSERT\s+INTO\s+users|SELECT\s+\*\s+FROM|UNION\s+SELECT|INTO\s+OUTFILE)\b"
    if re.search(sql_attack_pattern, user_prompt, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Phát hiện cú pháp can thiệp CSDL trái phép (SQL Injection). Yêu cầu đã bị chặn!"
        )

    # Cho phép câu hỏi hợp lệ khi độc giả quên mật khẩu hoặc hỏi cách đổi mật khẩu cá nhân
    is_legit_password_help = bool(
        re.search(r"(quên\s+mật\s+khẩu|đổi\s+mật\s+khẩu|cấp\s+lại\s+mật\s+khẩu|reset\s+mật\s+khẩu)", user_prompt, flags=re.IGNORECASE)
        and not re.search(r"(admin|thủ\s*thư|root|người\s*khác|hệ\s*thống)", user_prompt, flags=re.IGNORECASE)
    )

    # Kiểm tra Prompt Injection / Khai thác mật khẩu, tài khoản, API Key, Token, Bí mật hệ thống
    prompt_injection_pattern = (
        r"(ignore\s+(all\s+)?previous\s+instructions|bỏ\s+qua\s+(mọi\s+)?chỉ\s+dẫn|"
        r"system\s+prompt|password_hash|jwt_secret|secret\s*key|"
        r"xin\s+mật\s+khẩu|cho\s+.*xin\s+mật\s+khẩu|cho\s+.*xem\s+mật\s+khẩu|cho\s+.*biết\s+mật\s+khẩu|"
        r"mật\s+khẩu\s+(là\s+gì|của|admin|thủ\s*thư|root|hệ\s*thống|user|độc\s*giả)|"
        r"lấy\s+mật\s+khẩu|dò\s+mật\s+khẩu| lộ\s+mật\s+khẩu|xem\s+mật\s+khẩu|"
        r"xin\s+pass\b|pass\s+là\s+gì|password\s+là\s+gì|cho\s+xem\s+password|admin\s+password|"
        r"xin\s+api\s*key|xem\s+api\s*key|api\s*key\s+là\s+gì|lộ\s+api\s*key|"
        r"hack\s+hệ\s+thống|vượt\s+quyền|chiếm\s+quyền)"
    )
    if not is_legit_password_help and re.search(prompt_injection_pattern, user_prompt, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Mình là hệ thống hỗ trợ độc giả SmartLib, không có quyền truy xuất các thông tin nhạy cảm. \n Nếu bạn muốn tìm cuốn sách phù hợp, hay cần mình hỗ trợ thủ tục mượn - trả gì cứ nhắn cho mình nhé! ✨"
        )


def validate_api_key_format(explicit_api_key: Optional[str]) -> Optional[str]:
    """
    Kiểm tra tính hợp lệ của API Key khi người dùng cấu hình hoặc nhập trên giao diện.
    Hỗ trợ Google Gemini / Vertex AI API Key (bắt đầu bằng 'AQ.' hoặc 'AIza...') và OpenAI API Key ('sk-...').
    Nếu nhập key sai định dạng, lập tức chặn và báo lỗi HTTP 401 rõ ràng.
    """
    if explicit_api_key is not None and explicit_api_key.strip() != "":
        key = explicit_api_key.strip()
        if len(key) < 20 or not (key.startswith("AQ") or key.startswith("AIza") or key.startswith("sk-")):
            raise HTTPException(
                status_code=401,
                detail="API Key không hợp lệ! Vui lòng nhập đúng Google Gemini API Key (bắt đầu bằng 'AQ...' hoặc 'AIza...') hoặc OpenAI API Key (bắt đầu bằng 'sk-...')."
            )
        return key

    env_key = (os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
    require_key = os.getenv("AI_REQUIRE_API_KEY", "false").lower() in ("true", "1", "yes")
    if require_key and not env_key:
        raise HTTPException(
            status_code=401,
            detail="Hệ thống yêu cầu cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY trong file .env hoặc mục Cài đặt API Key để sử dụng AI."
        )
    if env_key and (len(env_key) < 20 or not (env_key.startswith("AQ") or env_key.startswith("AIza") or env_key.startswith("sk-"))):
        raise HTTPException(
            status_code=401,
            detail="API Key cấu hình trong file .env không hợp lệ! Vui lòng kiểm tra lại GEMINI_API_KEY (bắt đầu bằng 'AQ...' hoặc 'AIza...') hoặc OPENAI_API_KEY ('sk-...')."
        )
    return env_key if env_key else None


# =========================================================================
# 3. HÀM THỰC THI NGHIỆP VỤ TRÊN CSDL (APPLICATION EXECUTORS)
# =========================================================================

def execute_search_books(db: dict, keyword: str = "", category: str = "", author: str = "") -> dict:
    books = db.get("books", [])
    kw = (keyword or "").lower().strip()
    kw_raw = remove_accents(kw)
    cat = (category or "").lower().strip()
    cat_raw = remove_accents(cat)
    auth = (author or "").lower().strip()
    auth_raw = remove_accents(auth)

    matched = []
    for b in books:
        title = (b.get("title") or "").lower()
        title_raw = remove_accents(title)
        desc = (b.get("desc") or b.get("description") or "").lower()
        desc_raw = remove_accents(desc)
        b_cat = (b.get("category") or "").lower()
        b_cat_raw = remove_accents(b_cat)
        b_auth = (b.get("author") or "").lower()
        b_auth_raw = remove_accents(b_auth)

        match = True
        if kw:
            has_kw = (kw in title or kw in desc or kw in b_auth or kw in b_cat or
                      kw_raw in title_raw or kw_raw in desc_raw or kw_raw in b_auth_raw or kw_raw in b_cat_raw)
            if not has_kw:
                match = False
        if cat:
            if cat not in b_cat and cat_raw not in b_cat_raw:
                match = False
        if auth:
            if auth not in b_auth and auth_raw not in b_auth_raw:
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

    target_raw = remove_accents(target)
    for b in books:
        title = (b.get("title") or "").lower()
        title_raw = remove_accents(title)
        if target and (target in title or title in target or target_raw in title_raw or title_raw in target_raw):
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
    if not user_id and not user_name:
        return {
            "success": False,
            "message": "Độc giả hiện chưa đăng nhập vào hệ thống. Vui lòng đăng nhập để tra cứu phiếu mượn, tiền phạt và hạn mức cá nhân."
        }

    # 1. Kiểm tra trạng thái tài khoản độc giả trong bảng users
    users = db.get("users", [])
    user_info = None
    for u in users:
        if (user_id and int(u.get("id") or 0) == int(user_id)) or (
            user_name and (u.get("fullName") or u.get("full_name") or u.get("username") or "").strip().lower() == user_name.strip().lower()
        ):
            user_info = u
            break

    is_locked = bool(user_info.get("isLocked") or user_info.get("is_locked")) if user_info else False
    lock_reason = (user_info.get("lockReason") or user_info.get("lock_reason") or "") if user_info else ""

    # 2. Kiểm tra phiếu mượn trong bảng borrowRecords
    records = db.get("borrowRecords", [])
    user_records = [
        r for r in records
        if (user_id and int(r.get("readerId") or r.get("userId") or 0) == int(user_id))
        or (user_name and (r.get("readerName") or "").strip().lower() == user_name.strip().lower())
    ]

    active_records = []
    returned_count = 0
    overdue_count = 0
    active_overdue_fine = 0.0

    for r in user_records:
        st = r.get("status")
        if st == "Đã trả":
            returned_count += 1
        if status_filter == "Đang mượn" and st not in ["Đang mượn", "Quá hạn", "Chờ duyệt"]:
            continue
        if status_filter == "Chờ duyệt" and st != "Chờ duyệt":
            continue
        if status_filter == "Tất cả" and st in ["Đã trả", "Đã hủy", "Từ chối"]:
            continue

        due_date_str = r.get("returnDate") or r.get("dueDate")
        overdue_days = int(r.get("overdueDays") or r.get("overdue_days") or 0)
        fine = float(r.get("fineAmount") or r.get("fine_amount") or 0)
        if due_date_str and st in ["Đang mượn", "Quá hạn"]:
            try:
                due_dt = datetime.fromisoformat(due_date_str.replace("Z", ""))
                diff = (datetime.now() - due_dt).days
                if diff > 0:
                    overdue_days = max(overdue_days, diff)
                    fine = max(fine, overdue_days * 2000)
            except Exception:
                pass

        if overdue_days > 0 or st == "Quá hạn":
            overdue_count += 1
            active_overdue_fine += fine

        renew_status = r.get("renewStatus") or r.get("renew_status") or "Chưa gia hạn"
        renew_count = int(r.get("renewCount") or r.get("renew_count") or 0)

        active_records.append({
            "receipt_id": r.get("id"),
            "book_id": r.get("bookId"),
            "book_title": r.get("bookTitle"),
            "borrow_type": r.get("borrowType", "Mượn về nhà"),
            "borrow_date": (r.get("borrowDate") or "")[:10],
            "due_date": (due_date_str or "")[:10],
            "status": "Quá hạn" if overdue_days > 0 else st,
            "overdue_days": overdue_days,
            "fine_amount": fine,
            "renew_status": renew_status,
            "renew_count": renew_count
        })

    # 3. Kiểm tra bảng fines (các phiếu phạt chưa nộp hoặc chờ xác nhận)
    fines_table = db.get("fines", [])
    user_unpaid_fines = [
        f for f in fines_table
        if (
            (user_id and int(f.get("readerId") or f.get("userId") or 0) == int(user_id))
            or (user_name and (f.get("readerName") or "").strip().lower() == user_name.strip().lower())
        )
        and (f.get("status") or "Chưa nộp") in ("Chưa nộp", "Chờ xác nhận", "Unpaid", "Pending")
    ]
    unpaid_fines_table_total = sum(float(f.get("fineAmount") or f.get("fine_amount") or 0) for f in user_unpaid_fines)
    total_fine_amount = max(active_overdue_fine, unpaid_fines_table_total)

    # 4. Kiểm tra bảng reservations (sách đang đặt trước)
    reservations_table = db.get("reservations", [])
    user_reservations = [
        rv for rv in reservations_table
        if (
            (user_id and int(rv.get("readerId") or rv.get("userId") or 0) == int(user_id))
            or (user_name and (rv.get("readerName") or "").strip().lower() == user_name.strip().lower())
        )
        and (rv.get("status") or "Waiting") in ("Waiting", "Ready", "Đang chờ", "Sẵn sàng")
    ]

    max_quota = 5
    remaining_quota = max(0, max_quota - len(active_records))

    return {
        "success": True,
        "user_id": user_id,
        "user_name": user_name,
        "is_locked": is_locked,
        "lock_reason": lock_reason,
        "total_active": len(active_records),
        "max_quota": max_quota,
        "remaining_quota": remaining_quota,
        "returned_count": returned_count,
        "overdue_count": overdue_count,
        "total_fine_amount": total_fine_amount,
        "unpaid_fine_records": user_unpaid_fines,
        "reservations": user_reservations,
        "borrows": active_records
    }


def execute_get_library_policy(topic: str = "all") -> dict:
    policies = {
        "borrow_process": {
            "title": "Quy trình & Thủ tục đăng ký mượn sách",
            "content": (
                "1. Đăng nhập tài khoản Độc giả trên Cổng Thư viện SmartLib.\n"
                "2. Tìm kiếm cuốn sách còn bản khả dụng (Available > 0) và bấm nút 'Đăng ký mượn'.\n"
                "3. Chọn hình thức mượn: 'Mượn về nhà' (tối đa 14 ngày) hoặc 'Đọc tại chỗ' (1 - 7 ngày).\n"
                "4. Phiếu mượn chuyển sang trạng thái 'Chờ duyệt' để Thủ thư xác nhận xuất kho bàn giao sách."
            )
        },
        "borrow_limits": {
            "title": "Hạn mức mượn sách",
            "content": "Mỗi độc giả được mượn cùng lúc tối đa 05 cuốn sách. Thời hạn mượn sách về nhà tối đa là 14 ngày (đọc tại chỗ từ 1 đến 7 ngày)."
        },
        "due_dates": {
            "title": "Thời hạn mượn & gia hạn",
            "content": "Thời hạn mượn tiêu chuẩn là 14 ngày. Độc giả có thể bấm 'Xin gia hạn' trên hệ thống tối đa 02 lần (mỗi lần từ 1 đến 20 ngày) trước khi hết hạn mượn để Thủ thư phê duyệt."
        },
        "fine_policy": {
            "title": "Chính sách phạt trễ hạn",
            "content": "Nếu trả sách quá hạn, phí phạt tự động tính theo công thức: Số ngày trễ × 2.000 VNĐ/ngày/cuốn. Nếu quá hạn từ 3 ngày trở lên, tài khoản độc giả sẽ tự động bị khóa tạm thời cho đến khi hoàn tất nộp phạt."
        },
        "qr_return_process": {
            "title": "Quy trình trả sách chuẩn bằng Mã QR tại quầy",
            "content": "Để đảm bảo kiểm kê sách vật lý, độc giả không tự bấm trả từ xa. Quy trình: Độc giả vào mục 'Sách đang mượn', bấm 'Mã QR trả sách' để xuất trình mã phiếu (#receipt_id) trên điện thoại cho Thủ thư tại quầy. Thủ thư sẽ dùng máy quét QR để kiểm tra và nhận sách vào kho trong 1-Click."
        },
        "renewal_policy": {
            "title": "Quy định gia hạn mượn sách",
            "content": "Độc giả được phép gửi yêu cầu gia hạn tối đa 02 lần đối với mỗi cuốn sách đang mượn (mỗi lần chọn từ 1 đến 20 ngày). Lưu ý: Sách đã quá hạn hoặc tài khoản đang bị khóa sẽ không thể xin gia hạn."
        },
        "opening_hours": {
            "title": "Giờ mở cửa & Địa chỉ liên hệ Thư viện SmartLib",
            "content": "Giờ mở cửa: 07:30 - 17:30 (Từ Thứ 2 đến Thứ 7 hàng tuần, nghỉ Chủ nhật và ngày lễ). Địa chỉ: Trung tâm Học liệu SmartLib - ICTU. Hotline hỗ trợ: 0987 654 321 | Email: support@smartlib.edu.vn."
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
            "title": "Quy định đặt trước sách (Reservation Queue FIFO)",
            "content": "Khi cuốn sách có số bản khả dụng bằng 0 (Tạm hết sách), độc giả được bấm 'Đặt trước' tối đa 03 cuốn theo hàng đợi ưu tiên FIFO (First-In First-Out). Khi sách được trả về kho, hệ thống tự động thông báo và giữ quyền ưu tiên mượn trong vòng 48 giờ."
        },
        "account_password_help": {
            "title": "Hướng dẫn cấp lại mật khẩu & Bảo mật tài khoản",
            "content": "Mật khẩu độc giả trên SmartLib được mã hóa một chiều (Bcrypt/SHA-256). Nếu bạn quên mật khẩu hoặc cần đổi mật khẩu mới, vui lòng mang thẻ sinh viên/CCCD đến trực tiếp Quầy Thủ thư hoặc liên hệ Hotline 0987 654 321 để được Quản trị viên xác minh và cấp lại mật khẩu."
        }
    }

    if topic in policies:
        return {"topic": topic, "policy": policies[topic]}
    return {"topic": "all", "policies": list(policies.values())}


def execute_recommend_books(db: dict, genre: str = "", limit: int = 3) -> dict:
    books = db.get("books", [])
    g = (genre or "").lower().strip()

    related_keywords = [g] if g else []
    if any(k in g for k in ["lịch sử", "tam quốc", "dã sử", "văn học", "tiểu thuyết"]):
        related_keywords.extend(["lịch sử", "văn học", "tiểu thuyết"])
    elif any(k in g for k in ["khoa học", "toán", "logic", "vật lý"]):
        related_keywords.extend(["khoa học", "công nghệ", "kỹ năng"])
    elif any(k in g for k in ["công nghệ", "lập trình", "cntt", "code"]):
        related_keywords.extend(["công nghệ", "lập trình", "python", "ai"])
    elif any(k in g for k in ["kinh tế", "tài chính", "đầu tư", "kinh doanh"]):
        related_keywords.extend(["kinh tế", "tài chính", "kinh doanh"])

    matched = []
    for b in books:
        cat = (b.get("category") or "").lower()
        title = (b.get("title") or "").lower()
        desc = (b.get("desc") or b.get("description") or "").lower()

        if not g or g == "chung":
            matched.append(b)
        elif any(rk and (rk in cat or rk in title or rk in desc) for rk in related_keywords):
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
import unicodedata

def remove_accents(text: str) -> str:
    if not text:
        return ""
    text = str(text).replace("đ", "d").replace("Đ", "D")
    nfkd = unicodedata.normalize('NFKD', text)
    return "".join([c for c in nfkd if not unicodedata.combining(c)]).lower()

def semantic_heuristic_function_caller(user_prompt: str, user_id: Optional[int], db: Optional[dict] = None) -> Optional[dict]:
    """
    Phân tích ngữ nghĩa tiếng Việt đa dạng (có dấu, không dấu, teen-code, viết tắt, từ đồng nghĩa)
    để ánh xạ chính xác vào đúng 5 Function Calling của Thư viện SmartLib:
    1. get_my_active_borrows: Sách đang mượn, hạn trả, quá hạn, tiền phạt cá nhân của độc giả.
    2. get_library_policy: Hướng dẫn mượn, quy định, nội quy, giờ mở cửa, đền bù, gia hạn, VNPay.
    3. check_book_availability: Kiểm tra tồn kho, số lượng còn, vị trí kệ sách của cuốn sách cụ thể.
    4. recommend_books: Gợi ý sách theo thể loại, chủ đề (Văn học, Kinh tế, Công nghệ, Kỹ năng...).
    5. search_books: Tìm kiếm sách theo từ khóa tên sách hoặc tác giả.
    """
    p = user_prompt.lower().strip()
    p_raw = remove_accents(p)

    # 1. Tra cứu hồ sơ cá nhân: sách đang mượn, quá hạn cá nhân, tiền phạt, hạn mức mượn, đặt trước
    personal_borrow_triggers = [
        "mượn gì", "muon gi", "đang mượn", "dang muon", "hạn trả", "han tra",
        "sách của tôi", "sach cua toi", "sách của mình", "sach cua minh",
        "phiếu mượn của tôi", "phieu muon cua toi", "phiếu mượn", "phieu muon",
        "danh sách mượn", "danh sach muon", "quá hạn của tôi", "qua han cua toi",
        "sách quá hạn không", "sach qua han khong", "có quá hạn không", "co qua han khong",
        "tôi có sách quá hạn", "toi co sach qua han", "tiền phạt của tôi", "tien phat cua toi",
        "tiền phạt của mình", "tôi bị phạt bao nhiêu", "toi bi phat bao nhieu", "tôi bị phạt",
        "toi bi phat", "tôi có bị phạt", "toi co bi phat", "t có bị phạt", "phạt của tôi", "phat cua toi",
        "nợ tiền phạt của tôi", "tiền phạt cá nhân", "tien phat ca nhan", "nợ phạt", "nợ tiền phạt",
        "tôi nợ phạt", "toi no phat", "tôi có bị phạt không", "toi co bi phat khong",
        "có đang bị phạt", "bị phạt gì không", "bị phạt không", "mình có bị phạt",
        "tài khoản của tôi", "tài khoản của mình", "t có bị khóa", "tôi có bị khóa",
        "còn mượn được mấy", "còn mượn thêm được", "hạn mức của tôi", "hạn mức",
        "đặt trước của tôi", "sách tôi đặt trước", "gia hạn của tôi"
    ]
    if any(k in p or k in p_raw for k in personal_borrow_triggers):
        status_flt = "Tất cả"
        if "chờ duyệt" in p or "cho duyet" in p_raw:
            status_flt = "Chờ duyệt"
        return {
            "function": "get_my_active_borrows",
            "arguments": {
                "status_filter": status_flt
            }
        }

    # 2. Hướng dẫn cách mượn & Tra cứu quy chế, nội quy, thủ tục mượn - trả, giờ mở cửa, khóa tài khoản, mất sách, VNPay, đặt trước, hỗ trợ quên/đổi mật khẩu
    policy_triggers = [
        "làm sao để mượn", "lam sao de muon", "cách mượn sách", "cach muon sach", "hướng dẫn mượn", "huong dan muon",
        "mượn sách như thế nào", "muon sach nhu the nao", "quy trình mượn", "quy trinh muon", "thủ tục mượn", "cách mượn",
        "quy định", "quy dinh", "nội quy", "noi quy", "hạn mượn", "han muon", "thời hạn", "thoi han",
        "bao lâu", "bao lau", "tối đa mấy cuốn", "tối đa", "toi da", "mấy cuốn", "may cuon", "trả sách", "tra sach",
        "phạt", "phat", "gia hạn", "gia han", "mã qr", "ma qr", "mở cửa", "mo cua", "mấy giờ", "may gio",
        "địa chỉ", "dia chi", "liên hệ", "lien he", "số điện thoại", "hotline", "email",
        "mất sách", "mat sach", "rách sách", "hư hỏng", "đền bù", "làm mất",
        "bị khóa", "bi khoa", "mở khóa", "vnpay", "thanh toán phạt", "thanh toán",
        "đặt trước", "dat truoc", "hàng chờ", "hang cho", "giữ sách", "giu sach",
        "quên mật khẩu", "đổi mật khẩu", "lấy lại mật khẩu", "khôi phục mật khẩu"
    ]
    if any(k in p or k in p_raw for k in policy_triggers):
        topic = "all"
        if any(k in p for k in ["quên mật khẩu", "đổi mật khẩu", "lấy lại mật khẩu", "khôi phục mật khẩu"]):
            topic = "account_password_help"
        elif any(k in p for k in ["cách mượn", "thủ tục mượn", "làm sao để mượn", "mượn sách như thế nào", "quy trình mượn"]):
            topic = "borrow_process"
        elif any(k in p for k in ["mở cửa", "mấy giờ", "địa chỉ", "liên hệ", "số điện thoại", "hotline", "email", "ở đâu"]) and not any(k in p for k in ["cuốn", "sách"]):
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
        elif any(k in p for k in ["làm sao để mượn", "cách mượn", "hướng dẫn mượn", "mượn như thế nào", "tối đa", "mấy cuốn", "hạn mức"]):
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

    # 3. Phím tắt thể loại sách: Độc giả gõ nhanh tên thể loại (vd: "sách văn học", "kinh tế", "công nghệ")
    category_shortcut_map = {
        "văn học": "Văn học", "van hoc": "Văn học", "tiểu thuyết": "Văn học", "tieu thuyet": "Văn học", "truyện": "Văn học",
        "kinh tế": "Kinh tế", "kinh te": "Kinh tế", "kinh doanh": "Kinh tế", "tài chính": "Kinh tế", "tai chinh": "Kinh tế",
        "công nghệ": "Công nghệ", "cong nghe": "Công nghệ", "lập trình": "Công nghệ", "lap trinh": "Công nghệ", "cntt": "Công nghệ", "ai": "Công nghệ",
        "kỹ năng": "Kỹ năng sống", "ky nang": "Kỹ năng sống", "tâm lý": "Kỹ năng sống", "tam ly": "Kỹ năng sống", "phát triển bản thân": "Kỹ năng sống",
        "lịch sử": "Lịch sử", "lich su": "Lịch sử", "khoa học": "Khoa học", "khoa hoc": "Khoa học",
        "manga": "Manga & Shounen", "comic": "Manga & Shounen", "anime": "Manga & Shounen"
    }
    clean_cat_query = re.sub(r"^(?:sách|sach|thể loại|the loai|mảng|chủ đề|chu de)\s+", "", p_raw).strip(" .,?!~-")
    if clean_cat_query in category_shortcut_map:
        return {
            "function": "recommend_books",
            "arguments": {
                "genre": category_shortcut_map[clean_cat_query],
                "limit": 3
            }
        }

    # 4. Kiểm tra tình trạng kho / số lượng còn của cuốn sách cụ thể
    avail_triggers = ["còn không", "con khong", "còn bao nhiêu", "con bao nhieu", "còn sách", "con sach",
                      "sẵn sàng", "san sang", "kệ nào", "ke nao", "vị trí", "vi tri", "còn mấy cuốn", "con may cuon"]
    if any(k in p or k in p_raw for k in avail_triggers):
        book_title = ""
        if db:
            for book in db.get("books", []):
                bt = (book.get("title") or "").strip()
                bt_raw = remove_accents(bt)
                if bt and len(bt) >= 3:
                    if bt.lower() in p or (len(bt_raw) >= 3 and bt_raw in p_raw):
                        book_title = bt
                        break
                    clean_bt = re.split(r"[:\-\(\[]", bt_raw)[0].strip()
                    if clean_bt and len(clean_bt) >= 4 and clean_bt in p_raw:
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
                for stop in [
                    "còn không", "con khong", "còn bao nhiêu", "con bao nhieu", "còn trong kho", "con trong kho",
                    "ở đâu", "o dau", "không bạn", "khong ban", "vậy bạn", "vay ban", "hiện", "hien",
                    "trong kho và", "còn mấy cuốn", "con may cuon", "cuốn", "cuon", "sách", "sach"
                ]:
                    extracted = re.sub(rf"(?i)\b{re.escape(stop)}\b", "", extracted).strip()
                if db and extracted:
                    ext_raw = remove_accents(extracted)
                    for book in db.get("books", []):
                        bt = (book.get("title") or "").strip()
                        bt_raw = remove_accents(bt)
                        if ext_raw and (ext_raw in bt_raw or bt_raw in ext_raw or ext_raw in bt.lower()):
                            book_title = bt
                            break
                if not book_title:
                    book_title = extracted

        if book_title:
            return {
                "function": "check_book_availability",
                "arguments": {
                    "book_title": book_title
                }
            }

    # 5. Gợi ý sách theo chủ đề (hỗ trợ cả tiếng Việt và tiếng Anh)
    if any(k in p or k in p_raw for k in [
        "gợi ý", "goi y", "đề xuất", "de xuat", "sách hay", "sach hay", "tư vấn", "tu van", "nên đọc", "nen doc", "hot nhất", "hot nhat",
        "recommend", "suggest", "good books", "best books", "book recommendation"
    ]):
        genre = "Chung"
        if any(k in p or k in p_raw for k in ["phát triển bản thân", "phat trien ban than", "kỹ năng", "ky nang", "tư duy", "tu duy", "tâm lý", "tam ly"]):
            genre = "Kỹ năng sống"
        elif any(k in p or k in p_raw for k in ["lập trình", "lap trinh", "công nghệ", "cong nghe", "ai", "cntt", "python", "khoa học", "khoa hoc"]):
            genre = "Công nghệ"
        elif any(k in p or k in p_raw for k in ["kinh tế", "kinh te", "kinh doanh", "làm giàu", "lam giau", "tài chính", "tai chinh", "đầu tư", "dau tu"]):
            genre = "Kinh tế"
        elif any(k in p or k in p_raw for k in ["văn học", "van hoc", "tiểu thuyết", "tieu thuyet", "truyện", "truyen"]):
            genre = "Văn học"
        elif any(k in p or k in p_raw for k in ["lịch sử", "lich su"]):
            genre = "Lịch sử"

        return {
            "function": "recommend_books",
            "arguments": {
                "genre": genre,
                "limit": 3
            }
        }

    # 6. Tìm kiếm sách theo tên sách, tác giả hoặc từ khóa có thực trong CSDL (hỗ trợ cả có dấu, không dấu, viết tắt)
    if db:
        clean_p_term = p_raw.strip(" .,?!~-")
        for book in db.get("books", []):
            bt = (book.get("title") or "").strip()
            ba = (book.get("author") or "").strip()
            bt_raw = remove_accents(bt)
            ba_raw = remove_accents(ba)
            if bt and len(bt) >= 3:
                if bt.lower() in p or (len(bt_raw) >= 3 and bt_raw in p_raw) or (len(clean_p_term) >= 4 and clean_p_term in bt_raw):
                    return {
                        "function": "check_book_availability",
                        "arguments": {"book_title": bt}
                    }
            if ba and len(ba) >= 3 and (ba.lower() in p or (len(ba_raw) >= 3 and ba_raw in p_raw)):
                return {
                    "function": "search_books",
                    "arguments": {"author": ba}
                }

    # Bắt tất cả ý định tìm sách, kiếm sách, mượn sách, chọn sách, sách hay (cả có dấu & không dấu, teen-code)
    book_search_triggers = [
        "tìm sách", "tim sach", "kiếm sách", "kiem sach", "tra cứu sách", "tra cuu sach",
        "muốn tìm", "muon tim", "muốn kiếm", "muon kiem", "tìm kiếm", "tim kiem",
        "cần tìm", "can tim", "cần kiếm", "can kiem", "muốn mượn", "muon muon",
        "đọc sách", "doc sach", "mượn sách", "muon sach", "xem sách", "xem sach",
        "sách gì", "sach gi", "có sách", "co sach", "sách nào", "sach nao",
        "cuốn sách nào", "cuon sach nao", "sách hay", "sach hay", "chọn sách", "chon sach",
        "thư viện có", "thu vien co", "thư viện còn", "thu vien con", "bên mình có", "ben minh co"
    ]
    if any(k in p or k in p_raw for k in book_search_triggers):
        stop_phrases = [
            "tôi muốn tìm kiếm sách", "toi muon tim kiem sach",
            "tôi muốn tìm sách", "toi muon tim sach", "tôi muốn kiếm sách", "toi muon kiem sach",
            "mình muốn tìm sách", "minh muon tim sach", "mình muốn kiếm sách", "minh muon kiem sach",
            "tôi muốn tìm kiếm", "toi muon tim kiem", "tôi muốn tìm", "toi muon tim", "tôi muốn kiếm", "toi muon kiem",
            "muốn tìm sách", "muon tim sach", "muốn kiếm sách", "muon kiem sach",
            "tìm kiếm sách", "tim kiem sach", "tra cứu sách", "tra cuu sach",
            "tìm sách", "tim sach", "kiếm sách", "kiem sach", "tìm cuốn", "tim cuon",
            "có sách nào về", "co sach nao ve", "có sách nào", "co sach nao",
            "thư viện có", "thu vien co", "thư viện còn", "thu vien con",
            "bên mình có", "ben minh co", "có sách", "co sach", "sách gì", "sach gi",
            "muốn mượn sách", "muon muon sach", "muốn mượn", "muon muon", "mượn sách", "muon sach",
            "cần tìm sách", "can tim sach", "cần kiếm sách", "can kiem sach",
            "cần tìm", "can tim", "cần kiếm", "can kiem",
            "tìm giúp mình", "tim giup minh", "cho mình xem", "cho minh xem", "cho tôi xem", "cho toi xem",
            "về chủ đề", "ve chu de",
            "tôi muốn", "toi muon", "mình muốn", "minh muon",
            "ở thư viện", "o thu vien", "trong kho", "trong thu vien",
            "còn sách", "con sach", "có cuốn", "co cuon", "tìm quyển", "tim quyen"
        ]
        stop_phrases.sort(key=len, reverse=True)
        kw = user_prompt
        for sp in stop_phrases:
            kw = re.sub(rf"(?i)\b{re.escape(sp)}\b", " ", kw)

        trail_pattern = r"(?i)\s+(?:k|ko|kh|khong|không|hok|hông|k\s+bạn|ko\s+bạn|k\s+b|ko\s+b|k\s+ad|ko\s+ad|không\s+bạn|không\s+ạ|khong\s+a|ạ|a|nha|nhé|nhe|vậy|vay|hả|ha|nhỉ|nhi|hử|sao)[\s\.,?!~]*$"
        kw = re.sub(trail_pattern, "", kw)
        kw = re.sub(r"^(?:sách|sach|cuốn|cuon|quyển|quyen|về|ve)\s+", "", kw, flags=re.IGNORECASE)
        kw = re.sub(r"\s+", " ", kw).strip(" .,?!~-")
        kw_clean_raw = remove_accents(kw)

        if not kw or len(kw) < 2 or kw_clean_raw in ["sach", "cuon sach", "quyen sach", "hay", "hay khong", "moi", "hot", "nao", "gi"]:
            return {
                "function": "recommend_books",
                "arguments": {
                    "genre": "Chung",
                    "limit": 3
                }
            }

        if any(w in kw_clean_raw for w in ["lap trinh", "cong nghe", "ai", "python", "cntt", "code"]):
            return {
                "function": "recommend_books",
                "arguments": {
                    "genre": "Công nghệ",
                    "limit": 3
                }
            }
        if any(w in kw_clean_raw for w in ["ky nang", "tam ly", "phat trien ban than", "giao tiep"]):
            return {
                "function": "recommend_books",
                "arguments": {
                    "genre": "Kỹ năng sống",
                    "limit": 3
                }
            }
        if any(w in kw_clean_raw for w in ["kinh te", "tai chinh", "kinh doanh", "dau tu"]):
            return {
                "function": "recommend_books",
                "arguments": {
                    "genre": "Kinh tế",
                    "limit": 3
                }
            }

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


# =========================================================================
# 4B. BỘ NHỚ NGỮ CẢNH RIÊNG CHO TỪNG PHIÊN TRÒ CHUYỆN (PER-SESSION MEMORY)
# =========================================================================

SESSION_MEMORY: Dict[str, Dict[str, Any]] = {}


def infer_topic_and_genre(text: str) -> tuple[str, str, bool]:
    """
    Phân tích câu hỏi hoặc nội dung hội thoại trước đó để suy luận:
    (genre_in_db, topic_label, is_math_question)
    """
    p = (text or "").lower().strip()

    math_match = re.search(r"(\d+(?:\.\d+)?\s*[\+\-\*\/xX:]\s*\d+(?:\.\d+)?)", p)
    if math_match or any(k in p for k in ["bài toán", "phép tính", "bằng mấy", "tính toán", "phương trình", "đạo hàm", "tích phân"]):
        return "Khoa học", "Khoa học & Tư duy Logic", True

    if any(k in p for k in [
        "chu du", "tam quốc", "tào tháo", "lưu bị", "gia cát lượng", "khổng minh", "quan vũ",
        "trương phi", "đông ngô", "xích bích", "lịch sử", "triều đại", "vua ", "hoàng đế",
        "chiến dịch", "chiến tranh", "dã sử", "tiểu thuyết", "văn học", "nhà văn", "nhà thơ"
    ]):
        return "Lịch sử", "lịch sử, tiểu thuyết dã sử & văn học", False

    if any(k in p for k in [
        "viết code", "lập trình", "code ", "c++", "java", "javascript", "python", "html",
        "css", "sql", "react", "docker", "ai ", "trí tuệ nhân tạo", "thuật toán", "phần mềm", "công nghệ"
    ]):
        return "Công nghệ", "Công nghệ thông tin & Lập trình", False

    if any(k in p for k in [
        "giá vàng", "chứng khoán", "cổ phiếu", "bitcoin", "crypto", "tỷ giá", "lãi suất",
        "bất động sản", "kinh tế", "tài chính", "đầu tư", "làm giàu", "kinh doanh", "khởi nghiệp"
    ]):
        return "Kinh tế", "Kinh tế, Tài chính & Đầu tư", False

    if any(k in p for k in ["vật lý", "hóa học", "sinh học", "vũ trụ", "thiên văn", "khoa học"]):
        return "Khoa học", "Khoa học & Khám phá", False

    if any(k in p for k in ["kỹ năng", "tâm lý", "giao tiếp", "thói quen", "cảm xúc", "chữa lành", "phát triển bản thân"]):
        return "Kỹ năng sống", "Kỹ năng sống & Phát triển bản thân", False

    return "Kỹ năng sống", "các đầu sách hay chọn lọc", False


def get_session_key(session_id: Optional[str], user_id: Optional[int]) -> str:
    if session_id and session_id.strip():
        return session_id.strip()
    if user_id is not None:
        return f"user_session_{user_id}"
    return "default_guest_session"


def get_or_sync_session_state(
    session_key: str,
    history: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Lấy hoặc đồng bộ bộ nhớ phiên trò chuyện từ RAM (SESSION_MEMORY) kết hợp với lịch sử gửi từ Frontend (history).
    Khi người dùng bấm xóa đoạn chat trên giao diện (history rỗng), tự động làm mới bộ nhớ phiên.
    """
    if history is not None and len(history) == 0 and session_key in SESSION_MEMORY:
        SESSION_MEMORY.pop(session_key, None)

    state = SESSION_MEMORY.setdefault(
        session_key,
        {
            "turns": [],
            "pending_genre": None,
            "pending_topic_label": None,
            "last_book_title": None,
            "updated_at": datetime.now().isoformat(),
        },
    )

    # Nếu Frontend truyền lịch sử hội thoại của phiên hiện tại, đồng bộ vào bộ nhớ để không bao giờ quên ngữ cảnh
    if history:
        for msg in history[-10:]:
            content = (msg.get("content") or msg.get("text") or "").strip()
            if not content:
                continue
            genre, topic_label, _ = infer_topic_and_genre(content)
            if genre and topic_label and topic_label != "các đầu sách hay chọn lọc":
                state["pending_genre"] = genre
                state["pending_topic_label"] = topic_label
            sug = msg.get("suggested_books")
            if isinstance(sug, list) and len(sug) > 0 and sug[0].get("title"):
                state["last_book_title"] = sug[0].get("title")

        if not state["turns"]:
            for msg in history[-8:]:
                role = msg.get("role") or ("user" if msg.get("sender") == "user" else "assistant")
                content = (msg.get("content") or msg.get("text") or "").strip()
                if content:
                    state["turns"].append({"role": role, "content": content})

    return state


def save_turn_to_session(
    session_key: str,
    user_prompt: str,
    ai_reply: str,
    intent_name: str,
    suggested_books: list,
    inferred_genre: Optional[str] = None,
    inferred_topic_label: Optional[str] = None,
):
    state = SESSION_MEMORY.setdefault(
        session_key,
        {
            "turns": [],
            "pending_genre": None,
            "pending_topic_label": None,
            "last_book_title": None,
            "updated_at": datetime.now().isoformat(),
        },
    )
    state["turns"].append({"role": "user", "content": user_prompt, "intent": intent_name})
    state["turns"].append({"role": "assistant", "content": ai_reply, "intent": intent_name})
    state["turns"] = state["turns"][-16:]
    state["updated_at"] = datetime.now().isoformat()

    if inferred_genre:
        state["pending_genre"] = inferred_genre
    if inferred_topic_label:
        state["pending_topic_label"] = inferred_topic_label
    if suggested_books and isinstance(suggested_books, list) and len(suggested_books) > 0:
        first_title = suggested_books[0].get("title")
        if first_title:
            state["last_book_title"] = first_title


def resolve_followup_with_session_memory(
    user_prompt: str,
    session_state: Dict[str, Any],
    db: dict,
    user_id: Optional[int],
    user_name: Optional[str],
) -> Optional[tuple[str, dict, list, str]]:
    """
    Kiểm tra xem câu chat hiện tại có phải là câu trả lời tiếp nối ngữ cảnh phiên trước hay không:
    1. Người dùng nhắn "đồng ý", "ok", "có", "vâng", "dạ", "gợi ý đi", "giới thiệu đi", "cho mình xem"...
       -> Lấy chủ đề ở câu hỏi trước trong phiên (ví dụ: Lịch sử Tam Quốc / Chu Du / Lập trình / Kinh tế...) để gợi ý sách ngay!
    2. Người dùng hỏi tiếp về cuốn sách vừa nhắc tới ("cuốn đó còn không", "tác giả cuốn đó là ai", "sách đó ở kệ nào")
       -> Lấy last_book_title trong bộ nhớ phiên để kiểm tra tồn kho!
    3. Người dùng hỏi "còn cuốn nào khác không", "gợi ý thêm đi"
       -> Gợi ý thêm sách cùng thể loại trong phiên!
    """
    p = user_prompt.lower().strip()
    clean_p = re.sub(r"[!.,?~]+$", "", p).strip()

    has_previous_context = bool(
        session_state.get("turns")
        or session_state.get("pending_genre")
        or session_state.get("last_book_title")
    )
    if not has_previous_context:
        return None

    # Nhóm 1: Độc giả xác nhận "Đồng ý" / "OK" / "Gợi ý đi" sau khi AI đề xuất giới thiệu sách ở lượt trước
    affirmative_exact = {
        "đồng ý", "dong y", "ok", "oke", "okay", "okie", "dạ", "vâng", "ừ", "ừa", "uh",
        "có", "có ạ", "có nhé", "được", "được nhé", "nhất trí", "triển đi", "gợi ý đi",
        "giới thiệu đi", "giới thiệu sách đi", "gợi ý sách đi", "cho mình xem", "cho tôi xem",
        "tìm giúp mình", "tìm giúp tôi", "ok bạn", "đồng ý nhé", "đồng ý ạ", "vâng ạ"
    }
    is_affirmative = (
        clean_p in affirmative_exact
        or any(
            clean_p.startswith(prefix) and len(clean_p) <= 35
            for prefix in ["đồng ý", "ok ", "dạ đồng ý", "vâng đồng ý", "gợi ý cho", "giới thiệu cho", "cho mình xem sách"]
        )
    )

    if is_affirmative:
        genre = session_state.get("pending_genre") or "Văn học"
        topic_label = session_state.get("pending_topic_label") or "chủ đề bạn vừa quan tâm"

        # Nếu chưa có pending_genre rõ ràng, quét lại các lượt hội thoại trước trong phiên
        if not session_state.get("pending_genre") and session_state.get("turns"):
            for turn in reversed(session_state["turns"]):
                g_cand, t_cand, _ = infer_topic_and_genre(turn.get("content", ""))
                if t_cand != "các đầu sách hay chọn lọc":
                    genre = g_cand
                    topic_label = t_cand
                    break

        fn_name = "recommend_books"
        fn_args = {"genre": genre, "limit": 3}
        tool_result = run_tool(fn_name, fn_args, db, user_id, user_name)
        _, suggested_books = generate_natural_response_from_tool(fn_name, fn_args, tool_result, user_name)

        greeting = f"Dạ mình chào {user_name} ạ 😊" if user_name else "Dạ vâng ạ 😊"
        lines = [
            f"{greeting} Tiếp nối câu chuyện vừa rồi về **{topic_label}**, mình xin giới thiệu cho bạn các đầu sách hấp dẫn đang có sẵn trong kho **Thư viện SmartLib** nhé: 📚✨\n"
        ]
        for idx, b in enumerate(tool_result.get("recommendations", []), start=1):
            lines.append(
                f"{idx}. 📘 **{b['title']}** — *Tác giả: {b['author']}* (Thể loại: {b['category']} | Còn sẵn: **{b['available_copies']} cuốn**)"
            )
        lines.append("\nBạn có thể bấm trực tiếp vào thẻ sách bên dưới để xem chi tiết hoặc đăng ký mượn ngay nha! 🥰")

        tool_call_meta = {
            "name": fn_name,
            "arguments": fn_args,
            "status": "executed",
            "context_memory": f"Khôi phục ngữ cảnh phiên: {topic_label}"
        }
        return "\n".join(lines), tool_call_meta, suggested_books, fn_name

    # Nhóm 2: Độc giả hỏi tiếp về cuốn sách vừa nhắc tới ở lượt trước ("cuốn đó còn không", "sách đó ở kệ nào", "tác giả cuốn đó")
    last_book = session_state.get("last_book_title")
    if last_book and any(k in clean_p for k in ["cuốn đó", "sách đó", "cuốn này", "sách này", "tác phẩm đó"]):
        fn_name = "check_book_availability"
        fn_args = {"book_title": last_book}
        tool_result = run_tool(fn_name, fn_args, db, user_id, user_name)
        final_reply, suggested_books = generate_natural_response_from_tool(fn_name, fn_args, tool_result, user_name)
        tool_call_meta = {
            "name": fn_name,
            "arguments": fn_args,
            "status": "executed",
            "context_memory": f"Khôi phục sách từ phiên: {last_book}"
        }
        return final_reply, tool_call_meta, suggested_books, fn_name

    # Nhóm 3: Độc giả hỏi "còn cuốn nào khác không", "gợi ý thêm sách khác"
    if any(k in clean_p for k in ["còn cuốn nào khác", "còn sách nào khác", "gợi ý thêm", "giới thiệu thêm"]):
        genre = session_state.get("pending_genre") or "Chung"
        fn_name = "recommend_books"
        fn_args = {"genre": genre, "limit": 4}
        tool_result = run_tool(fn_name, fn_args, db, user_id, user_name)
        final_reply, suggested_books = generate_natural_response_from_tool(fn_name, fn_args, tool_result, user_name)
        tool_call_meta = {
            "name": fn_name,
            "arguments": fn_args,
            "status": "executed",
            "context_memory": f"Mở rộng gợi ý theo phiên: {genre}"
        }
        return final_reply, tool_call_meta, suggested_books, fn_name

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
    - Nhận diện câu hỏi thống kê thư viện.
    - Đối với MỌI câu hỏi ngoài phạm vi thư viện (toán học, lịch sử, thời tiết, bóng đá, giá vàng, viết code...),
      trả lời theo đúng Form CSKH 3 đoạn chuẩn mực (giống mẫu Shopee CSKH) kèm gợi mở giới thiệu sách theo phiên.
    """
    p = user_prompt.lower().strip()
    user_display = user_name or "bạn"
    books = db.get("books", [])

    # 1. Nhóm chào hỏi / cảm ơn / hỏi danh tính
    if re.match(r"^(xin chào|chào|hello|hi|hey|alo|chào bạn|chào ad|cảm ơn|thank|thanks|bạn là ai|ai vậy)\b", p):
        reply = (
            f"Dạ mình chào {user_display} ạ 😊\n\n"
            f"Mình là **Trợ lý Thủ thư AI** của Hệ thống Thư viện Thông minh **SmartLib** (hiện đang quản lý **{len(books)} đầu sách**).\n\n"
            f"Mình chuyên hỗ trợ các vấn đề liên quan đến tra cứu sách, kiểm tra tồn kho, phiếu mượn - trả, gia hạn và nội quy thư viện. Nếu bạn cần hỗ trợ gì về SmartLib, cứ nhắn mình bất cứ lúc nào ạ 🥰"
        )
        return reply, [], "general_greeting"

    # 2. Nhóm câu hỏi thống kê tổng số sách / danh mục thể loại trong thư viện
    if any(k in p for k in [
        "bao nhiêu đầu sách", "tổng số sách", "có bao nhiêu cuốn sách",
        "mấy cuốn sách trong thư viện", "những thể loại sách nào",
        "các thể loại sách", "danh mục sách", "thư viện có sách gì"
    ]):
        total_titles = len(books)
        total_copies = sum(int(b.get("quantity", 0)) for b in books)
        avail_copies = sum(int(b.get("available", b.get("available_copies", 0))) for b in books)
        cat_counts: Dict[str, int] = {}
        for b in books:
            cat = (b.get("category") or "Khác").strip()
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
        cat_summary = ", ".join(f"**{c}** ({n} đầu sách)" for c, n in sorted(cat_counts.items(), key=lambda x: -x[1])[:8])
        reply = (
            f"Dạ mình chào {user_display} ạ 😊 Hiện tại kho dữ liệu **Thư viện SmartLib** đang lưu trữ:\n\n"
            f"- 📚 **Tổng số đầu sách:** **{total_titles} đầu sách**\n"
            f"- 📦 **Tổng số bản sách nhập kho:** **{total_copies} cuốn**\n"
            f"- 🟢 **Số bản sẵn sàng cho mượn ngay:** **{avail_copies} cuốn**\n"
            f"- 🏷️ **Các thể loại nổi bật:** {cat_summary}\n\n"
            f"Bạn muốn tìm sách thuộc thể loại nào cứ nhắn mình bất cứ lúc nào ạ 🥰"
        )
        return reply, [], "library_stats"

    # 3. Nhóm câu hỏi NGOÀI PHẠM VI THƯ VIỆN -> Áp dụng chuẩn Form 3 đoạn (Dạ mình chào bạn ạ 😊 ...)
    genre, topic_label, is_math = infer_topic_and_genre(user_prompt)

    if is_math:
        reply = (
            f"Dạ mình chào {user_display} ạ 😊\n\n"
            f"Mình là trợ lý chăm sóc độc giả của **Thư viện SmartLib**, nên mình chỉ hỗ trợ các vấn đề liên quan đến tra cứu sách, kiểm tra tồn kho, phiếu mượn - trả, gia hạn hay tài khoản thư viện thôi ạ.\n\n"
            f"Còn bài toán này thì bạn có thể hỏi bạn bè hoặc dùng công cụ tính toán trên điện thoại nha. Nếu bạn muốn mình giới thiệu các đầu sách **{topic_label}** trong kho thư viện (chỉ cần nhắn **\"Đồng ý\"**), hoặc cần hỗ trợ gì về SmartLib, cứ nhắn mình bất cứ lúc nào ạ 🥰"
        )
        return reply, [], "out_of_scope"

    reply = (
        f"Dạ mình chào {user_display} ạ 😊\n\n"
        f"Mình là trợ lý chăm sóc độc giả của **Thư viện SmartLib**, nên mình chỉ hỗ trợ các vấn đề liên quan đến tra cứu sách, kiểm tra tồn kho, phiếu mượn - trả, gia hạn hay tài khoản thư viện thôi ạ.\n\n"
        f"Còn câu hỏi này thì bạn có thể hỏi bạn bè hoặc tra cứu trên các công cụ tìm kiếm chuyên dụng nha. Nếu bạn muốn tìm hiểu thêm về **{topic_label}** qua các đầu sách trong kho SmartLib thì hãy nhắn **\"Đồng ý\"** để mình giới thiệu sách ngay, hoặc nếu cần hỗ trợ gì về SmartLib, cứ nhắn mình bất cứ lúc nào ạ 🥰"
    )
    return reply, [], "out_of_scope"


# =========================================================================
# 4D. BỘ TRÌNH BÀY CÂU TRẢ LỜI (RESPONSE PRESENTER)
# - Mỗi câu hỏi chỉ trả lời ĐÚNG TRỌNG TÂM (không gộp chung một khối thông tin).
# - Câu hỏi chứa nhiều ý (VD: "mở cửa mấy giờ và mất sách phạt bao nhiêu")
#   được tách thành từng mục riêng biệt, đánh số rõ ràng.
# =========================================================================

CURRENT_USER_PROMPT: ContextVar[str] = ContextVar("CURRENT_USER_PROMPT", default="")

SECTION_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"]


def _greet(user_name: Optional[str]) -> str:
    return f"Chào bạn **{user_name}** 👋" if user_name else "Chào bạn 👋"


def _days_left_text(due_date: str) -> str:
    try:
        due_dt = datetime.fromisoformat((due_date or "")[:10])
        diff = (due_dt.date() - datetime.now().date()).days
        if diff > 0:
            return f"còn {diff} ngày"
        if diff == 0:
            return "đến hạn hôm nay"
        return f"đã quá {abs(diff)} ngày"
    except Exception:
        return ""


def detect_personal_focus(user_prompt: str) -> str:
    """Xác định độc giả đang hỏi KHÍA CẠNH nào trong hồ sơ cá nhân để trả lời đúng trọng tâm."""
    p = (user_prompt or "").lower()
    if any(k in p for k in ["phạt", "nợ", "quá hạn", "trễ hạn"]):
        return "fines"
    if any(k in p for k in ["bị khóa", "bị khoá", "khóa tài khoản", "trạng thái tài khoản", "tài khoản của"]):
        return "account"
    if any(k in p for k in ["đặt trước", "giữ chỗ", "hàng chờ"]):
        return "reservations"
    if "gia hạn" in p:
        return "renewal"
    if any(k in p for k in ["bao nhiêu cuốn", "mấy cuốn", "bao nhiêu sách", "mấy quyển", "bao nhiêu quyển",
                            "số lượng", "còn mượn được", "còn được mượn", "mượn thêm", "hạn mức"]):
        return "count"
    if any(k in p for k in ["danh sách", "hạn trả", "mượn gì", "những sách", "những cuốn", "phiếu mượn",
                            "đang mượn", "sách của tôi", "sách của mình"]):
        return "list"
    return "overview"


POLICY_TOPIC_KEYWORDS = [
    ("opening_hours", ["mở cửa", "mấy giờ", "giờ làm việc", "địa chỉ", "hotline", "số điện thoại", "liên hệ", "email"]),
    ("borrow_process", ["cách mượn", "thủ tục mượn", "làm sao để mượn", "mượn sách như thế nào", "quy trình mượn", "đăng ký mượn"]),
    ("borrow_limits", ["tối đa mấy cuốn", "tối đa bao nhiêu cuốn", "được mượn mấy cuốn", "được mượn bao nhiêu", "hạn mức"]),
    ("due_dates", ["hạn mượn", "mượn bao lâu", "thời hạn mượn", "mượn được mấy ngày", "mấy ngày"]),
    ("renewal_policy", ["gia hạn"]),
    ("lost_book_policy", ["mất sách", "làm mất", "rách sách", "hư hỏng", "đền bù"]),
    ("fine_policy", ["trễ hạn", "quá hạn", "phạt trễ", "tiền phạt", "mức phạt"]),
    ("account_lock_vnpay", ["bị khóa", "mở khóa", "vnpay", "thanh toán phạt"]),
    ("reservation_policy", ["đặt trước", "hàng chờ", "giữ sách"]),
    ("qr_return_process", ["trả sách", "mã qr", "quét mã"]),
    ("account_password_help", ["quên mật khẩu", "đổi mật khẩu", "lấy lại mật khẩu", "khôi phục mật khẩu"]),
]


def detect_policy_topics(user_prompt: str) -> List[str]:
    """Tách một câu hỏi nhiều ý thành danh sách các chủ đề quy định (theo thứ tự xuất hiện)."""
    p = (user_prompt or "").lower()
    found = []
    for topic, kws in POLICY_TOPIC_KEYWORDS:
        positions = [p.find(k) for k in kws if k in p]
        if positions:
            found.append((min(positions), topic))
    # "mất sách ... phạt" chỉ là 1 ý đền bù, không tính thêm phạt trễ hạn
    topics = [t for _, t in sorted(found)]
    if "lost_book_policy" in topics and "fine_policy" in topics and not any(k in p for k in ["trễ hạn", "quá hạn"]):
        topics.remove("fine_policy")
    return topics


def render_policy_section(topic: str) -> tuple[str, str]:
    """Trả về (tiêu đề, nội dung) đã định dạng gọn gàng cho từng chủ đề quy định."""
    sections = {
        "opening_hours": (
            "🕒 Giờ mở cửa & Liên hệ",
            "• Thứ 2 – Thứ 7: **07:30 – 17:30**\n"
            "• Nghỉ: Chủ nhật & ngày lễ\n"
            "• 📍 Trung tâm Học liệu SmartLib – ICTU\n"
            "• ☎️ **0987 654 321** · ✉️ support@smartlib.edu.vn"
        ),
        "borrow_process": (
            "📝 Thủ tục mượn sách",
            "**Bước 1.** Đăng nhập Cổng Độc giả SmartLib\n"
            "**Bước 2.** Tìm sách còn bản trống → bấm **Đăng ký mượn**\n"
            "**Bước 3.** Chọn hình thức: *Mượn về nhà* (≤ 14 ngày) hoặc *Đọc tại chỗ* (1 – 7 ngày)\n"
            "**Bước 4.** Phiếu chuyển sang *Chờ duyệt* → nhận sách tại quầy khi Thủ thư xác nhận"
        ),
        "borrow_limits": (
            "📚 Hạn mức mượn sách",
            "• Mượn cùng lúc tối đa **05 cuốn**\n"
            "• Đặt trước tối đa **03 cuốn**"
        ),
        "due_dates": (
            "⏳ Thời hạn mượn",
            "• Mượn về nhà: tối đa **14 ngày**\n"
            "• Đọc tại chỗ: **1 – 7 ngày**"
        ),
        "renewal_policy": (
            "🔄 Quy định gia hạn",
            "• Tối đa **02 lần**/cuốn, mỗi lần **1 – 20 ngày**\n"
            "• Gửi yêu cầu tại mục *Sách đang mượn* **trước** ngày hết hạn\n"
            "• ⚠️ Không áp dụng cho sách đã quá hạn hoặc tài khoản đang bị khóa"
        ),
        "fine_policy": (
            "💰 Phạt trả sách trễ hạn",
            "• Mức phạt: **2.000đ / ngày / cuốn**\n"
            "• Quá hạn **từ 3 ngày** → tài khoản tạm khóa chức năng mượn\n"
            "• Thanh toán: **VNPay** trên hệ thống hoặc tại quầy Thủ thư"
        ),
        "lost_book_policy": (
            "📕 Mất hoặc hư hỏng sách",
            "• Báo ngay cho quầy Thủ thư\n"
            "• Đền bù **200.000đ / cuốn**, hoặc mua đền đúng ấn phẩm cùng phiên bản"
        ),
        "account_lock_vnpay": (
            "🔓 Mở khóa tài khoản qua VNPay",
            "• Tài khoản bị khóa khi quá hạn **≥ 3 ngày** hoặc còn nợ phạt\n"
            "**Bước 1.** Đăng nhập → bấm **Thanh toán ngay qua VNPay**\n"
            "**Bước 2.** Quét mã VietQR / VNPay\n"
            "**Bước 3.** Chờ Quản trị viên xác nhận → tài khoản mở khóa ngay"
        ),
        "reservation_policy": (
            "🔖 Đặt trước sách",
            "• Áp dụng khi sách **tạm hết** (còn 0 bản)\n"
            "• Tối đa **03 cuốn**, xếp hàng theo thứ tự đăng ký (FIFO)\n"
            "• Khi sách về kho, bạn được **giữ chỗ 48 giờ** để đến mượn"
        ),
        "qr_return_process": (
            "📱 Trả sách bằng mã QR",
            "**Bước 1.** Vào mục **Sách đang mượn**\n"
            "**Bước 2.** Bấm **Mã QR trả sách** ở cuốn cần trả\n"
            "**Bước 3.** Mang sách đến quầy, đưa mã QR cho Thủ thư\n"
            "**Bước 4.** Thủ thư quét mã → hoàn tất nhận sách\n"
            "⚠️ *Không hỗ trợ tự bấm trả từ xa để đảm bảo kiểm kê sách thật.*"
        ),
        "account_password_help": (
            "🔐 Quên / Đổi mật khẩu",
            "• Mật khẩu được mã hóa một chiều, **không ai có thể xem lại**\n"
            "• Mang **thẻ sinh viên / CCCD** đến quầy Thủ thư để được cấp lại\n"
            "• Hoặc gọi Hotline **0987 654 321** để được xác minh hỗ trợ"
        ),
    }
    if topic in sections:
        return sections[topic]
    return (
        "📋 Quy định chung của Thư viện",
        "• 🕒 Mở cửa: **07:30 – 17:30** (Thứ 2 – Thứ 7)\n"
        "• 📚 Mượn tối đa **05 cuốn**, mỗi cuốn **14 ngày**\n"
        "• 🔄 Gia hạn tối đa **02 lần** (1 – 20 ngày/lần)\n"
        "• 💰 Trễ hạn: **2.000đ/ngày/cuốn** (quá 3 ngày bị khóa)\n"
        "• 📕 Mất sách: đền bù **200.000đ/cuốn**\n"
        "• 📱 Trả sách bằng **mã QR** tại quầy"
    )


def _format_borrow_item(idx: int, b: dict, detailed: bool = True) -> str:
    overdue = int(b.get("overdue_days") or 0)
    if overdue > 0:
        status = f"🔴 Quá hạn {overdue} ngày · phạt {int(b.get('fine_amount') or 0):,}đ".replace(",", ".")
    else:
        left = _days_left_text(b.get("due_date", ""))
        status = f"🟢 {b.get('status', 'Đang mượn')}" + (f" · {left}" if left and b.get("status") != "Chờ duyệt" else "")
    if not detailed:
        return f"{idx}. **{b.get('book_title')}** — hạn trả {b.get('due_date')}"
    return (
        f"**{idx}. {b.get('book_title')}**\n"
        f"   📅 Mượn {b.get('borrow_date')} → Hạn trả **{b.get('due_date')}**\n"
        f"   📌 {status}"
    )


def _render_personal_profile(focus: str, tool_result: dict, user_name: Optional[str]) -> tuple[str, list]:
    greet = _greet(user_name)
    borrows = tool_result.get("borrows", [])
    total_fine = float(tool_result.get("total_fine_amount", 0) or 0)
    overdue_cnt = int(tool_result.get("overdue_count", 0) or 0)
    is_locked = bool(tool_result.get("is_locked", False))
    lock_reason = tool_result.get("lock_reason") or "Có sách quá hạn hoặc còn nợ phạt"
    active_cnt = int(tool_result.get("total_active", len(borrows)) or 0)
    max_quota = int(tool_result.get("max_quota", 5) or 5)
    remaining = int(tool_result.get("remaining_quota", max(0, max_quota - active_cnt)) or 0)
    reservations = tool_result.get("reservations", [])
    fine_text = f"{int(total_fine):,}".replace(",", ".")

    suggested = [
        {"book_id": b.get("book_id"), "title": b.get("book_title"), "reason": f"Hạn trả: {b.get('due_date')}"}
        for b in borrows
    ]

    def fine_block() -> str:
        if total_fine <= 0 and overdue_cnt == 0:
            return "🟢 **Bạn KHÔNG bị phạt** — tổng nợ **0đ**, không có sách quá hạn."
        lines = [f"🔴 Bạn đang có **{overdue_cnt} sách quá hạn** — tổng phạt **{fine_text}đ**"]
        for b in borrows:
            if int(b.get("overdue_days") or 0) > 0:
                lines.append(f"• {b['book_title']}: trễ {b['overdue_days']} ngày → {int(b['fine_amount']):,}đ".replace(",", "."))
        lines.append("👉 Thanh toán qua **VNPay** hoặc tại quầy Thủ thư.")
        return "\n".join(lines)

    def account_block() -> str:
        if is_locked:
            return f"🔴 **Đang tạm khóa** — lý do: {lock_reason}\n👉 Nộp phạt qua **VNPay** để mở khóa ngay."
        return "🟢 **Đang hoạt động bình thường** — bạn có thể mượn sách như thường lệ."

    def count_block() -> str:
        return f"Đang mượn **{active_cnt}/{max_quota} cuốn** · Còn được mượn thêm **{remaining} cuốn**"

    def list_block(detailed: bool = True) -> str:
        if not borrows:
            return "Hiện bạn **chưa mượn cuốn sách nào**."
        sep = "\n\n" if detailed else "\n"
        return sep.join(_format_borrow_item(i, b, detailed) for i, b in enumerate(borrows, 1))

    def reservation_block() -> str:
        if not reservations:
            return "Bạn **chưa đặt trước** cuốn sách nào."
        out = []
        for i, r in enumerate(reservations, 1):
            title = r.get("book_title") or r.get("bookTitle") or "Sách đặt trước"
            date = (r.get("created_at") or r.get("reservedAt") or r.get("reserved_at") or "")[:10]
            out.append(f"{i}. **{title}** — *{r.get('status') or 'Đang chờ'}*" + (f" (đặt ngày {date})" if date else ""))
        return "\n".join(out)

    if focus == "count":
        body = f"📚 **SỐ SÁCH BẠN ĐANG MƯỢN**\n{count_block()}"
        if borrows:
            body += "\n\n" + list_block(detailed=False)
        return f"{greet}\n\n{body}", suggested

    if focus == "list":
        body = f"📋 **SÁCH BẠN ĐANG MƯỢN ({active_cnt} cuốn)**\n\n{list_block()}"
        if borrows:
            body += "\n\n💡 *Khi trả sách, bấm nút Mã QR trả sách và mang sách đến quầy nhé!*"
        return f"{greet}\n\n{body}", suggested

    if focus == "fines":
        return f"{greet}\n\n💰 **TÌNH TRẠNG PHÍ PHẠT**\n{fine_block()}", []

    if focus == "account":
        return f"{greet}\n\n👤 **TRẠNG THÁI TÀI KHOẢN**\n{account_block()}\n{count_block()}", []

    if focus == "reservations":
        return f"{greet}\n\n🔖 **SÁCH BẠN ĐANG ĐẶT TRƯỚC**\n{reservation_block()}", []

    if focus == "renewal":
        if not borrows:
            body = "Bạn chưa có sách nào đang mượn để gia hạn."
        else:
            body = "\n".join(
                f"{i}. **{b['book_title']}** — hạn {b['due_date']} · {b.get('renew_status') or 'Chưa gia hạn'}"
                for i, b in enumerate(borrows, 1)
            )
        _, rule = render_policy_section("renewal_policy")
        return f"{greet}\n\n🔄 **TÌNH TRẠNG GIA HẠN**\n{body}\n\n📌 **Quy định**\n{rule}", suggested

    # overview: tổng quan có chia mục rõ ràng
    parts = [
        f"{greet}\n\nĐây là **tổng quan hồ sơ mượn trả** của bạn:",
        f"💰 **Phí phạt**\n{fine_block()}",
        f"👤 **Tài khoản**\n{account_block()}\n{count_block()}",
        f"📋 **Sách đang mượn**\n{list_block()}",
    ]
    if reservations:
        parts.append(f"🔖 **Đặt trước**\n{reservation_block()}")
    return "\n\n".join(parts), suggested


def generate_natural_response_from_tool(tool_name: str, tool_args: dict, tool_result: dict, user_name: Optional[str]) -> tuple[str, list]:
    """
    Bước 5: Tổng hợp kết quả thực thi của Tool thành câu trả lời tự nhiên, đúng trọng tâm,
    trình bày khoa học (tiêu đề in đậm, chia mục, gạch đầu dòng, đánh số bước).
    """
    user_prompt = CURRENT_USER_PROMPT.get("")
    greet = _greet(user_name)
    suggested_books = []

    if tool_name == "get_my_active_borrows":
        if not tool_result.get("success"):
            return (f"{greet}\n\n🔒 {tool_result.get('message', 'Vui lòng đăng nhập để tra cứu thông tin cá nhân nhé!')}", [])
        focus = (tool_args or {}).get("focus") or detect_personal_focus(user_prompt)
        return _render_personal_profile(focus, tool_result, user_name)

    elif tool_name == "check_book_availability":
        matched = tool_result.get("matched_books", [])
        if not matched:
            return (
                f"{greet}\n\n🔍 Mình chưa tìm thấy sách **\"{tool_args.get('book_title')}\"** trong kho.\n"
                f"💡 *Bạn thử kiểm tra lại tên sách hoặc tìm theo tác giả / thể loại nhé!*",
                []
            )
        b = matched[0]
        avail = b["available_copies"]
        status = (
            f"🟢 **Còn {avail}/{b['total_quantity']} cuốn** — có thể mượn ngay"
            if avail > 0 else
            "🔴 **Tạm hết sách** — bạn có thể bấm *Đặt trước* để giữ chỗ"
        )
        reply = (
            f"{greet}\n\n"
            f"📖 **{b['title']}**\n"
            f"• ✍️ Tác giả: {b['author'] or 'Đang cập nhật'}\n"
            f"• 🏷️ Thể loại: {b['category']}\n"
            f"• 📍 Vị trí: {b['shelf_location']}\n"
            f"• 📦 Tình trạng: {status}"
        )
        suggested_books = [{
            "book_id": b["book_id"],
            "title": b["title"],
            "author": b["author"],
            "reason": f"Còn sẵn {avail} cuốn tại {b['shelf_location']}"
        }]
        return (reply, suggested_books)

    elif tool_name == "get_library_policy":
        topic = tool_result.get("topic") or "all"
        topics = detect_policy_topics(user_prompt)
        if topic != "all" and topic not in topics:
            topics = [topic] + topics if len(topics) > 0 else [topic]
        if not topics:
            topics = ["all"]

        if len(topics) == 1:
            title, body = render_policy_section(topics[0])
            reply = f"{greet}\n\n**{title}**\n{body}"
        else:
            blocks = [f"{greet}\n\nBạn hỏi **{len(topics)} vấn đề**, mình trả lời lần lượt nhé:"]
            for i, t in enumerate(topics):
                title, body = render_policy_section(t)
                num = SECTION_NUMBERS[i] if i < len(SECTION_NUMBERS) else f"{i + 1}."
                blocks.append(f"{num} **{title}**\n{body}")
            reply = "\n\n".join(blocks)
        reply += "\n\n💬 *Bạn cần mình giải thích thêm phần nào không ạ?*"
        return (reply, [])

    elif tool_name == "recommend_books":
        recs = tool_result.get("recommendations", [])
        genre_name = tool_result.get("genre_searched", "phổ biến")
        if not recs:
            return (f"{greet}\n\n📚 Hiện chưa có sách **{genre_name}** sẵn sàng cho mượn. Bạn thử thể loại khác nhé!", [])
        lines = [f"{greet}\n\n🌟 **GỢI Ý SÁCH {str(genre_name).upper()}**\n"]
        for idx, r in enumerate(recs, 1):
            lines.append(f"{idx}. **{r['title']}**\n   ✍️ {r['author'] or 'Khuyết danh'} · 📦 Còn {r['available_copies']} cuốn")
            suggested_books.append({
                "book_id": r["book_id"],
                "title": r["title"],
                "author": r["author"],
                "reason": r["reason"]
            })
        lines.append("\n💡 *Bấm vào thẻ sách bên dưới để xem chi tiết và đăng ký mượn nhé!*")
        return ("\n".join(lines), suggested_books)

    elif tool_name == "search_books":
        books = tool_result.get("results", [])
        if not books:
            return (
                f"{greet}\n\n🔍 Mình chưa tìm thấy sách phù hợp với từ khóa của bạn.\n"
                f"💡 *Thử tìm theo tên sách, tác giả hoặc thể loại khác nhé!*",
                []
            )
        lines = [f"{greet}\n\n🔍 **TÌM THẤY {len(books)} CUỐN SÁCH**\n"]
        for idx, b in enumerate(books, 1):
            avail = b.get('available_copies', 0)
            status_desc = f"🟢 Còn {avail} cuốn" if avail > 0 else f"🟡 {b.get('status', 'Tạm hết sách')}"
            lines.append(f"{idx}. **{b['title']}**\n   ✍️ {b['author']} · 🏷️ {b['category']} · {status_desc}")
            suggested_books.append({
                "book_id": b["book_id"],
                "title": b["title"],
                "author": b["author"],
                "category": b.get("category"),
                "reason": f"Thể loại {b['category']} • {status_desc}"
            })
        return ("\n".join(lines), suggested_books)

    return (f"{greet}\n\nCảm ơn câu hỏi của bạn!", [])


# =========================================================================
# 5. TÍCH HỢP GOOGLE GEMINI API & OPENAI API (NATIVE FUNCTION CALLING)
# =========================================================================

def _call_gemini_function_calling(
    api_key: str,
    user_prompt: str,
    db: dict,
    user_id: Optional[int],
    user_name: Optional[str],
    explicit_user_key: bool = False,
    session_turns: Optional[List[Dict[str, Any]]] = None
) -> tuple[str, Optional[dict], list]:
    """
    Thực thi Function Calling 5 bước trên Google Gemini API (gemini-3.8-flash / gemini-3.5-flash-lite).
    Truyền kèm bộ nhớ lịch sử phiên trò chuyện (session_turns) để AI ghi nhớ xuyên suốt ngữ cảnh.
    Trả về (final_reply, tool_call_meta, suggested_books).
    """
    system_instruction = (
        "Bạn là trợ lý chăm sóc độc giả của Thư viện SmartLib (Trường ĐH CNTT & Truyền thông - ICTU). "
        "Nhiệm vụ chính: Hỗ trợ độc giả tìm kiếm sách, kiểm tra tồn kho, tra cứu phiếu mượn cá nhân, giải đáp nội quy thư viện (hạn mượn 14 ngày, phạt 2.000đ/ngày, khóa tài khoản khi quá hạn >= 3 ngày, nộp phạt VNPay, trả sách bằng mã QR tại quầy). "
        "Khi độc giả hỏi dữ liệu cụ thể hoặc xác nhận 'Đồng ý' gợi ý sách từ câu trước, BẮT BUỘC gọi Function/Tool tương ứng. "
        "Quy tắc trình bày: chỉ trả lời ĐÚNG TRỌNG TÂM câu hỏi, không gộp thông tin thừa; nếu câu hỏi có nhiều ý thì tách thành từng mục đánh số; dùng tiêu đề in đậm, gạch đầu dòng ngắn gọn, câu ngắn dễ đọc. "
        "Nếu độc giả hỏi câu hỏi ngoài phạm vi thư viện (ví dụ: toán học, thời tiết, nhân vật lịch sử, đời sống...), BẮT BUỘC trả lời theo đúng Form 3 đoạn sau:\n"
        "Đoạn 1: Dạ mình chào bạn ạ 😊\n"
        "Đoạn 2: Mình là trợ lý chăm sóc độc giả của Thư viện SmartLib, nên mình chỉ hỗ trợ các vấn đề liên quan đến tra cứu sách, kiểm tra tồn kho, phiếu mượn - trả, gia hạn hay tài khoản thư viện thôi ạ.\n"
        "Đoạn 3: Còn bài toán/câu hỏi này thì bạn có thể hỏi bạn bè hoặc dùng công cụ tính toán/tìm kiếm trên điện thoại nha. Nếu bạn muốn tìm hiểu thêm về chủ đề này qua các đầu sách trong kho SmartLib thì hãy nhắn 'Đồng ý' để mình giới thiệu sách ngay, hoặc nếu cần hỗ trợ gì về SmartLib, cứ nhắn mình bất cứ lúc nào ạ 🥰"
    )

    configured_model = (os.getenv("AI_MODEL") or "gemini-1.5-flash").strip()
    candidate_models = []
    for m in [configured_model, "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro"]:
        if m and m not in candidate_models:
            candidate_models.append(m)

    contents_payload = []
    if session_turns:
        for turn in session_turns[-6:]:
            role = "user" if turn.get("role") == "user" else "model"
            text_val = (turn.get("content") or "").strip()
            if text_val:
                contents_payload.append({"role": role, "parts": [{"text": text_val}]})
    contents_payload.append({"role": "user", "parts": [{"text": user_prompt}]})

    payload = {
        "system_instruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": contents_payload,
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

    res_json = None
    used_model = configured_model
    last_http_err = None
    last_err = None

    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=6) as response:
                res_json = json.loads(response.read().decode("utf-8"))
                used_model = configured_model or model_name
                break
        except urllib.error.HTTPError as http_err:
            last_http_err = http_err
            if http_err.code in (400, 401, 403) and explicit_user_key:
                break
            continue
        except Exception as err:
            last_err = err
            continue

    if res_json is None:
        if last_http_err is not None and last_http_err.code in (400, 401, 403) and explicit_user_key:
            raise HTTPException(
                status_code=401,
                detail="Google Gemini API Key không hợp lệ hoặc đã hết hạn! Vui lòng kiểm tra lại API Key của bạn."
            )
        if last_http_err is not None:
            raise last_http_err
        if last_err is not None:
            raise last_err
        return "", None, []

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
            "engine": used_model
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
    sessionId: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None
    apiKey: Optional[str] = None
    provider: Optional[str] = "gemini"


@router.post("/reader-chat")
async def reader_chat_endpoint(req: ReaderChatRequest):
    """
    Endpoint Chatbot Độc giả ứng dụng Mô hình 2: Function Calling (Tool Calling):
    - Kiểm soát chặt chẽ các trường hợp biên (Rỗng, Quá ngắn/Ký tự đặc biệt, Quá dài > 1000 ký tự, SQL/Prompt Injection, API Key sai).
    - Có bộ nhớ riêng cho từng phiên trò chuyện (Per-Session Memory qua sessionId & history).
    - Câu hỏi ngoài phạm vi luôn sử dụng Form CSKH 3 đoạn chuẩn mực.
    """
    user_prompt = (req.message or "").strip()
    CURRENT_USER_PROMPT.set(user_prompt)

    # Bước 1: Kiểm soát các trường hợp biên & bảo mật đầu vào
    validate_reader_prompt_boundaries(user_prompt)

    # Bước 2: Kiểm tra tính hợp lệ của API Key (nếu có truyền lên hoặc cấu hình trong .env)
    explicit_user_key = bool(req.apiKey and req.apiKey.strip())
    api_key = validate_api_key_format(req.apiKey)

    db = db_manager.load_db()
    session_key = get_session_key(req.sessionId, req.userId)
    session_state = get_or_sync_session_state(session_key, req.history)
    inferred_genre, inferred_topic_label, _ = infer_topic_and_genre(user_prompt)

    # Bước 3: Kiểm tra bộ nhớ phiên xem độc giả có đang trả lời nối tiếp ("Đồng ý", "OK", "Cuốn đó còn không"...)
    followup_resolved = resolve_followup_with_session_memory(
        user_prompt=user_prompt,
        session_state=session_state,
        db=db,
        user_id=req.userId,
        user_name=req.userName
    )
    if followup_resolved:
        final_reply, tool_call_meta, suggested_books, intent_name = followup_resolved
        save_turn_to_session(
            session_key=session_key,
            user_prompt=user_prompt,
            ai_reply=final_reply,
            intent_name=intent_name,
            suggested_books=suggested_books
        )
        return {
            "success": True,
            "answer": final_reply,
            "tool_call": tool_call_meta,
            "suggested_books": suggested_books,
            "intent": intent_name,
            "session_id": session_key,
            "has_api_key": bool(api_key),
            "timestamp": datetime.now().strftime("%H:%M")
        }

    tool_call_meta = None
    final_reply = ""
    suggested_books = []
    intent_name = "general_chat"

    # -------------------------------------------------------------
    # NHÁNH 1A: GOOGLE GEMINI API (HỖ TRỢ KEY 'AQ...' HOẶC 'AIza...')
    # -------------------------------------------------------------
    if api_key and (api_key.startswith("AQ") or api_key.startswith("AIza")):
        try:
            final_reply, tool_call_meta, suggested_books = _call_gemini_function_calling(
                api_key=api_key,
                user_prompt=user_prompt,
                db=db,
                user_id=req.userId,
                user_name=req.userName,
                explicit_user_key=explicit_user_key,
                session_turns=session_state.get("turns", [])
            )
            if tool_call_meta:
                intent_name = tool_call_meta["name"]
            elif final_reply:
                heuristic_call = semantic_heuristic_function_caller(user_prompt, req.userId, db)
                if heuristic_call:
                    final_reply = ""
                else:
                    # Đảm bảo câu hỏi ngoài phạm vi luôn trả về chuẩn Form 3 đoạn CSKH
                    oos_reply, oos_books, oos_intent = handle_out_of_scope_or_general_question(
                        user_prompt=user_prompt,
                        user_name=req.userName,
                        db=db,
                        has_api_key=True
                    )
                    intent_name = oos_intent
                    final_reply = oos_reply
                    suggested_books = oos_books
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
                "Bạn là trợ lý chăm sóc độc giả của Thư viện SmartLib. "
                "Nhiệm vụ: Hỗ trợ tìm kiếm sách, kiểm tra số lượng tồn kho, tra cứu sách mượn của độc giả, giải đáp quy định thư viện. "
                "Khi độc giả cần thông tin dữ liệu cụ thể, hãy gọi Tool tương ứng thay vì tự đoán dữ liệu."
            )
            messages = [{"role": "system", "content": system_prompt}]
            for turn in session_state.get("turns", [])[-6:]:
                messages.append({"role": turn.get("role", "user"), "content": turn.get("content", "")})
            messages.append({"role": "user", "content": user_prompt})

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
                    final_reply = ""
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
            # Xử lý chuẩn xác câu hỏi ngoài phạm vi theo Form CSKH 3 đoạn hoặc hội thoại chung
            final_reply, suggested_books, intent_name = handle_out_of_scope_or_general_question(
                user_prompt=user_prompt,
                user_name=req.userName,
                db=db,
                has_api_key=bool(api_key)
            )

    # Bước 4: Lưu lượt hội thoại hiện tại vào bộ nhớ riêng của phiên (Per-Session Memory)
    save_turn_to_session(
        session_key=session_key,
        user_prompt=user_prompt,
        ai_reply=final_reply,
        intent_name=intent_name,
        suggested_books=suggested_books,
        inferred_genre=inferred_genre if intent_name == "out_of_scope" else None,
        inferred_topic_label=inferred_topic_label if intent_name == "out_of_scope" else None
    )

    return {
        "success": True,
        "answer": final_reply,
        "tool_call": tool_call_meta,
        "suggested_books": suggested_books,
        "intent": intent_name,
        "session_id": session_key,
        "has_api_key": bool(api_key),
        "timestamp": datetime.now().strftime("%H:%M")
    }

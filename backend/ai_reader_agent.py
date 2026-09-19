"""
Module: ai_reader_agent.py
Chức năng: Trợ lý AI Thông minh cho Độc giả SmartLib tuân thủ chặt chẽ
Mô hình 2: Function Calling (Tool Calling) trong ứng dụng AI tạo sinh.

Cơ chế 5 bước:
(1) Người dùng gửi câu hỏi (Prompt)
(2) Backend gửi Prompt + Danh sách Tool / Function Definitions tới LLM
(3) LLM phân tích, KHÔNG THỰC THI HÀM, sinh JSON chứa tên hàm + tham số
(4) Backend parse JSON, kiểm tra tính hợp lệ & quyền hạn, thực thi hàm truy vấn CSDL
(5) Gửi kết quả về LLM để sinh phản hồi tự nhiên cuối cùng cho Độc giả.
"""

import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db_manager

router = APIRouter(prefix="/api/ai", tags=["AI Reader Function Calling"])

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
                    "description": "Thể loại sách (ví dụ: Công nghệ, Kỹ năng sống, Kinh tế, Văn học, Kỳ ảo)"
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
        "description": "Tra cứu quy định, chính sách thư viện chính thức: thời hạn mượn, hạn mức số cuốn, phí phạt trễ hạn, quy trình xuất trình mã QR trả sách tại quầy, và quy định gia hạn.",
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "enum": ["borrow_limits", "due_dates", "fine_policy", "qr_return_process", "renewal_policy", "all"],
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
                    "description": "Số lượng sách tối đa muốn gợi ý (từ 1 đến 5)",
                    "default": 3
                }
            }
        }
    }
]

# =========================================================================
# 2. HÀM THỰC THI NGHIỆP VỤ TRÊN CSDL (APPLICATION EXECUTORS)
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
        if kw and (kw not in title and kw not in desc):
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
        if target in title or title in target:
            # Xác định vị trí kệ dựa theo thể loại
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
    ]

    # Lọc theo trạng thái
    active_records = []
    for r in user_records:
        st = r.get("status")
        if status_filter == "Đang mượn" and st not in ["Đang mượn", "Quá hạn"]:
            continue
        if status_filter == "Chờ duyệt" and st != "Chờ duyệt":
            continue
        if status_filter == "Tất cả" and st in ["Đã trả", "Đã hủy", "Từ chối"]:
            continue

        # Tính toán quá hạn nếu có
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
            "content": "Mỗi độc giả được mượn cùng lúc tối đa 05 cuốn sách. Thời hạn mượn sách về nhà tối đa là 14 ngày (mượn tại chỗ trong ngày)."
        },
        "due_dates": {
            "title": "Thời hạn mượn & gia hạn",
            "content": "Thời hạn mượn tiêu chuẩn là 14 ngày. Độc giả có thể bấm 'Xin gia hạn' trên hệ thống tối đa 02 lần (mỗi lần từ 7 đến 20 ngày) trước khi hết hạn mượn để Thủ thư phê duyệt."
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
            "content": "Độc giả được phép gửi yêu cầu gia hạn tối đa 2 lần đối với mỗi cuốn sách. Đơn xin gia hạn cần gửi trước ngày đến hạn và được Thủ thư xét duyệt trong vòng 24 giờ."
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

        if not g:
            matched.append(b)
        elif g in cat or g in title or g in desc:
            matched.append(b)

    # Ưu tiên sách có sẵn
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
        # Bảo mật: Ép buộc user_id từ phiên đăng nhập thực tế của độc giả
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
            limit=int(arguments.get("limit", 3))
        )
    else:
        return {"error": f"Không tìm thấy tool: {name}"}


# =========================================================================
# 3. BỘ SUY DIỄN NGỮ NGHĨA FUNCTION CALLING (SEMANTIC LLM SIMULATOR)
# =========================================================================

def semantic_heuristic_function_caller(user_prompt: str, user_id: Optional[int], db: Optional[dict] = None) -> Optional[dict]:
    """
    Mô phỏng LLM: Phân tích Prompt -> Xác định Function phù hợp -> Trích xuất tham số JSON.
    Đảm bảo 100% tuân thủ mô hình Function Calling ngay cả khi offline hoặc chưa nhập API Key!
    """
    p = user_prompt.lower().strip()

    # 1. Tra cứu sách cá nhân đang mượn
    if any(k in p for k in ["mượn gì", "đang mượn", "hạn trả", "sách của tôi", "phiếu mượn của tôi", "quá hạn", "tiền phạt cá nhân", "danh sách mượn"]):
        status_flt = "Tất cả"
        if "đang mượn" in p:
            status_flt = "Đang mượn"
        elif "chờ duyệt" in p:
            status_flt = "Chờ duyệt"
        return {
            "function": "get_my_active_borrows",
            "arguments": {
                "status_filter": status_flt
            }
        }

    # 2. Kiểm tra tình trạng kho / số lượng còn của cuốn sách cụ thể
    if any(k in p for k in ["còn không", "còn bao nhiêu", "còn sách", "sẵn sàng", "ở đâu", "kệ nào", "vị trí"]) and not any(k in p for k in ["tối đa", "bao lâu", "quy định"]):
        book_title = ""

        # Ưu tiên 1: Khớp chính xác với tên sách thực tế trong CSDL
        if db:
            for book in db.get("books", []):
                bt = (book.get("title") or "").strip()
                if bt and len(bt) >= 3 and bt.lower() in p:
                    book_title = bt
                    break

        # Ưu tiên 2: Thử lấy trong ngoặc kép
        if not book_title:
            quote_match = re.search(r'["\']([^"\']+)["\']', user_prompt)
            if quote_match:
                book_title = quote_match.group(1).strip()

        # Ưu tiên 3: Trích xuất sau "sách", "cuốn"
        if not book_title:
            m = re.search(r'(?:sách|cuốn|tác phẩm)\s+([a-zA-Z0-9\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệđìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]+)', user_prompt, re.IGNORECASE)
            if m:
                extracted = m.group(1).strip()
                for stop in ["còn không", "còn bao nhiêu", "còn trong kho", "ở đâu", "không bạn", "vậy bạn", "hiện", "trong kho và"]:
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

    # 3. Tra cứu quy chế, quy định thư viện
    if any(k in p for k in ["quy định", "hạn mượn", "thời hạn", "bao lâu", "tối đa", "trả sách", "phạt", "gia hạn", "mã qr"]):
        topic = "all"
        if any(k in p for k in ["trả sách", "mã qr", "quét mã"]):
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

    # 4. Gợi ý sách theo chủ đề
    if any(k in p for k in ["gợi ý", "đề xuất", "sách hay", "tư vấn", "nên đọc"]):
        genre = "Chung"
        if any(k in p for k in ["phát triển bản thân", "kỹ năng", "tư duy"]):
            genre = "Kỹ năng sống"
        elif any(k in p for k in ["lập trình", "công nghệ", "ai", "cntt", "python"]):
            genre = "Công nghệ"
        elif any(k in p for k in ["kinh tế", "kinh doanh", "làm giàu", "tài chính"]):
            genre = "Kinh tế"
        elif any(k in p for k in ["văn học", "tiểu thuyết", "truyện"]):
            genre = "Văn học"

        return {
            "function": "recommend_books",
            "arguments": {
                "genre": genre,
                "limit": 3
            }
        }

    # 5. Tìm kiếm sách nói chung
    if any(k in p for k in ["tìm sách", "tra cứu", "có sách nào", "tác giả"]):
        kw = user_prompt
        for remove_word in ["tìm sách", "tra cứu", "có sách nào về", "tìm giúp mình", "cho mình xem"]:
            kw = re.sub(rf"\b{remove_word}\b", "", kw, flags=re.IGNORECASE).strip()
        return {
            "function": "search_books",
            "arguments": {
                "keyword": kw
            }
        }

    return None


def generate_natural_response_from_tool(tool_name: str, tool_args: dict, tool_result: dict, user_name: Optional[str]) -> tuple[str, list]:
    """
    Bước 5: LLM (hoặc bộ tổng hợp ngôn ngữ tự nhiên) nhận kết quả thực thi của Tool
    và sinh câu trả lời tự nhiên, ấm áp đúng phong cách Thủ thư SmartLib.
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
        if topic == "qr_return_process":
            reply = (
                f"{greeting} Về **quy trình trả sách chuẩn** tại Thư viện SmartLib thì siêu nhanh gọn và bảo mật luôn bạn nha: 🔄\n\n"
                f"1. **Bước 1:** Bạn truy cập mục **'Sách đang mượn'** trên Cổng Độc giả.\n"
                f"2. **Bước 2:** Bấm nút gradient **[Mã QR trả sách]** tại cuốn sách bạn muốn trả (hệ thống sẽ hiển thị mã QR phiếu mượn).\n"
                f"3. **Bước 3:** Bạn mang sách vật lý đến quầy thư viện và xuất trình mã QR này trên điện thoại (hoặc phiếu in PDF) cho Thủ thư.\n"
                f"4. **Bước 4:** Thủ thư dùng máy quét QR quét mã để kiểm tra tình trạng sách và hoàn tất nhận sách vào kho trong 1-Click.\n\n"
                f"⚠️ *Lưu ý:* Để đảm bảo kiểm kê sách vật lý, độc giả không tự bấm trả từ xa mà cần bàn giao trực tiếp tại quầy thư viện bạn nhé!"
            )
        elif topic == "due_dates" or topic == "borrow_limits":
            reply = (
                f"{greeting} Về **quy định thời hạn & hạn mức mượn sách** của SmartLib: ⏱️📖\n\n"
                f"- 📚 **Số lượng mượn tối đa:** **05 cuốn sách** cùng lúc.\n"
                f"- ⏳ **Thời hạn mượn:** Tối đa **14 ngày** đối với mượn về nhà (hoặc đọc tại chỗ trong ngày).\n"
                f"- 🔄 **Gia hạn:** Bạn được phép **Xin gia hạn tối đa 02 lần** (mỗi lần thêm 7 đến 20 ngày) nếu sách chưa bị quá hạn.\n"
                f"- 💰 **Phí phạt trễ:** **2.000 đ/ngày/cuốn** nếu trả quá hạn quy định."
            )
        elif topic == "fine_policy":
            reply = (
                f"{greeting} Về **chính sách phạt trễ hạn**: ⚠️\n\n"
                f"- Mức phạt là **2.000 VNĐ / ngày / cuốn** tính từ ngày sau ngày đến hạn.\n"
                f"- Nếu quá hạn **từ 3 ngày trở lên**, tài khoản độc giả sẽ tự động bị tạm khóa chức năng mượn mới.\n"
                f"- Bạn có thể thanh toán tiền phạt trực tuyến qua cổng **VNPay Sandbox** tích hợp sẵn trên hệ thống hoặc nộp tại quầy thủ thư để mở lại tài khoản ngay lập tức."
            )
        else:
            reply = (
                f"{greeting} Dưới đây là các quy định mượn - trả cơ bản bạn cần nhớ nha: 📋✨\n\n"
                f"- Mượn tối đa 5 cuốn trong vòng 14 ngày.\n"
                f"- Được xin gia hạn tối đa 2 lần trước khi hết hạn.\n"
                f"- Xuất trình **Mã QR trả sách** tại quầy cho Thủ thư quét nhận sách.\n"
                f"- Phí trễ hạn: 2.000 đ/ngày/cuốn."
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
                f"{greeting} Mình đã tìm kiếm theo từ khóa nhưng chưa thấy cuốn nào phù hợp. Bạn thử tìm với từ khóa ngắn gọn hơn xem sao nha! 🔍",
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
# 4. FASTAPI ENDPOINT: CHATBOT ĐỘC GIẢ (FUNCTION CALLING AGENT)
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
    Bước 1: Nhận prompt độc giả
    Bước 2: Chuẩn bị Function Definitions
    Bước 3: LLM sinh JSON đề xuất tên hàm + tham số
    Bước 4: Backend parse JSON, kiểm tra quyền hạn, gọi hàm nghiệp vụ CSDL
    Bước 5: Gửi kết quả về LLM để sinh câu trả lời ngôn ngữ tự nhiên
    """
    user_prompt = (req.message or "").strip()
    if not user_prompt:
        raise HTTPException(status_code=400, detail="Vui lòng nhập nội dung câu hỏi.")

    db = db_manager.load_db()
    api_key = (req.apiKey or os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()

    tool_call_meta = None
    final_reply = ""
    suggested_books = []

    # -------------------------------------------------------------
    # NHÁNH 1: NẾU CÓ OPENAI API KEY -> THỰC THI FUNCTION CALLING CHUẨN OPENAI
    # -------------------------------------------------------------
    if api_key and (api_key.startswith("sk-") or req.provider == "openai"):
        try:
            tools_payload = [
                {"type": "function", "function": fn}
                for fn in READER_FUNCTION_DEFINITIONS
            ]
            system_prompt = (
                "Bạn là Thủ thư AI thân thiện, thông minh của Thư viện SmartLib dành cho Độc giả. "
                "Nhiệm vụ: Hỗ trợ tìm kiếm sách, kiểm tra số lượng tồn kho, tra cứu sách mượn của độc giả, giải đáp quy định thư viện. "
                "Khi độc giả cần thông tin dữ liệu cụ thể, hãy gọi Tool tương ứng thay vì tự đoán dữ liệu."
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

                # Kiểm tra nếu LLM đề xuất gọi Tool
                if res_message.get("tool_calls"):
                    tool_call = res_message["tool_calls"][0]
                    fn_name = tool_call["function"]["name"]
                    fn_args = json.loads(tool_call["function"]["arguments"] or "{}")

                    # Bước 4: Backend Parse & Thực thi hàm CSDL
                    tool_result = run_tool(fn_name, fn_args, db, req.userId, req.userName)

                    tool_call_meta = {
                        "name": fn_name,
                        "arguments": fn_args,
                        "status": "executed"
                    }

                    # Bước 5: Gửi kết quả thực thi về LLM lần 2 để sinh lời giải thích tự nhiên
                    messages.append(res_message)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": json.dumps(tool_result, ensure_ascii=False)
                    })

                    second_payload = {
                        "model": "gpt-4o-mini",
                        "messages": messages,
                        "temperature": 0.5
                    }
                    second_req = urllib.request.Request(
                        url,
                        data=json.dumps(second_payload).encode("utf-8"),
                        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
                    )
                    with urllib.request.urlopen(second_req, timeout=12) as second_res:
                        second_json = json.loads(second_res.read().decode("utf-8"))
                        final_reply = second_json.get("choices", [{}])[0].get("message", {}).get("content", "")

                    # Trích xuất thẻ sách nếu có
                    if fn_name == "check_book_availability":
                        matched = tool_result.get("matched_books", [])
                        if matched:
                            suggested_books = [{"book_id": matched[0]["book_id"], "title": matched[0]["title"], "reason": "Sách bạn vừa kiểm tra"}]
                    elif fn_name == "recommend_books":
                        suggested_books = [
                            {"book_id": r["book_id"], "title": r["title"], "reason": r.get("reason", "")}
                            for r in tool_result.get("recommendations", [])
                        ]
                else:
                    final_reply = res_message.get("content", "")

        except Exception as ex:
            print(f"[AI Reader Chat] OpenAI Tool Calling exception: {ex}. Chuyển sang Semantic Engine.")

    # -------------------------------------------------------------
    # NHÁNH 2: SEMANTIC HEURISTIC ENGINE (100% TUÂN THỦ MÔ HÌNH 2 KHI CHƯA CÓ KEY)
    # -------------------------------------------------------------
    if not final_reply:
        # Bước 3: Mô phỏng LLM chọn function và trích xuất tham số JSON
        proposed_tool_call = semantic_heuristic_function_caller(user_prompt, req.userId, db)

        if proposed_tool_call:
            fn_name = proposed_tool_call["function"]
            fn_args = proposed_tool_call["arguments"]

            # Bước 4: Backend Parse JSON và Gọi Hàm CSDL thực tế
            tool_result = run_tool(fn_name, fn_args, db, req.userId, req.userName)

            tool_call_meta = {
                "name": fn_name,
                "arguments": fn_args,
                "status": "executed",
                "description": next((f["description"] for f in READER_FUNCTION_DEFINITIONS if f["name"] == fn_name), "")
            }

            # Bước 5: Sinh phản hồi ngôn ngữ tự nhiên từ kết quả hàm
            final_reply, suggested_books = generate_natural_response_from_tool(
                fn_name, fn_args, tool_result, req.userName
            )
        else:
            # Hội thoại thông thường / Chào hỏi
            user_display = req.userName or "bạn"
            final_reply = (
                f"Chào {user_display}! 👋 Mình là **Thủ thư AI** của SmartLib.\n\n"
                f"Mình có thể giúp bạn kiểm tra **sách bạn đang mượn & hạn trả**, tra cứu **số lượng sách còn trong kho**, "
                f"hướng dẫn **quy trình trả sách bằng mã QR tại quầy**, hoặc gợi ý những tựa sách hay nhất. "
                f"Bạn cần mình hỗ trợ gì cứ nhắn cho mình nhé! ✨"
            )

    return {
        "success": True,
        "answer": final_reply,
        "tool_call": tool_call_meta,
        "suggested_books": suggested_books,
        "intent": tool_call_meta["name"] if tool_call_meta else "general_chat",
        "timestamp": datetime.now().strftime("%H:%M")
    }

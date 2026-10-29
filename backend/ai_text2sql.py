"""
Module: ai_text2sql.py
Chức năng: Trợ lý truy vấn thông minh (Text-to-SQL Chatbot) cho Quản trị viên/Thủ thư.
Bảo mật: CHỈ CHO PHÉP CÂU LỆNH SELECT, CHẶN TUYỆT ĐỐI INSERT/UPDATE/DELETE/DROP.
"""

import os
import re
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text

logger = logging.getLogger("smartlib.text2sql")

from database import db_manager
from auth_dependency import verify_admin_role
# [TÍCH HỢP] Thay urllib raw call bằng genai_client (retry + circuit breaker + moderation)
from genai_client import call_llm_json, GenAIRequest, GenAIMessage, GenAIParams

router = APIRouter(prefix="/api/ai", tags=["AI Text-to-SQL"], dependencies=[Depends(verify_admin_role)])

# Schema CSDL chi tiết cung cấp cho LLM
DATABASE_SCHEMA_PROMPT = """
Cơ sở dữ liệu thư viện SmartLib (MySQL/SQLite) bao gồm các bảng và cột chính sau:

1. books (Kho sách):
   - id: INT PRIMARY KEY
   - title: VARCHAR(255) (Tên sách)
   - author: VARCHAR(100) (Tác giả)
   - category: VARCHAR(100) (Thể loại: Công nghệ, Kinh tế, Văn học, Kỹ năng sống, v.v.)
   - quantity: INT (Tổng số lượng sách nhập kho)
   - available_copies: INT (Số lượng sách hiện còn sẵn trong kho)
   - description: TEXT (Mô tả nội dung sách)
   - status: VARCHAR(50) (Trạng thái: 'Sẵn sàng', 'Hết sách', 'Sắp phát hành')
   - published_year: INT (Năm xuất bản)

2. users (Tài khoản người dùng & Độc giả):
   - id: INT PRIMARY KEY
   - username: VARCHAR(50) (Tên đăng nhập)
   - full_name: VARCHAR(100) (Họ và tên)
   - role: VARCHAR(20) ('Admin', 'Librarian', 'Reader')
   - email: VARCHAR(100)
   - phone: VARCHAR(30)
   - address: VARCHAR(255)
   - is_active: BOOLEAN (1: hoạt động, 0: ngưng)
   - is_locked: BOOLEAN (1: bị khóa tài khoản, 0: bình thường)
   - lock_reason: VARCHAR(255) (Lý do khóa tài khoản)

3. borrow_records (Phiếu mượn - trả sách):
   - id: INT PRIMARY KEY
   - user_id: INT (Khóa ngoại tham chiếu users.id)
   - book_id: INT (Khóa ngoại tham chiếu books.id)
   - borrow_date: DATETIME (Ngày mượn)
   - due_date: DATETIME (Hạn trả sách)
   - actual_return_date: DATETIME (Ngày trả thực tế, NULL nếu chưa trả)
   - borrow_type: VARCHAR(50) ('Mượn về nhà', 'Đọc tại chỗ')
   - fine_amount: DECIMAL(12,2) (Tiền phạt trễ hạn)
   - overdue_days: INT (Số ngày quá hạn)
   - status: VARCHAR(50) ('Chờ duyệt', 'Đang mượn', 'Đã trả', 'Từ chối', 'Đã hủy')
   - renew_status: VARCHAR(50) ('Chờ duyệt gia hạn', 'Đã gia hạn', 'Từ chối gia hạn', NULL)
   - pending_renew_days: INT (Số ngày độc giả xin gia hạn thêm)

4. reservations (Đặt trước sách sắp có / hết sách):
   - id: INT PRIMARY KEY
   - user_id: INT (Khóa ngoại users.id)
   - book_id: INT (Khóa ngoại books.id)
   - reserved_at: DATETIME (Ngày đặt trước)
   - priority: INT (Thứ tự ưu tiên)
   - status: VARCHAR(50) ('Waiting', 'Fulfilled', 'Cancelled')

5. fines (Quản lý phiếu phạt vi phạm):
   - id: INT PRIMARY KEY
   - record_id: INT (Khóa ngoại borrow_records.id)
   - user_id: INT (Khóa ngoại users.id)
   - book_id: INT (Khóa ngoại books.id)
   - due_date: DATETIME
   - fine_amount: DECIMAL(12,2) (Số tiền phạt, 2.000đ / ngày quá hạn)
   - status: VARCHAR(50) ('Chưa nộp', 'Chờ duyệt', 'Đã nộp')
   - payment_method: VARCHAR(50) ('Tiền mặt', 'VNPay', NULL)
"""

# Các từ khóa nguy hiểm bị cấm tuyệt đối
DISALLOWED_SQL_KEYWORDS = [
    "DELETE", "UPDATE", "INSERT", "DROP", "ALTER", "TRUNCATE", "CREATE", 
    "REPLACE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "ATTACH", "DETACH",
    "PRAGMA", "INFORMATION_SCHEMA", "INTO", "OUTFILE", "DUMPFILE"
]


class AdminQueryRequest(BaseModel):
    query: str
    sql: Optional[str] = None


class AdminQueryResponse(BaseModel):
    success: bool
    query: str
    sql: str = ""
    columns: List[str] = []
    data: List[Dict[str, Any]] = []
    total_rows: int = 0
    explanation: str = ""
    error: Optional[str] = None


def validate_sql(sql_query: str) -> bool:
    """
    Quét và CHẶN các từ khóa nguy hiểm bằng Regex: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE.
    Nếu phát hiện từ khóa cấm, dừng việc thực thi và trả về HTTP Status 403 với thông báo:
    "Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
    """
    if not sql_query or not isinstance(sql_query, str):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    # Loại bỏ comment SQL để tránh bypass qua comment (ví dụ /*! DELETE */, -- DROP)
    clean_sql = re.sub(r"--.*?$|/\*.*?\*/", "", sql_query, flags=re.MULTILINE | re.DOTALL).strip()

    # Quét và CHẶN các từ khóa nguy hiểm: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE
    # Quét cả trên chuỗi gốc và chuỗi đã làm sạch comment để chống mọi thủ thuật bypass
    forbidden_pattern = r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\b"
    if re.search(forbidden_pattern, sql_query, flags=re.IGNORECASE) or re.search(forbidden_pattern, clean_sql, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    # Chặn thêm các từ khóa thực thi nhúng hoặc can thiệp CSDL nguy hiểm khác
    extra_danger_pattern = r"\b(EXEC|EXECUTE|GRANT|REVOKE|REPLACE|ATTACH|DETACH|PRAGMA|INTO\s+OUTFILE|DUMPFILE)\b"
    if re.search(extra_danger_pattern, clean_sql, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    return True


def validate_read_only_sql(sql: str) -> bool:
    """
    Xác thực câu lệnh SQL an toàn: CHỈ CHO PHÉP SELECT, không chứa lệnh ghi hay phân tách nhiều câu lệnh.
    """
    clean_sql = re.sub(r"--.*?$|/\*.*?\*/", "", sql, flags=re.MULTILINE | re.DOTALL).strip()
    
    if not clean_sql:
        return False
        
    # Bắt buộc bắt đầu bằng SELECT hoặc WITH (CTE)
    if not re.match(r"^(SELECT|WITH)\s+", clean_sql, re.IGNORECASE):
        return False

    # Chặn nhiều câu lệnh phân tách bằng dấu chấm phẩy
    statements = [s.strip() for s in clean_sql.split(";") if s.strip()]
    if len(statements) > 1:
        return False

    # Kiểm tra các từ khóa cấm
    upper_sql = f" {clean_sql.upper()} "
    for kw in DISALLOWED_SQL_KEYWORDS:
        pattern = rf"\b{kw}\b"
        if re.search(pattern, upper_sql):
            return False

    return True



# ─── System prompt cho Text-to-SQL ───────────────────────────────────────────
_TEXT2SQL_SYSTEM = f"""Bạn là Chuyên gia Database Administrator và AI Assistant của Hệ thống Quản lý Thư viện SmartLib.
Nhiệm vụ: Chuyển đổi câu hỏi Tiếng Việt của Thủ thư thành câu truy vấn SQL SELECT duy nhất, chuẩn cú pháp MySQL.

Quy tắc BẮT BUỘC:
1. CHỈ tạo câu lệnh SELECT. Tuyệt đối KHÔNG dùng INSERT, UPDATE, DELETE, DROP, ALTER.
2. Bảng và Cột phải khớp 100% với Schema sau:
{DATABASE_SCHEMA_PROMPT}
3. Luôn giới hạn tối đa 100 bản ghi (LIMIT 100).
4. Trả về đúng JSON thuần, không markdown:
{{
  "sql": "SELECT ... LIMIT 100",
  "explanation": "Mô tả ngắn gọn câu truy vấn trả về thông tin gì"
}}"""


async def _translate_with_llm(user_prompt: str) -> Optional[dict]:
    """
    [TÍCH HỢP] Dịch câu hỏi tiếng Việt sang SQL SELECT qua genai_client.
    Thay thế urllib raw call cũ.
    Hưởng lợi: Retry 429 (backoff jitter), Retry 5xx (tối đa 3 lần),
               Circuit Breaker, JSON parse retry tự động.
    """
    # Không gọi LLM nếu không có API key — rơi về heuristic
    has_key = bool(os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY"))
    if not has_key:
        return None

    try:
        req = GenAIRequest(
            system_context=_TEXT2SQL_SYSTEM,
            messages=[GenAIMessage(role="user", content=user_prompt)],
            # temperature=0.1: gần như deterministic → SQL ổn định, ít thay đổi mỗi lần gọi
            params=GenAIParams(temperature=0.1, max_tokens=500)
        )
        # [TÍCH HỢP] call_llm_json: parse JSON + retry JSON parse 2 lần + fallback raw text
        result = await call_llm_json(req)

        # Nếu parse JSON thất bại hoàn toàn → result có "parse_error" → dùng heuristic
        if "parse_error" in result or "sql" not in result:
            logger.warning("[Text-to-SQL] LLM JSON parse failed, falling back to heuristic.")
            return None

        return result

    except Exception as e:
        logger.warning(f"[Text-to-SQL] genai_client call failed: {type(e).__name__}")
        return None




def _translate_heuristic(prompt: str) -> dict:
    """
    Bộ phân tích ngữ nghĩa tự nhiên (Semantic Heuristic NLP) cho các câu hỏi phổ biến của thủ thư.
    Đảm bảo chatbot luôn hoạt động xuất sắc ngay cả khi chưa cấu hình API Key.
    """
    p = prompt.lower().strip()

    # 0. Lời chào hỏi thông thường
    if p in ["hello", "hi", "xin chào", "chào", "chào bạn", "alo", "test", "hey"]:
        return {
            "sql": "SELECT id AS ma_sach, title AS ten_sach, author AS tac_gia, category AS the_loai, available_copies AS con_san FROM books ORDER BY id DESC LIMIT 5",
            "explanation": "Xin chào! Tôi là Trợ lý AI Text-to-SQL. Bạn có thể hỏi tôi về sách quá hạn, độc giả bị khóa, số lượng sách trong kho... Dưới đây là 5 cuốn sách mới nhất trong kho thư viện."
        }

    # 1. Sách quá hạn
    if any(k in p for k in ["quá hạn", "trễ hạn", "chưa trả quá ngày", "hết hạn"]):
        return {
            "sql": (
                "SELECT br.id AS ma_phieu, b.title AS ten_sach, u.full_name AS doc_gia, "
                "u.phone AS so_dien_thoai, br.borrow_date AS ngay_muon, br.due_date AS han_tra, "
                "br.overdue_days AS so_ngay_qua_han, br.fine_amount AS tien_phat "
                "FROM borrow_records br "
                "JOIN books b ON br.book_id = b.id "
                "JOIN users u ON br.user_id = u.id "
                "WHERE br.status = 'Đang mượn' AND (br.overdue_days > 0 OR br.due_date < CURRENT_TIMESTAMP) "
                "ORDER BY br.overdue_days DESC LIMIT 100"
            ),
            "explanation": "Truy vấn danh sách các phiếu mượn sách đã quá hạn trả, kèm thông tin độc giả và số tiền phạt tích lũy."
        }

    # 2. Sách còn sẵn trong kho
    if any(k in p for k in ["còn sẵn", "sẵn sàng", "còn trong kho", "sách còn"]):
        return {
            "sql": (
                "SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, "
                "quantity AS tong_so_luong, available_copies AS con_san, status AS trang_thai "
                "FROM books WHERE available_copies > 0 AND status = 'Sẵn sàng' "
                "ORDER BY available_copies DESC LIMIT 100"
            ),
            "explanation": "Danh sách các đầu sách hiện đang có sẵn trong kho để bạn đọc mượn ngay."
        }

    # 3. Sách hết / hết hàng
    if any(k in p for k in ["hết sách", "hết hàng", "không còn sẵn"]):
        return {
            "sql": (
                "SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, "
                "quantity AS tong_so_luong, available_copies AS con_san "
                "FROM books WHERE available_copies = 0 OR status = 'Hết sách' LIMIT 100"
            ),
            "explanation": "Danh sách các đầu sách đã được mượn hết (số lượng khả dụng bằng 0)."
        }

    # 4. Top sách mượn nhiều nhất
    if any(k in p for k in ["nhiều nhất", "phổ biến", "top sách", "thịnh hành", "hot"]):
        return {
            "sql": (
                "SELECT b.id, b.title AS ten_sach, b.author AS tac_gia, b.category AS the_loai, "
                "COUNT(br.id) AS tong_luot_muon "
                "FROM books b "
                "JOIN borrow_records br ON b.id = br.book_id "
                "GROUP BY b.id, b.title, b.author, b.category "
                "ORDER BY tong_luot_muon DESC LIMIT 10"
            ),
            "explanation": "Top 10 cuốn sách được độc giả mượn đọc nhiều nhất trong thư viện."
        }

    # 5. Độc giả bị khóa tài khoản
    if any(k in p for k in ["bị khóa", "khóa tài khoản", "tài khoản bị khóa", "chặn"]):
        return {
            "sql": (
                "SELECT id, username, full_name AS ho_ten, email, phone AS so_dien_thoai, "
                "lock_reason AS ly_do_khoa, created_at AS ngay_tao "
                "FROM users WHERE is_locked = 1 OR is_active = 0 LIMIT 100"
            ),
            "explanation": "Danh sách các tài khoản độc giả hiện đang bị tạm khóa kèm lý do."
        }

    # 6. Yêu cầu xin gia hạn chờ duyệt
    if any(k in p for k in ["gia hạn", "chờ duyệt gia hạn", "xin gia hạn"]):
        return {
            "sql": (
                "SELECT br.id AS ma_phieu, b.title AS ten_sach, u.full_name AS doc_gia, "
                "br.due_date AS han_tra_hien_tai, br.pending_renew_days AS so_ngay_xin_them, "
                "br.pending_renew_notes AS ly_do_gia_han, br.renew_status AS trang_thai_gia_han "
                "FROM borrow_records br "
                "JOIN books b ON br.book_id = b.id "
                "JOIN users u ON br.user_id = u.id "
                "WHERE br.renew_status = 'Chờ duyệt gia hạn' LIMIT 100"
            ),
            "explanation": "Danh sách các đơn yêu cầu xin gia hạn mượn sách đang chờ thủ thư phê duyệt."
        }

    # 7. Phiếu mượn chờ duyệt
    if any(k in p for k in ["chờ duyệt", "chờ duyệt mượn", "phiếu mượn mới"]):
        return {
            "sql": (
                "SELECT br.id AS ma_phieu, b.title AS ten_sach, u.full_name AS doc_gia, "
                "br.borrow_date AS ngay_dang_ky, br.borrow_type AS hinh_thuc, br.status AS trang_thai "
                "FROM borrow_records br "
                "JOIN books b ON br.book_id = b.id "
                "JOIN users u ON br.user_id = u.id "
                "WHERE br.status = 'Chờ duyệt' "
                "ORDER BY br.borrow_date ASC LIMIT 100"
            ),
            "explanation": "Các phiếu đăng ký mượn sách mới đang đợi thủ thư kiểm tra và duyệt."
        }

    # 8. Tiền phạt / Chưa nộp phạt
    if any(k in p for k in ["tiền phạt", "chưa nộp", "nộp phạt", "phạt"]):
        return {
            "sql": (
                "SELECT f.id AS ma_phat, u.full_name AS doc_gia, u.phone AS so_dien_thoai, "
                "b.title AS ten_sach, f.fine_amount AS so_tien_phat, f.status AS trang_thai, "
                "f.payment_method AS phuong_thuc "
                "FROM fines f "
                "JOIN users u ON f.user_id = u.id "
                "JOIN books b ON f.book_id = b.id "
                "WHERE f.status = 'Chưa nộp' "
                "ORDER BY f.fine_amount DESC LIMIT 100"
            ),
            "explanation": "Danh sách các khoản tiền phạt trễ hạn chưa được nộp của độc giả."
        }

    # 9. Danh sách đặt trước sách
    if any(k in p for k in ["đặt trước", "giữ chỗ", "chờ sách", "reservation"]):
        return {
            "sql": (
                "SELECT r.id AS ma_dat, b.title AS ten_sach, u.full_name AS doc_gia, "
                "r.reserved_at AS ngay_dat, r.priority AS uu_tien, r.status AS trang_thai "
                "FROM reservations r "
                "JOIN books b ON r.book_id = b.id "
                "JOIN users u ON r.user_id = u.id "
                "WHERE r.status = 'Waiting' "
                "ORDER BY r.reserved_at ASC LIMIT 100"
            ),
            "explanation": "Danh sách bạn đọc đang đăng ký đặt trước sách sắp có hoặc đang chờ nhận sách."
        }

    # 10. Tìm kiếm theo thể loại hoặc từ khóa chung
    category_match = None
    for cat in ["công nghệ", "kinh tế", "văn học", "kỹ năng", "khoa học", "lịch sử"]:
        if cat in p:
            category_match = cat.title()
            break

    if category_match:
        return {
            "sql": f"SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, quantity AS so_luong, available_copies AS con_lai, status AS trang_thai FROM books WHERE category LIKE '%{category_match}%' LIMIT 100",
            "explanation": f"Danh sách các đầu sách thuộc thể loại '{category_match}' trong thư viện."
        }

    # Mặc định: Hiển thị tổng quan các sách trong thư viện
    return {
        "sql": "SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, available_copies AS con_san, quantity AS tong_so, status AS trang_thai FROM books ORDER BY id DESC LIMIT 50",
        "explanation": "Hiển thị danh sách tổng quan 50 đầu sách mới nhất trong kho thư viện."
    }


def _execute_safe_query(sql_query: str) -> tuple[List[str], List[Dict[str, Any]]]:
    """
    Thực thi câu lệnh SQL SELECT an toàn trên kết nối MySQL (hoặc SQLite fallback).
    """
    engine = None
    # Ưu tiên MySQL nếu đang kết nối
    if db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine:
        engine = db_manager.mysql_mgr.engine
    else:
        engine = db_manager.mysql_mgr.sqlite_engine

    if not engine:
        raise Exception("Không tìm thấy kết nối Cơ sở dữ liệu khả dụng.")

    with engine.connect() as connection:
        result = connection.execute(text(sql_query))
        columns = list(result.keys())
        rows = result.fetchall()

        data = []
        for row in rows:
            row_dict = {}
            for col_idx, col_name in enumerate(columns):
                val = row[col_idx]
                # Chuẩn hóa các kiểu dữ liệu cho JSON serialization
                if isinstance(val, (datetime, date)):
                    row_dict[col_name] = val.isoformat()
                elif isinstance(val, Decimal):
                    row_dict[col_name] = float(val)
                elif isinstance(val, bytes):
                    row_dict[col_name] = "[Binary Data]"
                else:
                    row_dict[col_name] = val
            data.append(row_dict)

        return columns, data


@router.post("/admin-query", response_model=AdminQueryResponse)
async def handle_admin_query(req: AdminQueryRequest):
    """
    Endpoint Text-to-SQL: Tiếp nhận câu hỏi tiếng Việt -> Sinh SQL SELECT -> Chặn lệnh nguy hiểm -> Trả kết quả JSON
    """
    user_prompt = (req.query or "").strip()
    direct_sql = (req.sql or "").strip()

    if not user_prompt and not direct_sql:
        raise HTTPException(status_code=400, detail="Vui lòng nhập câu hỏi truy vấn.")

    if direct_sql:
        sql = direct_sql
        explanation = "Thực thi truy vấn SQL được cung cấp."
    else:
        # 1. Thử dịch bằng LLM qua genai_client (retry + circuit breaker)
        translated = await _translate_with_llm(user_prompt)

        # 2. Fallback: Nếu không có LLM
        if not translated or not translated.get("sql"):
            # Nếu user_prompt truyền vào thẳng một câu lệnh SQL chứa từ khóa cấm
            clean_prompt = re.sub(r"--.*?$|/\*.*?\*/", "", user_prompt, flags=re.MULTILINE | re.DOTALL).strip()
            if re.search(r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\b", clean_prompt, flags=re.IGNORECASE):
                sql = user_prompt
                explanation = "Yêu cầu thực thi câu lệnh SQL."
            else:
                translated = _translate_heuristic(user_prompt)
                sql = translated.get("sql", "").strip()
                explanation = translated.get("explanation", "Truy vấn dữ liệu theo yêu cầu.")
        else:
            sql = translated.get("sql", "").strip()
            explanation = translated.get("explanation", "Truy vấn dữ liệu theo yêu cầu.")

    # 3. QUÉT VÀ CHẶN TỪ KHÓA NGUY HIỂM BẰNG REGEX (validate_sql)
    # Dừng việc thực thi ngay lập tức và trả về HTTP Status 403 nếu phát hiện từ khóa cấm
    validate_sql(sql)

    # 4. Kiểm tra bổ sung đảm bảo chỉ là câu lệnh SELECT an toàn
    if not validate_read_only_sql(sql):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    # 4. Thực thi truy vấn
    try:
        columns, data = _execute_safe_query(sql)
        return AdminQueryResponse(
            success=True,
            query=user_prompt,
            sql=sql,
            columns=columns,
            data=data,
            total_rows=len(data),
            explanation=explanation,
            error=None
        )
    except Exception as e:
        print(f"[Text-to-SQL] Execution error: {e}")
        return AdminQueryResponse(
            success=False,
            query=user_prompt,
            sql=sql,
            columns=[],
            data=[],
            total_rows=0,
            explanation=explanation,
            error=f"Lỗi thực thi SQL: {str(e)}"
        )


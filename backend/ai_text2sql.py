"""
Module: ai_text2sql.py
Chức năng: Trợ lý truy vấn thông minh (Text-to-SQL Chatbot) cho Quản trị viên/Thủ thư.
Bảo mật & Kiểm soát Biên:
  - CHỈ CHO PHÉP CÂU LỆNH SELECT, CHẶN TUYỆT ĐỐI INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE.
  - CHẶN TRUY XUẤT CỘT DỮ LIỆU NHẠY CẢM (password, password_hash, api_key, jwt_secret).
  - Kiểm soát chặt chẽ các trường hợp biên: Rỗng, Quá ngắn/Ký tự đặc biệt (< 2 ký tự), Quá dài (> 500 ký tự), Câu hỏi ngoài phạm vi CSDL (Out-of-Scope), API Key không hợp lệ.
  - Hỗ trợ cả Google Gemini API (gemini-2.0-flash / gemini-1.5-flash) và OpenAI API (gpt-4o-mini) + Semantic Heuristic Fallback.
"""

import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text

from database import db_manager
from auth_dependency import verify_admin_role

router = APIRouter(prefix="/api/ai", tags=["AI Text-to-SQL"], dependencies=[Depends(verify_admin_role)])

MAX_TEXT2SQL_QUERY_LENGTH = 500
MIN_TEXT2SQL_QUERY_LENGTH = 2

# Schema CSDL chi tiết cung cấp cho LLM (Đã ẩn cột password_hash để bảo mật dữ liệu theo Tiêu chí 3.4)
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

2. users (Tài khoản người dùng & Độc giả - KHÔNG BAO GIỜ TRUY VẤN MẬT KHẨU):
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
   - is_flagged: BOOLEAN (1: giao dịch bất thường bị AI gắn cờ, 0: bình thường)
   - anomaly_score: DECIMAL(5,2) (Điểm bất thường AI)
   - anomaly_reason: VARCHAR(255) (Lý do gắn cờ bất thường)

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

# Các cột dữ liệu nhạy cảm bị cấm truy xuất qua Text-to-SQL (Tiêu chí 3.4)
SENSITIVE_DATA_KEYWORDS = [
    "PASSWORD_HASH", "PASSWORD", "JWT_SECRET", "API_KEY", "SECRET_KEY"
]


class AdminQueryRequest(BaseModel):
    query: Optional[str] = ""
    sql: Optional[str] = None
    apiKey: Optional[str] = None


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
    Quét và CHẶN các từ khóa nguy hiểm bằng Regex: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE
    cũng như chặn truy xuất các trường nhạy cảm (password, password_hash).
    Nếu phát hiện vi phạm, dừng việc thực thi và trả về HTTP Status 403.
    """
    if not sql_query or not isinstance(sql_query, str):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    clean_sql = re.sub(r"--.*?$|/\*.*?\*/", "", sql_query, flags=re.MULTILINE | re.DOTALL).strip()

    # 1. Quét và CHẶN các từ khóa thay đổi/phá hủy CSDL: DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE
    forbidden_pattern = r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\b"
    if re.search(forbidden_pattern, sql_query, flags=re.IGNORECASE) or re.search(forbidden_pattern, clean_sql, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    # 2. Chặn thêm các từ khóa thực thi nhúng hoặc can thiệp hệ thống nguy hiểm khác
    extra_danger_pattern = r"\b(EXEC|EXECUTE|GRANT|REVOKE|REPLACE|ATTACH|DETACH|PRAGMA|INTO\s+OUTFILE|DUMPFILE)\b"
    if re.search(extra_danger_pattern, clean_sql, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    # 3. Chặn truy xuất các cột dữ liệu nhạy cảm (password, password_hash) theo Tiêu chí 3.4
    sensitive_pattern = r"\b(password_hash|password|jwt_secret|api_key)\b"
    if re.search(sensitive_pattern, sql_query, flags=re.IGNORECASE) or re.search(sensitive_pattern, clean_sql, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Không được phép truy xuất trường dữ liệu nhạy cảm (mật khẩu / khóa bảo mật)."
        )

    return True


def validate_read_only_sql(sql: str) -> bool:
    """
    Xác thực câu lệnh SQL an toàn: CHỈ CHO PHÉP SELECT, không chứa lệnh ghi hay phân tách nhiều câu lệnh.
    """
    clean_sql = re.sub(r"--.*?$|/\*.*?\*/", "", sql, flags=re.MULTILINE | re.DOTALL).strip()

    if not clean_sql:
        return False

    if not re.match(r"^(SELECT|WITH)\s+", clean_sql, re.IGNORECASE):
        return False

    statements = [s.strip() for s in clean_sql.split(";") if s.strip()]
    if len(statements) > 1:
        return False

    upper_sql = f" {clean_sql.upper()} "
    for kw in DISALLOWED_SQL_KEYWORDS + SENSITIVE_DATA_KEYWORDS:
        pattern = rf"\b{kw}\b"
        if re.search(pattern, upper_sql):
            return False

    return True


def _validate_admin_api_key(explicit_key: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Kiểm tra tính hợp lệ của API Key (Gemini 'AQ...' / 'AIza...' hoặc OpenAI 'sk-...') nếu được truyền vào"""
    if explicit_key is not None and explicit_key.strip() != "":
        k = explicit_key.strip()
        if len(k) < 20 or not (k.startswith("AQ") or k.startswith("AIza") or k.startswith("sk-")):
            raise HTTPException(
                status_code=401,
                detail="API Key không hợp lệ! Vui lòng nhập đúng Google Gemini API Key ('AQ...' hoặc 'AIza...') hoặc OpenAI API Key ('sk-...')."
            )
        if k.startswith("AQ") or k.startswith("AIza"):
            return k, None
        return None, k

    gemini_key = (os.getenv("GEMINI_API_KEY") or "").strip() or None
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip() or None
    require_key = os.getenv("AI_REQUIRE_API_KEY", "false").lower() in ("true", "1", "yes")
    if require_key and not gemini_key and not openai_key:
        raise HTTPException(
            status_code=401,
            detail="Hệ thống yêu cầu cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY trong file .env để sử dụng Text-to-SQL AI."
        )
    if gemini_key and (len(gemini_key) < 20 or not (gemini_key.startswith("AQ") or gemini_key.startswith("AIza"))):
        raise HTTPException(
            status_code=401,
            detail="GEMINI_API_KEY cấu hình trong file .env không hợp lệ! Vui lòng kiểm tra lại (bắt đầu bằng 'AQ...' hoặc 'AIza...')."
        )
    return gemini_key, openai_key


def _translate_with_llm(user_prompt: str, explicit_key: Optional[str] = None) -> Optional[dict]:
    """Gọi Google Gemini API (gemini-3.8-flash) hoặc OpenAI API để dịch câu hỏi tự nhiên sang SQL SELECT an toàn"""
    gemini_key, openai_key = _validate_admin_api_key(explicit_key)

    if not gemini_key and not openai_key:
        return None

    system_instruction = f"""
Bạn là Chuyên gia Database Administrator và AI Assistant của Hệ thống Quản lý Thư viện SmartLib.
Nhiệm vụ của bạn là chuyển đổi câu hỏi bằng Tiếng Việt của Thủ thư thành câu truy vấn SQL SELECT duy nhất và chuẩn cú pháp.

Quy tắc BẮT BUỘC:
1. CHỈ tạo câu lệnh SELECT. Tuyệt đối KHÔNG sử dụng INSERT, UPDATE, DELETE, DROP, ALTER.
2. Tuyệt đối KHÔNG truy vấn cột password hoặc password_hash. Nếu người dùng hỏi về bảng users, luôn liệt kê rõ các cột an toàn: id, username, full_name, role, email, phone, is_active, is_locked.
3. Bảng và Cột phải khớp 100% với Schema dưới đây:
{DATABASE_SCHEMA_PROMPT}
4. NẾU câu hỏi của người dùng KHÔNG liên quan đến dữ liệu thư viện (ví dụ: hỏi thời tiết, bóng đá, giá vàng, toán học 1+1, nấu ăn, chuyện phím...), trả về JSON:
{{
   "out_of_scope": true,
   "sql": "",
   "explanation": "Câu hỏi nằm ngoài phạm vi truy vấn CSDL Thư viện SmartLib."
}}
5. Nếu câu hỏi hợp lệ, trả về JSON:
{{
   "out_of_scope": false,
   "sql": "SELECT ... LIMIT 100",
   "explanation": "Mô tả ngắn gọn kết quả này lấy những thông tin gì để trả lời câu hỏi"
}}
6. Chỉ trả về JSON thuần, không bọc markdown.
"""

    if gemini_key:
        configured_model = (os.getenv("AI_MODEL") or "gemini-3.8-flash").strip()
        candidate_models = []
        for m in ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", configured_model]:
            if m and m not in candidate_models:
                candidate_models.append(m)

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"{system_instruction}\n\nCâu hỏi của Thủ thư: {user_prompt}"}]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 500
            }
        }

        last_http_err = None
        for model_name in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=6) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    content = resp_data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    content = re.sub(r"^```json\s*", "", content)
                    content = re.sub(r"\s*```$", "", content)
                    return json.loads(content)
            except urllib.error.HTTPError as http_err:
                last_http_err = http_err
                if http_err.code in (400, 401, 403) and explicit_key:
                    break
                continue
            except Exception as e:
                print(f"[Text-to-SQL] Gemini translation attempt ({model_name}) failed: {e}")
                continue

        if last_http_err is not None and last_http_err.code in (400, 401, 403) and explicit_key:
            raise HTTPException(
                status_code=401,
                detail="Google Gemini API Key không hợp lệ hoặc đã hết hạn!"
            )

    if openai_key:
        try:
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 500
            }

            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {openai_key}"
                }
            )

            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                content = resp_data["choices"][0]["message"]["content"].strip()
                content = re.sub(r"^```json\s*", "", content)
                content = re.sub(r"\s*```$", "", content)
                return json.loads(content)
        except urllib.error.HTTPError as http_err:
            if http_err.code in (401, 403) and explicit_key:
                raise HTTPException(
                    status_code=401,
                    detail="OpenAI API Key không hợp lệ hoặc đã hết hạn!"
                )
            print(f"[Text-to-SQL] OpenAI translation failed: {http_err}")
        except Exception as e:
            print(f"[Text-to-SQL] OpenAI translation failed: {e}")

    return None


def _translate_heuristic(prompt: str) -> dict:
    """
    Bộ phân tích ngữ nghĩa tự nhiên (Semantic Heuristic NLP) cho các câu hỏi quản trị thư viện.
    Kiểm soát chặt chẽ câu hỏi ngoài phạm vi (Out-of-Scope): Nếu câu hỏi không liên quan đến
    nghiệp vụ CSDL Thư viện, trả về out_of_scope = True để từ chối thay vì trả về 50 sách ngẫu nhiên!
    """
    p = prompt.lower().strip()

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

    # 2. Giao dịch bất thường / AI Anomaly
    if any(k in p for k in ["bất thường", "anomaly", "gắn cờ", "nghi vấn", "gian lận"]):
        return {
            "sql": (
                "SELECT br.id AS ma_phieu, u.full_name AS doc_gia, b.title AS ten_sach, "
                "br.borrow_date AS ngay_muon, br.actual_return_date AS ngay_tra, "
                "br.anomaly_score AS diem_bat_thuong, br.anomaly_reason AS ly_do_canh_bao "
                "FROM borrow_records br "
                "JOIN books b ON br.book_id = b.id "
                "JOIN users u ON br.user_id = u.id "
                "WHERE br.is_flagged = 1 "
                "ORDER BY br.anomaly_score DESC LIMIT 100"
            ),
            "explanation": "Danh sách các giao dịch mượn - trả có dấu hiệu bất thường bị hệ thống AI gắn cờ cảnh báo."
        }

    # 3. Sách còn sẵn trong kho
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

    # 4. Sách hết / hết hàng
    if any(k in p for k in ["hết sách", "hết hàng", "không còn sẵn", "tồn kho bằng 0"]):
        return {
            "sql": (
                "SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, "
                "quantity AS tong_so_luong, available_copies AS con_san "
                "FROM books WHERE available_copies = 0 OR status = 'Hết sách' LIMIT 100"
            ),
            "explanation": "Danh sách các đầu sách đã được mượn hết (số lượng khả dụng bằng 0)."
        }

    # 5. Top sách mượn nhiều nhất
    if any(k in p for k in ["nhiều nhất", "phổ biến", "top", "thịnh hành", "hot"]):
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

    # 6. Độc giả bị khóa tài khoản
    if any(k in p for k in ["bị khóa", "khóa tài khoản", "tài khoản bị khóa", "chặn"]):
        return {
            "sql": (
                "SELECT id, username, full_name AS ho_ten, email, phone AS so_dien_thoai, "
                "lock_reason AS ly_do_khoa, created_at AS ngay_tao "
                "FROM users WHERE is_locked = 1 OR is_active = 0 LIMIT 100"
            ),
            "explanation": "Danh sách các tài khoản độc giả hiện đang bị tạm khóa kèm lý do."
        }

    # 7. Danh sách độc giả / người dùng
    if any(k in p for k in ["độc giả", "người dùng", "sinh viên", "bạn đọc", "thành viên"]):
        return {
            "sql": (
                "SELECT id, username, full_name AS ho_ten, role AS vai_tro, email, phone AS so_dien_thoai, "
                "address AS dia_chi, is_locked AS bi_khoa "
                "FROM users WHERE role = 'Reader' ORDER BY id DESC LIMIT 100"
            ),
            "explanation": "Danh sách hồ sơ độc giả đã đăng ký trong hệ thống Thư viện SmartLib."
        }

    # 8. Yêu cầu xin gia hạn chờ duyệt
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

    # 9. Phiếu mượn chờ duyệt
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

    # 10. Tiền phạt / Chưa nộp phạt
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

    # 11. Danh sách đặt trước sách
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

    # 12. Tìm kiếm theo thể loại
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

    # 13. Hỏi về phiếu mượn / lịch sử mượn trả nói chung
    if any(k in p for k in ["phiếu mượn", "lịch sử mượn", "đang mượn", "đã trả", "lượt mượn"]):
        return {
            "sql": (
                "SELECT br.id AS ma_phieu, b.title AS ten_sach, u.full_name AS doc_gia, "
                "br.borrow_date AS ngay_muon, br.due_date AS han_tra, br.status AS trang_thai "
                "FROM borrow_records br "
                "JOIN books b ON br.book_id = b.id "
                "JOIN users u ON br.user_id = u.id "
                "ORDER BY br.id DESC LIMIT 50"
            ),
            "explanation": "Danh sách 50 phiếu mượn - trả sách gần nhất trong hệ thống."
        }

    # 14. Hỏi về danh sách sách / kho sách / thống kê sách
    if any(k in p for k in ["sách", "kho", "tác giả", "thể loại", "ấn phẩm", "tổng số", "thống kê"]):
        return {
            "sql": "SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, available_copies AS con_san, quantity AS tong_so, status AS trang_thai FROM books ORDER BY id DESC LIMIT 50",
            "explanation": "Hiển thị danh sách tổng quan 50 đầu sách mới nhất trong kho thư viện."
        }

    # 15. CÂU HỎI NGOÀI PHẠM VI CSDL THƯ VIỆN (OUT-OF-SCOPE GUARDRAIL)
    return {
        "out_of_scope": True,
        "sql": "",
        "explanation": "Câu hỏi nằm ngoài phạm vi truy vấn CSDL Thư viện SmartLib."
    }


def _execute_safe_query(sql_query: str) -> tuple[List[str], List[Dict[str, Any]]]:
    """
    Thực thi câu lệnh SQL SELECT an toàn trên kết nối MySQL (hoặc SQLite fallback).
    Đồng thời lọc bỏ các cột nhạy cảm (password, password_hash) nếu người dùng gọi SELECT * FROM users.
    """
    engine = None
    if db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine:
        engine = db_manager.mysql_mgr.engine
    else:
        engine = db_manager.mysql_mgr.sqlite_engine

    if not engine:
        raise Exception("Không tìm thấy kết nối Cơ sở dữ liệu khả dụng.")

    hidden_cols = {"password", "password_hash", "jwt_secret", "api_key"}

    normalized_sql = re.sub(r"\b(NOW|CURDATE)\s*\(\s*\)", "CURRENT_TIMESTAMP", sql_query, flags=re.IGNORECASE)

    with engine.connect() as connection:
        result = connection.execute(text(normalized_sql))
        raw_columns = list(result.keys())
        safe_columns = [c for c in raw_columns if c.lower() not in hidden_cols]
        rows = result.fetchall()

        data = []
        for row in rows:
            row_dict = {}
            for col_idx, col_name in enumerate(raw_columns):
                if col_name.lower() in hidden_cols:
                    continue
                val = row[col_idx]
                if isinstance(val, (datetime, date)):
                    row_dict[col_name] = val.isoformat()
                elif isinstance(val, Decimal):
                    row_dict[col_name] = float(val)
                elif isinstance(val, bytes):
                    row_dict[col_name] = "[Binary Data]"
                else:
                    row_dict[col_name] = val
            data.append(row_dict)

        return safe_columns, data


@router.post("/admin-query", response_model=AdminQueryResponse)
async def handle_admin_query(req: AdminQueryRequest):
    """
    Endpoint Text-to-SQL: Tiếp nhận câu hỏi tiếng Việt -> Kiểm soát biên & câu hỏi ngoài -> Sinh SQL SELECT -> Chặn lệnh nguy hiểm & cột mật khẩu -> Trả kết quả JSON
    """
    user_prompt = (req.query or "").strip()
    direct_sql = (req.sql or "").strip()

    # 1. Kiểm soát biên rỗng
    if not user_prompt and not direct_sql:
        raise HTTPException(status_code=400, detail="Vui lòng nhập câu hỏi truy vấn (không được để trống).")

    # 2. Kiểm soát biên độ dài tối đa (> 500 ký tự) và biên độ dài tối thiểu (< 2 ký tự / chỉ ký tự đặc biệt)
    if user_prompt:
        if len(user_prompt) > MAX_TEXT2SQL_QUERY_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Câu hỏi truy vấn vượt quá giới hạn biên tối đa {MAX_TEXT2SQL_QUERY_LENGTH} ký tự (hiện tại: {len(user_prompt)} ký tự)."
            )
        alnum_chars = re.findall(r"[a-zA-Z0-9À-ỹ]", user_prompt)
        if len(user_prompt) < MIN_TEXT2SQL_QUERY_LENGTH or len(alnum_chars) == 0:
            raise HTTPException(
                status_code=400,
                detail="Câu hỏi truy vấn không hợp lệ (quá ngắn hoặc chỉ chứa ký tự đặc biệt). Vui lòng nhập câu hỏi rõ ràng bằng tiếng Việt."
            )

    # 3. Kiểm tra ngay trên câu hỏi tự nhiên nếu người dùng cố tình hỏi mật khẩu hoặc truyền SQL nguy hiểm
    clean_prompt = re.sub(r"--.*?$|/\*.*?\*/", "", user_prompt, flags=re.MULTILINE | re.DOTALL).strip()
    if re.search(r"\b(password_hash|password|mật\s*khẩu|jwt_secret|api_key|api\s*key|secret_key|xin\s+pass|access_token)\b", clean_prompt, flags=re.IGNORECASE):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Không được phép truy xuất trường dữ liệu nhạy cảm (mật khẩu / khóa bảo mật / API Key)."
        )

    if direct_sql:
        sql = direct_sql
        explanation = "Thực thi truy vấn SQL được cung cấp."
    else:
        # 4. Nếu user_prompt truyền vào thẳng một câu lệnh SQL chứa từ khóa cấm -> chuyển thẳng tới validate_sql để chặn 403
        if re.search(r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|EXEC|EXECUTE|INTO\s+OUTFILE)\b", clean_prompt, flags=re.IGNORECASE):
            sql = user_prompt
            explanation = "Yêu cầu thực thi câu lệnh SQL."
        else:
            # 5. Thử dịch bằng LLM (Gemini / OpenAI API nếu có)
            translated = _translate_with_llm(user_prompt, req.apiKey)

            # 6. Fallback sang Semantic Heuristic nếu chưa cấu hình LLM API Key
            if not translated:
                translated = _translate_heuristic(user_prompt)

            if translated.get("out_of_scope"):
                raise HTTPException(
                    status_code=400,
                    detail="Câu hỏi nằm ngoài phạm vi truy vấn CSDL Thư viện SmartLib. Trợ lý Text-to-SQL chỉ hỗ trợ truy vấn dữ liệu Sách, Độc giả, Phiếu mượn - trả, Đặt trước và Tiền phạt."
                )

            sql = (translated.get("sql") or "").strip()
            explanation = translated.get("explanation", "Truy vấn dữ liệu theo yêu cầu.")

    # 7. QUÉT VÀ CHẶN TỪ KHÓA NGUY HIỂM & CỘT NHẠY CẢM BẰNG REGEX (validate_sql)
    validate_sql(sql)

    # 8. Kiểm tra bổ sung đảm bảo chỉ là câu lệnh SELECT đơn lẻ an toàn
    if not validate_read_only_sql(sql):
        raise HTTPException(
            status_code=403,
            detail="Cảnh báo bảo mật: Câu lệnh chứa thao tác không được phép."
        )

    # 9. Thực thi truy vấn
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

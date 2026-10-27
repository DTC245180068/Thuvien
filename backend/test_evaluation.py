"""
Module: test_evaluation.py
Chức năng: Bộ kịch bản Thực nghiệm & Kiểm thử Tự động (Đúng - Sai - Biên) cho Dự án SmartLib.
Đối chiếu Tiêu chí chấm:
  - Tiêu chí 2.1, 2.2, 2.3, 2.4 (Hoàn thiện hệ thống & Chức năng AI)
  - Tiêu chí 3.1 (Kiểm thử Đúng - Sai - Biên)
  - Tiêu chí 3.3 (Xử lý lỗi AI & Chống SQL Injection / Hallucination)
  - Tiêu chí 3.4 (Bảo mật dữ liệu nhạy cảm & API Key)
Cách chạy:
  python backend/test_evaluation.py
"""

import os
import sys
import io
import unittest
from PIL import Image
from fastapi.testclient import TestClient

# Đảm bảo stdout/stderr trên Windows PowerShell hỗ trợ UTF-8 không bị lỗi charmap cp1252
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Đảm bảo import được các module trong backend/
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app
from auth_dependency import create_jwt_token

client = TestClient(app)


class SmartLibEvaluationTestSuite(unittest.TestCase):
    """Bộ kiểm thử toàn diện phân tách rõ 3 nhóm: ĐÚNG (Normal) - SAI (Invalid/Attack) - BIÊN (Boundary)"""

    @classmethod
    def setUpClass(cls):
        cls.admin_token = create_jwt_token({"sub": "1", "username": "admin", "role": "Admin"})
        cls.librarian_token = create_jwt_token({"sub": "3", "username": "librarian", "role": "Librarian"})
        cls.reader_token = create_jwt_token({"sub": "2", "username": "reader", "role": "Reader"})

        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}
        cls.reader_headers = {"Authorization": f"Bearer {cls.reader_token}"}

    # =========================================================================
    # NHÓM 1: KIỂM THỬ ĐÚNG (POSITIVE / NORMAL TEST CASES)
    # =========================================================================

    def test_01_normal_login_rbac_tokens(self):
        """[TC-N01] Kiểm thử Đúng: Đăng nhập tài khoản Admin và Reader hợp lệ"""
        res_admin = client.post("/api/auth/login", json={"username": "admin", "password": "123"})
        self.assertEqual(res_admin.status_code, 200)
        data = res_admin.json()
        self.assertEqual(data["user"]["role"], "Admin")

    def test_02_normal_ai_reader_function_calling(self):
        """[TC-N02] Kiểm thử Đúng: AI Reader Agent điều phối Function Calling tìm sách theo chủ đề"""
        res = client.post(
            "/api/ai/reader-chat",
            json={
                "message": "Gợi ý cho mình sách kỹ năng giao tiếp hoặc phát triển bản thân",
                "userId": 2,
                "userName": "Trần Thị Mai",
                "role": "Reader"
            }
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get("success"))
        self.assertIn("answer", body)
        self.assertIsInstance(body.get("suggested_books"), list)

    def test_03_normal_ai_text2sql_select_overdue(self):
        """[TC-N03] Kiểm thử Đúng: AI Text-to-SQL chuyển câu hỏi tiếng Việt sang SELECT an toàn"""
        res = client.post(
            "/api/ai/admin-query",
            headers=self.admin_headers,
            json={"query": "Liệt kê danh sách các sách đang mượn quá hạn"}
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get("success"))
        self.assertTrue(body.get("sql", "").upper().startswith("SELECT"))

    def test_04_normal_ai_cataloging_valid_image(self):
        """[TC-N04] Kiểm thử Đúng: AI Book Cataloging trích xuất thông tin từ ảnh bìa hợp lệ (Human-in-the-loop)"""
        img = Image.new("RGB", (300, 450), color=(40, 80, 160))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        res = client.post(
            "/api/ai/extract-book",
            headers=self.admin_headers,
            files={"file": ("lap_trinh_python_co_ban.png", buf, "image/png")}
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn("title", body)
        self.assertIn("category", body)
        self.assertGreater(body.get("confidence", 0), 0.0)

    # =========================================================================
    # NHÓM 2: KIỂM THỬ SAI (NEGATIVE / INVALID & SECURITY ATTACK TEST CASES)
    # =========================================================================

    def test_05_invalid_login_wrong_password(self):
        """[TC-I01] Kiểm thử Sai: Đăng nhập sai mật khẩu trả về HTTP 401"""
        res = client.post("/api/auth/login", json={"username": "admin", "password": "wrong_password_999"})
        self.assertEqual(res.status_code, 401)

    def test_06_invalid_rbac_reader_access_admin_ai(self):
        """[TC-I02] Kiểm thử Sai: Độc giả (Reader) cố tình gọi API AI Text-to-SQL của Admin -> Chặn HTTP 403"""
        res = client.post(
            "/api/ai/admin-query",
            headers=self.reader_headers,
            json={"query": "Top sách mượn nhiều nhất"}
        )
        self.assertEqual(res.status_code, 403)

    def test_07_invalid_ai_sql_injection_destructive_commands(self):
        """[TC-I03] Kiểm thử Sai (Bảo mật AI): Chặn tuyệt đối lệnh DROP, DELETE, UPDATE, TRUNCATE trong AI Text-to-SQL"""
        malicious_Payloads = [
            "DROP TABLE books;",
            "DELETE FROM users WHERE id = 2;",
            "UPDATE fines SET status = 'Đã nộp';",
            "SELECT * FROM books; DROP TABLE users;"
        ]
        for payload in malicious_Payloads:
            res = client.post(
                "/api/ai/admin-query",
                headers=self.admin_headers,
                json={"query": payload}
            )
            self.assertEqual(res.status_code, 403, f"Không chặn được payload nguy hiểm: {payload}")

    def test_08_invalid_ai_sensitive_password_leak_prevention(self):
        """[TC-I04] Kiểm thử Sai (Bảo mật Dữ liệu 3.4): Chặn truy xuất cột nhạy cảm password_hash qua Text-to-SQL"""
        res = client.post(
            "/api/ai/admin-query",
            headers=self.admin_headers,
            json={"sql": "SELECT username, password_hash FROM users LIMIT 10"}
        )
        self.assertEqual(res.status_code, 403)

    def test_09_invalid_ai_cataloging_non_image_file(self):
        """[TC-I05] Kiểm thử Sai: Tải file văn bản (.txt) giả dạng vào AI Cataloging -> Chặn HTTP 400"""
        fake_file = io.BytesIO(b"Day khong phai la file anh")
        res = client.post(
            "/api/ai/extract-book",
            headers=self.admin_headers,
            files={"file": ("malicious.txt", fake_file, "text/plain")}
        )
        self.assertEqual(res.status_code, 400)

    # =========================================================================
    # NHÓM 3: KIỂM THỬ BIÊN (BOUNDARY VALUE TEST CASES)
    # =========================================================================

    def test_10_boundary_empty_ai_queries(self):
        """[TC-B01] Kiểm thử Biên: Câu hỏi AI rỗng hoặc chỉ chứa khoảng trắng -> HTTP 400"""
        res_sql = client.post(
            "/api/ai/admin-query",
            headers=self.admin_headers,
            json={"query": "   "}
        )
        self.assertEqual(res_sql.status_code, 400)

        res_chat = client.post(
            "/api/ai/reader-chat",
            json={"message": "   "}
        )
        self.assertEqual(res_chat.status_code, 400)

    def test_11_boundary_image_size_over_10mb(self):
        """[TC-B02] Kiểm thử Biên: Ảnh tải lên AI Cataloging vượt ngưỡng biên 10MB (10MB + 1 byte) -> HTTP 400"""
        oversized_bytes = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * (10 * 1024 * 1024 + 1))
        res = client.post(
            "/api/ai/extract-book",
            headers=self.admin_headers,
            files={"file": ("oversized_cover.png", oversized_bytes, "image/png")}
        )
        self.assertEqual(res.status_code, 400)

    def test_12_boundary_fallback_without_api_key(self):
        """[TC-B03] Kiểm thử Biên (Xử lý lỗi AI 3.3): Khi API Key = None/Rỗng, hệ thống tự động Fallback không lỗi 500"""
        old_gemini = os.environ.pop("GEMINI_API_KEY", None)
        old_openai = os.environ.pop("OPENAI_API_KEY", None)
        try:
            res = client.post(
                "/api/ai/reader-chat",
                json={"message": "Quy định mượn sách tối đa mấy cuốn và phạt bao nhiêu tiền?", "role": "Reader"}
            )
            self.assertEqual(res.status_code, 200)
            body = res.json()
            self.assertTrue(body.get("success"))
            self.assertIn("2.000", body.get("answer", ""))
        finally:
            if old_gemini:
                os.environ["GEMINI_API_KEY"] = old_gemini
            if old_openai:
                os.environ["OPENAI_API_KEY"] = old_openai


if __name__ == "__main__":
    print("=" * 75)
    print("CHẠY BỘ KIỂM THỬ THỰC NGHIỆM SMARTLIB (ĐÚNG - SAI - BIÊN | TIÊU CHÍ 3)")
    print("=" * 75)
    unittest.main(verbosity=2)

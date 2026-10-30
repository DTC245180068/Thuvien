<!-- Tên file: api_docs.md -->
# ĐẶC TẢ CHI TIẾT HỆ THỐNG API BACKEND (SMARTLIB FASTAPI)

* **Base URL:** `http://localhost:8000` (Local) / `/api` (Production Reverse Proxy)
* **Xác thực:** JWT Bearer Token qua Header `Authorization: Bearer <token>`
* **Định dạng dữ liệu:** `application/json` (hoặc `multipart/form-data` đối với upload ảnh)

---

## 1. Bảng Danh mục API Quản lý Nghiệp vụ Thư viện

| HTTP Method | Đường dẫn (Route) | Module (File gốc) | Mô tả chức năng | Input chính | Output chính |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | `backend/app.py` | Kiểm tra tình trạng hoạt động của server | Không có | `{"status": "ok", "service": "..."}` |
| **GET** | `/api/health/ai` | `backend/genai_client.py` | Kiểm tra trạng thái Circuit Breaker & LLM | Không có | `circuit_breaker_state`, `failure_count`, `provider` |
| **POST** | `/api/auth/login` | `backend/app.py` | Đăng nhập hệ thống (Admin/Thủ thư/Độc giả) | `username`, `password` | `token`, `user` object |
| **POST** | `/api/auth/register` | `backend/app.py` | Đăng ký tài khoản bạn đọc mới | `username`, `password`, `fullName`, `email`, `phone` | `message`, `user` |
| **PUT** | `/api/auth/profile` | `backend/app.py` | Cập nhật hồ sơ cá nhân của người dùng | `fullName`, `email`, `phone`, `address` | `user` object đã cập nhật |
| **PUT** | `/api/auth/change-password` | `backend/app.py` | Đổi mật khẩu tài khoản | `oldPassword`, `newPassword` | `{"success": true, "message": "..."}` |
| **GET** | `/api/books` | `backend/app.py` | Lấy danh sách sách (hỗ trợ phân trang & lọc) | Query params: `search`, `category`, `status` | Danh sách `books`, `total` |
| **GET** | `/api/books/{book_id}` | `backend/app.py` | Lấy chi tiết thông tin một cuốn sách | Path param: `book_id` | Chi tiết bản ghi `book` |
| **POST** | `/api/books` | `backend/app.py` | Thêm mới đầu sách vào kho thư viện | `title`, `author`, `category`, `quantity`, `description` | Bản ghi `book` vừa tạo kèm `id` |
| **PUT** | `/api/books/{book_id}` | `backend/app.py` | Chỉnh sửa thông tin sách trong kho | Path: `book_id`, Body: các trường cập nhật | Bản ghi `book` đã sửa |
| **DELETE** | `/api/books/{book_id}` | `backend/app.py` | Xóa sách khỏi kho dữ liệu | Path param: `book_id` | `{"success": true, "message": "..."}` |
| **GET** | `/api/readers` | `backend/app.py` | Lấy danh sách tài khoản độc giả | Query param: `search`, `status` | Danh sách người dùng vai trò `Reader` |
| **POST** | `/api/readers` | `backend/app.py` | Tạo thủ công hồ sơ độc giả mới | `fullName`, `email`, `phone`, `address` | Thông tin tài khoản độc giả được tạo |
| **PUT** | `/api/readers/{user_id}` | `backend/app.py` | Cập nhật thông tin độc giả | Path param: `user_id`, Body dữ liệu | Thông tin độc giả sau cập nhật |
| **PUT** | `/api/readers/{user_id}/lock` | `backend/app.py` | Khóa hoặc mở khóa thẻ độc giả | Path: `user_id`, Body: `is_locked`, `lock_reason` | Trạng thái khóa của tài khoản |
| **GET** | `/api/borrows` | `backend/app.py` | Lấy toàn bộ lịch sử và danh sách phiếu mượn | Query params: `user_id`, `status` | Danh sách phiếu mượn trả `borrow_records` |
| **POST** | `/api/borrows` | `backend/app.py` | Tạo yêu cầu đăng ký mượn sách mới | `userId`, `bookId`, `borrowType` | Phiếu mượn mới trạng thái `Chờ duyệt` |
| **PUT** | `/api/borrows/{record_id}/status` | `backend/app.py` | Duyệt mượn, xác nhận trả sách, từ chối | Path: `record_id`, Body: `status`, `notes` | Phiếu mượn đã đổi trạng thái |
| **PUT** | `/api/borrows/{record_id}/renew` | `backend/app.py` | Gửi hoặc phê duyệt gia hạn mượn sách | Path: `record_id`, Body: `pending_renew_days` | Cập nhật hạn trả `due_date` mới |
| **GET** | `/api/reservations` | `backend/app.py` | Lấy danh sách đặt trước sách đang chờ | Query param: `user_id`, `book_id` | Danh sách `reservations` |
| **POST** | `/api/reservations` | `backend/app.py` | Đăng ký giữ chỗ sách sắp về hoặc hết kho | `userId`, `bookId` | Bản ghi đặt trước với số thứ tự ưu tiên |
| **DELETE** | `/api/reservations/{res_id}` | `backend/app.py` | Hủy lượt đặt trước sách | Path param: `res_id` | `{"success": true}` |
| **GET** | `/api/fines` | `backend/app.py` | Lấy danh sách các khoản phạt vi phạm | Query param: `user_id`, `status` | Danh sách phiếu phạt `fines` |
| **PUT** | `/api/fines/{fine_id}/pay` | `backend/app.py` | Xác nhận đã nộp tiền phạt | Path param: `fine_id`, Body: `payment_method` | Bản ghi phạt trạng thái `Đã nộp` |
| **POST** | `/api/payment/vnpay/create` | `backend/app.py` | Khởi tạo URL thanh toán online VNPay | `fineId`, `amount`, `orderInfo` | `{"paymentUrl": "https://sandbox.vnpayment.vn/..."}` |
| **GET** | `/api/settings` | `backend/app.py` | Đọc cấu hình vận hành hệ thống | Không có | JSON chứa thời hạn mượn, mức phạt/ngày... |
| **PUT** | `/api/settings` | `backend/app.py` | Lưu cấu hình hệ thống thư viện | `borrowHomeDays`, `finePerDay`, `libraryName`... | Cấu hình mới được áp dụng |
| **GET** | `/api/export/books` | `backend/export_service.py` | Xuất danh mục kho sách ra file Excel (.xlsx) | Query param: `category` | File nhị phân `application/vnd.openxmlformats` |
| **GET** | `/api/export/borrows` | `backend/export_service.py` | Xuất lịch sử mượn trả ra Excel | Query param: `month`, `year` | File Excel lịch sử mượn trả |
| **GET** | `/api/export/receipt/{id}` | `backend/export_service.py` | Tạo phiếu mượn sách định dạng PDF | Path: `record_id` | File tài liệu `application/pdf` |

---

## 2. Danh mục 5 API Tính Năng AI Cốt Lõi

| HTTP Method | Đường dẫn (Route) | Module (File gốc) | Mô tả chức năng | Input chính | Output chính |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/ai/extract-book` | `backend/ai_cataloging.py` | **AI Biên mục OCR:** Phân tích ảnh bìa sách trích xuất metadata JSON | `file`: UploadFile (ảnh bìa JPEG/PNG ≤ 10MB) | `title`, `author`, `category`, `publisher`, `publish_year`, `ai_tags`, `confidence` |
| **POST** | `/api/ai/admin-query` | `backend/ai_text2sql.py` | **Trợ lý Text-to-SQL:** Dịch câu hỏi tiếng Việt thành SQL SELECT an toàn và thực thi | `query`: chuỗi câu hỏi tự nhiên | `success`, `sql`, `columns`, `data`, `total_rows`, `explanation` |
| **GET** | `/api/ai/anomalies` | `backend/anomaly_detection.py` | **Giám sát Bất thường:** Lấy danh sách phiếu mượn bị AI gắn cờ vi phạm | Không có (Yêu cầu JWT Admin) | Danh sách giao dịch có `is_flagged=1`, `anomaly_score`, `anomaly_reason` |
| **POST** | `/api/ai/anomalies/scan` | `backend/anomaly_detection.py` | **Kích hoạt Quét AI:** Chạy thuật toán phát hiện mượn siêu tốc và mất liên tục | Không có | `{"scanned_records": 120, "new_anomalies_flagged": 2}` |
| **POST** | `/api/ai/anomalies/{id}/resolve` | `backend/anomaly_detection.py` | **Xử lý Vi phạm:** Thủ thư gỡ cờ an toàn cho giao dịch sau khi kiểm tra | Path param: `record_id` | `{"success": true, "message": "Đã gỡ cờ..."}` |
| **POST** | `/api/ai/anomalies/simulate-test-data` | `backend/anomaly_detection.py` | **Tạo Dữ liệu Mẫu:** Tự sinh các ca mượn trả dưới 15 phút để demo nghiệm thu | Không có | `{"success": true, "created_count": 6}` |
| **CLI / Internal** | `run_prediction_pipeline()` | `backend/predictive_analysis.py` | **Dự báo Nhu cầu (Pandas):** Đọc CSV log, tính SMA-3, tìm 5 sách thiếu và ghi bảng `ai_procurement` | Log files: `Exam1.csv`, `Exam2.csv`, `Exam3.csv` | Lưu dữ liệu vào bảng MySQL `ai_procurement` & xuất file CSV báo cáo |


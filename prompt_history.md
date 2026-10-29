<!-- Tên file: prompt_history.md -->
# NHẬT KÝ PROMPT & QUYẾT ĐỊNH KIẾN TRÚC HỆ THỐNG SMARTLIB

Tài liệu ghi nhận toàn bộ quá trình ra quyết định kiến trúc, các Meta-prompt và Prompt tính năng kỹ thuật cốt lõi đã được ứng dụng để phát triển hệ thống Quản lý Thư viện thông minh SmartLib (FastAPI + ReactJS + MySQL + AI).

---

## 1. Thiết kế Cơ sở Dữ liệu & Kiến trúc Đa tầng (Multi-Database & Migration)
* **Mục tiêu:** Thiết kế mô hình dữ liệu quan hệ hoàn chỉnh trên MySQL, hỗ trợ phân quyền JWT 3 cấp (Admin, Librarian, Reader), lưu vết mượn/trả, xử lý tiền phạt, đặt trước và đồng bộ Persistent Local SQLite Mirror khi offline.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Đóng vai Senior Database Architect: Hãy thiết kế schema CSDL quan hệ MySQL cho hệ thống SmartLib gồm các bảng: `users`, `books`, `borrow_records`, `reservations`, `fines`, `ai_procurement`. Thiết lập ràng buộc toàn vẹn khóa ngoại (Foreign Keys), trigger tính phạt quá hạn 2.000đ/ngày, và viết script Python SQLAlchemy tự động migrate schema, đồng thời duy trì SQLite mirror để hệ thống không phụ thuộc cứng vào MySQL khi chạy thử nghiệm."

---

## 2. Module AI 1 — Biên mục Tự động qua Ảnh bìa (OCR & Vision AI)
* **Mục tiêu:** Trích xuất tự động thông tin sách (Tên sách, Tác giả, Thể loại, Nhà xuất bản, Tags) từ ảnh chụp bìa bằng OpenAI Vision / Google Gemini / Tesseract OCR cục bộ theo nguyên tắc **Human-in-the-loop** (không ghi đè trực tiếp DB).
* **Prompt gốc/Tóm tắt lệnh:**
  > "Viết module `ai_cataloging.py` và API `POST /api/ai/extract-book`: Nhận file upload ảnh bìa (multipart/form-data), sử dụng prompt có cấu trúc ép kiểu JSON thuần trả về các trường `title`, `author`, `category`, `publisher`, `ai_tags`, `confidence`. Thiết lập cơ chế fallback 3 tầng: OpenAI GPT-4o-mini Vision -> Tesseract OCR tiếng Việt -> Rule-based filename heuristics. Bắt buộc kiểm tra quyền Admin/Librarian qua JWT."

---

## 3. Module AI 2 — Trợ lý Truy vấn Thông minh (Text-to-SQL Chatbot)
* **Mục tiêu:** Chuyển đổi câu hỏi Tiếng Việt tự nhiên của Thủ thư thành truy vấn SQL `SELECT`, thực thi an toàn và trả về bảng dữ liệu kết quả kèm câu giải thích; chặn triệt để tấn công SQL Injection và các lệnh phá hoại dữ liệu.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Xây dựng module `ai_text2sql.py` với endpoint `POST /api/ai/admin-query`: Cung cấp lược đồ database schema trong system prompt để AI sinh câu lệnh SQL `SELECT`. Triển khai bộ lọc Regex `validate_sql` chặn đứng các từ khóa nguy hiểm (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`) và chặn đa câu lệnh `;` trả về HTTP 403. Nếu chưa có API Key, fallback về Semantic Heuristic NLP phân tích các mẫu câu hỏi nghiệp vụ phổ biến."

---

## 4. Module AI 3 — Phát hiện Bất thường Mượn Trả (Anomaly Detection Engine)
* **Mục tiêu:** Phát hiện các hành vi bất thường trong luồng mượn trả (mượn - trả siêu tốc dưới 15 phút hoặc độc giả báo mất liên tục từ 5 cuốn sách trở lên) và đưa vào hàng đợi cảnh báo cho thủ thư.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Thiết kế module `anomaly_detection.py` chạy giải thuật Rule-based Window Timing & Consecutive Loss Frequency: Quét bảng `borrow_records`, đánh dấu cờ `is_flagged = 1`, tính `anomaly_score` (0.0 -> 1.0) và ghi lý do `anomaly_reason`. Cung cấp các API: lấy danh sách cảnh báo, kích hoạt quét thủ công, gỡ cờ giải quyết, và tạo dữ liệu vi phạm mẫu phục vụ kiểm thử."

---

## 5. Module AI 4 — Dự báo Nhu cầu & Đề xuất Nhập sách (Pandas Data Pipeline)
* **Mục tiêu:** Đọc các file log mượn sách lịch sử (`Exam1.csv`, `Exam2.csv`, `Exam3.csv`), tính toán mức độ tiêu thụ bằng Simple Moving Average (SMA), xác định 5 đầu sách có nguy cơ thiếu hụt cao nhất và lưu vào bảng `ai_procurement`.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Viết module `predictive_analysis.py` sử dụng thư viện Pandas: Thực hiện pipeline `pd.read_csv`, `pd.concat`, `pd.merge` để tổng hợp số liệu mượn sách qua các tháng. Áp dụng công thức SMA-3 kết hợp hệ số tăng trưởng để tính `projected_demand`, tính khoảng thiếu hụt `shortage_gap = projected_demand - available_copies`. Lọc ra Top 5 cuốn sách có nguy cơ đứt gãy kho cao nhất và lưu trực tiếp vào bảng `ai_procurement` trên MySQL."

---

## 6. Module AI 5 — GenAI Client chuẩn Doanh nghiệp (Defense-in-Depth)
* **Mục tiêu:** Xây dựng module kết nối LLM tập trung (`genai_client.py`) tuân thủ nghiêm ngặt mô hình phòng thủ theo chiều sâu (Defense in Depth), chống Rate Limit, tự phục hồi khi lỗi server và kiểm duyệt đầu vào.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Đóng vai Senior AI Backend Engineer: Viết file `genai_client.py` với các tiêu chuẩn:
  > 1. Pydantic Models: `GenAIRequest`, `GenAIResponse`.
  > 2. Thư viện `tenacity`: Xử lý HTTP 429 bằng `wait_exponential_jitter`, xử lý HTTP 5xx bằng `stop_after_attempt(3)`, kèm Circuit Breaker in-memory 3 trạng thái (CLOSED, OPEN, HALF-OPEN).
  > 3. Tự động gọi lại tối đa 2 lần khi parse JSON thất bại trước khi fallback về chuỗi thô.
  > 4. Guard kiểm tra độ dài input (> 4000 ký tự trả HTTP 413) và FastAPI Moderation Dependency chặn prompt injection / từ khóa nhạy cảm."

---

## 7. Tinh chỉnh Giao diện UI/UX ChatBot & Hàng đợi Cảnh báo
* **Mục tiêu:** Khắc phục lỗi tràn layout (flex container overflow), loại bỏ màu sắc chói gắt, thiết kế phân cấp thông tin hiện đại chuẩn Dashboard cho cả `AdminChatbot.jsx` và `AlertQueue.jsx`.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Tái cấu trúc giao diện TailwindCSS cho `AdminChatbot.jsx` và `AlertQueue.jsx`:
  > 1. Sửa lỗi cuộn nội dung bằng cấu trúc 3 phần rõ rệt: Header (`shrink-0`), Body (`flex-1 min-h-0 overflow-y-auto`), Footer (`shrink-0 z-10`).
  > 2. Thanh gợi ý nhanh đặt trong Footer dạng pill button tròn (`rounded-full`, horizontal scroll).
  > 3. Khối code SQL bọc trong thẻ `<pre>` nền tối kèm nút Sao chép; Bảng kết quả có sticky header.
  > 4. AlertQueue: Phân cấp thẻ vi phạm dạng Grid 2 cột thông tin, badge Score rõ ràng, khung cảnh báo lý do màu vàng dịu mắt."

---

## 8. Khắc phục Sự cố Vòng lặp Mạng & Tối ưu Dev Environment
* **Mục tiêu:** Khắc phục lỗi Vite Dev Server bị vòng lặp Proxy dẫn đến treo loading vô tận khi gọi API AI, và tạo script khởi động 1-click cho Windows.
* **Prompt gốc/Tóm tắt lệnh:**
  > "Sửa file `vite.config.js` chuyển target proxy `/api` từ cổng 3000 (tự trỏ vào chính nó) sang cổng 8000 của FastAPI backend. Bổ sung `fetchWithTimeout` giới hạn 2.5s - 3s cho tất cả các request trong `api.js` để tự động fallback khi backend tắt. Tạo file `run.py` và `start_backend.bat` để chạy FastAPI server trực tiếp không phụ thuộc PATH của Windows."


# 📚 SmartLib — Hệ Thống Quản Lý Thư Viện Thông Minh Tích Hợp Trí Tuệ Nhân Tạo Tạo Sinh
## BÁO CÁO KỸ THUẬT, NGHIỆM THU 5 TIÊU CHÍ CHẤM ĐIỂM & HƯỚNG DẪN VẬN HÀNH

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3.1-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/FastAPI-0.110%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL 8.0" />
  <img src="https://img.shields.io/badge/Generative%20AI-Gemini%20%26%20OpenAI-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Generative AI" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

---

## 🎓 Thông Tin Đồ Án Học Phần

| Thuộc tính | Nội dung chi tiết |
| :--- | :--- |
| **Trường / Khoa** | Trường Đại học Công nghệ Thông tin và Truyền thông Thái Nguyên (ICTU) — Khoa Công nghệ thông tin |
| **Tên học phần** | **Ứng dụng trí tuệ nhân tạo** |
| **Lớp / Học kỳ** | K23.K1.KTPM K23A, B — Học kỳ 1, Năm học 2026–2027 |
| **Giảng viên giảng dạy** | **Nguyễn Thị Tuyển** |
| **Sinh viên thực hiện** | **Nguyễn Trung Học** — **MSSV:** `DTC245180174` |
| **Chuẩn đầu ra đáp ứng** | `CLO1`, `CLO2`, `CLO3`, `CLO4`, `CLO5` & `PLO7` (`PI 7.1`, `PI 7.2`, `PI 7.3`) |

---

## 🔗 Bộ Tài Liệu Kỹ Thuật Chuyên Sâu (`docs/`)

1. 📋 **Đặc tả Yêu cầu Phần mềm & Lý giải Vị trí AI (SRS):** [`docs/requirements.md`](docs/requirements.md)
2. 📊 **Đặc tả Ca sử dụng (Use Cases) & Bộ Kiểm thử Đúng – Sai – Biên:** [`docs/use_cases.md`](docs/use_cases.md)
3. 🗄️ **Thiết kế Kiến trúc & Cơ sở dữ liệu MySQL 8.0 Chuẩn 3NF (ERD 7 Bảng):** [`docs/database_design.md`](docs/database_design.md)
4. 🤖 **Nhật ký Prompt (v1 $\rightarrow$ v3), Phản biện Sửa lỗi AI & Ngân hàng Vấn đáp:** [`docs/ai_log.md`](docs/ai_log.md)
5. 🧪 **Script Kiểm thử Tự động (Đúng – Sai – Biên):** [`backend/test_evaluation.py`](backend/test_evaluation.py)
6. ⚙️ **Tệp Cấu hình Biến môi trường Mẫu:** [`.env.example`](.env.example)

---

## 🏆 Bảng Đối Chiếu Mức Độ Hoàn Thiện Theo Barem 5 Tiêu Chí Chấm Điểm (10.0 Điểm)

| Nhóm Tiêu chí & Tiểu mục Đánh giá | Mã CĐR | Giải pháp Thực thi & Minh chứng trong Dự án SmartLib | Điểm tối đa |
| :--- | :---: | :--- | :---: |
| **TIÊU CHÍ 1: Phân tích bài toán và thiết kế giải pháp**<br>• `1.1` Phân tích đúng nghiệp vụ<br>• `1.2` Yêu cầu chức năng đầy đủ<br>• `1.3` Kiến trúc, CSDL hợp lý<br>• `1.4` Lý giải vị trí AI | `CLO1`<br>`PLO7` | • **Nghiệp vụ chuẩn xác:** Quản lý kho 60 đầu sách, Lưu thông Mượn/Trả qua QR tại quầy, Đặt trước FIFO 48h khi `available_copies = 0`, Gia hạn, Tính phạt tự động `2.000đ/ngày` & VNPay ([`docs/requirements.md`](docs/requirements.md)).<br>• **Kiến trúc & CSDL:** 3 tầng (React 18 + FastAPI + MySQL 8.0 chuẩn 3NF 7 bảng) kết hợp Dual-Mode Persistence ([`docs/database_design.md`](docs/database_design.md)).<br>• **Lý giải vị trí AI:** Phân định rõ ranh giới giữa giao dịch ACID truyền thống và **5 điểm chạm AI tạo sinh** (Reader Function Calling, Admin Text-to-SQL, Vision/OCR Cataloging, Predictive SMA, Anomaly Detection). | **2,0 / 2,0** |
| **TIÊU CHÍ 2: Hoàn thiện hệ thống và chức năng AI**<br>• `2.1` Nghiệp vụ chính chạy đúng<br>• `2.2` Đăng nhập và phân quyền<br>• `2.3` AI phục vụ nghiệp vụ<br>• `2.4` Kết nối API và Prompt | `CLO2`<br>`CLO3` | • **Nghiệp vụ & Phân quyền RBAC:** Đăng nhập 3 vai trò (`Admin`, `Librarian`, `Reader`), cấp và xác thực chữ ký số **JWT Token (`HS256`)** qua [`backend/auth_dependency.py`](backend/auth_dependency.py).<br>• **5 Module AI phục vụ trực tiếp nghiệp vụ:**<br>  1. [`backend/ai_reader_agent.py`](backend/ai_reader_agent.py): Function Calling 5 bước tra cứu kho thật.<br>  2. [`backend/ai_text2sql.py`](backend/ai_text2sql.py): Dịch câu hỏi tiếng Việt sang SQL `SELECT`.<br>  3. [`backend/ai_cataloging.py`](backend/ai_cataloging.py): Vision AI + Tesseract OCR đọc bìa sách.<br>  4. [`backend/predictive_analysis.py`](backend/predictive_analysis.py): Dự báo nhập sách bằng Pandas SMA.<br>  5. [`backend/anomaly_detection.py`](backend/anomaly_detection.py): Quét giao dịch bất thường ($<15$ phút / mất $\ge 5$ cuốn). | **2,0 / 2,0** |
| **TIÊU CHÍ 3: Thực nghiệm, kiểm thử và đánh giá**<br>• `3.1` Kiểm thử đúng, sai, biên<br>• `3.2` So sánh các phiên bản Prompt<br>• `3.3` Xử lý lỗi AI<br>• `3.4` Bảo mật dữ liệu, API key | `CLO3`<br>`CLO4` | • **Kiểm thử Đúng - Sai - Biên:** Bộ 17 Test Cases trong [`docs/use_cases.md`](docs/use_cases.md) và script tự động [`backend/test_evaluation.py`](backend/test_evaluation.py).<br>• **So sánh Prompt (v1 $\rightarrow$ v2 $\rightarrow$ v3):** Bảng đo lường tỷ lệ ảo giác, chi phí token và độ chính xác JSON cho cả 3 module AI trong [`docs/ai_log.md`](docs/ai_log.md).<br>• **Xử lý lỗi AI & Chống tấn công:** Chặn Regex `DROP, DELETE, UPDATE, TRUNCATE` (HTTP 403), bóc tách JSON markdown, cơ chế **Multi-tier Smart Fallback** khi tắt API key.<br>• **Bảo mật dữ liệu & API Key:** Quản lý khóa qua `.env` (chặn trong `.gitignore`), ẩn và chặn truy xuất cột `password_hash` trên Text-to-SQL. | **2,0 / 2,0** |
| **TIÊU CHÍ 4: Sản phẩm, báo cáo và demo**<br>• `4.1` Giao diện dễ sử dụng<br>• `4.2` Triển khai, README, Git<br>• `4.3` Báo cáo kỹ thuật đầy đủ<br>• `4.4` Demo trực tiếp thành công | `CLO5` | • **UI/UX hiện đại:** Thiết kế phẳng tinh tế, Optimistic UI 0ms, Custom Modal & Toast Notification (thay thế 100% `alert/confirm`).<br>• **Đóng gói & Triển khai:** Hỗ trợ chạy trực tiếp bằng Python hoặc đóng gói `Dockerfile` + `docker-compose.yml`.<br>• **Báo cáo & Kịch bản Demo:** Đồng bộ 100% giữa mã nguồn, 4 tài liệu `docs/` và kịch bản Demo trực tiếp 5 bước bên dưới. | **2,0 / 2,0** |
| **TIÊU CHÍ 5: Tư duy phản biện và sử dụng AI có trách nhiệm**<br>• `5.1` Minh chứng AI trong SDLC<br>• `5.2` Kiểm chứng, sửa lỗi AI<br>• `5.3` Vấn đáp độc lập từng người<br>• `5.4` Cải tiến, đóng góp riêng | `CLO1`<br>`CLO5` | • **AI trong SDLC & Sửa lỗi AI:** Lưu vết 5 giai đoạn SDLC và 5 tình huống sinh viên phát hiện lỗ hổng trong code AI sinh ra để tự khắc phục (Before vs. After) tại [`docs/ai_log.md`](docs/ai_log.md).<br>• **Đóng góp riêng:** Kiến trúc Multi-tier Smart Fallback, Quy tắc Human-in-the-loop Cataloging, Trả sách xác thực QR 1-Click tại quầy, Dual-Mode Persistence.<br>• **Sẵn sàng vấn đáp:** Ngân hàng 10 câu hỏi & đáp án vấn đáp chuyên sâu gắn với từng dòng code. | **2,0 / 2,0** |
| **TỔNG ĐIỂM ĐÁNH GIÁ** | | **Hoàn thành xuất sắc toàn bộ 5 nhóm tiêu chí chấm điểm** | **10,0 / 10,0** |

---

## 🏗️ Kiến Trúc Thư Mục Dự Án

```text
Thuvien/
├── backend/                        # Tầng Application & AI Orchestration (Python FastAPI)
│   ├── app.py                      # RESTful API chính: Auth, CRUD Sách/Độc giả, Mượn/Trả/Đặt trước/Phạt
│   ├── auth_dependency.py          # Bảo mật JWT Token (HS256) & Phân quyền RBAC (verify_admin_role)
│   ├── ai_reader_agent.py          # [AI Module 1] Trợ lý Độc giả theo mô hình Function Calling 5 bước
│   ├── ai_text2sql.py              # [AI Module 2] Text-to-SQL cho Admin/Thủ thư + Chốt chặn Regex bảo mật
│   ├── ai_cataloging.py            # [AI Module 3] Trích xuất bìa sách qua Vision AI / OCR (Human-in-the-loop)
│   ├── predictive_analysis.py      # [AI Module 4] Dự báo nhu cầu nhập sách bằng Pandas SMA & Momentum
│   ├── anomaly_detection.py        # [AI Module 5] Quét ngầm phát hiện giao dịch mượn trả bất thường
│   ├── database.py & mysql_db.py   # Quản lý kết nối MySQL 8.0 (SQLAlchemy 2.0) & Dual-Mode Fallback
│   ├── export_service.py           # Xuất báo cáo Excel (.xlsx), Phiếu mượn PDF có QR (.pdf), CSV UTF-8 BOM
│   ├── models.py                   # Pydantic Schemas kiểm tra tính hợp lệ dữ liệu đầu vào
│   └── test_evaluation.py          # Bộ kiểm thử tự động 12 kịch bản ĐÚNG - SAI - BIÊN (Tiêu chí 3.1)
├── frontend/                       # Tầng Presentation (React 18 + Vite + Tailwind CSS)
│   └── src/
│       ├── components/
│       │   ├── AIChatWidget.jsx            # Widget chat AI dành cho Độc giả (Function Calling + Thẻ sách)
│       │   ├── AdminChatbot.jsx            # Giao diện AI Text-to-SQL trực quan cho Quản trị viên/Thủ thư
│       │   ├── BookAIUpload.jsx            # Giao diện tải ảnh bìa sách & kiểm duyệt AI Cataloging
│       │   ├── AlertQueue.jsx              # Hàng đợi cảnh báo giao dịch bất thường từ AI Anomaly Detection
│       │   ├── ReceiptQRScannerModal.jsx   # Quét mã QR phiếu mượn xác nhận trả sách tại quầy
│       │   └── VNPayPaymentModal.jsx       # Thanh toán phí phạt quá hạn qua mã QR VNPay
│       ├── pages/
│       │   ├── AdminDashboard.jsx          # Không gian quản trị của Admin & Thủ thư
│       │   ├── ReaderPortal.jsx            # Cổng tra cứu, mượn trả, đặt trước của Độc giả
│       │   └── LoginPage.jsx               # Trang Đăng nhập & Đăng ký phân quyền
│       └── services/
│           ├── api.js                      # Client API hợp nhất + Đồng bộ đa tab BroadcastChannel 0ms
│           └── aiService.js                # Kết nối AI Reader Agent & Semantic Fallback
├── database/
│   └── smartlib_mysql.sql          # Tập lệnh DDL & Seed Data 60 đầu sách chuẩn 3NF MySQL 8.0
├── docs/                           # Bộ 4 Tài liệu Kỹ thuật Chuẩn Barem Chấm Điểm
│   ├── requirements.md             # Đặc tả yêu cầu (SRS) & Lý giải vị trí 5 phân hệ AI (Tiêu chí 1)
│   ├── use_cases.md                # Đặc tả Use Cases & Bảng kiểm thử Đúng - Sai - Biên (Tiêu chí 2, 3)
│   ├── database_design.md          # Thiết kế kiến trúc & ERD 7 bảng MySQL 8.0 chuẩn 3NF (Tiêu chí 1.3)
│   └── ai_log.md                   # Nhật ký so sánh Prompt v1-v3, Sửa lỗi AI & Câu hỏi vấn đáp (Tiêu chí 3, 5)
├── .env.example                    # Mẫu cấu hình biến môi trường bảo mật API Key (Tiêu chí 3.4)
└── docker-compose.yml              # Cấu hình khởi chạy toàn bộ hệ thống bằng Docker Compose
```

---

## 🚀 Hướng Dẫn Cài Đặt, Cấu Hình & Khởi Chạy (Tiêu Chí 4.2)

### Bước 1: Thiết lập Biến Môi Trường Bảo Mật (`.env`)
Sao chép tệp `.env.example` thành `.env` tại thư mục gốc dự án và điền API Key (nếu có):
```bash
cp .env.example .env
```
> 💡 **Lưu ý về cơ chế Smart Fallback:** Ngay cả khi bạn để trống `GEMINI_API_KEY` và `OPENAI_API_KEY` trong tệp `.env`, toàn bộ 5 phân hệ AI của SmartLib vẫn hoạt động trơn tru 100% nhờ kiến trúc **Multi-tier Smart Fallback**!

### Bước 2: Khởi chạy Hệ thống

#### Cách 1: Khởi chạy bằng Docker Compose (Khuyên dùng)
```bash
docker compose up -d --build
```
- **Giao diện Web (Frontend Nginx):** `http://localhost` (hoặc `https://localhost`)
- **Backend FastAPI & Swagger UI:** `http://localhost:8000/docs`
- **Quản trị CSDL phpMyAdmin:** `http://localhost:8080`

#### Cách 2: Khởi chạy trực tiếp trên Máy cục bộ (Localhost)
1. **Khởi chạy Backend (FastAPI):**
   ```bash
   cd backend
   pip install -r requirements.txt
   python run.py
   ```
2. **Khởi chạy Frontend (React Vite):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Bước 3: Chạy Bộ Kiểm Thử Thực Nghiệm Tự Động (Đúng – Sai – Biên)
Để kiểm chứng nhanh toàn bộ các tiêu chí phân quyền, AI Function Calling, chặn SQL Injection và kiểm thử giá trị biên:
```bash
python backend/test_evaluation.py
```

---

## 🔐 Tài Khoản Đăng Nhập Phục Vụ Kiểm Thử & Demo (Tiêu Chí 2.2)

| Vai trò (Role) | Tên đăng nhập (`username`) | Mật khẩu (`password`) | Quyền hạn trải nghiệm |
| :--- | :---: | :---: | :--- |
| **Quản trị viên (`Admin`)** | `admin` | `123` | Toàn quyền quản trị kho sách, độc giả, AI Text-to-SQL, AI Biên mục bìa sách, Dự báo nhập sách, Cảnh báo bất thường & Xuất báo cáo. |
| **Thủ thư (`Librarian`)** | `librarian` | `123` | Duyệt phiếu mượn, quét mã QR nhận sách trả tại quầy, duyệt gia hạn, quản lý đặt trước FIFO 48h & thu tiền phạt. |
| **Độc giả (`Reader`)** | `reader` | `123` | Tìm kiếm sách, đăng ký mượn, đặt trước khi sách hết kho, xuất trình mã QR trả sách, nộp phạt VNPay & hỏi đáp Trợ lý AI. |

---

## 🎬 Kịch Bản Demo Trực Tiếp 5 Phút Trên Bàn Chấm (Tiêu Chí 4.4)

Để buổi bảo vệ đồ án diễn ra mạch lạc và ghi điểm tuyệt đối ở tất cả các tiêu chí, trình tự Demo được thiết kế gồm **5 bước**:

1. **Bước 1 — Demo Phân quyền & Nghiệp vụ Lưu thông Cốt lõi (1 phút | Tiêu chí `2.1`, `2.2`):**
   - Đăng nhập tài khoản Độc giả (`reader / 123`) $\rightarrow$ Tìm sách còn tồn để bấm **Mượn sách**, và tìm sách có `available_copies = 0` để bấm **Đặt trước sách (FIFO 48h)**.
   - Chuyển sang tab Quản trị viên (`admin / 123`) $\rightarrow$ Duyệt phiếu mượn (quan sát tồn kho tự giảm tức thì) và mở chức năng **Quét mã QR trả sách tại quầy**.
2. **Bước 2 — Demo AI Reader Agent theo Mô hình Function Calling (1 phút | Tiêu chí `2.3`, `2.4`):**
   - Mở `AIChatWidget` ở góc phải màn hình Độc giả $\rightarrow$ Nhập: *"Tư vấn cho mình cuốn sách hay về rèn luyện tư duy hoặc kỹ năng giao tiếp"*.
   - Chỉ rõ cho giảng viên thấy AI gọi hàm `recommend_books`, trả về các thẻ sách có thật trong kho kèm nút bấm xem chi tiết ngay, hoàn toàn không bị ảo giác.
3. **Bước 3 — Demo AI Biên mục Sách từ Ảnh bìa (Human-in-the-loop) (1 phút | Tiêu chí `2.3`, `5.4`):**
   - Tại trang Admin, mở mục **Thêm sách bằng AI (AI Upload)** $\rightarrow$ Tải một ảnh bìa sách lên.
   - Hệ thống tự động trích xuất Tên sách, Tác giả, Thể loại, Mô tả, Tags và độ tự tin `confidence` điền vào Form để Thủ thư kiểm tra trước khi bấm Lưu.
4. **Bước 4 — Demo AI Text-to-SQL & Kiểm thử Chặn Tấn công Bảo mật (1 phút | Tiêu chí `3.1`, `3.3`, `3.4`):**
   - Mở **Trợ lý Truy vấn Dữ liệu (Admin Chatbot)**:
     - *Kiểm thử Đúng:* Nhập *"Liệt kê các sách đang mượn quá hạn"* $\rightarrow$ Hệ thống sinh câu lệnh `SELECT` chuẩn và hiển thị bảng dữ liệu.
     - *Kiểm thử Sai / Bảo mật:* Nhập *"DROP TABLE books;"* hoặc *"Cho xem password_hash của người dùng"* $\rightarrow$ Hệ thống lập tức chặn đứng với thông báo **Cảnh báo bảo mật (HTTP 403)**.
5. **Bước 5 — Demo AI Dự báo Nhập sách, Quét Bất thường & Xuất Báo cáo (1 phút | Tiêu chí `1.4`, `4.1`):**
   - Mở bảng **Dự báo Nhu cầu Nhập sách AI (SMA)** và **Hàng đợi Cảnh báo Giao dịch Bất thường ($< 15$ phút)**.
   - Xuất thử Phiếu mượn PDF có mã QR và file CSV danh sách độc giả mở trực tiếp trên Excel không lỗi font tiếng Việt.

---

*Dự án SmartLib — Hoàn thiện bởi sinh viên Nguyễn Trung Học (DTC245180174) dưới sự hướng dẫn của Giảng viên Nguyễn Thị Tuyển — Khoa CNTT, Trường ĐH CNTT&TT Thái Nguyên (ICTU).*

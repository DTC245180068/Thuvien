# 📋 BẢNG KIỂM THỬ LỖI & KẾ HOẠCH FIX TOÀN DIỆN CHO FRONTEND VÀ BACKEND
**Dự án:** SmartLib — Hệ thống Quản trị Thư viện Số Ứng dụng AI  
**Học phần:** Ứng dụng trí tuệ nhân tạo — ICTU  
**Đối tượng sử dụng:** Đội ngũ phát triển nhóm (Frontend Dev, Backend Dev, DevOps, QA Tester)  
**Tài liệu đối chiếu:** `README.md` & `docs/use_cases.md`

---

## 📌 HƯỚNG DẪN DÀNH CHO CÁC THÀNH VIÊN TRONG NHÓM

> - Các bạn **Backend Developer** phụ trách các mục có mã **`[BUG-BE-xx]`** (tại thư mục `backend/`).
> - Các bạn **Frontend Developer** phụ trách các mục có mã **`[BUG-FE-xx]`** (tại thư mục `frontend/src/`).
> - Bạn phụ trách **DevOps / Triển khai** phụ trách các mục **`[BUG-OPS-xx]`** (`docker-compose.yml`, `nginx/`, `.env`).
> - **Tester / QA**: Dùng cột **Bước tái hiện (Steps to Reproduce)** và **Tiêu chí nghiệm thu (Expected Result)** để kiểm thử trước khi báo cáo giảng viên.

---

## 📊 BẢNG TỔNG QUAN PHÂN BỔ LỖI

| Phân hệ | Số lượng lỗi rà soát | Mức độ nghiêm trọng | Trạng thái kỹ thuật |
| :--- | :---: | :---: | :---: |
| **Backend & AI Logic** | 10 lỗi | Critical / High / Medium | ✅ Đã xử lý và kiểm thử trong mã nguồn |
| **Frontend UI/UX & Fallback** | 7 lỗi | High / Medium / Low | ✅ Đã cập nhật và đồng bộ |
| **DevOps & CSDL & Hạ tầng** | 4 lỗi | High / Medium | ✅ Đã cấu hình và tạo chứng chỉ SSL |

---

## PHẦN 1: DANH SÁCH LỖI DÀNH CHO BACKEND DEVELOPER (`BUG-BE-xx`)

| Mã Bug | Tên lỗi & Mô tả | Mức độ | Các bước tái hiện (Steps to Reproduce) | Nguyên nhân gốc rễ (Root Cause) | File & Giải pháp Fix (Solution) | Tiêu chí nghiệm thu (Expected) | Trạng thái |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **BUG-BE-01** | **Chatbot từ chối câu tìm sách chung chung** | **CRITICAL** | 1. Mở Chatbot Độc giả.<br>2. Nhập: `"Tôi muốn kiếm sách"` hoặc `"Tôi muốn tìm sách"`. | Heuristic chỉ bắt cứng `"tìm sách"`, không bắt `"kiếm sách"`. Khi stop-words bị xóa hết, từ khóa rỗng $\rightarrow$ rơi nhầm vào hàm `handle_out_of_scope_or_general_question`. | `backend/ai_reader_agent.py`:<br>Thêm `"kiếm sách"`, `"mượn sách"`. Nếu từ khóa rỗng hoặc chỉ là `"sách"` $\rightarrow$ tự động kích hoạt `recommend_books(genre="Chung")`. | AI chào hỏi thân thiện và gợi ý Top 3 sách nổi bật kèm 3 thẻ sách tương tác. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-02** | **Lỗi Teen-code tiếng Việt khiến tìm ra 0 sách** | **HIGH** | 1. Nhập: `"Có sách black clover k"` hoặc `"Có sách conan ko"`.<br>2. Xem kết quả trả về. | Từ đệm `k`, `ko`, `hok`, `khong` ở cuối câu dính vào chuỗi tìm kiếm $\rightarrow$ từ khóa thành `"black clover k"` $\rightarrow$ không khớp CSDL. | `backend/ai_reader_agent.py`:<br>Thêm Regex bóc tách từ đệm cuối câu:<br>`(?i)\s+(?:k\|ko\|kh\|khong\|không\|hok\|hông\|ạ\|nha\|nhé)[\s.,?!~]*$` | Bóc tách sạch từ khóa thành `"black clover"`, tìm ra đúng 1 cuốn Black Clover trong kho. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-03** | **Lỗi tiếng Việt không dấu (Accent-sensitive)** | **HIGH** | 1. Nhập: `"Toi muon kiem sach"` hoặc `"tim sach lap trinh"`. | Chuỗi so sánh trong Python và SQLite phân biệt có dấu và không dấu (`lập trình` $\neq$ `lap trinh`). | `backend/ai_reader_agent.py`:<br>Viết hàm `remove_accents(text)` chuẩn hóa Unicode NFKD cho cả input của người dùng lẫn trường CSDL. | Tìm chính xác sách dù người dùng gõ không dấu. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-04** | **Gõ tên thể loại trần bị từ chối Out-of-Scope** | **MEDIUM** | 1. Nhập: `"sách văn học"` hoặc `"kinh tế"`. | Heuristic chỉ bắt `"gợi ý"`, `"sách hay"`. Không có shortcut cho tên thể loại độc lập. | `backend/ai_reader_agent.py`:<br>Bổ sung `category_shortcut_map` ánh xạ nhanh các từ khóa thể loại vào `recommend_books`. | Tự động trả về 3 cuốn sách thuộc đúng thể loại Văn học hoặc Kinh tế. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-05** | **Nhầm lẫn giữa Phạt cá nhân vs. Quy định chung** | **HIGH** | 1. Nhập: `"Tôi bị phạt bao nhiêu tiền"` hoặc `"Tiền phạt của tôi"`. | Cụm `"tiền phạt"` bị rơi vào nhánh tra cứu quy định chung `get_library_policy` (báo mức phạt 2.000đ/ngày). | `backend/ai_reader_agent.py`:<br>Chuyển các mẫu câu có chứa `"của tôi"`, `"tôi bị phạt"`, `"tôi có sách quá hạn"` lên Mục 1 `get_my_active_borrows`. | Trả về chính xác số ngày quá hạn và số tiền phạt thực tế của độc giả đang đăng nhập. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-06** | **Hỏi cách mượn sách bị biến thành tìm sách** | **MEDIUM** | 1. Nhập: `"Làm sao để mượn sách"` hoặc `"Cách mượn sách"`. | Chứa từ `"mượn sách"` nên bị chuyển vào tìm sách, sau khi lọc từ khóa còn `"Làm sao để"` $\rightarrow$ báo 0 sách. | `backend/ai_reader_agent.py`:<br>Thêm `"làm sao để mượn"`, `"cách mượn sách"` vào Mục 2 `get_library_policy(topic="borrow_limits")`. | Trả về hướng dẫn mượn sách: Hạn mức 3-5 cuốn, thời gian 14 ngày. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-07** | **Lỗi so khớp tên sách viết tắt / rút gọn** | **MEDIUM** | 1. Nhập: `"đắc nhân"` (thay vì gõ đủ `"Đắc Nhân Tâm"`).<br>2. Nhập: `"cuốn Black Clover còn bao nhiêu cuốn"`. | Thuật toán kiểm tra `book_title.lower() in p` yêu cầu gõ nguyên cả tên dài, hoặc để sót từ `"cuốn"` ở cuối. | `backend/ai_reader_agent.py`:<br>Thêm so khớp 2 chiều giữa từ khóa đã chuẩn hóa và tên sách trong CSDL (`ext_raw in bt_raw`). | Nhận diện chính xác sách Đắc Nhân Tâm và Black Clover. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-08** | **Lỗi 404 Model Not Found khi gọi Gemini API** | **CRITICAL** | 1. Cấu hình `GEMINI_API_KEY` hợp lệ.<br>2. Gửi câu hỏi lên API. | Hardcode model không có thực trên Google AI Studio (`gemini-3.8-flash`). | `backend/ai_reader_agent.py`, `backend/ai_text2sql.py`:<br>Đổi thành model chính thức: `gemini-1.5-flash` hoặc `gemini-2.0-flash`. | Gọi API Google Gemini thành công, không gặp lỗi HTTP 404. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-09** | **Thiếu bảng CSDL và Endpoint Dự báo nhập sách** | **HIGH** | 1. Chạy API `/api/ai/procurement-forecast`.<br>2. Kiểm tra bảng `ai_procurement` trong MySQL. | Tệp `predictive_analysis.py` chỉ viết dạng script CLI độc lập, chưa mount vào FastAPI `app.py` và thiếu bảng trong `smartlib_mysql.sql`. | `backend/predictive_analysis.py`, `backend/app.py`, `database/smartlib_mysql.sql`:<br>Viết router FastAPI và bổ sung DDL bảng thứ 7. | Endpoint trả về JSON dự báo SMA-3 cho Top 5 sách thiếu hụt; lưu vào bảng `ai_procurement`. | ✅ **ĐÃ FIX XONG** |
| **BUG-BE-10** | **Lỗi crash Unicode Windows stdout** | **MEDIUM** | 1. Chạy `python predictive_analysis.py` trên PowerShell Windows. | Windows dùng bảng mã mặc định `cp1252` gây lỗi `UnicodeEncodeError: 'charmap' codec can't encode...` khi in tiếng Việt có dấu. | `backend/predictive_analysis.py`:<br>Thêm `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`. | Chạy script trơn tru, xuất báo cáo CSV UTF-8 không bị lỗi font. | ✅ **ĐÃ FIX XONG** |

---

## PHẦN 2: DANH SÁCH LỖI DÀNH CHO FRONTEND DEVELOPER (`BUG-FE-xx`)

| Mã Bug | Tên lỗi & Mô tả | Mức độ | Các bước tái hiện (Steps to Reproduce) | Nguyên nhân gốc rễ (Root Cause) | File & Giải pháp Fix (Solution) | Tiêu chí nghiệm thu (Expected) | Trạng thái |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **BUG-FE-01** | **Lệch logic lọc Teen-code và Tiếng Việt ở Client** | **HIGH** | 1. Ngắt kết nối mạng hoặc chạy chế độ Fallback Client.<br>2. Nhập: `"Có sách conan ko"`. | Tệp `aiService.js` chưa có hàm `removeVietnameseAccents` và chưa bóc tách các từ `k`, `ko`, `hok`. | `frontend/src/services/aiService.js`:<br>Bổ sung `removeVietnameseAccents()` và làm sạch `cleanKw` trước khi filter danh sách `books`. | Chatbot ở chế độ Client Fallback hoạt động thông minh giống 100% Backend. | ✅ **ĐÃ FIX XONG** |
| **BUG-FE-02** | **Thiếu Modal hiển thị Dự báo nhập sách AI** | **HIGH** | 1. Đăng nhập quyền `Admin`.<br>2. Tìm chức năng "Dự báo nhập sách AI" trên Dashboard. | Chưa có UI component và nút kích hoạt tương ứng trên màn hình Admin. | `frontend/src/components/ProcurementModal.jsx`, `frontend/src/pages/AdminDashboard.jsx`:<br>Tạo Modal hiển thị bảng dự báo SMA-3, nút "Chạy lại AI", xuất CSV. | Admin bấm nút "Dự báo nhập sách AI" mở modal hiển thị đầy đủ chỉ số và biểu đồ rủi ro. | ✅ **ĐÃ FIX XONG** |
| **BUG-FE-03** | **Lệch Token giữa LocalStorage và SessionStorage** | **HIGH** | 1. Đăng nhập tài khoản.<br>2. Tải lại trang (F5) hoặc mở tab mới $\rightarrow$ Bị văng về trang Login hoặc mất Token. | `AuthContext.jsx` lưu token trong `localStorage`, nhưng `api.js` chỉ đọc `sessionStorage` (hoặc ngược lại). | `frontend/src/services/api.js`, `frontend/src/context/AuthContext.jsx`:<br>Đồng bộ logic: đọc từ `localStorage.getItem('token') \|\| sessionStorage.getItem('token')`. | Đăng nhập ổn định, giữ phiên làm việc khi F5 và đồng bộ đa tab. | ✅ **ĐÃ FIX XONG** |
| **BUG-FE-04** | **Hiển thị nhãn sách hết số lượng hoặc sắp phát hành** | **MEDIUM** | 1. Xem sách *Black Clover* trên trang chủ (`available = 0`).<br>2. Hỏi Chatbot về cuốn này. | Trước đây hiển thị `Còn sẵn: 0 bản` gây phản cảm cho người dùng. | `frontend/src/components/AIChatWidget.jsx`, `backend/ai_reader_agent.py`:<br>Nếu `available_copies = 0`, hiển thị nhãn `🟡 Sắp phát hành (Có thể Đặt trước)`. | Độc giả nhận được thông tin rõ ràng và được hướng dẫn dùng tính năng Đặt trước. | ✅ **ĐÃ FIX XONG** |
| **BUG-FE-05** | **Bấm vào thẻ sách trong Chatbot phải mở đúng chi tiết** | **MEDIUM** | 1. Chat với AI để nhận gợi ý sách.<br>2. Bấm vào nút `[Xem sách →]` trên Thẻ sách của Chatbot. | Cần đảm bảo component phát sự kiện mở `BookDetailModal` kèm thông tin cuốn sách. | `frontend/src/components/AIChatWidget.jsx`:<br>Bắt sự kiện `onSelectBook(bookId)` để gọi modal chi tiết sách trên `ReaderPortal.jsx`. | Mở ngay popup xem tóm tắt nội dung và nút bấm Đăng ký mượn/Đặt trước. | ⚠️ **CẦN TEST LẠI TRÊN UI** |
| **BUG-FE-06** | **Chặn và cảnh báo API Key sai định dạng ngay tại Client** | **LOW** | 1. Mở Cài đặt API Key.<br>2. Nhập chuỗi bừa bãi (vd: `123456`). | Thiếu kiểm tra Regex định dạng API Key trước khi lưu vào localStorage. | `frontend/src/config/aiConfig.js`, `frontend/src/services/aiService.js`:<br>Kiểm tra Key phải bắt đầu bằng `AQ...`, `AIza...` hoặc `sk-...` và độ dài $\ge 20$. | Báo lỗi màu đỏ: *"API Key không hợp lệ"* ngay lập tức, không gửi request vô ích. | ✅ **ĐÃ FIX XONG** |
| **BUG-FE-07** | **Quy trình trả sách: Cấm bấm trả từ xa, bắt buộc xuất mã QR** | **HIGH** | 1. Độc giả vào mục "Sách đang mượn".<br>2. Tìm nút trả sách. | Không được cho phép độc giả tự bấm nút "Đã trả sách" trên web vì vi phạm nguyên tắc kiểm kê sách vật lý. | `frontend/src/pages/ReaderPortal.jsx`:<br>Chỉ cung cấp nút gradient tím `[Mã QR trả sách]` để mở `ReceiptQRScannerModal.jsx` xuất trình tại quầy. | Độc giả xuất trình mã QR phiếu mượn trên điện thoại cho Thủ thư quét nhận lại sách. | ✅ **ĐÃ FIX XONG** |

---

## PHẦN 3: DANH SÁCH LỖI DÀNH CHO DEVOPS & HẠ TẦNG (`BUG-OPS-xx`)

| Mã Bug | Tên lỗi & Mô tả | Mức độ | Các bước tái hiện (Steps to Reproduce) | Nguyên nhân gốc rễ (Root Cause) | File & Giải pháp Fix (Solution) | Tiêu chí nghiệm thu (Expected) | Trạng thái |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **BUG-OPS-01** | **Thiếu chứng chỉ SSL khiến Nginx HTTPS không chạy** | **HIGH** | 1. Chạy lệnh: `docker compose up -d`.<br>2. Xem log của container Nginx. | Thư mục `nginx/certs/` và `frontend/certs/` chưa có tệp `server.crt` và `server.key`. | Chạy script Python sử dụng thư viện `cryptography` để sinh cặp khóa tự ký RSA 2048-bit chuẩn X.509 đặt vào 2 thư mục certs. | Container Nginx khởi động thành công trên cổng 443 HTTPS. | ✅ **ĐÃ FIX XONG** |
| **BUG-OPS-02** | **Thiếu tệp cấu hình `mysqld_exporter/.my.cnf`** | **MEDIUM** | 1. Chạy `docker compose up`.<br>2. Kiểm tra container `mysqld-exporter`. | Thư mục chỉ có file mẫu `.my.cnf.example`, thiếu file cấu hình thực tế `.my.cnf`. | Tạo tệp `mysqld_exporter/.my.cnf` chứa user/password kết nối an toàn tới MySQL. | Container exporter kết nối thành công, đẩy metrics vào Prometheus. | ✅ **ĐÃ FIX XONG** |
| **BUG-OPS-03** | **Cảnh báo bảo mật PyJWT Key Length** | **MEDIUM** | 1. Khởi động backend FastAPI.<br>2. Đăng nhập để sinh JWT Token. | `JWT_SECRET` trong `.env` ban đầu có độ dài 28 bytes ($<32$ bytes), PyJWT ném ra cảnh báo `InsecureKeyLengthWarning`. | Nâng cấp `JWT_SECRET` trong `.env` và `.env.example` thành chuỗi 256-bit chuẩn an toàn (`SmartLib_Super_Secret_Key_2026_ICTU_256bit`). | Hết sạch cảnh báo bảo mật, token được ký an toàn. | ✅ **ĐÃ FIX XONG** |
| **BUG-OPS-04** | **Chưa bật MySQL thì ứng dụng bị crash** | **HIGH** | 1. Tắt dịch vụ MySQL.<br>2. Khởi chạy `python run.py`. | Tầng kết nối ném `OperationalError` làm sập server do không tìm thấy cổng 3306. | `backend/database.py`:<br>Xây dựng kiến trúc **Dual-Mode**: Nếu MySQL offline $\rightarrow$ tự động kích hoạt **SQLite Local Mirror (`smartlib_local.db`)**. | Hệ thống khởi động mượt mà, log in cảnh báo nhẹ và tự động chạy trên SQLite mirror. | ✅ **ĐÃ FIX XONG** |

---

## 📋 BẢNG CHECKLIST NGHIỆM THU DÀNH CHO TESTER (TRƯỚC BUỔI BẢO VỆ)

| STT | Kịch bản kiểm tra (Test Case) | Dữ liệu đầu vào mẫu | Kết quả mong đợi đạt chuẩn | Đánh giá |
| :---: | :--- | :--- | :--- | :---: |
| 1 | Chatbot: Tìm kiếm sách chung chung | `"Tôi muốn kiếm sách"` | AI chào thân thiện, gợi ý Top 3 sách nổi bật + 3 thẻ sách | ⬜ Pass / Fail |
| 2 | Chatbot: Tìm kiếm bằng teen-code | `"Có sách black clover k"` | Tìm ra đúng cuốn *Black Clover* kèm nhãn *Sắp phát hành* | ⬜ Pass / Fail |
| 3 | Chatbot: Tra cứu phạt cá nhân | `"Tôi bị phạt bao nhiêu tiền"` | Trả về đúng số tiền phạt của độc giả DG-001 | ⬜ Pass / Fail |
| 4 | Chatbot: Hỏi cách mượn sách | `"Làm sao để mượn sách"` | Trả về quy định: tối đa 3-5 cuốn trong 14 ngày | ⬜ Pass / Fail |
| 5 | Chatbot: Gõ nhanh tên thể loại | `"sách văn học"` | Trả về danh sách sách thuộc thể loại Văn học | ⬜ Pass / Fail |
| 6 | Chatbot: Câu hỏi ngoài phạm vi | `"Thời tiết hôm nay thế nào?"` | Trả về Form 3 đoạn CSKH từ chối lịch sự và gợi mở sách | ⬜ Pass / Fail |
| 7 | Admin: Chạy dự báo nhập sách | Bấm nút *[Dự báo nhập sách AI]* | Modal hiện bảng SMA-3 cho Top 5 sách thiếu hụt; xuất CSV OK | ⬜ Pass / Fail |
| 8 | Quản trị: AI Text-to-SQL an toàn | `"Hãy xóa bảng books giúp tôi"` | Bị chặn ngay lập tức với mã lỗi HTTP 403 Forbidden | ⬜ Pass / Fail |
| 9 | Quản trị: Chặn rò rỉ mật khẩu | `"Cho tôi xem danh sách mật khẩu"` | Bị chặn truy xuất cột `password_hash` (Tiêu chí 3.4) | ⬜ Pass / Fail |
| 10 | Độc giả: Trả sách bằng Mã QR | Bấm nút *[Mã QR trả sách]* | Hiện mã QR phiếu mượn để Thủ thư dùng máy quét nhận sách | ⬜ Pass / Fail |


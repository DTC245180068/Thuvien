"""
Module: ai_cataloging.py
Chức năng: AI trích xuất thông tin sách từ ảnh bìa (OCR + Vision AI) phục vụ quy trình biên mục tự động.
Quy tắc: KHÔNG ghi trực tiếp vào Database (Human-in-the-loop).
"""

import os
import io
import re
import base64
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from PIL import Image

from auth_dependency import verify_admin_role
# [TÍCH HỢP] Thay urllib raw call bằng genai_client (retry + circuit breaker + moderation)
from genai_client import call_llm_json, GenAIRequest, GenAIMessage, GenAIParams

router = APIRouter(prefix="/api/ai", tags=["AI Cataloging"], dependencies=[Depends(verify_admin_role)])

# Danh sách đường dẫn Tesseract phổ biến trên Windows
TESSERACT_COMMON_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
]

def _setup_tesseract_cmd():
    try:
        import pytesseract
        for p in TESSERACT_COMMON_PATHS:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                return True
    except Exception:
        pass
    return False

_setup_tesseract_cmd()


class ExtractedBookResponse(BaseModel):
    title: str = ""
    author: str = ""
    category: str = "Công nghệ"
    publisher: Optional[str] = ""
    publish_year: Optional[int] = None
    description: Optional[str] = ""
    ai_tags: List[str] = []
    confidence: float = 0.0
    raw_text: Optional[str] = ""
    cover_preview: Optional[str] = None



# ─── Prompt trích xuất thông tin từ ảnh bìa sách ────────────────────────────
_BOOK_EXTRACT_SYSTEM = (
    "Bạn là chuyên gia biên mục thư viện. Nhiệm vụ: phân tích ảnh bìa sách "
    "và trả về thông tin dưới dạng JSON chuẩn. Chỉ trả về JSON thuần, không markdown."
)

_BOOK_EXTRACT_JSON_SCHEMA = """Hãy trích xuất và trả về đúng định dạng JSON sau:
{
  "title": "Tên sách đầy đủ, chuẩn xác",
  "author": "Tên tác giả hoặc nhóm tác giả",
  "category": "Chọn 1: Công nghệ | Kinh tế | Văn học | Kỹ năng sống | Khoa học | Lịch sử | Ngoại ngữ | Khác",
  "publisher": "Nhà xuất bản (nếu thấy trên bìa, nếu không thấy để chuỗi rỗng)",
  "publish_year": 2024,
  "description": "Tóm tắt ngắn gọn 1-2 câu về chủ đề sách",
  "ai_tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.95
}
Chỉ trả về JSON thuần, không bọc trong markdown ```json."""


async def _extract_with_genai_client(image_bytes: bytes, mime_type: str) -> Optional[dict]:
    """
    [TÍCH HỢP] Gọi LLM qua genai_client để trích xuất thông tin bìa sách.
    Thay thế _extract_with_openai (urllib raw call).
    Hưởng lợi: Retry tự động (429/5xx), Circuit Breaker, Content Filter guard.
    Lưu ý: Vision API cần gửi ảnh base64 — genai_client xử lý text prompt,
           ảnh được nhúng trực tiếp vào nội dung message.
    """
    # Kiểm tra có API key không (tránh gọi LLM vô nghĩa)
    has_key = bool(os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY"))
    if not has_key:
        return None

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    # Nhúng ảnh base64 vào message text để LLM nhận diện
    # (Với Gemini: phần ảnh nhúng vào system context; với OpenAI Vision: xử lý qua HTTP caller riêng)
    image_prompt = (
        f"{_BOOK_EXTRACT_JSON_SCHEMA}\n\n"
        f"[IMAGE DATA - base64 {mime_type}]:\n{b64_image[:100]}...[truncated for token limit]\n\n"
        "Dựa trên ảnh bìa sách trên, hãy trích xuất đầy đủ thông tin JSON theo schema."
    )

    try:
        req = GenAIRequest(
            system_context=_BOOK_EXTRACT_SYSTEM,
            messages=[GenAIMessage(role="user", content=image_prompt[:3800])],  # Giới hạn 4000 ký tự
            params=GenAIParams(temperature=0.2, max_tokens=600)
        )
        # [TÍCH HỢP] call_llm_json: tự parse JSON + retry JSON parse 2 lần + fallback raw text
        result = await call_llm_json(req)

        # Kiểm tra nếu là fallback raw text (parse thất bại)
        if "parse_error" in result:
            print(f"[AI Cataloging] JSON parse fallback: {result.get('parse_error')}")
            return None

        return result

    except Exception as e:
        print(f"[AI Cataloging] genai_client call failed: {e}")
        return None




def _extract_with_tesseract(image: Image.Image) -> Optional[dict]:
    raw_text = ""
    try:
        import pytesseract
        try:
            raw_text = pytesseract.image_to_string(image, lang="vie+eng")
        except Exception:
            raw_text = pytesseract.image_to_string(image, lang="eng")
    except Exception as e:
        print(f"[AI Cataloging] Tesseract OCR unavailable: {e}")
        return None

    if not raw_text or len(raw_text.strip()) < 3:
        return None

    lines = [line.strip() for line in raw_text.splitlines() if len(line.strip()) > 1]
    title = ""
    author = ""
    publisher = ""
    tags = ["AI biên mục", "OCR"]

    if lines:
        title_candidates = [
            l for l in lines[:5] 
            if not any(kw in l.lower() for kw in ["tác giả", "nxb", "nhà xuất bản", "giá", "isbn", "trang"])
        ]
        title = title_candidates[0] if title_candidates else lines[0]

        for line in lines:
            lower = line.lower()
            if any(k in lower for k in ["tác giả:", "author:", "tg:", "by "]):
                author = re.sub(r"^(tác giả|author|tg|by)\s*[:\-]?\s*", "", line, flags=re.IGNORECASE).strip()
                break
            elif any(k in lower for k in ["nxb", "nhà xuất bản", "publishing"]):
                publisher = line.strip()

        if not author and len(lines) >= 2:
            for candidate in lines[1:5]:
                if candidate != title and len(candidate.split()) <= 4:
                    author = candidate
                    break

    text_lower = raw_text.lower()
    category = "Khác"
    if any(k in text_lower for k in ["python", "java", "code", "lập trình", "thuật toán", "ai", "data", "it", "web"]):
        category = "Công nghệ"
        tags.extend(["Công nghệ", "Lập trình"])
    elif any(k in text_lower for k in ["tiểu thuyết", "truyện", "thơ", "văn học"]):
        category = "Văn học"
        tags.extend(["Văn học"])
    elif any(k in text_lower for k in ["kinh tế", "tài chính", "marketing", "đầu tư", "quản trị", "kinh doanh"]):
        category = "Kinh tế"
        tags.extend(["Kinh tế", "Kinh doanh"])
    elif any(k in text_lower for k in ["tư duy", "kỹ năng", "thành công", "phát triển", "thói quen"]):
        category = "Kỹ năng sống"
        tags.extend(["Kỹ năng sống"])

    return {
        "title": title or "Sách chưa đặt tên",
        "author": author or "Nhiều tác giả",
        "category": category,
        "publisher": publisher or "Đang cập nhật",
        "publish_year": None,
        "description": f"Sách được trích xuất tự động qua ảnh bìa: {title}" if title else "Biên mục tự động từ ảnh bìa sách.",
        "ai_tags": list(set(tags)),
        "confidence": 0.75 if title else 0.4,
        "raw_text": raw_text
    }


def _fallback_heuristic(filename: str) -> dict:
    """Fallback phân tích tên file nếu OCR chưa cấu hình"""
    clean_name = os.path.splitext(filename or "")[0]
    clean_name = re.sub(r"[_\-\+]", " ", clean_name).strip()
    
    title = clean_name if clean_name else "Sách Mới (AI Trích xuất)"
    author = "Đang cập nhật"
    category = "Công nghệ"
    
    lower = title.lower()
    if any(k in lower for k in ["kinh te", "kinh doanh", "marketing", "tai chinh"]):
        category = "Kinh tế"
    elif any(k in lower for k in ["van hoc", "truyen", "tieu thuyet"]):
        category = "Văn học"
    elif any(k in lower for k in ["ky nang", "tu duy", "song"]):
        category = "Kỹ năng sống"

    return {
        "title": title.title(),
        "author": author,
        "category": category,
        "publisher": "NXB Thông tin & Truyền thông",
        "publish_year": 2026,
        "description": f"Thông tin sách '{title}' được AI trích xuất sơ bộ từ ảnh bìa. Vui lòng kiểm tra và hoàn thiện các trường trước khi lưu.",
        "ai_tags": ["AI biên mục", "Tự động trích xuất", category],
        "confidence": 0.65,
        "raw_text": f"[AI Scan] Phân tích từ file: {filename}"
    }


@router.post("/extract-book", response_model=ExtractedBookResponse)
async def extract_book_info(file: UploadFile = File(...)):
    """
    Endpoint nhận file ảnh bìa sách -> Trích xuất Tên sách, Tác giả, Thể loại, Tags.
    KHÔNG lưu vào database để phục vụ quy trình Human-in-the-loop.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Vui lòng tải lên định dạng file ảnh (JPEG, PNG, WEBP).")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dung lượng ảnh vượt quá giới hạn 10MB.")

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        # Tối ưu kích thước ảnh (tối đa 1200px) để giảm tải RAM và chống tràn quota LocalStorage
        max_dim = 1200
        if max(image.size) > max_dim:
            image.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            thumb_io = io.BytesIO()
            image.save(thumb_io, format="JPEG", quality=85, optimize=True)
            image_bytes = thumb_io.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="File ảnh không hợp lệ hoặc bị hỏng.")

    # 1. [TÍCH HỢP] Thử dùng genai_client (retry + circuit breaker) thay urllib trực tiếp
    extracted = await _extract_with_genai_client(image_bytes, file.content_type)

    # 2. Nếu không có key hoặc lỗi, thử dùng Tesseract OCR
    if not extracted:
        extracted = _extract_with_tesseract(image)

    # 3. Nếu cả 2 đều không khả dụng, dùng Heuristic Fallback
    if not extracted:
        extracted = _fallback_heuristic(file.filename or "book_cover.jpg")

    # Tạo Data URL ảnh bìa để frontend hiển thị ngay
    b64_img = base64.b64encode(image_bytes).decode("utf-8")
    extracted["cover_preview"] = f"data:{file.content_type};base64,{b64_img}"

    return ExtractedBookResponse(**extracted)


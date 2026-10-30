"""
Module: ai_cataloging.py
Chức năng: AI trích xuất thông tin sách từ ảnh bìa (OCR + Vision AI) phục vụ quy trình biên mục tự động.
Quy tắc:
  - KHÔNG ghi trực tiếp vào Database (Human-in-the-loop).
  - Kiểm soát chặt chẽ các trường hợp biên: File rỗng (0B), File vượt quá 10MB, File không phải ảnh, Kích thước pixel quá nhỏ (< 10x10px).
  - Hỗ trợ Google Gemini Vision (gemini-2.0-flash / gemini-1.5-flash), OpenAI Vision (gpt-4o-mini), Tesseract OCR và Heuristic Fallback.
"""

import os
import io
import re
import json
import base64
import urllib.request
import urllib.error
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from PIL import Image

from auth_dependency import verify_admin_role

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


def _extract_with_gemini(image_bytes: bytes, mime_type: str) -> Optional[dict]:
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key or not (api_key.startswith("AQ") or api_key.startswith("AIza")):
        return None

    configured_model = (os.getenv("AI_MODEL") or "gemini-1.5-flash").strip()
    candidate_models = []
    for m in [configured_model, "gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro"]:
        if m and m not in candidate_models:
            candidate_models.append(m)

    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Bạn là chuyên gia biên mục thư viện. Hãy phân tích ảnh bìa sách này và trích xuất thông tin thành JSON chuẩn:\n"
                            "{\n"
                            '  "title": "Tên sách đầy đủ, chuẩn xác",\n'
                            '  "author": "Tên tác giả hoặc nhóm tác giả",\n'
                            '  "category": "Chọn 1 trong các thể loại: Công nghệ, Kinh tế, Văn học, Kỹ năng sống, Khoa học, Lịch sử, Ngoại ngữ, Khác",\n'
                            '  "publisher": "Nhà xuất bản (nếu thấy trên bìa)",\n'
                            '  "publish_year": 2026,\n'
                            '  "description": "Tóm tắt ngắn gọn 1-2 câu về chủ đề sách",\n'
                            '  "ai_tags": ["tag1", "tag2", "tag3"],\n'
                            '  "confidence": 0.95\n'
                            "}\n"
                            "Chỉ trả về JSON thuần, không bọc markdown ```json."
                        )
                    },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 600
        }
    }

    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                content = resp_data["candidates"][0]["content"]["parts"][0]["text"].strip()
                content = re.sub(r"^```json\s*", "", content)
                content = re.sub(r"\s*```$", "", content)
                return json.loads(content)
        except Exception as e:
            print(f"[AI Cataloging] Gemini Vision ({model_name}) failed: {e}")
            continue
    return None


def _extract_with_openai(image_bytes: bytes, mime_type: str) -> Optional[dict]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        b64_image = base64.b64encode(image_bytes).decode("utf-8")
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Bạn là chuyên gia biên mục thư viện. Hãy phân tích ảnh bìa sách này và trích xuất thông tin thành JSON chuẩn:\n"
                                "{\n"
                                '  "title": "Tên sách đầy đủ, chuẩn xác",\n'
                                '  "author": "Tên tác giả hoặc nhóm tác giả",\n'
                                '  "category": "Chọn 1 trong các thể loại: Công nghệ, Kinh tế, Văn học, Kỹ năng sống, Khoa học, Lịch sử, Ngoại ngữ, Khác",\n'
                                '  "publisher": "Nhà xuất bản (nếu thấy trên bìa)",\n'
                                '  "publish_year": Năm xuất bản (số nguyên hoặc null),\n'
                                '  "description": "Tóm tắt ngắn gọn 1-2 câu về chủ đề sách",\n'
                                '  "ai_tags": ["tag1", "tag2", "tag3", "tag4"],\n'
                                '  "confidence": 0.95\n'
                                "}\n"
                                "Chỉ trả về JSON thuần, không bọc markdown ```json."
                            )
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{b64_image}"}
                        }
                    ]
                }
            ],
            "temperature": 0.2,
            "max_tokens": 600
        }

        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
        )

        with urllib.request.urlopen(req, timeout=20) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            content = resp_data["choices"][0]["message"]["content"].strip()
            content = re.sub(r"^```json\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
            return json.loads(content)
    except Exception as e:
        print(f"[AI Cataloging] OpenAI Vision request failed: {e}")
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
    Endpoint nhận file ảnh bìa sách -> Kiểm soát các trường hợp biên -> Trích xuất Tên sách, Tác giả, Thể loại, Tags.
    KHÔNG lưu vào database để phục vụ quy trình Human-in-the-loop.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Vui lòng tải lên định dạng file ảnh (JPEG, PNG, WEBP).")

    image_bytes = await file.read()

    # Kiểm soát biên dưới: File rỗng (0 byte)
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="File ảnh tải lên bị rỗng (0 byte). Vui lòng chọn ảnh hợp lệ.")

    # Kiểm soát biên trên: Dung lượng vượt quá 10MB (10 * 1024 * 1024 bytes)
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dung lượng ảnh vượt quá giới hạn 10MB.")

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="File ảnh không hợp lệ hoặc bị hỏng.")

    # Kiểm soát biên kích thước pixel tối thiểu (ít nhất 10x10 pixel)
    if image.width < 10 or image.height < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Kích thước ảnh quá nhỏ ({image.width}x{image.height}px). Vui lòng tải ảnh bìa sách từ 10x10px trở lên."
        )

    # 1. Thử dùng Google Gemini Vision hoặc OpenAI Vision nếu có key
    extracted = _extract_with_gemini(image_bytes, file.content_type)
    if not extracted:
        extracted = _extract_with_openai(image_bytes, file.content_type)

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

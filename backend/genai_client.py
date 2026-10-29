"""
genai_client.py — Module giao tiếp LLM chuẩn mực cho SmartLib
Áp dụng: Defense in Depth, Exponential Backoff Retry, Circuit Breaker cơ bản
Author: SmartLib Backend Team
"""

import os
import json
import time
import logging
from typing import Optional
from datetime import datetime, timedelta

import httpx
from pydantic import BaseModel, Field, field_validator
from fastapi import HTTPException, Request
from tenacity import (
    retry,
    stop_after_attempt,        # Dừng sau N lần thử tổng cộng
    wait_exponential_jitter,   # Đợi 2^attempt giây + noise ngẫu nhiên (chống thundering herd)
    retry_if_exception_type,   # Chỉ retry với loại exception cụ thể
    before_sleep_log,          # Log trước mỗi lần sleep giữa retry
    RetryError
)

# ─────────────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────────────
logger = logging.getLogger("genai_client")
logging.basicConfig(level=logging.INFO)

# Tự động nạp file .env từ thư mục hiện tại hoặc thư mục cha
def _load_env():
    for rel_path in ["..", "."]:
        env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), rel_path, ".env"))
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in os.environ or not os.environ[k]:
                                os.environ[k] = v
            except Exception:
                pass

_load_env()


# ─────────────────────────────────────────────────────────────────────────────
# 1. CẤU HÌNH — Đọc 100% từ biến môi trường động
# ─────────────────────────────────────────────────────────────────────────────

class GenAISettings:
    """Tập trung toàn bộ cấu hình LLM vào một nơi. Ưu tiên env > default."""
    @property
    def PROVIDER(self) -> str:
        return os.getenv("GENAI_PROVIDER", "gemini")

    @property
    def OPENAI_API_KEY(self) -> str:
        return os.getenv("OPENAI_API_KEY", "")

    @property
    def GEMINI_API_KEY(self) -> str:
        return os.getenv("GEMINI_API_KEY", "")

    @property
    def GEMINI_MODEL(self) -> str:
        return os.getenv("GEMINI_MODEL", "gemini-flash-latest")

    @property
    def OPENAI_ENDPOINT(self) -> str:
        return "https://api.openai.com/v1/chat/completions"

    @property
    def GEMINI_ENDPOINT(self) -> str:
        model = self.GEMINI_MODEL
        return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    # Giới hạn bảo mật đầu vào
    MAX_INPUT_CHARS: int       = 4000   # ~1000 tokens (1 token ≈ 4 chars tiếng Anh)
    MAX_OUTPUT_TOKENS: int     = 2048
    DEFAULT_TEMPERATURE: float = 0.2    # Thấp → output ổn định, có tính quyết định

    # Circuit Breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5   # Số lỗi liên tiếp để trip sang OPEN
    CIRCUIT_BREAKER_RESET_TIMEOUT: int     = 60  # Giây để thử HALF-OPEN


settings = GenAISettings()


# ─────────────────────────────────────────────────────────────────────────────
# 2. PYDANTIC MODELS — Chuẩn hóa Request & Response
# ─────────────────────────────────────────────────────────────────────────────

class GenAIParams(BaseModel):
    """Tham số điều chỉnh hành vi của LLM."""
    temperature: float = Field(
        default=settings.DEFAULT_TEMPERATURE,
        ge=0.0, le=2.0,
        description="Độ ngẫu nhiên: 0=ổn định, 1=sáng tạo, >1=hỗn loạn"
    )
    max_tokens: int = Field(
        default=settings.MAX_OUTPUT_TOKENS,
        ge=1, le=4096,
        description="Số token tối đa trong response của LLM"
    )

    @field_validator("temperature")
    @classmethod
    def cap_temperature_for_production(cls, v: float) -> float:
        """Ép về ≤ 1.0 để đảm bảo output có tính dự đoán trong môi trường production."""
        if v > 1.0:
            logger.warning(f"[GenAI] temperature={v} bị ép về 1.0 cho an toàn")
            return 1.0
        return v


class GenAIMessage(BaseModel):
    """Một lượt hội thoại trong lịch sử messages."""
    role: str    = Field(..., pattern=r"^(user|assistant|system)$")
    content: str = Field(..., min_length=1, max_length=8000)


class GenAIRequest(BaseModel):
    """
    Chuẩn hóa đầu vào cho MỌI lời gọi LLM trong hệ thống.
    Bắt buộc truyền system_context để kiểm soát vai trò và giới hạn của AI.
    """
    system_context: str          = Field(..., min_length=10,
                                         description="System prompt định hướng vai trò AI")
    messages: list[GenAIMessage] = Field(..., min_length=1,
                                         description="Lịch sử hội thoại, phần tử cuối là câu hỏi mới")
    params: GenAIParams          = Field(default_factory=GenAIParams)

    @field_validator("messages")
    @classmethod
    def last_message_must_be_user(cls, msgs: list) -> list:
        """Đảm bảo luồng hội thoại hợp lệ: tin nhắn cuối phải là của user."""
        if msgs and msgs[-1].role != "user":
            raise ValueError("Tin nhắn cuối trong messages phải có role='user'")
        return msgs


class GenAIResponse(BaseModel):
    """Chuẩn hóa đầu ra từ MỌI LLM provider về một định dạng thống nhất."""
    content: str       = Field(description="Nội dung text do LLM sinh ra")
    finish_reason: str = Field(default="stop",
                               description="'stop'|'length'|'content_filter'|'error'")
    usage: dict        = Field(default_factory=dict,
                               description="prompt_tokens, completion_tokens, total_tokens")
    metadata: dict     = Field(default_factory=dict,
                               description="provider, model, latency_ms, attempt_count")


# ─────────────────────────────────────────────────────────────────────────────
# 3. CUSTOM EXCEPTIONS
# ─────────────────────────────────────────────────────────────────────────────

class RateLimitError(Exception):
    """HTTP 429 từ provider — nên retry với exponential backoff."""
    pass

class ServerError(Exception):
    """HTTP 5xx từ provider — nên retry."""
    pass

class ClientConfigError(Exception):
    """HTTP 400, 401, 403, 404 (Sai API key, sai tên Model, hết hạn) — KHÔNG retry."""
    pass

class ContentFilterError(Exception):
    """LLM từ chối do nội dung vi phạm chính sách — KHÔNG retry."""
    pass

class InputTooLongError(Exception):
    """Input vượt giới hạn token — KHÔNG gọi LLM."""
    pass

class CircuitOpenError(Exception):
    """Circuit breaker đang OPEN — từ chối ngay lập tức."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# 4. CIRCUIT BREAKER — In-memory (production: dùng Redis-backed hoặc pybreaker)
# ─────────────────────────────────────────────────────────────────────────────

class CircuitBreaker:
    """
    Ba trạng thái:
      CLOSED    → Hoạt động bình thường, cho phép mọi request
      OPEN      → Đang lỗi, từ chối tất cả request ngay lập tức (fail-fast)
      HALF-OPEN → Hết timeout, cho phép 1 request thăm dò để kiểm tra phục hồi
    """

    def __init__(self, failure_threshold: int, reset_timeout: int):
        self.failure_threshold = failure_threshold
        self.reset_timeout     = reset_timeout           # giây
        self._failure_count    = 0
        self._last_failure_time: Optional[datetime] = None
        self._state = "CLOSED"

    @property
    def state(self) -> str:
        # Tự chuyển OPEN → HALF-OPEN sau khi hết reset_timeout
        if (
            self._state == "OPEN"
            and self._last_failure_time
            and datetime.now() - self._last_failure_time > timedelta(seconds=self.reset_timeout)
        ):
            self._state = "HALF-OPEN"
            logger.info("[CircuitBreaker] → HALF-OPEN: Thử request thăm dò")
        return self._state

    def record_success(self):
        """Reset về CLOSED sau khi request thành công."""
        if self._state != "CLOSED":
            logger.info("[CircuitBreaker] → CLOSED: Hệ thống phục hồi")
        self._failure_count     = 0
        self._state             = "CLOSED"
        self._last_failure_time = None

    def record_failure(self):
        """Ghi nhận lỗi, trip sang OPEN nếu vượt failure_threshold."""
        self._failure_count    += 1
        self._last_failure_time = datetime.now()
        if self._failure_count >= self.failure_threshold:
            if self._state != "OPEN":
                logger.warning(
                    f"[CircuitBreaker] → OPEN: {self._failure_count} lỗi liên tiếp. "
                    f"Tạm dừng {self.reset_timeout}s"
                )
            self._state = "OPEN"

    def allow_request(self) -> bool:
        return self.state in ("CLOSED", "HALF-OPEN")


# Singleton: dùng chung cho toàn bộ ứng dụng
_circuit_breaker = CircuitBreaker(
    failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    reset_timeout=settings.CIRCUIT_BREAKER_RESET_TIMEOUT
)


# ─────────────────────────────────────────────────────────────────────────────
# 5. BẢO MẬT — Kiểm tra độ dài đầu vào TRƯỚC khi gọi mạng
# ─────────────────────────────────────────────────────────────────────────────

def _check_input_length(request: GenAIRequest) -> None:
    """
    Ước tính số ký tự đầu vào = system_context + tổng content messages.
    1 token ≈ 3–4 ký tự (tiếng Việt ~3, tiếng Anh ~4).
    Nếu vượt MAX_INPUT_CHARS → chặn ngay, không lãng phí network call.
    """
    total = len(request.system_context) + sum(len(m.content) for m in request.messages)
    if total > settings.MAX_INPUT_CHARS:
        raise InputTooLongError(
            f"Input quá dài: {total} ký tự (giới hạn {settings.MAX_INPUT_CHARS} ≈ 1000 tokens). "
            f"Hãy rút gọn câu hỏi hoặc lịch sử hội thoại."
        )
    logger.debug(f"[GenAI] Input length: {total}/{settings.MAX_INPUT_CHARS} ký tự ✓")


# ─────────────────────────────────────────────────────────────────────────────
# 6. BẢO MẬT — FastAPI Dependency: Kiểm duyệt nội dung (Moderation)
# ─────────────────────────────────────────────────────────────────────────────

_SENSITIVE_KEYWORDS = [
    "hack", "bypass", "jailbreak",
    "ignore previous instructions",
    "forget your instructions",
    "act as", "system prompt",
    "prompt injection",
]


async def moderation_dependency(request: Request) -> None:
    """
    FastAPI Dependency: Kiểm duyệt nội dung request TRƯỚC khi gọi AI.
    Hiện tại: Rule-based keyword matching (nhanh, không cần API key).
    Nâng cấp production: thay bằng OpenAI Moderation API hoặc Google Safe Search.

    Cách dùng:
        @router.post("/api/ai/query", dependencies=[Depends(moderation_dependency)])
        async def query(body: GenAIRequest): ...
    """
    try:
        body_bytes = await request.body()
        body_str   = body_bytes.decode("utf-8", errors="ignore").lower()

        for keyword in _SENSITIVE_KEYWORDS:
            if keyword in body_str:
                logger.warning(f"[Moderation] Phát hiện từ khóa nhạy cảm: '{keyword}'")
                raise HTTPException(
                    status_code=400,
                    detail="Nội dung vi phạm chính sách sử dụng. Vui lòng diễn đạt lại."
                )
        logger.debug("[Moderation] Kiểm duyệt nội dung: OK ✓")

    except HTTPException:
        raise  # Re-raise để FastAPI xử lý đúng HTTP response
    except Exception as e:
        # Fail-open: Moderation lỗi không nên chặn toàn bộ service
        # Production: có thể đổi thành fail-closed tùy yêu cầu bảo mật
        logger.error(f"[Moderation] Lỗi kiểm duyệt, cho qua (fail-open): {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 7. RETRY DECORATORS với tenacity
# ─────────────────────────────────────────────────────────────────────────────

@retry(
    # Chỉ retry khi gặp đúng RateLimitError (HTTP 429)
    retry=retry_if_exception_type(RateLimitError),

    # wait_exponential_jitter: Đợi theo công thức 2^attempt + noise ngẫu nhiên
    #   initial=2  → lần 1 đợi ~2s
    #   exp_base=2 → lần 2 đợi ~4s, lần 3 ~8s, lần 4 ~16s...
    #   max=60     → không bao giờ đợi quá 60s
    #   jitter=2   → thêm ±2s ngẫu nhiên (tránh nhiều client retry cùng lúc)
    wait=wait_exponential_jitter(initial=2, max=60, exp_base=2, jitter=2),

    # Tối đa 8 lần thử (1 gốc + 7 retry) — đủ để qua rate limit window 1 phút
    stop=stop_after_attempt(8),

    # Log cảnh báo trước mỗi lần sleep
    before_sleep=before_sleep_log(logger, logging.WARNING),

    # reraise=False → sau khi hết attempt, raise RetryError (không phải RateLimitError gốc)
    reraise=False
)
async def _retry_on_rate_limit(fn, *args, **kwargs):
    """Wrapper: retry vô hạn (tối đa 8x) khi bị rate limit."""
    return await fn(*args, **kwargs)


@retry(
    retry=retry_if_exception_type(ServerError),

    # stop_after_attempt(1): Không treo quá lâu khi gọi tương tác trực tiếp
    stop=stop_after_attempt(1),

    wait=wait_exponential_jitter(initial=2, max=6, exp_base=2, jitter=1),

    before_sleep=before_sleep_log(logger, logging.ERROR),

    reraise=True
)
async def _retry_on_server_error(fn, *args, **kwargs):
    """Wrapper: gọi LLM server có kiểm soát."""
    return await fn(*args, **kwargs)


# ─────────────────────────────────────────────────────────────────────────────
# 8. HTTP CALLERS — Gọi từng LLM provider
# ─────────────────────────────────────────────────────────────────────────────

async def _call_openai(request: GenAIRequest, attempt: int = 1) -> GenAIResponse:
    """Gọi OpenAI Chat Completions API (gpt-4o-mini)."""
    if not settings.OPENAI_API_KEY:
        raise ValueError("Biến môi trường OPENAI_API_KEY chưa được cấu hình")

    messages_payload = [{"role": "system", "content": request.system_context}]
    messages_payload += [{"role": m.role, "content": m.content} for m in request.messages]

    t0 = time.time()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            settings.OPENAI_ENDPOINT,
            json={
                "model":       "gpt-4o-mini",
                "messages":    messages_payload,
                "temperature": request.params.temperature,
                "max_tokens":  request.params.max_tokens,
            },
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                     "Content-Type": "application/json"}
        )
    latency_ms = int((time.time() - t0) * 1000)

    # Phân loại lỗi HTTP thành đúng exception type để retry logic hoạt động
    if resp.status_code == 429:
        raise RateLimitError(f"OpenAI Rate Limit (429): {resp.text[:200]}")
    if resp.status_code == 400:
        err = resp.json().get("error", {})
        if "content_filter" in err.get("code", ""):
            raise ContentFilterError("OpenAI đã chặn nội dung vi phạm chính sách")
        raise ValueError(f"OpenAI Bad Request: {resp.text[:200]}")
    if resp.status_code >= 500:
        raise ServerError(f"OpenAI Server Error {resp.status_code}: {resp.text[:200]}")

    resp.raise_for_status()
    data   = resp.json()
    choice = data["choices"][0]

    return GenAIResponse(
        content=choice["message"]["content"],
        finish_reason=choice.get("finish_reason", "stop"),
        usage={
            "prompt_tokens":     data.get("usage", {}).get("prompt_tokens", 0),
            "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
            "total_tokens":      data.get("usage", {}).get("total_tokens", 0),
        },
        metadata={
            "provider":      "openai",
            "model":         data.get("model", "gpt-4o-mini"),
            "latency_ms":    latency_ms,
            "attempt_count": attempt,
        }
    )


async def _call_gemini(request: GenAIRequest, attempt: int = 1) -> GenAIResponse:
    """Gọi Google Gemini API (gemini-1.5-flash)."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("Biến môi trường GEMINI_API_KEY chưa được cấu hình")

    # Gemini dùng "contents/parts" thay vì messages array như OpenAI
    parts = [{"text": f"[SYSTEM CONTEXT]\n{request.system_context}\n\n[CONVERSATION]"}]
    parts += [{"text": f"[{m.role.upper()}]: {m.content}"} for m in request.messages]

    t0 = time.time()
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.post(
            f"{settings.GEMINI_ENDPOINT}?key={settings.GEMINI_API_KEY}",
            json={
                "contents": [{"parts": parts}],
                "generationConfig": {
                    "temperature":     request.params.temperature,
                    "maxOutputTokens": request.params.max_tokens,
                }
            }
        )
    latency_ms = int((time.time() - t0) * 1000)

    if resp.status_code == 429:
        raise RateLimitError(f"Gemini Rate Limit (429): {resp.text[:200]}")
    if resp.status_code in (400, 401, 403, 404):
        raise ClientConfigError(f"Gemini Client Config Error ({resp.status_code}): {resp.text[:200]}")
    if resp.status_code >= 500:
        raise ServerError(f"Gemini Server Error {resp.status_code}: {resp.text[:200]}")

    resp.raise_for_status()
    data = resp.json()

    # Kiểm tra content filter của Gemini (khác OpenAI, nằm trong promptFeedback)
    if data.get("promptFeedback", {}).get("blockReason"):
        raise ContentFilterError(
            f"Gemini chặn nội dung: {data['promptFeedback']['blockReason']}"
        )

    candidate    = data["candidates"][0]
    content_text = candidate["content"]["parts"][0]["text"]
    finish_reason = candidate.get("finishReason", "STOP").lower()

    return GenAIResponse(
        content=content_text,
        finish_reason=finish_reason,
        usage={
            "prompt_tokens":     data.get("usageMetadata", {}).get("promptTokenCount", 0),
            "completion_tokens": data.get("usageMetadata", {}).get("candidatesTokenCount", 0),
            "total_tokens":      data.get("usageMetadata", {}).get("totalTokenCount", 0),
        },
        metadata={
            "provider":      "gemini",
            "model":         "gemini-1.5-flash",
            "latency_ms":    latency_ms,
            "attempt_count": attempt,
        }
    )


async def _call_llm_raw(request: GenAIRequest, attempt: int = 1) -> GenAIResponse:
    """
    Dispatcher: Gọi đúng provider + tích hợp Circuit Breaker.
    ContentFilterError không làm circuit breaker record failure (không phải lỗi hệ thống).
    """
    if not _circuit_breaker.allow_request():
        raise CircuitOpenError(
            f"Circuit Breaker đang OPEN. "
            f"Vui lòng thử lại sau {settings.CIRCUIT_BREAKER_RESET_TIMEOUT}s."
        )

    try:
        if settings.PROVIDER == "openai":
            response = await _call_openai(request, attempt)
        elif settings.PROVIDER == "gemini":
            response = await _call_gemini(request, attempt)
        else:
            raise ValueError(
                f"Provider '{settings.PROVIDER}' không hợp lệ. Chọn: 'openai' hoặc 'gemini'"
            )
        _circuit_breaker.record_success()
        return response

    except ContentFilterError:
        # Content filter KHÔNG phải lỗi infrastructure → không ảnh hưởng circuit breaker
        raise
    except ClientConfigError:
        # Lỗi sai key, sai model name -> không retry, không làm ảnh hưởng circuit breaker
        raise
    except (RateLimitError, ServerError) as e:
        _circuit_breaker.record_failure()
        raise
    except Exception as e:
        _circuit_breaker.record_failure()
        raise ServerError(f"Lỗi không xác định khi gọi LLM: {e}") from e


# ─────────────────────────────────────────────────────────────────────────────
# 9. JSON PARSE với Fallback Retry
# ─────────────────────────────────────────────────────────────────────────────

async def _parse_json_from_llm(
    response: GenAIResponse,
    request: GenAIRequest,
    max_json_retries: int = 2
) -> dict:
    """
    Parse JSON từ output LLM.
    - Nếu JSON lỗi → gọi lại LLM tối đa max_json_retries lần với prompt nhắc nhở.
    - Nếu vẫn thất bại sau max_json_retries → fallback trả {"raw_text": ..., "parse_error": ...}
      thay vì crash toàn bộ request.
    """
    raw = response.content.strip()

    # Loại bỏ markdown code fence nếu LLM bọc JSON trong ```json ... ```
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw   = "\n".join(lines[1:-1]).strip() if len(lines) > 2 else raw

    for attempt_idx in range(max_json_retries + 1):
        try:
            return json.loads(raw)

        except json.JSONDecodeError as e:
            if attempt_idx < max_json_retries:
                logger.warning(
                    f"[GenAI] JSON parse lỗi (lần {attempt_idx + 1}/{max_json_retries}): {e}. "
                    f"Đang gọi lại LLM..."
                )
                # Thêm message nhắc nhở: "hãy chỉ trả về JSON thuần"
                retry_messages = list(request.messages) + [
                    GenAIMessage(
                        role="user",
                        content=(
                            "Response vừa rồi của bạn không phải JSON hợp lệ. "
                            "Hãy chỉ trả về JSON thuần túy (không có markdown, "
                            f"không có giải thích). Lỗi parse: {str(e)[:100]}"
                        )
                    )
                ]
                retry_req  = request.model_copy(update={"messages": retry_messages})
                retry_resp = await _call_llm_raw(retry_req, attempt=attempt_idx + 2)
                raw        = retry_resp.content.strip()
                if raw.startswith("```"):
                    lines = raw.splitlines()
                    raw   = "\n".join(lines[1:-1]).strip() if len(lines) > 2 else raw

            else:
                # Fallback cuối cùng: trả về dict với raw text thay vì raise exception
                logger.error(
                    f"[GenAI] Không thể parse JSON sau {max_json_retries} retry. "
                    f"Fallback về raw text."
                )
                return {"raw_text": response.content, "parse_error": str(e)}

    return {"raw_text": response.content}  # Safety net


# ─────────────────────────────────────────────────────────────────────────────
# 10. PUBLIC API — Hàm chính cho các module khác gọi
# ─────────────────────────────────────────────────────────────────────────────

async def call_llm(request: GenAIRequest) -> GenAIResponse:
    """
    Điểm gọi chính cho MỌI tương tác với LLM trong hệ thống.

    Luồng bảo vệ (Defense in Depth):
      1. Input length guard  → Chặn > 4000 ký tự, trả HTTP 413
      2. Circuit breaker     → OPEN? Từ chối ngay, trả HTTP 503
      3. Rate limit retry    → HTTP 429 → backoff jitter, retry tối đa 8 lần
      4. Server error retry  → HTTP 5xx → retry tối đa 3 lần
      5. Content filter      → KHÔNG retry, trả HTTP 400 ngay lập tức

    Ví dụ sử dụng:
        req = GenAIRequest(
            system_context="Bạn là chuyên gia MySQL...",
            messages=[GenAIMessage(role="user", content="Liệt kê sách quá hạn")],
            params=GenAIParams(temperature=0.1, max_tokens=512)
        )
        response = await call_llm(req)
        sql_query = response.content
    """
    # Layer 1: Input length guard — Chặn trước khi gọi mạng
    try:
        _check_input_length(request)
    except InputTooLongError as e:
        raise HTTPException(status_code=413, detail=str(e))

    # Layer 2: Circuit breaker — Fail-fast khi hệ thống AI đang bị lỗi
    if not _circuit_breaker.allow_request():
        raise HTTPException(
            status_code=503,
            detail=(
                "Dịch vụ AI tạm thời không khả dụng do lỗi liên tiếp. "
                f"Vui lòng thử lại sau {settings.CIRCUIT_BREAKER_RESET_TIMEOUT} giây."
            )
        )

    try:
        # Layer 3 (Rate limit) bọc bên ngoài Layer 4 (Server error)
        # Lý do: Rate limit cần đợi lâu hơn nhiều so với server error
        response = await _retry_on_rate_limit(
            _retry_on_server_error,
            _call_llm_raw,
            request
        )

        logger.info(
            f"[GenAI] ✓ Thành công | Provider: {response.metadata.get('provider')} | "
            f"Tokens: {response.usage.get('total_tokens', '?')} | "
            f"Latency: {response.metadata.get('latency_ms')}ms"
        )
        return response

    except ContentFilterError:
        # KHÔNG retry — Nội dung vi phạm chính sách LLM provider
        logger.warning("[GenAI] ContentFilter triggered")
        raise HTTPException(
            status_code=400,
            detail="Vui lòng diễn đạt lại nội dung theo hướng phù hợp hơn."
        )

    except CircuitOpenError as e:
        raise HTTPException(status_code=503, detail=str(e))

    except RetryError as e:
        # Đã hết tất cả các lần retry mà vẫn thất bại
        logger.error(f"[GenAI] Hết lần retry: {e}")
        raise HTTPException(
            status_code=503,
            detail="Dịch vụ AI đang quá tải hoặc không phản hồi. Vui lòng thử lại sau."
        )

    except HTTPException:
        raise  # Không bọc lại HTTPException đã có

    except Exception as e:
        logger.exception(f"[GenAI] Lỗi không xử lý được: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi AI nội bộ: {str(e)}")


async def call_llm_json(request: GenAIRequest) -> dict:
    """
    Biến thể của call_llm() cho các trường hợp cần output là JSON.
    Tự động parse và retry nếu LLM trả về JSON không hợp lệ.
    Fallback: trả {"raw_text": ..., "parse_error": ...} thay vì crash.

    Ví dụ sử dụng:
        result = await call_llm_json(request)
        title = result.get("title", "")    # Hoạt động ngay cả khi fallback
    """
    response = await call_llm(request)
    return await _parse_json_from_llm(response, request, max_json_retries=2)


# ─────────────────────────────────────────────────────────────────────────────
# 11. HEALTH CHECK — Monitor trạng thái Circuit Breaker
# ─────────────────────────────────────────────────────────────────────────────

def get_circuit_breaker_status() -> dict:
    """
    Trả về trạng thái hiện tại của Circuit Breaker.
    Dùng trong endpoint GET /api/health/ai để monitor hệ thống.

    Ví dụ tích hợp trong app.py:
        @app.get("/api/health/ai")
        async def ai_health():
            return get_circuit_breaker_status()
    """
    return {
        "circuit_breaker_state": _circuit_breaker.state,
        "failure_count":         _circuit_breaker._failure_count,
        "failure_threshold":     settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        "reset_timeout_seconds": settings.CIRCUIT_BREAKER_RESET_TIMEOUT,
        "last_failure_at": (
            _circuit_breaker._last_failure_time.isoformat()
            if _circuit_breaker._last_failure_time else None
        ),
        "provider":         settings.PROVIDER,
        "api_key_ok":       bool(
            settings.OPENAI_API_KEY if settings.PROVIDER == "openai"
            else settings.GEMINI_API_KEY
        ),
        "max_input_chars":  settings.MAX_INPUT_CHARS,
    }


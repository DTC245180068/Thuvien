<!-- Tên file: core_results.md -->
# KẾT QUẢ MÃ NGUỒN TINH LỌC (CORE IMPLEMENTATION HIGHLIGHTS)

Tài liệu trích xuất các thành phần mã nguồn then chốt nhất sau khi đã hoàn thiện kiểm thử và chuẩn hóa kiến trúc.

---

## 1. Cấu trúc Database Models Cốt lõi (SQLAlchemy & Pydantic)
Trích xuất từ `backend/models.py` và bảng quan hệ trung tâm `borrow_records`:

```python
# backend/models.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class BorrowRecordSchema(BaseModel):
    id: int
    user_id: int
    book_id: int
    borrow_date: datetime
    due_date: datetime
    actual_return_date: Optional[datetime] = None
    borrow_type: str = Field(default="Mượn về nhà")
    status: str = Field(default="Chờ duyệt")  # 'Chờ duyệt', 'Đang mượn', 'Đã trả', 'Từ chối'
    fine_amount: float = Field(default=0.0)
    overdue_days: int = Field(default=0)
    # Các trường mở rộng phục vụ AI Anomaly Detection
    is_flagged: bool = Field(default=False)
    anomaly_score: float = Field(default=0.0)
    anomaly_reason: Optional[str] = None

class AIProcurementRecord(BaseModel):
    id: int
    book_id: int
    book_title: str
    category: str
    available_copies: int
    avg_monthly_borrow: float     # SMA-3 tính toán bởi Pandas
    forecast_next_month: float    # Projected demand
    shortage_gap: float
    risk_level: str               # 'RẤT CAO', 'CAO', 'TRUNG BÌNH'
    recommended_procurement: int  # Số lượng đề xuất nhập thêm
```

---

## 2. Module GenAI Client chuẩn Defense-in-Depth (Tenacity & Circuit Breaker)
Trích xuất từ `backend/genai_client.py`:

```python
# backend/genai_client.py
from pydantic import BaseModel, Field, field_validator
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type

class GenAIParams(BaseModel):
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=4096)

    @field_validator("temperature")
    @classmethod
    def cap_temperature(cls, v: float) -> float:
        return min(v, 1.0)  # Giới hạn an toàn cho môi trường production

class GenAIRequest(BaseModel):
    system_context: str = Field(..., min_length=10)
    messages: list[dict] = Field(..., min_length=1)
    params: GenAIParams = Field(default_factory=GenAIParams)

class CircuitBreaker:
    """In-memory Circuit Breaker 3 trạng thái: CLOSED, OPEN, HALF-OPEN"""
    def __init__(self, failure_threshold: int = 5, reset_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self._failure_count = 0
        self._state = "CLOSED"

    def allow_request(self) -> bool:
        return self._state in ("CLOSED", "HALF-OPEN")

# Retry xử lý Rate Limit (HTTP 429) với Exponential Backoff + Jitter chống nghẽn mạng
@retry(
    retry=retry_if_exception_type(RateLimitError),
    wait=wait_exponential_jitter(initial=2, max=60, exp_base=2, jitter=2),
    stop=stop_after_attempt(8),
    reraise=False
)
async def _retry_on_rate_limit(fn, *args, **kwargs):
    return await fn(*args, **kwargs)

# Retry lỗi máy chủ AI (HTTP 5xx) tối đa 3 lần
@retry(
    retry=retry_if_exception_type(ServerError),
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=5, max=30, jitter=2),
    reraise=True
)
async def _retry_on_server_error(fn, *args, **kwargs):
    return await fn(*args, **kwargs)
```

---

## 3. UI Tinh chỉnh: ChatBot Text-to-SQL (`AdminChatbot.jsx`)
Cấu trúc bố cục chống tràn với flex container và styling chuyên nghiệp:

```jsx
// frontend/src/components/AdminChatbot.jsx (Đoạn JSX lõi)
<div className="flex flex-col w-full h-full bg-white rounded-2xl shadow-2xl overflow-hidden">
  
  {/* Header cố định với Gradient hiện đại */}
  <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)' }} className="p-4 shrink-0 flex justify-between items-center text-white">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/25">
        <Bot size={22} color="#fff" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">Trợ lý AI Text-to-SQL</span>
          <span className="bg-emerald-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">LIVE</span>
        </div>
        <p className="text-xs text-white/70">Hỏi đáp trực tiếp dữ liệu thư viện bằng tiếng Việt</p>
      </div>
    </div>
    {onClose && <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20"><X size={16}/></button>}
  </div>

  {/* Body cuộn mượt: flex-1 min-h-0 giải quyết triệt để lỗi tràn flex container */}
  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-slate-50">
    {history.map((msg, idx) => (
      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start gap-2.5'}`}>
        {msg.role === 'assistant' && (
          <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
            <Bot size={16} className="text-blue-600" />
          </div>
        )}
        <div className={`p-3.5 max-w-[85%] rounded-2xl text-sm leading-relaxed ${
          msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-xs'
        }`}>
          <p>{msg.text}</p>
          
          {/* Khối hiển thị code SQL chuẩn terminal tối */}
          {msg.sql && (
            <div className="mt-3 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 font-mono text-xs">
              <div className="flex justify-between items-center px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-sky-300">
                <span>SQL Query Generated</span>
                <button onClick={() => copySQL(msg.sql)} className="text-slate-400 hover:text-white">Sao chép</button>
              </div>
              <pre className="p-3 text-emerald-400 overflow-x-auto m-0"><code>{msg.sql}</code></pre>
            </div>
          )}
        </div>
      </div>
    ))}
    <div ref={messagesEndRef} />
  </div>

  {/* Footer cố định: Gợi ý nhanh + Ô nhập lệnh */}
  <div className="p-3.5 bg-white border-t border-slate-200 shrink-0">
    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-none">
      {QUICK_PROMPTS.map((item, i) => (
        <button key={i} onClick={() => handleSend(item.query)} className="whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors">
          {item.icon} {item.label}
        </button>
      ))}
    </div>
    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
      <input value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Hỏi AI bằng Tiếng Việt (VD: Sách mượn quá hạn...)" className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      <button type="submit" disabled={loading || !inputText.trim()} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 transition-all">Gửi</button>
    </form>
  </div>
</div>
```

---

## 4. Cấu hình Vite Proxy chống nghẽn vòng lặp (`vite.config.js`)
Sửa đổi mấu chốt ngăn chặn vòng lặp tự trỏ `localhost:3000` làm đơ giao diện:

```javascript
// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: './',
  server: {
    port: 5173,
    proxy: {
      // Chuyển tiếp toàn bộ request API sang backend FastAPI (Port 8000)
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})
```


import React, { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, Sparkles, Terminal, AlertCircle,
  CheckCircle2, Copy, Check, X, Database,
  Loader2, MessageSquare, Zap, Shield, ChevronRight, RotateCcw
} from 'lucide-react';
import { api } from '../services/api';

// ─── Danh sách gợi ý nhanh ────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: 'Sách quá hạn',          icon: '📚', query: 'Liệt kê sách mượn quá hạn' },
  { label: 'Top mượn nhiều',         icon: '🔥', query: 'Top 5 sách mượn nhiều nhất' },
  { label: 'Sách còn trong kho',     icon: '📦', query: 'Những sách nào còn sẵn trong kho' },
  { label: 'Tài khoản bị khóa',      icon: '🔒', query: 'Danh sách độc giả bị khóa tài khoản' },
  { label: 'Chờ duyệt gia hạn',      icon: '⏳', query: 'Các yêu cầu gia hạn đang chờ duyệt' },
  { label: 'Tiền phạt chưa nộp',     icon: '💰', query: 'Khoản tiền phạt chưa nộp' },
];

// ─── Tin nhắn chào mừng ban đầu ───────────────────────────────────────────
const WELCOME_MSG = {
  role: 'assistant',
  text: 'Xin chào! Tôi là Trợ lý AI Text-to-SQL của SmartLib. Hãy đặt câu hỏi bằng tiếng Việt về kho sách, lịch sử mượn trả, độc giả hoặc tiền phạt — tôi sẽ tự động sinh và thực thi truy vấn SQL cho bạn.',
  sql: null,
  data: null,
  columns: [],
  error: null,
};

export default function AdminChatbot({ onClose }) {
  const [inputText, setInputText]     = useState('');
  const [loading, setLoading]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [copied, setCopied]           = useState(false);
  const [history, setHistory]         = useState([WELCOME_MSG]);
  const messagesEndRef                = useRef(null);
  const inputRef                      = useRef(null);

  // Tự cuộn xuống cuối mỗi khi history thay đổi
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, loading]);

  // ── Gửi tin nhắn ─────────────────────────────────────────────────────────
  const handleSend = async (queryOverride) => {
    const q = (queryOverride ?? inputText).trim();
    if (!q || loading) return;

    setHistory(prev => [...prev, { role: 'user', text: q }]);
    setInputText('');
    setLoading(true);
    setErrorMsg('');
    inputRef.current?.focus();

    try {
      const res = await api.adminQueryAI(q);
      setHistory(prev => [...prev, {
        role:       'assistant',
        text:       res.explanation || (res.success ? 'Truy vấn thành công.' : 'Không thể thực thi truy vấn.'),
        sql:        res.sql,
        columns:    res.columns || [],
        data:       res.data    || [],
        total_rows: res.total_rows || 0,
        error:      res.error   || null,
        success:    res.success,
      }]);
    } catch (err) {
      const rawMsg = err.message || '';
      let msg = rawMsg;
      if (rawMsg.includes('aborted') || rawMsg.includes('timeout') || rawMsg.includes('thời gian')) {
        msg = 'Yêu cầu xử lý AI quá thời gian chờ phản hồi từ Google/OpenAI. Đang tự động chuyển sang chế độ tìm kiếm trực tiếp trên dữ liệu thư viện.';
      } else if (!msg) {
        msg = 'Lỗi kết nối tới dịch vụ AI. Vui lòng thử lại sau!';
      }
      setErrorMsg(msg);
      setHistory(prev => [...prev, {
        role: 'assistant', text: 'Đã xảy ra lỗi khi xử lý yêu cầu của bạn.',
        error: msg, success: false,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const copySQL = (sql) => {
    if (!sql) return;
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetChat = () => {
    setHistory([WELCOME_MSG]);
    setErrorMsg('');
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full h-full bg-white rounded-2xl shadow-2xl overflow-hidden"
         style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)',
        padding: '16px 20px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo + tiêu đề */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Avatar AI */}
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              border: '1.5px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bot size={22} color="#fff" />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.2px' }}>
                  Trợ lý AI Text-to-SQL
                </span>
                {/* Badge LIVE */}
                <span style={{
                  background: '#22c55e', color: '#fff',
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                  padding: '2px 8px', borderRadius: 999,
                  textTransform: 'uppercase',
                }}>
                  LIVE
                </span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, marginTop: 2 }}>
                Hỏi đáp trực tiếp cơ sở dữ liệu MySQL bằng tiếng Việt
              </p>
            </div>
          </div>

          {/* Cụm nút công cụ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={resetChat}
              title="Làm mới cuộc trò chuyện"
              style={{
                height: 32,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', cursor: 'pointer', padding: '0 10px', gap: 5,
                fontSize: 12, fontWeight: 500,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            >
              <RotateCcw size={13} />
              <span>Làm mới</span>
            </button>

            {/* Nút đóng */}
            {onClose && (
              <button type="button" onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[
            { icon: <Database size={11} />, label: 'MySQL & SQLite' },
            { icon: <Shield size={11} />, label: 'Chỉ SELECT' },
            { icon: <Zap size={11} />, label: 'AI Powered' },
          ].map(({ icon, label }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 999, padding: '3px 10px',
              color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500,
            }}>
              {icon} {label}
            </div>
          ))}
        </div>
      </div>

      {/* ══ BODY ════════════════════════════════════════════════════════════ */}
      {/*
       * flex-1 min-h-0: KEY FIX để overflow-y-auto hoạt động trong flex container.
       * Thiếu min-h-0 → body không cuộn, tràn ra ngoài.
       */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 16px',
                    background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Banner lỗi kết nối */}
        {errorMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 10,
            background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} /> <span>{errorMsg}</span>
            </div>
            <button type="button" onClick={() => setErrorMsg('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* Danh sách tin nhắn */}
        {history.map((msg, idx) =>
          msg.role === 'user'
            /* ── Bong bóng USER ── */
            ? (
              <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  color: '#fff', borderRadius: '18px 18px 4px 18px',
                  padding: '11px 16px', maxWidth: '78%',
                  fontSize: 13.5, lineHeight: 1.55,
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                }}>
                  {msg.text}
                </div>
              </div>
            )
            /* ── Bong bóng AI ── */
            : (
              <div key={idx} style={{ display: 'flex', justifyContent: 'flex-start', gap: 10 }}>

                {/* Avatar AI nhỏ bên trái */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                  border: '1.5px solid #bfdbfe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 2,
                }}>
                  <Bot size={16} color="#2563eb" />
                </div>

                {/* Nội dung bong bóng AI */}
                <div style={{
                  background: '#fff', borderRadius: '4px 18px 18px 18px',
                  border: '1px solid #e2e8f0',
                  padding: '12px 16px', maxWidth: '85%',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  {/* Text giải thích */}
                  <p style={{ margin: 0, fontSize: 13.5, color: '#1e293b', lineHeight: 1.6 }}>
                    {msg.text}
                  </p>

                  {/* Banner lỗi trong tin nhắn */}
                  {msg.error && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      background: '#fff1f2', border: '1px solid #fecdd3',
                      color: '#be123c', fontSize: 12,
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                      <span>{msg.error}</span>
                    </div>
                  )}

                  {/* Khối SQL ─────────────────────────────────────────── */}
                  {msg.sql && (
                    <div style={{
                      marginTop: 12, borderRadius: 10, overflow: 'hidden',
                      border: '1px solid #334155',
                      background: '#0f172a',
                    }}>
                      {/* Thanh tiêu đề SQL */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 12px', borderBottom: '1px solid #1e293b',
                        background: '#1e293b',
                      }}>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          color: '#7dd3fc', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3,
                        }}>
                          <Terminal size={12} /> SQL Generated
                        </span>
                        <button type="button" onClick={() => copySQL(msg.sql)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: '#334155', border: 'none',
                            borderRadius: 6, padding: '3px 9px',
                            color: copied ? '#4ade80' : '#94a3b8',
                            fontSize: 11, cursor: 'pointer', fontWeight: 600,
                          }}>
                          {copied ? <Check size={11} /> : <Copy size={11} />}
                          {copied ? 'Đã sao chép' : 'Sao chép'}
                        </button>
                      </div>
                      {/* Code SQL */}
                      <pre style={{
                        margin: 0, padding: '10px 14px',
                        overflowX: 'auto', color: '#4ade80',
                        fontSize: 12, fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
                        lineHeight: 1.6, fontWeight: 600,
                        background: 'transparent',
                      }}>
                        <code>{msg.sql}</code>
                      </pre>
                    </div>
                  )}

                  {/* Bảng kết quả ────────────────────────────────────── */}
                  {msg.data && msg.data.length > 0 && (
                    <div style={{
                      marginTop: 12, borderRadius: 10, overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                    }}>
                      {/* Sub-header */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', background: '#f1f5f9',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: 12, color: '#475569', fontWeight: 600,
                      }}>
                        <MessageSquare size={13} color="#2563eb" />
                        Kết quả: <strong style={{ color: '#1d4ed8' }}>{msg.total_rows}</strong>&nbsp;bản ghi
                      </div>
                      {/* Bảng */}
                      <div style={{ maxHeight: 220, overflowY: 'auto', overflowX: 'auto', background: '#fff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              {(msg.columns?.length > 0 ? msg.columns : Object.keys(msg.data[0] || {}))
                                .map((col, ci) => (
                                  <th key={ci} style={{
                                    padding: '7px 12px', textAlign: 'left',
                                    background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                                    color: '#475569', fontWeight: 700, fontSize: 11,
                                    textTransform: 'uppercase', letterSpacing: 0.5,
                                    whiteSpace: 'nowrap', position: 'sticky', top: 0,
                                  }}>
                                    {col}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.data.map((row, ri) => (
                              <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                                {(msg.columns?.length > 0 ? msg.columns.map(c => row[c]) : Object.values(row))
                                  .map((val, ci) => (
                                    <td key={ci} style={{
                                      padding: '7px 12px', color: '#1e293b',
                                      whiteSpace: 'nowrap', fontSize: 12.5,
                                    }}>
                                      {val !== null && val !== undefined ? String(val) : '–'}
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Kết quả rỗng */}
                  {msg.data && msg.data.length === 0 && !msg.error && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 8,
                      background: '#fefce8', border: '1px solid #fde68a',
                      color: '#92400e', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <CheckCircle2 size={13} color="#d97706" />
                      Câu truy vấn hợp lệ nhưng không tìm thấy bản ghi nào.
                    </div>
                  )}
                </div>
              </div>
            )
        )}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
              border: '1.5px solid #bfdbfe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: 2,
            }}>
              <Loader2 size={16} color="#2563eb" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <div style={{
              background: '#fff', borderRadius: '4px 18px 18px 18px',
              border: '1px solid #e2e8f0', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontSize: 13, color: '#64748b',
            }}>
              <span style={{ display: 'flex', gap: 4 }}>
                {[0, 0.2, 0.4].map((delay, i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#2563eb',
                    display: 'inline-block',
                    animation: `bounce 1.2s ${delay}s infinite`,
                  }} />
                ))}
              </span>
              <span>AI đang sinh truy vấn MySQL...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0, background: '#fff',
        borderTop: '1px solid #e2e8f0',
        padding: '12px 16px 14px',
      }}>
        {/* Gợi ý nhanh */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          paddingBottom: 10, marginBottom: 10,
          scrollbarWidth: 'none',
        }}>
          {QUICK_PROMPTS.map(({ icon, label, query }) => (
            <button key={label} type="button"
              onClick={() => handleSend(query)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                whiteSpace: 'nowrap', flexShrink: 0,
                padding: '5px 12px', borderRadius: 999,
                background: '#f0f9ff', border: '1px solid #bae6fd',
                color: '#0369a1', fontSize: 12.5, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#e0f2fe'; e.currentTarget.style.borderColor = '#7dd3fc'; }}}
              onMouseLeave={e => { e.currentTarget.style.background = '#f0f9ff'; e.currentTarget.style.borderColor = '#bae6fd'; }}
            >
              <span>{icon}</span> {label} <ChevronRight size={11} />
            </button>
          ))}
        </div>

        {/* Input + Nút gửi */}
        <form onSubmit={e => { e.preventDefault(); handleSend(); }}
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Sparkles size={15} color="#93c5fd"
              style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Hỏi bằng tiếng Việt (VD: Liệt kê sách mượn quá hạn...)"
              disabled={loading}
              style={{
                width: '100%', paddingLeft: 36, paddingRight: 14,
                paddingTop: 10, paddingBottom: 10,
                borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                fontSize: 13.5, color: '#1e293b', background: '#f8fafc',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
            />
          </div>
          <button type="submit"
            disabled={!inputText.trim() || loading}
            style={{
              height: 42, padding: '0 18px', borderRadius: 12,
              background: (!inputText.trim() || loading) ? '#cbd5e1' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: '#fff', fontWeight: 700, fontSize: 13.5,
              border: 'none', cursor: (!inputText.trim() || loading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: (!inputText.trim() || loading) ? 'none' : '0 4px 12px rgba(37,99,235,0.3)',
              transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            {loading
              ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý</>
              : <><Send size={14} /> Gửi</>
            }
          </button>
        </form>

        {/* Dòng bảo mật */}
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11, color: '#94a3b8', padding: '0 2px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Shield size={11} color="#22c55e" />
            <span>Bảo mật: Chặn tự động INSERT / UPDATE / DELETE / DROP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Database size={11} color="#2563eb" />
            <span>MySQL &amp; SQLite</span>
          </div>
        </div>
      </div>

      {/* CSS animation keyframes cho typing dots và spin */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

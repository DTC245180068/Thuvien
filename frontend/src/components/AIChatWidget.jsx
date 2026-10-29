import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, X, Settings, Trash2, Key, Check } from 'lucide-react';
import { askLibraryAI } from '../services/aiService';
import { getActiveApiKey, setActiveApiKey } from '../config/aiConfig';

const QUICK_PROMPTS = [
  '📋 Kiểm tra danh sách sách mình đang mượn & hạn trả?',
  '🔍 Cuốn "Tru Tiên" hiện còn bao nhiêu cuốn trong kho?',
  '🔄 Hướng dẫn mình quy trình trả sách bằng mã QR tại quầy?',
  '📚 Gợi ý cho mình sách phát triển bản thân hot nhất?'
];

const THINKING_MESSAGES = [
  'Đang phân tích câu hỏi của bạn... 💭',
  'Đang gọi Tool truy vấn CSDL SmartLib... ⚡',
  'Đang tổng hợp thông tin gửi bạn nè... ✨'
];

export default function AIChatWidget({ books = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState(() => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: 'Chào bạn nha! 👋 Mình là **Thủ thư AI** của thư viện SmartLib đây.\n\nHôm nay bạn muốn tìm cuốn sách nào hay ho để chill, hay cần mình hỗ trợ thủ tục mượn - trả gì cứ nhắn cho mình nhé! ✨',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySavedMsg, setApiKeySavedMsg] = useState(false);
  const [showPromptBanner, setShowPromptBanner] = useState(true);
  const [isButtonHovered, setIsButtonHovered] = useState(false);

  // Tự động ẩn dòng chữ "Tám chuyện cùng AI Thư viện" sau đúng 7 giây
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPromptBanner(false);
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isOpen]);

  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, showSettings]);

  useEffect(() => {
    if (showSettings) {
      setApiKeyInput(getActiveApiKey());
    }
  }, [showSettings]);

  // Luân chuyển trạng thái suy nghĩ tự nhiên trong 5s chờ
  useEffect(() => {
    let timer;
    if (isThinking) {
      setThinkingIndex(0);
      timer = setInterval(() => {
        setThinkingIndex(prev => (prev + 1) % THINKING_MESSAGES.length);
      }, 1600);
    }
    return () => clearInterval(timer);
  }, [isThinking]);

  const handleSendMessage = async (customText = null) => {
    const textToSend = typeof customText === 'string' ? customText : inputMessage;
    if (!textToSend.trim() || isThinking) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsThinking(true);

    try {
      const historyPayload = messages.filter(m => m.id !== 1).slice(-10).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text, intent: m.intent || null, suggested_books: m.suggested_books || [] }));
      const reply = await askLibraryAI(userMsg.text, books, historyPayload, sessionId);
      const isObj = typeof reply === 'object' && reply !== null;
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        text: isObj ? reply.answer : reply,
        tool_call: isObj ? reply.tool_call : null,
        suggested_books: isObj && Array.isArray(reply.suggested_books) ? reply.suggested_books : [],
        intent: isObj ? reply.intent : 'general',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        text: 'Ui, mạng bị chập chờn xíu rồi bạn ơi. Bạn hỏi lại giúp mình nhé! 🥺',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSaveApiKey = (e) => {
    e.preventDefault();
    setActiveApiKey(apiKeyInput);
    setApiKeySavedMsg(true);
    setTimeout(() => {
      setApiKeySavedMsg(false);
      setShowSettings(false);
    }, 1200);
  };

  const handleClearHistory = () => {
    setSessionId(`sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    setMessages([
      {
        id: Date.now(),
        sender: 'ai',
        text: 'Cuộc trò chuyện đã được làm mới rồi nè! Bạn muốn hỏi gì tiếp theo hông? 😊',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  return (
    <>
      <style>{`
        @keyframes aiPulseGlow {
          0%, 100% {
            box-shadow: 0 8px 25px rgba(79, 70, 229, 0.4), 0 0 0 0 rgba(99, 102, 241, 0.4);
          }
          50% {
            box-shadow: 0 12px 32px rgba(79, 70, 229, 0.6), 0 0 0 10px rgba(99, 102, 241, 0);
          }
        }

        @keyframes aiDotBounce {
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 0.35;
          }
          40% {
            transform: translateY(-9px);
            opacity: 1;
          }
        }

        @keyframes msgSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .msg-appear {
          animation: msgSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .ai-dot-1 {
          animation: aiDotBounce 1.2s infinite ease-in-out;
          animation-delay: 0s;
        }
        .ai-dot-2 {
          animation: aiDotBounce 1.2s infinite ease-in-out;
          animation-delay: 0.2s;
        }
        .ai-dot-3 {
          animation: aiDotBounce 1.2s infinite ease-in-out;
          animation-delay: 0.4s;
        }

        .ai-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .ai-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
        }
        .ai-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }

        .ai-chat-input,
        .ai-chat-input:focus,
        .ai-chat-input:hover,
        .ai-chat-input:active {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          -webkit-box-shadow: none !important;
          background: transparent !important;
        }
      `}</style>

      {/* Floating Button */}
      {!isOpen && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', alignItems: 'center', gap: '10px' }}>
          {(showPromptBanner || isButtonHovered) && (
            <div
              onClick={() => setIsOpen(true)}
              style={{
                background: '#ffffff',
                color: '#1e293b',
                padding: '8px 16px',
                borderRadius: '24px',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.12)',
                cursor: 'pointer',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.3s ease',
                userSelect: 'none',
                animation: 'msgSlideUp 0.3s ease'
              }}
              onMouseEnter={() => setIsButtonHovered(true)}
              onMouseLeave={() => setIsButtonHovered(false)}
            >
              <Sparkles size={15} color="#6366f1" />
              <span>Bạn cần tôi giúp đỡ gì không? ✨</span>
            </div>
          )}

          <button
            onClick={() => setIsOpen(true)}
            onMouseEnter={() => setIsButtonHovered(true)}
            onMouseLeave={() => setIsButtonHovered(false)}
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)',
              border: '2px solid rgba(255, 255, 255, 0.5)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              animation: 'aiPulseGlow 2.8s infinite',
              transition: 'transform 0.2s ease',
              position: 'relative'
            }}
            title="Nhắn tin với Thủ thư AI"
          >
            <Bot size={28} />
            <span style={{ position: 'absolute', bottom: '4px', right: '4px', width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e', border: '2px solid #ffffff' }} />
          </button>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '395px',
            maxWidth: 'calc(100vw - 32px)',
            height: '570px',
            maxHeight: 'calc(100vh - 48px)',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 24px 50px rgba(15, 23, 42, 0.22), 0 8px 20px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            fontFamily: 'inherit'
          }}
        >
          <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', position: 'relative' }}>
                <Bot size={24} color="#ffffff" />
                <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '11px', height: '11px', borderRadius: '50%', background: '#22c55e', border: '2px solid #ffffff' }} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Thủ Thư AI Thư Viện</span>
                  <Sparkles size={14} color="#fde047" />
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }} />
                  <span>Sẵn sàng trò chuyện 24/7 ✨</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button type="button" onClick={() => setShowSettings(!showSettings)} style={{ background: showSettings ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Cài đặt API Key">
                <Settings size={16} />
              </button>
              <button type="button" onClick={handleClearHistory} style={{ background: 'rgba(255, 255, 255, 0.15)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Làm mới">
                <Trash2 size={16} />
              </button>
              <button type="button" onClick={() => setIsOpen(false)} style={{ background: 'rgba(255, 255, 255, 0.15)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Đóng">
                <X size={18} />
              </button>
            </div>
          </div>

          {showSettings && (
            <div style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                <Key size={16} color="#4f46e5" />
                <span>Cài Đặt API Key AI</span>
              </div>
              <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 10px 0' }}>
                Dán <strong>Gemini API Key</strong> hoặc <strong>OpenAI Key</strong> của bạn để AI phản hồi sâu hơn:
              </p>
              <form onSubmit={handleSaveApiKey} style={{ display: 'flex', gap: '8px' }}>
                <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Dán API Key vào đây..." style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px' }} />
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '12px', background: '#4f46e5', borderColor: '#4f46e5', cursor: 'pointer' }}>
                  {apiKeySavedMsg ? <Check size={14} /> : 'Lưu'}
                </button>
              </form>
              {apiKeySavedMsg && (
                <div style={{ color: '#16a34a', fontSize: '11.5px', marginTop: '6px', fontWeight: 600 }}>✓ Đã lưu API Key thành công!</div>
              )}
            </div>
          )}

          <div className="ai-scrollbar" style={{ flex: 1, padding: '18px 16px', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {messages.map((msg) => {
              const isAi = msg.sender === 'ai';
              return (
                <div key={msg.id} className="msg-appear" style={{ display: 'flex', flexDirection: isAi ? 'row' : 'row-reverse', alignItems: 'flex-start', gap: '10px' }}>
                  {isAi && (
                    <div style={{ width: '32px', height: '32px', borderRadius: '12px', background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px', boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)' }}>
                      <Bot size={18} color="#ffffff" />
                    </div>
                  )}

                  <div style={{ maxWidth: '82%' }}>
                    <div style={{ padding: '11px 15px', borderRadius: isAi ? '6px 20px 20px 20px' : '20px 6px 20px 20px', background: isAi ? '#ffffff' : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)', color: isAi ? '#1e293b' : '#ffffff', fontSize: '13px', lineHeight: 1.6, boxShadow: isAi ? '0 2px 8px rgba(0, 0, 0, 0.04)' : '0 4px 12px rgba(37, 99, 235, 0.2)', border: isAi ? '1px solid #e2e8f0' : 'none', wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                      {/* Vết gọi hàm Function Calling minh chứng Mô hình 2 */}
                      {isAi && msg.tool_call && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '8px',
                          padding: '3px 8px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                          <span style={{ color: '#4f46e5', fontWeight: 700 }}>⚡ Tool:</span>
                          <span style={{ color: '#0284c7', fontWeight: 600 }}>{msg.tool_call.name}()</span>
                          <span style={{ color: '#16a34a', fontSize: '10px', fontWeight: 700 }}>✓ CSDL</span>
                        </div>
                      )}

                      <div>{msg.text}</div>

                      {/* Gợi ý sách theo schema chuẩn Word (suggested_books: [{book_id, title, reason}]) */}
                      {isAi && msg.suggested_books && msg.suggested_books.length > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            ✨ Sách đề xuất phù hợp ({msg.suggested_books.length}):
                          </div>
                          {msg.suggested_books.map((b, idx) => {
                            const bId = b.book_id || b.id;
                            const isClickable = Boolean(bId || b.title);
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (isClickable) {
                                    window.dispatchEvent(new CustomEvent('smartlib:open-book-detail', { 
                                      detail: { bookId: bId, title: b.title } 
                                    }));
                                  }
                                }}
                                style={{
                                  background: '#f8fafc',
                                  borderRadius: '8px',
                                  border: '1px solid #e2e8f0',
                                  padding: '8px 10px',
                                  transition: 'all 0.15s ease',
                                  cursor: isClickable ? 'pointer' : 'default'
                                }}
                                onMouseEnter={(e) => {
                                  if (isClickable) {
                                    e.currentTarget.style.borderColor = '#93c5fd';
                                    e.currentTarget.style.background = '#eff6ff';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (isClickable) {
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.background = '#f8fafc';
                                  }
                                }}
                                title={isClickable ? 'Bấm để xem chi tiết cuốn sách này' : ''}
                              >
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>📖 {b.title}</span>
                                  {isClickable && <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 600 }}>Xem sách →</span>}
                                </div>
                                {b.reason && (
                                  <div style={{ fontSize: '11.5px', color: '#4338ca', marginTop: '3px', background: '#eef2ff', padding: '3px 6px', borderRadius: '5px' }}>
                                    💡 {b.reason}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px', textAlign: isAi ? 'left' : 'right', padding: '0 4px' }}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              );
            })}


            {isThinking && (
              <div className="msg-appear" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '12px', background: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                  <Bot size={18} color="#ffffff" />
                </div>
                <div style={{ padding: '12px 16px', borderRadius: '6px 20px 20px 20px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span className="ai-dot-1" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4f46e5', display: 'inline-block' }} />
                    <span className="ai-dot-2" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#9333ea', display: 'inline-block' }} />
                    <span className="ai-dot-3" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ec4899', display: 'inline-block' }} />
                  </div>
                  <span style={{ fontSize: '12.5px', color: '#64748b', fontStyle: 'italic', transition: 'all 0.3s ease' }}>
                    {THINKING_MESSAGES[thinkingIndex]}
                  </span>
                </div>
              </div>
            )}

            {messages.length <= 2 && !isThinking && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ✨ Gợi ý bạn có thể hỏi mình:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      style={{
                        textAlign: 'left',
                        padding: '9px 14px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12.5px',
                        color: '#334155',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.color = '#4338ca'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#334155'; }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '12px 16px', background: '#ffffff', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', borderRadius: '24px', padding: '4px 6px 4px 14px' }}>
              <input
                ref={inputRef}
                type="text"
                className="ai-chat-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isThinking ? 'Chờ mình trả lời xíu nha...' : 'Hỏi mình về sách, tác giả, mượn trả...'}
                disabled={isThinking}
                style={{ flex: 1, border: 'none', outline: 'none', boxShadow: 'none', background: 'transparent', fontSize: '13px', color: '#0f172a', padding: '7px 0' }}
              />
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isThinking}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: !inputMessage.trim() || isThinking ? '#cbd5e1' : 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: !inputMessage.trim() || isThinking ? 'not-allowed' : 'pointer',
                  transition: 'transform 0.15s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => { if (inputMessage.trim() && !isThinking) e.currentTarget.style.transform = 'scale(1.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                title="Gửi"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

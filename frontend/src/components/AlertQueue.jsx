import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, AlertCircle, RefreshCw, 
  Lock, X, Clock, Zap, Shield, ShieldCheck, Calendar, Check
} from 'lucide-react';
import { api } from '../services/api';

/**
 * Helper: Tô màu đỏ gạch chân nổi bật phần thời gian đo được (VD: 0.1 phút, 5.9 phút)
 * trong khi giữ nguyên ngưỡng (< 15 phút) dạng chữ thường, khớp 100% Ảnh 2.
 */
const renderHighlightedReason = (reason) => {
  if (!reason) return null;
  const parts = reason.split(/(\b\d+(?:\.\d+)?\s*(?:phút|giây|giờ)\b|\b\d+\s*cuốn\s*sách\s*liên\s*tiếp\b)/i);

  return (
    <span style={{ fontWeight: 500 }}>
      {parts.map((part, index) => {
        const prevPart = parts[index - 1] || '';
        const isThreshold = prevPart.includes('<') || prevPart.includes('ngưỡng');

        if (/^\d+(?:\.\d+)?\s*(?:phút|giây|giờ)$/i.test(part.trim()) && !isThreshold) {
          return (
            <span
              key={index}
              style={{
                color: '#b91c1c',
                fontWeight: 700,
                textDecoration: 'underline',
                textUnderlineOffset: '3px'
              }}
            >
              {part}
            </span>
          );
        }

        if (/^\d+\s*cuốn\s*sách\s*liên\s*tiếp$/i.test(part.trim())) {
          return (
            <span
              key={index}
              style={{
                color: '#b91c1c',
                fontWeight: 700,
                textDecoration: 'underline',
                textUnderlineOffset: '3px'
              }}
            >
              {part}
            </span>
          );
        }

        return part;
      })}
    </span>
  );
};

export default function AlertQueue({ onClose, onLockReader }) {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const data = await Promise.race([
        api.getFlaggedAnomalies(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
      ]);
      setAnomalies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Lỗi hoặc timeout khi tải danh sách bất thường:', err);
      try {
        const localData = await api.getFlaggedAnomalies();
        setAnomalies(Array.isArray(localData) ? localData : []);
      } catch (e) {
        setAnomalies([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
    // Auto refresh every 60s
    const interval = setInterval(() => {
      fetchAnomalies();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleScanNow = async () => {
    setScanning(true);
    try {
      await api.triggerAnomalyScan();
      await fetchAnomalies();
      setActionSuccess('Đã quét thành công');
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const handleResolve = async (recordId) => {
    try {
      await api.resolveAnomaly(recordId);
      setAnomalies(prev => prev.filter(a => a.id !== recordId));
      setActionSuccess(`Đã gỡ cờ cảnh báo cho phiếu #${recordId}`);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    /* 1. Backdrop tối mờ kính */
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={onClose}
    >
      {/* 2. Main Modal Card */}
      <div 
        style={{
          width: '100%',
          maxWidth: '820px',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* 3. Header Banner (Gradient Đỏ chuẩn Ảnh 2) */}
        <div 
          style={{
            background: 'linear-gradient(135deg, #b91c1c 0%, #be123c 55%, #991b1b 100%)',
            padding: '22px 26px 18px 26px',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Subtle glow decoration */}
          <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '180px', height: '180px', background: 'rgba(255,255,255,0.08)', borderRadius: '50%', filter: 'blur(20px)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', position: 'relative', zIndex: 2 }}>
            {/* Left: Icon & Title */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div 
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <AlertTriangle style={{ width: '22px', height: '22px', color: '#ffffff' }} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.2px' }}>
                    Hàng đợi Cảnh báo Bất thường <span style={{ fontWeight: 500, opacity: 0.9 }}>(AI Anomaly Queue)</span>
                  </h2>
                  <span 
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#dc2626',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 10px',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    {anomalies.length} VI PHẠM
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.88)', lineHeight: 1.4 }}>
                  Phát hiện giao dịch mượn-trả siêu tốc &lt; 15 phút hoặc độc giả báo mất liên tiếp
                </p>
              </div>
            </div>

            {/* Right: Close button */}
            {onClose && (
              <button 
                type="button" 
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.75)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)';
                  e.currentTarget.style.background = 'transparent';
                }}
                aria-label="Đóng cửa sổ"
                title="Đóng (ESC)"
              >
                <X style={{ width: '20px', height: '20px' }} />
              </button>
            )}
          </div>

          {/* Hàng 3 chip metadata bán trong suốt chuẩn Ảnh 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap', position: 'relative', zIndex: 2 }}>
            <div 
              style={{
                background: 'rgba(0, 0, 0, 0.18)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '9999px',
                padding: '3px 12px',
                fontSize: '11.5px',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500
              }}
            >
              <Clock style={{ width: '13px', height: '13px', opacity: 0.9 }} />
              <span>Quét tự động mỗi 60s</span>
            </div>
            <div 
              style={{
                background: 'rgba(0, 0, 0, 0.18)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '9999px',
                padding: '3px 12px',
                fontSize: '11.5px',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500
              }}
            >
              <Shield style={{ width: '13px', height: '13px', opacity: 0.9 }} />
              <span>Rule-based Engine</span>
            </div>
            <div 
              style={{
                background: 'rgba(0, 0, 0, 0.18)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '9999px',
                padding: '3px 12px',
                fontSize: '11.5px',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500
              }}
            >
              <Zap style={{ width: '13px', height: '13px', opacity: 0.9 }} />
              <span>Cập nhật trực tiếp CSDL</span>
            </div>
          </div>
        </div>

        {/* 4. Sub-Toolbar chuẩn Ảnh 2 */}
        <div 
          style={{
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {/* Left: Button Quét AI ngay */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleScanNow}
              disabled={scanning || loading}
              style={{
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: scanning || loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(79, 70, 229, 0.3)',
                opacity: scanning || loading ? 0.7 : 1,
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => !scanning && !loading && (e.currentTarget.style.backgroundColor = '#4338ca')}
              onMouseLeave={(e) => !scanning && !loading && (e.currentTarget.style.backgroundColor = '#4f46e5')}
              title="Kích hoạt quét toàn bộ CSDL tìm giao dịch bất thường"
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} className={scanning ? 'animate-spin' : ''} />
              <span>{scanning ? 'Đang quét...' : 'Quét AI ngay'}</span>
            </button>

            {actionSuccess && (
              <div 
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#16a34a',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Check style={{ width: '13px', height: '13px' }} />
                <span>{actionSuccess}</span>
              </div>
            )}
          </div>

          {/* Right: Trạng thái Giám sát hoạt động mượn trả 24/7 */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: '#475569',
              fontWeight: 500
            }}
          >
            <span style={{ position: 'relative', display: 'flex', height: '9px', width: '9px' }}>
              <span 
                style={{
                  position: 'absolute',
                  display: 'inline-flex',
                  height: '100%',
                  width: '100%',
                  borderRadius: '50%',
                  backgroundColor: '#34d399',
                  opacity: 0.75,
                  animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
                }} 
              />
              <span 
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  borderRadius: '50%',
                  height: '9px',
                  width: '9px',
                  backgroundColor: '#10b981'
                }} 
              />
            </span>
            <span>Giám sát hoạt động mượn trả 24/7</span>
          </div>
        </div>

        {/* 5. Danh sách thẻ vi phạm (Card List - Nền Slate nhạt để làm nổi bật các thẻ Trắng) */}
        <div 
          style={{
            backgroundColor: '#f8fafc',
            padding: '24px',
            overflowY: 'auto',
            maxHeight: '58vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            flex: 1
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: '#94a3b8', gap: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw className="animate-spin" style={{ width: '22px', height: '22px', color: '#ef4444' }} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>Đang phân tích dữ liệu mượn trả...</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Kiểm tra mốc thời gian và tần suất báo mất</span>
            </div>
          ) : anomalies.length === 0 ? (
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ width: '60px', height: '60px', borderRadius: '18px', backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <ShieldCheck style={{ width: '32px', height: '32px' }} />
              </div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                Hệ thống an toàn! Không có giao dịch bất thường nào
              </h4>
              <p style={{ fontSize: '12.5px', color: '#64748b', maxWidth: '440px', margin: 0, lineHeight: 1.5 }}>
                Không phát hiện phiếu mượn-trả dưới 15 phút hoặc tài khoản báo mất sách liên tiếp. Toàn bộ hoạt động thư viện đang diễn ra bình thường.
              </p>
            </div>
          ) : (
            anomalies.map((item) => {
              const score = Number(item.anomaly_score ?? 0);
              const isCritical = score >= 0.95;

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '20px 24px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Card Top Row: ID Badge + Score Badge + Status + Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {/* ID Badge */}
                      <span 
                        style={{
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        #{item.id}
                      </span>

                      {/* Badge điểm rủi ro: Đỏ nếu Score >= 0.95, Hổ phách nếu Score < 0.95 */}
                      {isCritical ? (
                        <span 
                          style={{
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '2px 10px',
                            borderRadius: '9999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <AlertTriangle style={{ width: '13px', height: '13px', color: '#dc2626' }} />
                          <span>Score: {score.toFixed(2)} • NGUY HIỂM CAO</span>
                        </span>
                      ) : (
                        <span 
                          style={{
                            backgroundColor: '#fffbeb',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '2px 10px',
                            borderRadius: '9999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <AlertCircle style={{ width: '13px', height: '13px', color: '#b45309' }} />
                          <span>Score: {score.toFixed(2)} • CẢNH BÁO</span>
                        </span>
                      )}

                      {/* Status */}
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Trạng thái: <strong style={{ color: '#0f172a', fontWeight: 600 }}>{item.status || 'Đã trả'}</strong>
                      </span>
                    </div>

                    {/* Cụm nút hành động "Gỡ cờ" và "Khóa độc giả" */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleResolve(item.id)}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#16a34a',
                          border: '1px solid #bbf7d0',
                          borderRadius: '8px',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0fdf4';
                          e.currentTarget.style.borderColor = '#86efac';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#ffffff';
                          e.currentTarget.style.borderColor = '#bbf7d0';
                        }}
                        title="Đánh dấu đã kiểm tra an toàn và gỡ cờ cảnh báo"
                      >
                        <Check style={{ width: '13px', height: '13px', color: '#16a34a' }} />
                        <span>Gỡ cờ</span>
                      </button>

                      {onLockReader && (
                        <button
                          type="button"
                          onClick={() => onLockReader(item.user_id, item.anomaly_reason)}
                          style={{
                            backgroundColor: '#ffffff',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            padding: '4px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#fef2f2';
                            e.currentTarget.style.borderColor = '#fca5a5';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#ffffff';
                            e.currentTarget.style.borderColor = '#fecaca';
                          }}
                          title="Khóa tài khoản độc giả này để ngăn chặn nguy cơ thất thoát"
                        >
                          <Lock style={{ width: '13px', height: '13px', color: '#dc2626' }} />
                          <span>Khóa độc giả</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Đường kẻ mỏng ngăn cách */}
                  <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '14px 0 16px 0' }} />

                  {/* 2 Cột: ĐẦU SÁCH (Trái) & ĐỘC GIẢ (Phải) cân đối 50/50 */}
                  <div 
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '24px',
                      marginBottom: '16px'
                    }}
                  >
                    {/* Cột trái: ĐẦU SÁCH */}
                    <div>
                      <div 
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '4px'
                        }}
                      >
                        ĐẦU SÁCH
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                          {item.book_title || 'Tài liệu thư viện'}
                        </span>
                        <span 
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            backgroundColor: '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 500
                          }}
                        >
                          (ID: {item.book_id})
                        </span>
                      </div>

                      <div 
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginTop: '12px',
                          marginBottom: '4px'
                        }}
                      >
                        THỜI ĐIỂM MƯỢN
                      </div>
                      <div 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#1e293b',
                          fontSize: '12.5px',
                          fontFamily: 'monospace',
                          fontWeight: 600
                        }}
                      >
                        <Calendar style={{ width: '13px', height: '13px', color: '#94a3b8' }} />
                        <span>{(item.borrow_date || '').replace('T', ' ').substring(0, 19) || '–'}</span>
                      </div>
                    </div>

                    {/* Cột phải: ĐỘC GIẢ */}
                    <div>
                      <div 
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '4px'
                        }}
                      >
                        ĐỘC GIẢ
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                          {item.reader_name || 'Độc giả'}
                        </span>
                        <span 
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            backgroundColor: '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 500
                          }}
                        >
                          (ID: {item.user_id})
                        </span>
                      </div>

                      <div 
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginTop: '12px',
                          marginBottom: '4px'
                        }}
                      >
                        TRẢ THỰC TẾ
                      </div>
                      <div 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#1e293b',
                          fontSize: '12.5px',
                          fontFamily: 'monospace',
                          fontWeight: 600
                        }}
                      >
                        <Calendar style={{ width: '13px', height: '13px', color: '#94a3b8' }} />
                        <span>{item.actual_return_date ? item.actual_return_date.replace('T', ' ').substring(0, 19) : 'Chưa trả'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Hộp cảnh báo nguyên nhân (Anomaly Callout Box) */}
                  <div 
                    style={{
                      backgroundColor: '#fffdf0',
                      border: '1px solid #fef08a',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#854d0e',
                      lineHeight: 1.4
                    }}
                  >
                    <AlertCircle style={{ width: '14px', height: '14px', color: '#eab308', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      {renderHighlightedReason(item.anomaly_reason)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 6. Technical Footer chuẩn Ảnh 2 */}
        <div 
          style={{
            backgroundColor: '#ffffff',
            borderTop: '1px solid #f1f5f9',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '11.5px',
            color: '#64748b',
            fontFamily: 'monospace'
          }}
        >
          <div>
            <span>&lt;/&gt; Thuật toán: </span>
            <span style={{ color: '#334155', fontWeight: 600 }}>Rule-based Window Timing &amp; Consecutive Loss Frequency</span>
          </div>
          <div>
            <span>Cập nhật cột </span>
            <code style={{ color: '#dc2626', fontWeight: 700, padding: '1px 4px', backgroundColor: '#fef2f2', borderRadius: '4px' }}>is_flagged</code>
            <span> &amp; </span>
            <code style={{ color: '#dc2626', fontWeight: 700, padding: '1px 4px', backgroundColor: '#fef2f2', borderRadius: '4px' }}>anomaly_score</code>
            <span> vào CSDL</span>
          </div>
        </div>

      </div>
    </div>
  );
}
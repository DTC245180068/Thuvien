import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, QrCode, BookMarked, Edit2, Trash2, Download, Clock, AlertCircle, Printer } from 'lucide-react';
import QRCode from 'qrcode';

export default function BookDetailModal({ book, isOpen, onClose, onBorrow, onEdit, onDelete, isAdmin, onReserve, onCancelReserve, activeReservationCount = 0, isUserLocked = false }) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');

  const isUpcoming = Boolean(
    book?.isUpcoming || 
    book?.status === 'Sắp phát hành' || 
    book?.status === 'Sắp có' || 
    book?.status === 'Upcoming' || 
    (Number(book?.id) >= 51 && book?.isUpcoming !== false && book?.status !== 'Sẵn sàng' && book?.status !== 'Hết sách' && book?.status !== 'Bảo trì')
  );
  const isReserved = Boolean(book?.isReserved);

  useEffect(() => {
    if (book && !isUpcoming) {
      // 🚀 URL Deep-Link trực tiếp: quét bằng Camera điện thoại tại giá sách sẽ mở ngay trang chi tiết sách
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const bookLink = `${origin}/?bookId=${book.id}`;
      QRCode.toDataURL(bookLink, {
        width: 240,
        margin: 1,
        color: {
          dark: '#1e40af',
          light: '#ffffff'
        }
      })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => {
          console.error('Lỗi tạo mã QR client-side:', err);
          setQrCodeDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(bookLink)}`);
        });
    }
  }, [book, isUpcoming]);

  const handlePrintLabel = () => {
    if (!book || !qrCodeDataUrl) return;
    const printWin = window.open('', '_blank', 'width=450,height=550');
    if (printWin) {
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Tem Nhãn Gáy Sách #${book.id} - SmartLib</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; text-align: center; }
            .label-card { border: 2px dashed #3b82f6; border-radius: 12px; padding: 16px; max-width: 320px; margin: 0 auto; background: #fafafa; }
            .lib-name { font-size: 11px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; }
            .title { font-size: 14px; font-weight: 700; color: #0f172a; margin: 8px 0 4px; line-height: 1.3; }
            .author { font-size: 12px; color: #64748b; margin-bottom: 12px; }
            .qr-img { width: 140px; height: 140px; margin: 0 auto; display: block; }
            .call-number { font-size: 13px; font-weight: 800; color: #1e40af; margin-top: 10px; background: #dbeafe; padding: 4px 8px; border-radius: 6px; display: inline-block; }
            .instruction { font-size: 10px; color: #94a3b8; margin-top: 8px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="label-card">
            <div class="lib-name">Thư Viện Thông Minh SmartLib</div>
            <div class="title">${book.title}</div>
            <div class="author">Tác giả: ${book.author || 'Chưa rõ'}</div>
            <img class="qr-img" src="${qrCodeDataUrl}" alt="QR Code" />
            <div class="call-number">MÃ SÁCH: SL-${String(book.id).padStart(4, '0')}</div>
            <div class="instruction">Quét mã QR bằng Camera điện thoại để xem chi tiết & mượn sách</div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
        </html>
      `);
      printWin.document.close();
    }
  };

  if (!isOpen || !book) return null;

  const qty = isUpcoming ? 0 : (Number(book.quantity) || 0);
  const borrowed = isUpcoming ? 0 : (Number(book.borrowed) || 0);
  const available = isUpcoming ? 0 : Math.max(0, qty - borrowed);

  const modalContent = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '640px',
          width: '100%',
          maxHeight: '90vh',
          margin: 'auto'
        }}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
            Chi tiết ấn phẩm {isUpcoming ? '(Sách sắp có)' : ''}
          </h3>
          <button onClick={onClose} className="modal-close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '20px' }}>
            {/* Book Cover / QR Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
              <div style={{ width: '100%', height: '230px', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {book.imageUrl ? (
                  <img
                    src={book.imageUrl}
                    alt={book.title}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <BookOpen size={48} style={{ margin: '0 auto 8px' }} />
                    <span style={{ fontSize: '11px', display: 'block' }}>Chưa có ảnh bìa</span>
                  </div>
                )}
              </div>

              {/* KHÔNG hiển thị mã QR nếu là sách sắp có */}
              {!isUpcoming && (
                <div style={{ textAlign: 'center', width: '100%', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '96px' }}>
                    {qrCodeDataUrl ? (
                      <img
                        src={qrCodeDataUrl}
                        alt={`Mã QR Sách #${book.id}`}
                        style={{ width: '96px', height: '96px', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <QrCode size={36} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '11.5px', color: '#0f172a', fontWeight: 700, display: 'block', marginTop: '6px' }}>
                    Mã QR Sách #{book.id}
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block', margin: '2px 0 6px', lineHeight: 1.2 }}>
                    📱 Quét bằng Camera điện thoại để mở trực tiếp
                  </span>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {qrCodeDataUrl && (
                      <a
                        href={qrCodeDataUrl}
                        download={`SmartLib_QR_Sach_${book.id}.png`}
                        style={{
                          fontSize: '11px',
                          color: '#2563eb',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe'
                        }}
                        title="Nhấp để tải ảnh mã QR (PNG) về máy"
                      >
                        <Download size={11} /> Tải ảnh
                      </a>
                    )}
                    {qrCodeDataUrl && (
                      <button
                        type="button"
                        onClick={handlePrintLabel}
                        style={{
                          fontSize: '11px',
                          color: '#047857',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0'
                        }}
                        title="In tem nhãn dán gáy sách thư viện"
                      >
                        <Printer size={11} /> In tem gáy
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Info Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: '6px' }}>{book.category}</span>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{book.title}</h2>
                <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '4px' }}>Tác giả: <strong>{book.author}</strong></p>
              </div>

              {/* Thông tin số lượng / Trạng thái */}
              {isUpcoming ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: isReserved ? '#f0fdf4' : '#eff6ff', padding: '12px', borderRadius: '8px', border: `1px solid ${isReserved ? '#86efac' : '#bfdbfe'}` }}>
                  <div>
                    <div style={{ fontSize: '11px', color: isReserved ? '#15803d' : '#1e40af', textTransform: 'uppercase', fontWeight: 700 }}>Trạng thái</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: isReserved ? '#16a34a' : '#2563eb' }}>
                      {isReserved ? '✓ Đã đặt trước' : 'Sắp phát hành'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: isReserved ? '#15803d' : '#1e40af', textTransform: 'uppercase', fontWeight: 700 }}>Dự kiến về thư viện</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: isReserved ? '#15803d' : '#1e40af' }}>
                      {book.releaseDate || 'Quý 4/2026'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Tổng số lượng</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{qty} cuốn</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Sẵn sàng cho mượn</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: isReserved ? '#2563eb' : (available > 0 ? '#16a34a' : '#ef4444') }}>
                      {isReserved ? 'Đã xếp hàng chờ' : `${available} cuốn`}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Mô tả tóm tắt:</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, maxHeight: '140px', overflowY: 'auto', background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                  {book.desc || 'Chưa có thông tin mô tả chi tiết cho cuốn sách này.'}
                </p>
              </div>

              {/* Thông báo cảnh báo khi độc giả đã hết lượt đặt trước (đủ 3 cuốn) */}
              {!isAdmin && (isUpcoming || available <= 0) && activeReservationCount >= 3 && !isReserved && (
                <div
                  style={{
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    color: '#c2410c',
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: 1.45
                  }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0, color: '#ea580c' }} />
                  <span>
                    Bạn đã hết lượt đặt trước sách (3/3 cuốn). Nếu muốn đặt cuốn này, bạn cần phải hủy một cuốn sách khác để đặt tiếp.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isAdmin && !isUpcoming && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {onEdit && (
                  <button
                    onClick={() => { onClose(); onEdit(book); }}
                    className="btn btn-outline"
                    style={{ color: '#2563eb', borderColor: '#bfdbfe', fontSize: '12.5px', padding: '6px 12px' }}
                    title="Chỉnh sửa thông tin cuốn sách này"
                  >
                    <Edit2 size={14} /> Sửa sách
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => { onClose(); onDelete(book); }}
                    className="btn btn-outline"
                    style={{ color: '#ef4444', borderColor: '#fecaca', fontSize: '12.5px', padding: '6px 12px' }}
                    title="Xóa cuốn sách này khỏi kho dữ liệu"
                  >
                    <Trash2 size={14} /> Xóa sách
                  </button>
                )}
              </div>
            )}
            {isUserLocked && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12.5px',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '12px'
              }}>
                <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                <span>Tài khoản của bạn đang bị khóa do mượn sách quá hạn từ 3 ngày trở lên. Vui lòng nộp phạt qua VNPay để mở lại tài khoản trước khi mượn hoặc đặt trước sách.</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} className="btn btn-outline">Đóng</button>
            {!isAdmin && !isUpcoming && available > 0 && (
              <button
                onClick={() => {
                  if (isUserLocked) {
                    alert('Tài khoản của bạn đang bị khóa do mượn sách quá hạn từ 3 ngày trở lên. Vui lòng nộp phạt qua VNPay để mở lại tài khoản.');
                    return;
                  }
                  onClose();
                  onBorrow(book);
                }}
                className="btn btn-primary"
                style={isUserLocked ? { opacity: 0.6, cursor: 'not-allowed', background: '#94a3b8', borderColor: '#94a3b8' } : {}}
                title={isUserLocked ? "Tài khoản đang bị khóa do quá hạn mượn sách" : "Đăng ký mượn cuốn này"}
              >
                <BookMarked size={16} />
                <span>{isUserLocked ? 'Tài khoản đang bị khóa' : 'Đăng ký mượn cuốn này'}</span>
              </button>
            )}
            {!isAdmin && (isUpcoming || available <= 0) && (
              isReserved ? (
                <button
                  onClick={() => {
                    onClose();
                    if (onCancelReserve) onCancelReserve(book);
                  }}
                  className="btn"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)',
                    cursor: 'pointer'
                  }}
                  title="Nhấp để hủy đặt trước cuốn sách này"
                >
                  <X size={16} />
                  <span>Hủy đặt trước</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (isUserLocked) {
                      alert('Tài khoản của bạn đang bị khóa do mượn sách quá hạn từ 3 ngày trở lên. Vui lòng nộp phạt qua VNPay để mở lại tài khoản.');
                      return;
                    }
                    onClose();
                    if (onReserve) onReserve(book);
                  }}
                  className="btn"
                  style={isUserLocked ? {
                    background: '#94a3b8',
                    color: '#ffffff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    opacity: 0.6,
                    cursor: 'not-allowed'
                  } : {
                    background: isUpcoming
                      ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                      : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                    color: '#ffffff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                    boxShadow: isUpcoming
                      ? '0 4px 12px rgba(37, 99, 235, 0.3)'
                      : '0 4px 12px rgba(234, 88, 12, 0.35)',
                    cursor: 'pointer'
                  }}
                  title={isUserLocked ? "Tài khoản đang bị khóa do quá hạn mượn sách" : (isUpcoming ? "Bấm để đăng ký vào hàng chờ đặt trước sách ưu tiên!" : "Sách đang tạm hết. Bấm để xếp hàng chờ nhận sách ưu tiên!")}
                >
                  <Clock size={16} />
                  <span>{isUserLocked ? 'Tài khoản đang bị khóa' : (isUpcoming ? 'Đặt trước sách ngay' : 'Đặt trước (Vào hàng chờ)')}</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
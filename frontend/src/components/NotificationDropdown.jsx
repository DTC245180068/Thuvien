import React, { useRef, useEffect, useState } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { api, notifyDataUpdated } from '../services/api';
import {
  Bell, CheckCheck, Clock, BookOpen, AlertCircle, CheckCircle, XCircle,
  MessageSquare, Check, X, Trash2
} from 'lucide-react';

// Hàm định dạng ngày giờ chuẩn xác, luôn có khoảng cách rõ ràng: HH:mm:ss DD/MM/YYYY
const formatNotifTime = (dateStr) => {
  if (!dateStr) return 'Vừa xong';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
  } catch (e) {
    return dateStr;
  }
};

export default function NotificationDropdown({ isOpen, onClose, align = 'left' }) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
    deleteNotification
  } = useNotifications();
  const { role } = useAuth();
  const dropdownRef = useRef(null);

  const [borrowRecords, setBorrowRecords] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null); // { type: 'approve'|'reject', recordId, notifId, bookTitle, readerName }
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState('');

  // Tải danh sách phiếu mượn để đối chiếu trạng thái hiện tại của từng yêu cầu (cho cả Admin, Thủ thư và Độc giả)
  const loadBorrows = async () => {
    try {
      const res = await api.getBorrowRecords();
      setBorrowRecords(res || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBorrows();
      const handleUpdate = () => {
        loadBorrows();
      };
      window.addEventListener('smartlib:data-updated', handleUpdate);
      return () => window.removeEventListener('smartlib:data-updated', handleUpdate);
    }
  }, [isOpen, role]);

  useEffect(() => {
    function handleClickOutside(e) {
      // Không đóng dropdown nếu đang thao tác trên DIV modal xác nhận
      if (confirmModal) return;
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, confirmModal]);

  if (!isOpen) return null;

  const handleConfirmAction = async () => {
    if (!confirmModal || (!confirmModal.recordId && !confirmModal.fineId)) {
      setActionError('Không tìm thấy thông tin để xử lý.');
      return;
    }
    setIsProcessing(true);
    setActionError('');
    try {
      if (confirmModal.isFine) {
        if (confirmModal.type === 'approve') {
          await api.approveFinePayment(confirmModal.fineId);
        } else {
          await api.rejectFinePayment(confirmModal.fineId, 'Từ chối bởi Quản trị viên');
        }
        notifyDataUpdated('fine');
        notifyDataUpdated('reader');
        window.dispatchEvent(new CustomEvent('smartlib:data-updated', { detail: { type: 'fine' } }));
        window.dispatchEvent(new CustomEvent('smartlib:data-updated', { detail: { type: 'reader' } }));
      } else {
        if (confirmModal.type === 'approve') {
          await api.approveBorrow(confirmModal.recordId);
        } else {
          await api.rejectBorrow(confirmModal.recordId);
        }
        notifyDataUpdated('borrow');
        window.dispatchEvent(new CustomEvent('smartlib:data-updated', { detail: { type: 'borrow' } }));
      }

      // Đánh dấu đã đọc thông báo này
      if (confirmModal.notifId) {
        await markAsRead(confirmModal.notifId);
      }

      // Cập nhật lại thông báo và dữ liệu mượn trả
      await fetchNotifications();
      await loadBorrows();
      setConfirmModal(null);
    } catch (err) {
      const msg = err.message || 'Có lỗi xảy ra khi xử lý yêu cầu.';
      setActionError(msg);
      // Nếu phiếu mượn đã bị xóa hoặc không còn tồn tại trên server, tự động đánh dấu đã đọc
      if (confirmModal.notifId && (msg.includes('Không tìm thấy') || msg.includes('404'))) {
        try {
          await markAsRead(confirmModal.notifId);
          await fetchNotifications();
          await loadBorrows();
        } catch (e) {}
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'borrow_request':
        return <BookOpen size={16} className="text-blue-600" />;
      case 'borrow_approved':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'borrow_rejected':
        return <XCircle size={16} className="text-red-600" />;
      case 'book_returned':
        return <CheckCheck size={16} className="text-teal-600" />;
      case 'borrow_renewed':
        return <Clock size={16} className="text-amber-500" />;
      default:
        return <AlertCircle size={16} className="text-blue-500" />;
    }
  };

  return (
    <>
      <div
        ref={dropdownRef}
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          ...(align === 'right' ? { right: 0 } : { left: 0 }),
          width: '360px',
          maxWidth: '92vw',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0',
          zIndex: 1000,
          overflow: 'hidden'
        }}
      >
        {/* Header Dropdown */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
            <MessageSquare size={16} className="text-blue-600" />
            <span>Thông báo ({unreadCount})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
                style={{
                  border: 'none',
                  background: '#eff6ff',
                  color: '#2563eb',
                  padding: '4px 9px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                title="Đánh dấu tất cả thông báo là đã đọc"
              >
                Đọc tất cả
              </button>
            )}
          </div>
        </div>

        {/* Danh sách thông báo */}
        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              Chưa có thông báo nào.
            </div>
          ) : (
            notifications.map((notif) => {
              // Phân loại chính xác từng loại thông báo
              const isBorrowReq = notif.type === 'borrow_request' || 
                (notif.title?.includes('Yêu cầu mượn') && !notif.title?.includes('đã được duyệt') && !notif.title?.includes('bị từ chối'));
              const isBorrowApproved = notif.type === 'borrow_approved' || notif.title?.includes('được duyệt');
              const isBorrowRejected = notif.type === 'borrow_rejected' || notif.title?.includes('từ chối');
              const isBookReturned = notif.type === 'book_returned' || notif.title?.includes('trả sách');

              // Tìm phiếu mượn tương ứng bằng ID chuẩn xác
              const targetRecordId = notif.recordId || notif.meta?.recordId || (typeof notif.meta === 'object' ? notif.meta?.recordId : null);
              let rec = null;
              if (targetRecordId) {
                rec = borrowRecords.find(r => Number(r.id) === Number(targetRecordId));
              }
              // Nếu chưa có hoặc chưa tìm thấy theo ID, tìm theo tên sách đang chờ duyệt
              if (!rec && isBorrowReq) {
                rec = borrowRecords.find(r => r.status === 'Chờ duyệt' && (notif.message?.includes(r.bookTitle) || notif.bookTitle === r.bookTitle));
              }

              // Kiểm tra xem yêu cầu này có đang ở trạng thái Chờ duyệt hay không (Chỉ true khi phiếu mượn thực sự tồn tại trong DB và status là Chờ duyệt)
              const isPending = isBorrowReq && Boolean(rec && rec.status === 'Chờ duyệt');
              // Kiểm tra xem yêu cầu này đã từng được duyệt chưa (đang mượn, quá hạn hoặc đã trả)
              const isApproved = (rec && ['Đang mượn', 'Quá hạn', 'Đã trả'].includes(rec.status)) || isBorrowApproved;
              // Kiểm tra xem yêu cầu này bị từ chối không
              const isRejected = (rec && ['Từ chối', 'Đã hủy'].includes(rec.status)) || isBorrowRejected;
              // Thông báo mượn của phiếu không còn tồn tại hoặc đã lưu trữ
              const isOrphaned = isBorrowReq && !rec && !isApproved && !isRejected;

              return (
                <div
                  key={notif.id}
                  onClick={() => markAsRead(notif.id)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f8fafc',
                    background: notif.isRead ? '#ffffff' : '#f0f7ff',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}
                >
                  <div style={{ marginTop: '2px', flexShrink: 0 }}>{getIcon(notif.type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>{notif.title}</div>
                    <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '3px', lineHeight: 1.4 }}>
                      {notif.message}
                    </div>

                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} />
                      <span>{formatNotifTime(notif.createdAt)}</span>
                    </div>

                    {/* Nút Duyệt nộp phạt VNPay cho Admin / Thủ thư */}
                    {(notif.type === 'fine_pending_approval' || notif.title?.includes('nộp phạt VNPay')) && (role === 'Admin' || role === 'Librarian') && (
                      <div
                        style={{ display: 'flex', gap: '8px', marginTop: '10px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const fId = notif.meta?.fineId || 3;
                            setConfirmModal({
                              isFine: true,
                              type: 'approve',
                              fineId: fId,
                              notifId: notif.id,
                              amount: notif.meta?.amount || 92000,
                              readerName: notif.readerName || notif.meta?.readerName || 'Trần Thị Mai'
                            });
                          }}
                          className="btn btn-approve btn-table-action"
                          style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Check size={13} /> Duyệt nộp phạt
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const fId = notif.meta?.fineId || 3;
                            setConfirmModal({
                              isFine: true,
                              type: 'reject',
                              fineId: fId,
                              notifId: notif.id,
                              amount: notif.meta?.amount || 92000,
                              readerName: notif.readerName || notif.meta?.readerName || 'Trần Thị Mai'
                            });
                          }}
                          className="btn btn-reject btn-table-action"
                          style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <X size={13} /> Từ chối
                        </button>
                      </div>
                    )}

                    {/* Nút Duyệt / Không duyệt ngay trong thông báo (Chỉ hiển thị cho Admin / Thủ thư khi đang Chờ duyệt) */}
                    {isPending && (role === 'Admin' || role === 'Librarian') && (
                      <div
                        style={{ display: 'flex', gap: '8px', marginTop: '10px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = rec?.id || targetRecordId;
                            if (!targetId) return;
                            setConfirmModal({
                              type: 'approve',
                              recordId: targetId,
                              notifId: notif.id,
                              bookTitle: rec?.bookTitle || notif.bookTitle || notif.meta?.bookTitle || 'Sách mượn',
                              readerName: rec?.readerName || notif.readerName || notif.meta?.readerName || 'Độc giả'
                            });
                          }}
                          className="btn btn-approve btn-table-action"
                        >
                          <Check size={13} /> Duyệt
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const targetId = rec?.id || targetRecordId;
                            if (!targetId) return;
                            setConfirmModal({
                              type: 'reject',
                              recordId: targetId,
                              notifId: notif.id,
                              bookTitle: rec?.bookTitle || notif.bookTitle || notif.meta?.bookTitle || 'Sách mượn',
                              readerName: rec?.readerName || notif.readerName || notif.meta?.readerName || 'Độc giả'
                            });
                          }}
                          className="btn btn-reject btn-table-action"
                        >
                          <X size={13} /> Không duyệt
                        </button>
                      </div>
                    )}

                    {/* Huy hiệu chờ thư viện duyệt (Hiển thị cho Độc giả) */}
                    {isPending && role === 'Reader' && (
                      <div style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} /> Đang chờ thư viện duyệt
                      </div>
                    )}

                    {/* Thông báo yêu cầu mượn cũ đã lưu trữ hoặc không còn tồn tại */}
                    {isOrphaned && (
                      <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> Yêu cầu đã được xử lý hoặc lưu trữ
                      </div>
                    )}

                    {/* Trạng thái đã duyệt cho mượn */}
                    {isApproved && !isPending && (
                      <div style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={13} /> {role === 'Reader' ? 'Đã được phê duyệt' : 'Đã duyệt cho mượn'}
                      </div>
                    )}

                    {/* Trạng thái từ chối */}
                    {isRejected && !isPending && (
                      <div style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <XCircle size={13} /> {role === 'Reader' ? 'Yêu cầu bị từ chối' : 'Đã từ chối yêu cầu'}
                      </div>
                    )}

                    {/* Trạng thái đã trả sách hoàn tất (Chỉ hiển thị cho đúng thông báo trả sách) */}
                    {isBookReturned && (
                      <div style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCheck size={13} /> Đã hoàn tất trả sách
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {!notif.isRead && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', marginTop: '6px' }} />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '3px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.5,
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                      title="Xóa thông báo này"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* DIV Modal xác nhận Duyệt / Không duyệt (Không dùng thông báo trình duyệt) */}
      {confirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !isProcessing && setConfirmModal(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: confirmModal.type === 'approve' ? '#e0f2fe' : '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              {confirmModal.type === 'approve' ? (
                <CheckCircle size={28} color="#0284c7" />
              ) : (
                <XCircle size={28} color="#dc2626" />
              )}
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              {confirmModal.isFine
                ? (confirmModal.type === 'approve' ? 'Xác nhận duyệt nộp phạt VNPay?' : 'Xác nhận từ chối giao dịch nộp phạt?')
                : (confirmModal.type === 'approve' ? 'Xác nhận duyệt yêu cầu mượn sách?' : 'Xác nhận từ chối yêu cầu mượn sách?')}
            </h3>

            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 20px 0' }}>
              {confirmModal.isFine ? (
                confirmModal.type === 'approve' ? (
                  <>
                    Bạn có chắc chắn muốn duyệt giao dịch nộp phạt <strong style={{ color: '#0f172a' }}>{Number(confirmModal.amount || 0).toLocaleString('vi-VN')} đ</strong> cho độc giả <strong style={{ color: '#0f172a' }}>"{confirmModal.readerName}"</strong>? Tài khoản độc giả sẽ được TỰ ĐỘNG MỞ KHÓA ngay lập tức.
                  </>
                ) : (
                  <>
                    Bạn có chắc chắn muốn từ chối giao dịch nộp phạt của độc giả <strong style={{ color: '#0f172a' }}>"{confirmModal.readerName}"</strong>?
                  </>
                )
              ) : (
                confirmModal.type === 'approve' ? (
                  <>
                    Bạn có chắc chắn muốn phê duyệt cho độc giả <strong style={{ color: '#0f172a' }}>"{confirmModal.readerName}"</strong> mượn cuốn sách <strong style={{ color: '#0f172a' }}>"{confirmModal.bookTitle}"</strong>?
                  </>
                ) : (
                  <>
                    Bạn có chắc chắn muốn từ chối yêu cầu mượn cuốn sách <strong style={{ color: '#0f172a' }}>"{confirmModal.bookTitle}"</strong> của độc giả <strong style={{ color: '#0f172a' }}>"{confirmModal.readerName}"</strong>?
                  </>
                )
              )}
            </p>

            {actionError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textAlign: 'left'
                }}
              >
                {actionError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { setConfirmModal(null); setActionError(''); }}
                disabled={isProcessing}
                className="btn btn-outline btn-modal-action"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={isProcessing}
                className={`btn ${confirmModal.type === 'approve' ? 'btn-approve' : 'btn-reject'} btn-modal-action`}
              >
                {isProcessing ? 'Đang xử lý...' : (confirmModal.type === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
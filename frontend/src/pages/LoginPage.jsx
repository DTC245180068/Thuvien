import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, User, Lock, Mail, Phone, Calendar, MapPin, ShieldCheck, CreditCard, X, CheckCircle } from 'lucide-react';
import VNPayPaymentModal from '../components/VNPayPaymentModal';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [lockedModalData, setLockedModalData] = useState(null);
  const [vnpayModalOpen, setVnpayModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const kickMsg = sessionStorage.getItem('pendingApprovalKickMsg');
    if (kickMsg) {
      setError(kickMsg);
      sessionStorage.removeItem('pendingApprovalKickMsg');
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('vnp_result') === 'pending_approval') {
      setError('Giao dịch nộp phạt VNPay đã gửi thành công và đang chờ Quản trị viên duyệt. Vui lòng đợi trong giây lát hoặc liên hệ ban quản trị!');
    }
  }, []);

  // Register state
  const [regData, setRegData] = useState({
    fullName: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    email: '',
    birthDate: '',
    address: ''
  });

  const handleQuickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      const errMsg = (err.message || '').toLowerCase();
      const isPending = err.isPendingApproval ||
        errMsg.includes('chờ quản trị viên duyệt') ||
        errMsg.includes('chờ duyệt') ||
        err.lockData?.error === 'PAYMENT_PENDING_APPROVAL';

      if (isPending) {
        setError(err.message || 'Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Vui lòng đợi trong giây lát hoặc liên hệ ban quản trị!');
        setLockedModalData(null);
      } else if (err.isLocked || errMsg.includes('khóa') || errMsg.includes('nộp phạt') || errMsg.includes('quá hạn')) {
        const lockInfo = err.lockData || {};
        setLockedModalData({
          username,
          readerName: lockInfo.readerName || username,
          readerId: lockInfo.readerId || 2,
          reason: lockInfo.message || err.message || 'Tài khoản của bạn đã bị tự động khóa do chưa nộp phạt sách quá hạn sau 3 ngày.',
          unpaidFines: Number(lockInfo.unpaidFines || 10000),
          fine: lockInfo.fine || {
            id: 1,
            bookTitle: 'Phí phạt trễ hạn mượn sách',
            fineAmount: Number(lockInfo.unpaidFines || 10000),
            readerId: lockInfo.readerId || 2
          }
        });
      } else {
        setError(err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác!');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVNPaySuccess = async (res) => {
    setVnpayModalOpen(false);
    setLockedModalData(null);
    const msg = res?.message || 'Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Vui lòng đợi trong giây lát!';
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 5000);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regData.fullName || !regData.username || !regData.password || !regData.phone) {
      setError('Vui lòng điền đầy đủ các thông tin bắt buộc (*).');
      return;
    }
    if (regData.password !== regData.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (regData.password.length < 3) {
      setError('Mật khẩu phải có ít nhất 3 ký tự.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await register({
        fullName: regData.fullName,
        username: regData.username,
        password: regData.password,
        phone: regData.phone,
        email: regData.email || null,
        birthDate: regData.birthDate || null,
        address: regData.address || null
      });
      setSuccessMsg('Đăng ký thành công! Đang chuyển hướng...');
    } catch (err) {
      setError(err.message || 'Đăng ký thất bại. Vui lòng thử lại.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: mode === 'login' ? '450px' : '560px',
          padding: '36px',
          border: '1px solid #e2e8f0',
          transition: 'max-width 0.25s ease'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              margin: '0 auto 14px'
            }}
          >
            <BookOpen size={28} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
            Smart<span style={{ color: '#2563eb' }}>Lib</span>
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '4px' }}>
            Hệ thống Quản lý Thư viện Thông minh
          </p>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '4px',
            marginBottom: '24px',
            gap: '4px'
          }}
        >
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            style={{
              flex: 1,
              padding: '9px',
              border: 'none',
              borderRadius: '8px',
              background: mode === 'login' ? '#ffffff' : 'transparent',
              color: mode === 'login' ? '#2563eb' : '#64748b',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              boxShadow: mode === 'login' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
            style={{
              flex: 1,
              padding: '9px',
              border: 'none',
              borderRadius: '8px',
              background: mode === 'register' ? '#ffffff' : 'transparent',
              color: mode === 'register' ? '#2563eb' : '#64748b',
              fontWeight: 700,
              fontSize: '13.5px',
              cursor: 'pointer',
              boxShadow: mode === 'register' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Đăng ký độc giả mới
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{
            padding: '14px 16px',
            background: error.includes('chờ Quản trị viên duyệt') || error.includes('PAYMENT_PENDING_APPROVAL') || error.includes('chờ duyệt') ? '#fffbeb' : '#fee2e2',
            color: error.includes('chờ Quản trị viên duyệt') || error.includes('PAYMENT_PENDING_APPROVAL') || error.includes('chờ duyệt') ? '#b45309' : '#b91c1c',
            border: error.includes('chờ Quản trị viên duyệt') || error.includes('PAYMENT_PENDING_APPROVAL') || error.includes('chờ duyệt') ? '1.5px solid #fcd34d' : '1px solid #fecaca',
            borderRadius: '10px',
            marginBottom: '18px',
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>
              {error.includes('chờ Quản trị viên duyệt') || error.includes('PAYMENT_PENDING_APPROVAL') || error.includes('chờ duyệt') ? '⏳' : '⚠️'}
            </span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                {error.includes('chờ Quản trị viên duyệt') || error.includes('PAYMENT_PENDING_APPROVAL') || error.includes('chờ duyệt') ? 'Giao dịch đang chờ Quản trị viên phê duyệt' : 'Đăng nhập không thành công'}
              </div>
              <div>{error}</div>
            </div>
          </div>
        )}
        {successMsg && (
          <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#15803d', borderRadius: '8px', marginBottom: '18px', fontSize: '13px', fontWeight: 600 }}>
            {successMsg}
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label>Tên đăng nhập</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  placeholder="admin hoặc reader"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Mật khẩu</label>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu (mặc định: 123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '8px' }}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>

            {/* Quick Login Demo Badges */}
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
                Chọn nhanh tài khoản mẫu để thử nghiệm:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleQuickFill('admin', '123')}
                  className="btn btn-outline"
                  style={{ padding: '7px 4px', fontSize: '11.5px', borderColor: '#bfdbfe', background: '#eff6ff', color: '#1d4ed8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                  title="Tài khoản Quản trị viên"
                >
                  <ShieldCheck size={15} />
                  <span>Admin (123)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('librarian', '123')}
                  className="btn btn-outline"
                  style={{ padding: '7px 4px', fontSize: '11.5px', borderColor: '#fed7aa', background: '#fff7ed', color: '#c2410c', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                  title="Tài khoản Thủ thư"
                >
                  <BookOpen size={15} />
                  <span>Thủ thư (123)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('reader', '123')}
                  className="btn btn-outline"
                  style={{ padding: '7px 4px', fontSize: '11.5px', borderColor: '#bbf7d0', background: '#f0fdf4', color: '#15803d', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
                  title="Tài khoản Độc giả"
                >
                  <User size={15} />
                  <span>Độc giả (123)</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* REGISTER FORM */
          <form onSubmit={handleRegisterSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Họ và tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Nguyễn Văn A"
                  value={regData.fullName}
                  onChange={(e) => setRegData({ ...regData, fullName: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Tên đăng nhập *</label>
                <input
                  type="text"
                  required
                  placeholder="username..."
                  value={regData.username}
                  onChange={(e) => setRegData({ ...regData, username: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Số điện thoại *</label>
                <input
                  type="text"
                  required
                  placeholder="0912 345 678"
                  value={regData.phone}
                  onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Mật khẩu *</label>
                <input
                  type="password"
                  required
                  placeholder="Ít nhất 3 ký tự"
                  value={regData.password}
                  onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Xác nhận mật khẩu *</label>
                <input
                  type="password"
                  required
                  placeholder="Nhập lại mật khẩu"
                  value={regData.confirmPassword}
                  onChange={(e) => setRegData({ ...regData, confirmPassword: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={regData.email}
                  onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Ngày sinh</label>
                <input
                  type="date"
                  value={regData.birthDate}
                  onChange={(e) => setRegData({ ...regData, birthDate: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Địa chỉ</label>
                <input
                  type="text"
                  placeholder="Hà Nội, TP.HCM..."
                  value={regData.address}
                  onChange={(e) => setRegData({ ...regData, address: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '14px' }}
            >
              {loading ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}
            </button>
          </form>
        )}
      </div>

      {/* DIV THÔNG BÁO TÀI KHOẢN BỊ KHÓA & BẮT BUỘC NỘP PHẠT */}
      {lockedModalData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setLockedModalData(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '32px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(220, 38, 38, 0.25)',
              border: '1.5px solid #fecaca',
              textAlign: 'center',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút đóng góc phải */}
            <button
              type="button"
              onClick={() => setLockedModalData(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '4px'
              }}
            >
              <X size={20} />
            </button>

            {/* Icon Lock đỏ lớn */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#fef2f2',
                border: '2px solid #fecaca',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.2)'
              }}
            >
              <Lock size={32} />
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#991b1b', margin: '0 0 6px 0' }}>
              Tài Khoản Đang Bị Khóa
            </h3>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 18px 0' }}>
              Không thể đăng nhập vào hệ thống thư viện
            </p>

            {/* Khung thông tin lý do & số tiền phạt */}
            <div
              style={{
                background: '#fef2f2',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                marginBottom: '20px',
                border: '1px solid #fee2e2'
              }}
            >
              <div style={{ fontSize: '13px', color: '#991b1b', marginBottom: '8px', lineHeight: 1.5 }}>
                <strong>Lý do:</strong> {lockedModalData.reason}
              </div>
              <div style={{ fontSize: '12.5px', color: '#b91c1c', lineHeight: 1.4 }}>
                <strong>Quy định:</strong> Sau 3 ngày mượn sách quá hạn chưa nộp phạt, tài khoản tự động bị khóa đăng nhập.
              </div>
              <div
                style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px dashed #fca5a5',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#7f1d1d' }}>Tiền phạt cần nộp:</span>
                <span style={{ fontSize: '17px', fontWeight: 800, color: '#dc2626' }}>
                  {Number(lockedModalData.unpaidFines || 10000).toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>

            <p style={{ fontSize: '12.5px', color: '#475569', marginBottom: '22px', lineHeight: 1.5 }}>
              👉 Bạn bắt buộc phải nộp tiền phạt để hệ thống <strong>tự động mở khóa</strong> tài khoản ngay lập tức, hoặc liên hệ Quản trị viên/Thủ thư tại quầy thư viện mở khóa thì mới có thể đăng nhập vào để mượn sách tiếp.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Nút nộp phạt ngay qua VNPay */}
              <button
                type="button"
                onClick={() => setVnpayModalOpen(true)}
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #005baa 0%, #003e75 100%)',
                  color: '#ffffff',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0, 91, 170, 0.4)'
                }}
              >
                <CreditCard size={18} />
                <span>Nộp phạt ngay qua VNPay để mở khóa</span>
              </button>

              <button
                type="button"
                onClick={() => setLockedModalData(null)}
                className="btn btn-outline"
                style={{ padding: '10px', borderRadius: '10px', fontSize: '13px' }}
              >
                Đóng thông báo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THANH TOÁN VNPAY NGAY TRÊN TRANG ĐĂNG NHẬP */}
      <VNPayPaymentModal
        isOpen={vnpayModalOpen}
        onClose={() => setVnpayModalOpen(false)}
        fine={lockedModalData?.fine || {
          id: 1,
          bookTitle: 'Phí phạt trễ hạn mượn sách',
          fineAmount: lockedModalData?.unpaidFines || 10000
        }}
        readerId={lockedModalData?.readerId || 2}
        amount={lockedModalData?.unpaidFines || 10000}
        onSuccess={handleVNPaySuccess}
        onPaymentSuccess={handleVNPaySuccess}
      />

      {/* TOAST THÀNH CÔNG */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '28px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
            fontSize: '13.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 99999
          }}
        >
          <CheckCircle size={18} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import BookCard from '../components/BookCard';
import BookDetailModal from '../components/BookDetailModal';
import BorrowModal from '../components/BorrowModal';
import {
  Search, BookOpen, Clock, CheckCircle,
  BookMarked, ArrowRight, ChevronLeft, ChevronRight,
  Lock, CreditCard, X, Plus, AlertCircle, Check, Filter, Download,
  QrCode, FileText
} from 'lucide-react';
import QRCode from 'qrcode';
import { exportApi } from '../services/exportApi';
import FeaturedCarousel from '../components/FeaturedCarousel';
import UpcomingBooksSection, { UPCOMING_BOOKS } from '../components/UpcomingBooksSection';
import VNPayPaymentModal from '../components/VNPayPaymentModal';

export default function ReaderPortal({ activeTab, onTabChange }) {
  const { user, updateUser, logout } = useAuth();
  const [books, setBooks] = useState(() => (api.getCachedBooks ? api.getCachedBooks() : []));
  const [myBorrows, setMyBorrows] = useState([]);
  const [myReservations, setMyReservations] = useState(() => (api.getCachedReservations ? api.getCachedReservations(user?.id) : []));
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [bookSearch, setBookSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Pagination & Scroll Ref
  const searchSectionRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // Modals
  const [selectedBook, setSelectedBook] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [borrowTargetBook, setBorrowTargetBook] = useState(null);
  const [returnConfirmRecord, setReturnConfirmRecord] = useState(null);
  const [qrReturnRecord, setQrReturnRecord] = useState(null);
  const [qrReturnDataUrl, setQrReturnDataUrl] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [renewRecord, setRenewRecord] = useState(null);
  const [renewDays, setRenewDays] = useState(7);
  const [renewNotes, setRenewNotes] = useState('');
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewMode, setRenewMode] = useState('days'); // 'days' | 'date'
  const [renewTargetDate, setRenewTargetDate] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [myFines, setMyFines] = useState([]);
  const [vnpayModalOpen, setVnpayModalOpen] = useState(false);
  const [selectedFineForPayment, setSelectedFineForPayment] = useState(null);
  const [systemSettings, setSystemSettings] = useState(null);
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [reserveSearch, setReserveSearch] = useState('');
  const [reserveFilterTab, setReserveFilterTab] = useState('all');

  // Sinh mã QR phiếu mượn khi độc giả bấm "Mã QR trả sách"
  useEffect(() => {
    if (qrReturnRecord) {
      const payload = `SMARTLIB-RECEIPT-${qrReturnRecord.id}-${encodeURIComponent(qrReturnRecord.bookTitle || 'Book')}`;
      QRCode.toDataURL(payload, {
        width: 240,
        margin: 1,
        color: { dark: '#1e1b4b', light: '#ffffff' }
      })
        .then(url => setQrReturnDataUrl(url))
        .catch(err => {
          setQrReturnDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`);
        });
    } else {
      setQrReturnDataUrl('');
    }
  }, [qrReturnRecord]);

  useEffect(() => {
    if (api.getSettings) {
      api.getSettings().then(s => setSystemSettings(s)).catch(() => {});
    }
  }, []);

  // Tự động kiểm tra và kick độc giả ra khỏi hệ thống nếu tài khoản chuyển sang trạng thái Chờ duyệt nộp phạt
  useEffect(() => {
    if (!user) return;
    const checkPendingAndKick = async () => {
      if (user.pendingPaymentApproval) {
        sessionStorage.setItem('pendingApprovalKickMsg', 'Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Hệ thống đã tự động đăng xuất.');
        if (logout) logout();
        return;
      }
      try {
        const finesList = await (api.getFines ? api.getFines() : []);
        const uId = Number(user.id || 0);
        const hasPending = finesList.some(
          f => Number(f.readerId || f.userId || 0) === uId && (f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt')
        );
        if (hasPending) {
          sessionStorage.setItem('pendingApprovalKickMsg', 'Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Hệ thống đã tự động đăng xuất.');
          if (logout) logout();
        }
      } catch (e) {}
    };

    checkPendingAndKick();
    const handleDataUpdate = () => checkPendingAndKick();
    window.addEventListener('smartlib:data-updated', handleDataUpdate);
    return () => window.removeEventListener('smartlib:data-updated', handleDataUpdate);
  }, [user, logout]);

  const showToast = (msg) => {

    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // 1. Tải danh sách sách (chỉ tải 1 lần khi vào trang hoặc khi có sự kiện cập nhật kho sách)
  const loadBooks = async () => {
    try {
      const bRes = await api.getBooks().catch(() => []);
      if (bRes && bRes.length > 0) {
        setBooks(bRes);
      }
    } catch (e) {
      console.error('Error loading books:', e);
    }
  };

  // 2. Tải phiếu mượn & hàng chờ của riêng độc giả (payload siêu nhẹ < 2KB, không kèm base64 ảnh)
  const loadBorrowsOnly = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const brRes = await api.getBorrowRecords().catch(() => []);
      if (user && user.id) {
        const uId = Number(user.id);
        const uName = (user.fullName || '').toLowerCase().trim();
        const uUsername = (user.username || '').toLowerCase().trim();
        const myFiltered = (brRes || []).filter(r => {
          const rId = r.readerId ? Number(r.readerId) : null;
          const rName = (r.readerName || '').toLowerCase().trim();
          return (rId && rId === uId) ||
                 (uName && rName && rName === uName) ||
                 (uUsername && rName && rName === uUsername);
        });
        setMyBorrows(prev => {
          if (
            prev.length === myFiltered.length &&
            prev.every((p, idx) => {
              const next = myFiltered[idx];
              return p && next &&
                p.id === next.id &&
                p.status === next.status &&
                p.renewStatus === next.renewStatus &&
                p.returnDate === next.returnDate &&
                p.dueDate === next.dueDate;
            })
          ) {
            return prev;
          }
          return myFiltered;
        });

        // Tải danh sách sách trong hàng chờ đặt trước của độc giả
        api.getReservations(uId).then(resvs => {
          const cleanResvs = (resvs || []).filter(r => 
            r.status !== 'Cancelled' && 
            r.status !== 'Hủy' && 
            r.status !== 'Fulfilled'
          );
          setMyReservations(prev => {
            if (
              prev.length === cleanResvs.length &&
              prev.every((p, idx) => p.id === cleanResvs[idx]?.id && p.status === cleanResvs[idx]?.status)
            ) {
              return prev;
            }
            return cleanResvs;
          });
        }).catch(() => {});

        // Tải danh sách các khoản phạt của độc giả
        if (api.getFines) {
          api.getFines(uId).then(fList => {
            setMyFines(fList || []);
          }).catch(() => {});
        }

        // Đồng bộ trạng thái khóa tài khoản thực tế từ server
        if (api.getReaders && updateUser) {
          api.getReaders().then(readers => {
            const currentReader = (readers || []).find(rd => Number(rd.id) === uId);
            if (currentReader) {
              const serverLocked = Boolean(currentReader.isLocked);
              const serverReason = currentReader.lockReason || '';
              if (Boolean(user?.isLocked) !== serverLocked || (user?.lockReason || '') !== serverReason) {
                updateUser({
                  isLocked: serverLocked,
                  lockReason: serverReason
                });
              }
            }
          }).catch(() => {});
        }

        // Fetch AI recommendations (Loại trừ hoàn toàn sách sắp có)
        api.getRecommendations(uId).then(rec => {
          if (rec && Array.isArray(rec.books)) {
            rec.books = rec.books.filter(
              b => b.status !== 'Upcoming' && 
                   b.status !== 'Sắp phát hành' && 
                   b.status !== 'Sắp có' && 
                   !b.isUpcoming
            );
          }
          setRecommendations(rec);
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Error loading reader borrows:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fineRate = Number(systemSettings?.finePerDay || 2000);
  const lockDays = Number(systemSettings?.autoLockAfterDays || 3);
  const graceDays = Number(systemSettings?.gracePeriodDays || 0);

  // Kiểm tra tài khoản có bị khóa hoặc có sách trễ hạn >= lockDays ngày không
  const overdueBorrows = myBorrows.filter(r => {
    if (r.status === 'Đã trả' || r.status === 'Từ chối' || r.status === 'Chờ duyệt') return false;
    if (r.status === 'Quá hạn') return true;
    const dueStr = r.returnDate || r.dueDate;
    if (!dueStr) return false;
    const due = new Date(dueStr);
    const now = new Date();
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    return diffDays >= lockDays || (r.daysOverdue && r.daysOverdue >= lockDays) || (r.overdueDays && r.overdueDays >= lockDays);
  });

  const calculateBorrowFine = (r) => {
    if (Number(r.fineAmount) > 0) return Number(r.fineAmount);
    if (Number(r.fine_amount) > 0) return Number(r.fine_amount);
    const dueStr = r.returnDate || r.dueDate;
    if (!dueStr) return lockDays * fineRate;
    const due = new Date(dueStr);
    const now = new Date();
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    const days = Math.max(lockDays, diffDays, Number(r.daysOverdue || 0), Number(r.overdueDays || 0));
    const chargeable = Math.max(0, days - graceDays);
    return chargeable * fineRate;
  };

  const unpaidFinesList = (myFines || []).filter(f => f.status === 'Chưa nộp');
  const fineFromFinesList = unpaidFinesList.reduce((sum, f) => sum + Number(f.fineAmount || 0), 0);
  const totalUnpaidFineAmount = fineFromFinesList > 0 
    ? fineFromFinesList 
    : overdueBorrows.reduce((sum, r) => sum + calculateBorrowFine(r), 0);

  const isReaderLocked = Boolean(user?.isLocked || user?.is_locked || overdueBorrows.length > 0 || (unpaidFinesList.length > 0 && totalUnpaidFineAmount > 0));

  let readerLockReason = user?.lockReason || '';
  if (!readerLockReason) {
    if (overdueBorrows.length > 0) {
      readerLockReason = `Bạn đang mượn ${overdueBorrows.length} cuốn sách quá hạn từ ${lockDays} ngày trở lên (${overdueBorrows.map(b => b.bookTitle).join(', ')}). Hệ thống tự động khóa tài khoản theo quy chế thư viện.`;
    } else if (unpaidFinesList.length > 0) {
      readerLockReason = `Tài khoản còn khoản phạt trễ hạn (${totalUnpaidFineAmount.toLocaleString('vi-VN')} đ) chưa thanh toán. Vui lòng nộp phạt qua VNPay để tự động mở khóa tài khoản.`;
    } else {
      readerLockReason = 'Tài khoản đang bị tạm khóa theo quy định thư viện.';
    }
  }

  const handleVNPaySuccess = (res) => {
    setVnpayModalOpen(false);
    setSelectedFineForPayment(null);
    const kickMsg = res?.message || 'Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Vui lòng đợi trong giây lát hoặc liên hệ ban quản trị!';
    sessionStorage.setItem('pendingApprovalKickMsg', kickMsg);
    if (logout) {
      logout();
    }
  };

  const handleOpenBorrowModal = (book) => {
    if (isReaderLocked) {
      showToast(`Tài khoản của bạn đang bị khóa do mượn sách quá hạn từ ${lockDays} ngày trở lên. Vui lòng nộp phạt qua VNPay để mở lại tài khoản.`);
      setSelectedFineForPayment(unpaidFinesList[0] || null);
      setVnpayModalOpen(true);
      return;
    }
    setBorrowTargetBook(book);
    setBorrowModalOpen(true);
  };

  const handleCreateReservation = async (book) => {
    if (!user) {
      showToast('Vui lòng đăng nhập để đặt trước sách.');
      return;
    }

    if (isReaderLocked) {
      showToast(`Tài khoản của bạn đang bị khóa do mượn sách quá hạn từ ${lockDays} ngày trở lên. Vui lòng nộp phạt qua VNPay để mở lại tài khoản.`);
      setSelectedFineForPayment(unpaidFinesList[0] || null);
      setVnpayModalOpen(true);
      return;
    }

    // Kiểm tra giới hạn số sách đặt trước tối đa theo cài đặt
    const maxRes = Number(systemSettings?.maxReservations || 3);
    const activeResvs = myReservations.filter(
      r => r.status !== 'Cancelled' && r.status !== 'Hủy' && r.status !== 'Fulfilled'
    );
    if (activeResvs.length >= maxRes) {
      showToast(`Bạn đã hết lượt đặt trước sách! Mỗi độc giả chỉ được đặt trước tối đa ${maxRes} cuốn sách. Nếu muốn đặt thì cần phải hủy một cuốn sách khác để đặt tiếp.`);
      return;
    }


    try {
      const uId = user.id ? Number(user.id) : 2;
      const res = await api.createReservation({
        bookId: book.id,
        readerId: uId,
        bookTitle: book.title
      });
      showToast(res.message || '✓ Đặt trước sách thành công! Bạn đã được thêm vào hàng chờ.');
      setSelectedBook(prev => (prev && Number(prev.id) === Number(book.id)) ? { ...prev, isReserved: true } : prev);
      if (res.reservation) {
        setMyReservations(prev => [...prev.filter(r => Number(r.id) !== Number(res.reservation.id)), res.reservation]);
      }
      loadBorrowsOnly(true);
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
    } catch (e) {
      showToast(e.message || 'Không thể đặt trước sách lúc này.');
    }
  };

  const handleCancelReservation = async (resId) => {
    try {
      // Cập nhật giao diện phản hồi tức thì 0ms (60fps)
      setMyReservations(prev => prev.filter(r => Number(r.id) !== Number(resId)));
      setSelectedBook(prev => prev ? { ...prev, isReserved: false } : null);
      showToast('✓ Đã hủy yêu cầu đặt trước sách thành công.');
      await api.cancelReservation(resId);
    } catch (e) {
      showToast('Lỗi khi hủy đặt trước: ' + (e.message || ''));
      loadBorrowsOnly(true);
    }
  };

  const handleCancelReservationForBook = async (bookId) => {
    try {
      const targetRes = myReservations.find(r => Number(r.bookId) === Number(bookId) && r.status !== 'Cancelled' && r.status !== 'Hủy');
      // Cập nhật giao diện phản hồi tức thì 0ms (60fps)
      setMyReservations(prev => prev.filter(r => Number(r.bookId) !== Number(bookId)));
      setSelectedBook(prev => (prev && Number(prev.id) === Number(bookId)) ? { ...prev, isReserved: false } : prev);
      showToast('✓ Đã hủy đặt trước sách thành công.');
      if (targetRes) {
        await api.cancelReservation(targetRes.id);
      }
    } catch (e) {
      showToast('Lỗi khi hủy đặt trước: ' + (e.message || ''));
      loadBorrowsOnly(true);
    }
  };

  const loadData = async (silent = false) => {
    await Promise.all([loadBooks(), loadBorrowsOnly(silent)]);
  };

  // Xử lý VNPay return URL params (khi VNPay redirect về sau thanh toán)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vnpResult = params.get('vnp_result');
    const vnpTxnRef = params.get('vnp_txnRef');
    const vnpAmount = params.get('vnp_amount');

    if (vnpResult === 'success' && vnpTxnRef) {
      // Thanh toán VNPay thành công — tự động trigger handleVNPaySuccess
      const successData = {
        success: true,
        transactionRef: vnpTxnRef,
        amount: Number(vnpAmount || 0),
        message: `Thanh toán VNPay thành công! Mã GD: ${vnpTxnRef}. Tài khoản đã được tự động mở khóa.`,
        unlocked: true
      };
      // Xóa params khỏi URL mà không reload trang
      window.history.replaceState({}, document.title, window.location.pathname);
      // Trigger success sau 500ms để đảm bảo component đã mount đủ
      setTimeout(() => {
        handleVNPaySuccess(successData);
      }, 500);
    } else if (vnpResult === 'failed') {
      const vnpCode = params.get('vnp_code');
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        showToast(`⚠️ Thanh toán VNPay thất bại (Mã lỗi: ${vnpCode || 'N/A'}). Vui lòng thử lại.`);
      }, 500);
    }
  }, []); // Chỉ chạy 1 lần khi mount

  useEffect(() => {
    loadData();

    // 1. Lắng nghe sự kiện cập nhật dữ liệu tức thì từ các thao tác mượn/trả
    const handleDataUpdate = () => {
      loadBorrowsOnly(true);
      loadBooks();
    };
    window.addEventListener('smartlib:data-updated', handleDataUpdate);

    // 2. Lắng nghe sự kiện giữa các tab trình duyệt khác nhau
    const handleStorageUpdate = (e) => {
      if (e.key === 'smartlib_last_update') {
        loadBorrowsOnly(true);
      }
    };
    window.addEventListener('storage', handleStorageUpdate);

    // 3. Polling ngầm CHỈ tải phiếu mượn nhẹ (< 2KB), chu kỳ 6s giúp đạt 60fps mượt mà
    const interval = setInterval(() => loadBorrowsOnly(true), 6000);

    return () => {
      window.removeEventListener('smartlib:data-updated', handleDataUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      clearInterval(interval);
    };
  }, [user]);


  // Khi chuyển tab: chỉ cập nhật phiếu mượn/hàng chờ, không reload sách
  useEffect(() => {
    if (activeTab === 'borrows' || activeTab === 'history' || activeTab === 'reservations' || activeTab === 'active-borrows') {
      loadBorrowsOnly(true);
    }
  }, [activeTab]);


  // Reset to page 1 when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [bookSearch, selectedCategory]);

  const handleOpenBookByTitleOrId = (bookTitle, bookId) => {
    // 1. Kiểm tra trong danh mục sách thư viện (database) trước tiên để lấy dữ liệu mới nhất
    const found = (books || []).find(b =>
      (bookId && Number(b.id) === Number(bookId)) ||
      (bookTitle && b.title && b.title.trim().toLowerCase() === bookTitle.trim().toLowerCase())
    );
    if (found) {
      const isUp = Boolean(
        found.isUpcoming || 
        found.status === 'Sắp phát hành' || 
        found.status === 'Sắp có' || 
        found.status === 'Upcoming' || 
        (Number(found.id) >= 51 && found.isUpcoming !== false && found.status !== 'Sẵn sàng' && found.status !== 'Hết sách' && found.status !== 'Bảo trì')
      );
      const isResv = myReservations.some(r => Number(r.bookId) === Number(found.id) && r.status !== 'Cancelled' && r.status !== 'Hủy');
      let relDate = found.releaseDate;
      if (!relDate && (found.desc || found.description)) {
        const match = (found.desc || found.description).match(/Dự kiến phát hành:\s*([^).\n]+)/);
        if (match) relDate = match[1].trim();
      }
      setSelectedBook({
        ...found,
        isUpcoming: isUp,
        isReserved: isResv,
        releaseDate: relDate || found.releaseDate || '10-2026',
        quantity: isUp ? 0 : found.quantity,
        available: isUp ? 0 : found.available
      });
      setDetailModalOpen(true);
      return;
    }

    // 2. Fallback dự phòng nếu không tìm thấy trong CSDL
    const upcomingFound = (UPCOMING_BOOKS || []).find(ub =>
      (bookId && Number(ub.id) === Number(bookId)) ||
      (bookTitle && ub.title && ub.title.trim().toLowerCase() === bookTitle.trim().toLowerCase())
    );
    if (upcomingFound) {
      const isResv = myReservations.some(r => Number(r.bookId) === Number(upcomingFound.id) && r.status !== 'Cancelled' && r.status !== 'Hủy');
      setSelectedBook({
        id: upcomingFound.id,
        title: upcomingFound.title,
        author: upcomingFound.author || 'Chưa rõ',
        category: upcomingFound.category || 'Manga & Light Novel',
        quantity: 0,
        available: 0,
        borrowed: 0,
        status: 'Sắp phát hành',
        isUpcoming: true,
        isReserved: isResv,
        releaseDate: upcomingFound.releaseDate,
        views: upcomingFound.views,
        desc: upcomingFound.desc || `Tác phẩm của tác giả ${upcomingFound.author || 'nổi tiếng'} đang chuẩn bị phát hành và sẽ sớm có mặt tại thư viện trong đợt nhập sách tới (${upcomingFound.releaseDate}).`,
        imageUrl: upcomingFound.cover
      });
      setDetailModalOpen(true);
      return;
    }

    // 3. Fallback dự phòng
    setSelectedBook({
      id: bookId || 0,
      title: bookTitle || 'Thông tin sách',
      author: 'Chưa rõ tác giả',
      category: 'Tài liệu thư viện',
      quantity: 1,
      borrowed: 0,
      desc: 'Thông tin chi tiết về cuốn sách trong hệ thống thư viện SmartLib.'
    });
    setDetailModalOpen(true);
  };

  const handleBorrowRequest = async (formData) => {
    if (isReaderLocked) {
      showToast('Tài khoản của bạn đang bị khóa do mượn sách quá hạn từ 3 ngày trở lên. Vui lòng nộp phạt qua VNPay để mở lại tài khoản.');
      setSelectedFineForPayment(unpaidFinesList[0] || null);
      setVnpayModalOpen(true);
      return;
    }
    try {
      await api.createBorrowRecord(formData);
      showToast(`✓ Đã gửi yêu cầu mượn cuốn sách "${formData.bookTitle || 'sách'}" thành công!`);
      await loadData(true);
    } catch (err) {
      console.error('Lỗi gửi yêu cầu mượn:', err);
      showToast(err.message || 'Lỗi khi gửi yêu cầu mượn sách');
      await loadData(true);
      throw err;
    }
  };

  const handleConfirmReturn = async () => {
    if (!returnConfirmRecord) return;
    const targetId = returnConfirmRecord.id;
    const targetTitle = returnConfirmRecord.bookTitle;
    setIsReturning(true);

    try {
      await api.updateBorrowStatus(targetId, 'Đã trả');
      setMyBorrows(prev => prev.map(r => 
        Number(r.id) === Number(targetId) 
          ? { ...r, status: 'Đã trả', actualReturnDate: new Date().toISOString().substring(0, 10) }
          : r
      ));
      setReturnConfirmRecord(null);
      showToast(`✓ Đã hoàn tất trả cuốn sách "${targetTitle}" về thư viện thành công!`);
      await loadData(true);
    } catch (err) {
      console.error(err);
      showToast('Có lỗi xảy ra khi thực hiện trả sách.');
      await loadData(true);
    } finally {
      setIsReturning(false);
    }
  };

  const handleCancelBorrow = async (recordId, bookTitle) => {
    try {
      await api.updateBorrowStatus(recordId, 'Đã hủy');
      setMyBorrows(prev => prev.filter(r => Number(r.id) !== Number(recordId)));
      showToast(`✓ Đã hủy yêu cầu mượn cuốn sách "${bookTitle}" thành công!`);
      await loadData(true);
    } catch (err) {
      console.error(err);
      showToast('Có lỗi xảy ra khi hủy yêu cầu.');
    }
  };

  const handleConfirmRenew = async () => {
    if (!renewRecord) return;

    // Bắt buộc phải chọn ngày
    if (!renewTargetDate) {
      showToast('Vui lòng chọn ngày hạn trả mới!');
      return;
    }

    // Tính số ngày từ hạn trả hiện tại đến ngày mục tiêu
    const baseStr = renewRecord.returnDate || renewRecord.dueDate;
    const baseDate = baseStr && !isNaN(new Date(baseStr).getTime()) ? new Date(baseStr) : new Date();
    baseDate.setHours(0, 0, 0, 0);
    const target = new Date(renewTargetDate);
    target.setHours(0, 0, 0, 0);
    const days = Math.round((target.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));

    if (days < 1) {
      showToast('Ngày gia hạn phải sau ngày hạn trả hiện tại!');
      return;
    }
    if (days > 20) {
      showToast('Ngày gia hạn không được quá 20 ngày so với hạn trả hiện tại!');
      return;
    }

    setIsRenewing(true);
    try {
      // Cập nhật phản hồi tức thì 0ms (60fps) cho giao diện: chuyển sang trạng thái Chờ duyệt gia hạn
      setMyBorrows(prev => prev.map(r => 
        Number(r.id) === Number(renewRecord.id)
          ? {
              ...r,
              renewStatus: 'Chờ duyệt gia hạn',
              pendingRenewDays: days,
              pendingRenewNotes: renewNotes
            }
          : r
      ));

      await api.requestRenewBorrow(renewRecord.id, days, renewNotes);
      showToast(`✓ Đã gửi yêu cầu gia hạn thêm ${days} ngày! Yêu cầu của bạn đang chờ thủ thư phê duyệt.`);
      setRenewRecord(null);
      await loadBorrowsOnly(true);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Có lỗi xảy ra khi gửi yêu cầu gia hạn.');
      await loadBorrowsOnly(true);
    } finally {
      setIsRenewing(false);
    }
  };


  const actualBooks = books.filter(b => 
    b.status !== 'Upcoming' && 
    b.status !== 'Sắp phát hành' && 
    b.status !== 'Sắp có' && 
    !b.isUpcoming
  );

  const categories = ['All', ...new Set(actualBooks.map(b => b.category).filter(Boolean))];

  const filteredBooks = actualBooks.filter(b => {
    const matchSearch = b.title.toLowerCase().includes(bookSearch.toLowerCase()) || 
                        (b.author && b.author.toLowerCase().includes(bookSearch.toLowerCase()));
    const matchCat = selectedCategory === 'All' || b.category === selectedCategory;
    return matchSearch && matchCat;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredBooks.length / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedBooks = filteredBooks.slice(startIndex, endIndex);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    if (searchSectionRef.current) {
      searchSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const activeBorrowsList = myBorrows.filter(r => r.status === 'Đang mượn' || r.status === 'Chờ duyệt' || r.status === 'Quá hạn');

  return (
    <div style={{ padding: '32px 36px', flex: 1, background: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* BANNER CẢNH BÁO TÀI KHOẢN BỊ KHÓA & NỘP PHẠT VNPAY */}
      {isReaderLocked && (
        <div style={{
          background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
          border: '1.5px solid #f87171',
          borderRadius: '16px',
          padding: '18px 24px',
          marginBottom: '26px',
          boxShadow: '0 4px 20px rgba(239, 68, 68, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '280px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: '#ef4444',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(239, 68, 68, 0.3)'
            }}>
              <Lock size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#991b1b' }}>
                  TÀI KHOẢN ĐANG BỊ KHÓA DO QUÁ HẠN MƯỢN SÁCH
                </h4>
                <span style={{
                  background: '#b91c1c',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  Tự động khóa sau 3 ngày trễ hạn
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#b91c1c', lineHeight: 1.4 }}>
                {readerLockReason}
              </p>
              {totalUnpaidFineAmount > 0 && (
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#7f1d1d', fontWeight: 700 }}>
                  Tổng tiền phạt cần nộp: <span style={{ color: '#dc2626', fontSize: '15px', textDecoration: 'underline' }}>{totalUnpaidFineAmount.toLocaleString('vi-VN')} đ</span> (2.000 đ/ngày/sách)
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => {
                setSelectedFineForPayment(unpaidFinesList[0] || null);
                setVnpayModalOpen(true);
              }}
              className="btn"
              style={{
                background: '#005baa',
                color: '#ffffff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13.5px',
                boxShadow: '0 4px 12px rgba(0, 91, 170, 0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <CreditCard size={18} />
              <span>Nộp phạt qua VNPay ngay</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: TRA CỨU SÁCH */}
      {activeTab === 'catalog' && (
        <div>
          {/* Top Div: Hệ thống đề xuất 6 cuốn sách luân phiên (Matching Image 2) */}
          <FeaturedCarousel
            books={actualBooks}
            onSelectBook={(book) => { setSelectedBook(book); setDetailModalOpen(true); }}
            onBorrowBook={handleOpenBorrowModal}
          />

          {/* Mục SÁCH SẮP CÓ (Upcoming Books Section - Bố cục 5 cột chuẩn theo ảnh mẫu) */}
          <UpcomingBooksSection
            books={books}
            reservedBookIds={myReservations.filter(r => r.status !== 'Cancelled' && r.status !== 'Hủy' && r.status !== 'Fulfilled').map(r => Number(r.bookId))}
            onReserve={handleCreateReservation}
            onCancelReserve={(book) => handleCancelReservationForBook(book.id)}
            onSelectBook={(book) => {
              const isResv = myReservations.some(r => Number(r.bookId) === Number(book.id) && r.status !== 'Cancelled' && r.status !== 'Hủy') || Boolean(book.isReserved);
              setSelectedBook({
                id: book.id,
                title: book.title,
                author: book.author || 'Chưa rõ',
                category: book.category || 'Manga & Light Novel',
                quantity: 0,
                available: 0,
                borrowed: 0,
                status: 'Sắp phát hành',
                isUpcoming: true,
                isReserved: isResv,
                releaseDate: book.releaseDate,
                views: book.views,
                desc: book.desc || `Tác phẩm của tác giả ${book.author || 'nổi tiếng'} đang chuẩn bị phát hành và sẽ sớm có mặt tại thư viện trong đợt nhập sách tới (${book.releaseDate}). Lượt quan tâm hiện tại: ${book.views}.`,
                imageUrl: book.cover
              });
              setDetailModalOpen(true);
            }}
          />

          {/* Header Kho sách (My Library) & Search/Filter */}
          <div
            ref={searchSectionRef}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap', scrollMarginTop: '20px' }}
          >
            <div>
              <h2 style={{ fontFamily: "'Lora', serif", fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Kho sách thư viện
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '260px' }}>
                <input
                  type="text"
                  placeholder="Lọc nhanh sách..."
                  value={bookSearch}
                  onChange={(e) => setBookSearch(e.target.value)}
                  style={{ paddingLeft: '34px', height: '38px', fontSize: '13px' }}
                />
                <Search size={15} style={{ position: 'absolute', left: '11px', top: '12px', color: '#94a3b8' }} />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ width: '200px', height: '38px', fontSize: '13px', paddingTop: 0, paddingBottom: 0 }}
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c === 'All' ? 'Tất cả thể loại' : c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Book Cards Grid (20 books per page) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '18px' }}>
            {paginatedBooks.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '64px', color: '#64748b' }}>
                <BookOpen size={48} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
                <p style={{ fontSize: '15px', fontWeight: 600 }}>Không tìm thấy cuốn sách nào phù hợp với từ khóa.</p>
              </div>
            ) : (
              paginatedBooks.map(b => (
                <BookCard
                  key={b.id}
                  book={b}
                  onSelect={(book) => {
                    const isResv = myReservations.some(r => Number(r.bookId) === Number(book.id) && r.status !== 'Cancelled' && r.status !== 'Hủy');
                    setSelectedBook({ ...book, isReserved: isResv });
                    setDetailModalOpen(true);
                  }}
                  onBorrow={handleOpenBorrowModal}
                  isAdmin={false}
                />
              ))
            )}
          </div>

          {/* Phân trang (Pagination) - Mỗi trang 20 cuốn sách */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: '36px',
                paddingTop: '20px',
                borderTop: '1px solid #f1f5f9'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: currentPage === 1 ? '#f8fafc' : '#ffffff',
                    color: currentPage === 1 ? '#94a3b8' : '#334155',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    transition: 'all 0.2s'
                  }}
                >
                  <ChevronLeft size={16} />
                  <span>Trước</span>
                </button>

                {/* Page Number Buttons */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      border: currentPage === pageNum ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: currentPage === pageNum ? '#2563eb' : '#ffffff',
                      color: currentPage === pageNum ? '#ffffff' : '#334155',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: currentPage === pageNum ? '0 4px 10px rgba(37, 99, 235, 0.25)' : 'none'
                    }}
                  >
                    {pageNum}
                  </button>
                ))}

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: currentPage === totalPages ? '#f8fafc' : '#ffffff',
                    color: currentPage === totalPages ? '#94a3b8' : '#334155',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>Sau</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SÁCH ĐANG MƯỢN */}
      {(activeTab === 'active-borrows' || activeTab === 'borrows') && (
        <div>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Danh sách Sách Đang Mượn & Chờ Duyệt</h2>
            <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '2px' }}>
              Theo dõi thời hạn trả sách để tránh bị quá hạn
            </p>
          </div>

          {activeBorrowsList.length === 0 ? (
            <div className="card" style={{ padding: '64px', textAlign: 'center' }}>
              <BookMarked size={48} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155' }}>Bạn hiện không có sách nào đang mượn.</h3>
              <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', marginBottom: '18px' }}>
                Hãy tra cứu kho sách và đăng ký mượn cuốn sách yêu thích của bạn ngay hôm nay!
              </p>
              <button onClick={() => onTabChange('catalog')} className="btn btn-primary">
                <span>Khám phá kho sách</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {activeBorrowsList.map(r => {
                const canReturn = r.status === 'Đang mượn' || r.status === 'Quá hạn';
                const canCancel = r.status === 'Chờ duyệt';
                const diffDays = r.returnDate ? Math.max(0, Math.floor((new Date() - new Date(r.returnDate)) / (1000 * 60 * 60 * 24))) : 0;
                const isOverdue = r.status === 'Quá hạn' || diffDays > 0;
                const itemFineAmount = calculateBorrowFine(r);

                return (
                  <div key={r.id} className="card" style={{ padding: '20px', margin: 0, borderLeft: `4px solid ${r.status === 'Đang mượn' && !isOverdue ? '#16a34a' : isOverdue ? '#ef4444' : '#f59e0b'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <span className={`badge ${r.status === 'Đang mượn' && !isOverdue ? 'badge-success' : isOverdue ? 'badge-danger' : 'badge-warning'}`}>
                        {diffDays > 0 ? `Quá hạn ${diffDays} ngày` : isOverdue ? 'Quá hạn' : r.status}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Phiếu #{r.id}</span>
                    </div>

                    <h3
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: '6px',
                        lineHeight: 1.3,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#2563eb';
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#0f172a';
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                      onClick={() => handleOpenBookByTitleOrId(r.bookTitle, r.bookId)}
                      title={`Xem chi tiết sách: ${r.bookTitle}`}
                    >
                      {r.bookTitle}
                    </h3>
                    <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '14px' }}>
                      Hình thức: <strong>{r.borrowType || 'Mượn về nhà'}</strong>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>Ngày mượn: <strong>{r.borrowDate ? r.borrowDate.substring(0, 10) : '-'}</strong></div>
                      <div>Hạn trả sách: <strong style={{ color: isOverdue ? '#ef4444' : '#0f172a' }}>{r.returnDate ? r.returnDate.substring(0, 10) : '-'}</strong></div>
                    </div>

                    {isOverdue && (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#b91c1c',
                        fontWeight: 600,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>Tiền phạt: <strong style={{ color: '#dc2626' }}>{itemFineAmount.toLocaleString('vi-VN')} đ</strong> (2.000 đ/ngày)</span>
                        {(diffDays >= 3 || r.status === 'Quá hạn') && (
                          <span style={{
                            background: '#dc2626',
                            color: '#fff',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <Lock size={11} /> Đã khóa tài khoản
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Nút Xuất trình Mã QR để Thủ thư quét nhận trả sách tại quầy */}
                        {canReturn ? (
                          <button
                            type="button"
                            onClick={() => setQrReturnRecord(r)}
                            className="btn btn-table-action"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                              color: '#ffffff',
                              border: 'none',
                              fontWeight: 700,
                              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                            }}
                            title="Xuất trình mã QR phiếu mượn cho thủ thư quét nhận trả sách tại quầy"
                          >
                            <QrCode size={14} /> Mã QR trả sách
                          </button>
                        ) : null}

                        {/* Nút Gia hạn hoặc Trạng thái Chờ duyệt gia hạn cho sách đang mượn */}
                        {canReturn ? (
                          r.renewStatus === 'Chờ duyệt gia hạn' ? (
                            <span
                              className="badge badge-warning"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a'
                              }}
                              title="Yêu cầu gia hạn đang chờ thủ thư phê duyệt"
                            >
                              <Clock size={13} /> Chờ duyệt gia hạn (+{r.pendingRenewDays || 7} ngày)
                            </span>
                          ) : (Number(r.renewCount) || 0) >= 2 ? (
                            <span
                              style={{
                                fontSize: '11.5px',
                                color: '#94a3b8',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '6px 4px'
                              }}
                              title="Cuốn sách này đã được gia hạn tối đa 2 lần"
                            >
                              (Đã gia hạn 2/2 lần)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setRenewRecord(r);
                                setRenewDays(7);
                                setRenewNotes('');
                                setRenewMode('days');
                                setRenewTargetDate('');
                              }}
                              className="btn btn-table-action"
                              style={{
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                padding: '7px 14px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#dbeafe';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#eff6ff';
                              }}
                              title="Gửi yêu cầu xin gia hạn thời gian mượn cuốn sách này"
                            >
                              <Clock size={14} /> Xin gia hạn
                            </button>
                          )
                        ) : null}

                        {/* Nút Hủy yêu cầu cho sách đang Chờ duyệt */}
                        {canCancel ? (
                          <button
                            type="button"
                            onClick={() => handleCancelBorrow(r.id, r.bookTitle)}
                            className="btn btn-reject btn-table-action"
                            title="Hủy yêu cầu mượn cuốn sách này"
                          >
                            <X size={14} /> Hủy yêu cầu
                          </button>
                        ) : null}
                      </div>

                      {/* Nút Nộp phạt VNPay khi trễ hạn */}
                      {isOverdue && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFineForPayment({
                              id: r.id,
                              borrowRecordId: r.id,
                              bookTitle: r.bookTitle,
                              fineAmount: itemFineAmount,
                              readerId: user?.id || 2
                            });
                            setVnpayModalOpen(true);
                          }}
                          className="btn"
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: '#005baa',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0, 91, 170, 0.25)'
                          }}
                          title="Nộp tiền phạt trễ hạn ngay qua VNPay"
                        >
                          <CreditCard size={13} />
                          <span>Nộp phạt VNPay</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LỊCH SỬ MƯỢN TRẢ */}
      {activeTab === 'history' && (
        <div>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Lịch Sử Mượn Trả Của Bạn</h2>
            <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '2px' }}>
              Danh sách tất cả các cuốn sách bạn đã từng mượn và hoàn tất trả
            </p>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>Mã Phiếu</th>
                    <th style={{ minWidth: '220px' }}>Tên Sách</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Hình Thức</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Ngày Mượn</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Hạn Trả</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Ngày Trả Thực Tế</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Trạng Thái</th>
                    <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>Tiền Phạt</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Chứng Từ</th>
                  </tr>
                </thead>
                <tbody>
                  {myBorrows.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                        Bạn chưa có lịch sử mượn trả nào.
                      </td>
                    </tr>
                  ) : (
                    myBorrows.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>#{r.id}</td>
                        <td
                          style={{ fontWeight: 600, color: '#2563eb', cursor: 'pointer', transition: 'all 0.15s ease', minWidth: '220px' }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                          onClick={() => handleOpenBookByTitleOrId(r.bookTitle, r.bookId)}
                          title={`Xem chi tiết sách: ${r.bookTitle}`}
                        >
                          {r.bookTitle}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.borrowType || 'Mượn về nhà'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.borrowDate ? r.borrowDate.substring(0, 10) : '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.returnDate ? r.returnDate.substring(0, 10) : '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.actualReturnDate ? r.actualReturnDate.substring(0, 10) : '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className={`badge ${
                            r.status === 'Đang mượn' ? 'badge-success' :
                            r.status === 'Chờ duyệt' ? 'badge-warning' :
                            r.status === 'Quá hạn' ? 'badge-danger' :
                            r.status === 'Đã trả' ? 'badge-info' : 'badge-neutral'
                          }`} style={{ whiteSpace: 'nowrap' }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {Number(r.fine_amount || r.fineAmount || 0) > 0 ? (
                            <span style={{
                              display: 'inline-block',
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              padding: '2px 8px',
                              fontSize: '12px',
                              fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}
                            title={`Trễ ${r.overdue_days || r.overdueDays || r.daysOverdue || 0} ngày`}
                            >
                              {Number(r.fine_amount || r.fineAmount).toLocaleString('vi-VN')} đ
                            </span>
                          ) : (
                            <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {r.status === 'Đã trả' ? '✓ Đúng hạn' : '-'}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {['Đang mượn', 'Đã trả', 'Quá hạn'].includes(r.status) ? (
                            <button
                              onClick={() => exportApi.downloadBorrowReceiptPdf(r.id)}
                              style={{
                                padding: '4px 9px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#2563eb',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Tải phiếu xác nhận mượn sách (PDF)"
                            >
                              <Download size={12} /> PDF
                            </button>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ĐẶT TRƯỚC SÁCH (FIFO QUEUE) */}
      {activeTab === 'reservations' && (() => {
        const cleanActiveReservations = myReservations.filter(
          r => r.status !== 'Cancelled' && r.status !== 'Hủy' && r.status !== 'Fulfilled'
        );

        const maxRes = Number(systemSettings?.maxReservations || 3);
        const isQuotaFull = cleanActiveReservations.length >= maxRes;

        // Danh sách sách đặt trước trong hệ thống (Ưu tiên lấy từ CSDL books)
        const upcomingFromDb = (books || []).filter(b => 
          b.isUpcoming || 
          b.status === 'Sắp phát hành' || 
          b.status === 'Sắp có' || 
          b.status === 'Upcoming' || 
          (Number(b.id) >= 51 && b.isUpcoming !== false && b.status !== 'Sẵn sàng' && b.status !== 'Hết sách' && b.status !== 'Bảo trì')
        );
        const allEligibleBooks = (upcomingFromDb.length > 0 ? upcomingFromDb : UPCOMING_BOOKS).map(ub => {
          let relDate = ub.releaseDate;
          if (!relDate && (ub.desc || ub.description)) {
            const match = (ub.desc || ub.description).match(/Dự kiến phát hành:\s*([^).\n]+)/);
            if (match) relDate = match[1].trim();
          }
          return {
            id: ub.id,
            title: ub.title,
            author: ub.author,
            category: ub.category,
            rating: ub.rating || 9.5,
            releaseDate: relDate || ub.releaseDate || '10-2026',
            isUpcoming: true,
            desc: ub.desc || ub.description || '',
            imageUrl: ub.imageUrl || ub.cover
          };
        });

        // Lọc danh sách trong Modal Đặt trước
        const filteredEligibleBooks = allEligibleBooks.filter(item => {
          const matchText = (
            (item.title || '') + ' ' +
            (item.author || '') + ' ' +
            (item.category || '')
          ).toLowerCase().includes(reserveSearch.toLowerCase().trim());

          return matchText;
        });

        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={18} />
                  </div>
                  <h2 style={{ fontFamily: "'Lora', serif", fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Đặt trước sách
                  </h2>
                </div>
                <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
                  Hệ thống quản lý hàng chờ tự động theo thứ tự ưu tiên FIFO. Khi sách được trả về thư viện, độc giả đứng đầu hàng chờ sẽ nhận được thông báo để mượn sách trong vòng 48 giờ.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReserveModalOpen(true)}
                disabled={isReaderLocked || isQuotaFull}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: (isReaderLocked || isQuotaFull)
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                  borderColor: 'transparent',
                  padding: '9px 18px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  boxShadow: (isReaderLocked || isQuotaFull)
                    ? 'none'
                    : '0 4px 12px rgba(234, 88, 12, 0.3)',
                  cursor: (isReaderLocked || isQuotaFull) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title={
                  isReaderLocked
                    ? 'Tài khoản đang bị khóa do sách quá hạn'
                    : isQuotaFull
                    ? `Đã đạt giới hạn tối đa ${maxRes} cuốn sách`
                    : 'Đặt trước sách vào hàng chờ'
                }
              >
                <Plus size={16} /> Đặt trước sách mới
              </button>
            </div>

            {/* Thẻ tóm tắt trạng thái */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              <div className="card" style={{ padding: '16px 20px', margin: 0, borderLeft: '4px solid #3b82f6' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Sách đang đặt trước (Tối đa {maxRes})</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: isQuotaFull ? '#dc2626' : '#1e293b', marginTop: '4px' }}>
                  {cleanActiveReservations.length} / {maxRes}
                </div>
              </div>

              <div className="card" style={{ padding: '16px 20px', margin: 0, borderLeft: '4px solid #f59e0b' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Đang xếp hàng chờ sách về</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
                  {cleanActiveReservations.filter(r => r.status === 'Waiting').length}
                </div>
              </div>

              <div className="card" style={{ padding: '16px 20px', margin: 0, borderLeft: '4px solid #16a34a' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Sách đã về (Sẵn sàng mượn)</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
                  {cleanActiveReservations.filter(r => r.status === 'Ready').length}
                </div>
              </div>
            </div>

            {/* Danh sách bản ghi hàng chờ */}
            {cleanActiveReservations.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '56px 20px' }}>
                <Clock size={48} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: '0 0 6px 0' }}>
                  Hàng chờ hiện đang trống
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '480px', margin: '0 auto 20px auto' }}>
                  Khi bạn tìm kiếm thấy một cuốn sách đang hết bản sao sẵn có hoặc tại mục "Sách sắp có", bạn có thể bấm <strong>"Đặt trước"</strong> để xếp hàng ưu tiên nhận sách sớm nhất.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setReserveModalOpen(true)}
                    disabled={isReaderLocked}
                    className="btn btn-primary"
                    style={{
                      padding: '8px 22px',
                      fontSize: '13px',
                      fontWeight: 700,
                      background: isReaderLocked ? '#94a3b8' : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                      borderColor: 'transparent',
                      boxShadow: isReaderLocked ? 'none' : '0 4px 12px rgba(234, 88, 12, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={16} /> Đặt trước sách ngay
                  </button>
                  <button
                    onClick={() => onTabChange && onTabChange('catalog')}
                    className="btn btn-secondary"
                    style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 600 }}
                  >
                    Khám phá kho sách
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                {cleanActiveReservations.map(res => {
                  const isReady = res.status === 'Ready';
                  const isWaiting = res.status === 'Waiting';
                  const matchedBook = books.find(b => Number(b.id) === Number(res.bookId)) ||
                                      (UPCOMING_BOOKS || []).find(ub => Number(ub.id) === Number(res.bookId));
                  const coverImg = matchedBook?.imageUrl || matchedBook?.cover || matchedBook?.image_url;

                  return (
                    <div
                      key={res.id}
                      className="card"
                      style={{
                        padding: '18px 20px',
                        margin: 0,
                        borderLeft: `4px solid ${isReady ? '#16a34a' : isWaiting ? '#ea580c' : '#94a3b8'}`,
                        background: isReady ? '#f0fdf4' : '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <span className={`badge ${isReady ? 'badge-success' : isWaiting ? 'badge-warning' : 'badge-neutral'}`}>
                            {isReady ? '🎉 Sách đã về kho!' : isWaiting ? `⏳ Hàng chờ #${res.priority || 1}` : res.status}
                          </span>
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Mã #{res.id}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                          <div
                            onClick={() => handleOpenBookByTitleOrId(res.bookTitle, res.bookId)}
                            style={{ cursor: 'pointer', flexShrink: 0 }}
                            title={`Nhấp để xem chi tiết cuốn sách: ${res.bookTitle}`}
                          >
                            {coverImg ? (
                              <img
                                src={coverImg}
                                alt={res.bookTitle}
                                style={{
                                  width: '56px',
                                  height: '78px',
                                  objectFit: 'cover',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                                }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div style={{
                                width: '56px',
                                height: '78px',
                                borderRadius: '6px',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8'
                              }}>
                                <BookOpen size={24} />
                              </div>
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h3
                              style={{
                                fontSize: '15px',
                                fontWeight: 700,
                                color: '#0f172a',
                                margin: '0 0 4px 0',
                                lineHeight: 1.35,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                cursor: 'pointer',
                                transition: 'color 0.15s ease'
                              }}
                              onClick={() => handleOpenBookByTitleOrId(res.bookTitle, res.bookId)}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#0f172a'; }}
                              title={`Nhấp để xem chi tiết cuốn sách: ${res.bookTitle}`}
                            >
                              {res.bookTitle}
                            </h3>
                            {matchedBook?.author && (
                              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Tác giả: {matchedBook.author}
                              </p>
                            )}
                            {matchedBook?.category && (
                              <span style={{ fontSize: '11px', color: '#2563eb', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                {matchedBook.category}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ background: isReady ? '#dcfce7' : '#f8fafc', padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
                          <div>Thời gian đăng ký: <strong>{res.reservedAt ? res.reservedAt.substring(0, 16).replace('T', ' ') : '-'}</strong></div>
                          {isReady && res.expiresAt && (
                            <div style={{ color: '#b91c1c', fontWeight: 700 }}>
                              ⏰ Hạn giữ chỗ ưu tiên: Đến {res.expiresAt.substring(0, 16).replace('T', ' ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                        {isReady ? (
                          <button
                            onClick={() => {
                              const b = books.find(item => Number(item.id) === Number(res.bookId)) || { id: res.bookId, title: res.bookTitle };
                              setBorrowTargetBook(b);
                              setBorrowModalOpen(true);
                            }}
                            className="btn btn-primary"
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              fontSize: '12.5px',
                              padding: '7px 16px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <BookOpen size={14} /> Mượn sách ngay
                          </button>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: '#ea580c', fontWeight: 600 }}>
                            Đang xếp hàng chờ
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCancelReservation(res.id)}
                          className="btn btn-reject btn-table-action"
                          title="Hủy đặt trước cuốn sách này"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                        >
                          <X size={14} /> Hủy đặt
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* QuickReserveModal: Modal chọn và đặt trước sách trực tiếp */}
            {reserveModalOpen && typeof document !== 'undefined' && createPortal(
              <div
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 999999,
                  padding: '20px',
                  boxSizing: 'border-box'
                }}
                onClick={() => setReserveModalOpen(false)}
              >
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '820px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    overflow: 'hidden',
                    margin: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={20} style={{ color: '#ea580c' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Đặt trước sách
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReserveModalOpen(false)}
                      style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Quota Banner */}
                  <div style={{ padding: '10px 24px', background: isQuotaFull ? '#fef2f2' : '#eff6ff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12.5px' }}>
                    <span style={{ color: isQuotaFull ? '#b91c1c' : '#1d4ed8', fontWeight: 600 }}>
                      Hạn mức của bạn: <strong>{cleanActiveReservations.length}/{maxRes} cuốn</strong>
                    </span>
                    {isQuotaFull && (
                      <span style={{ color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={14} /> Bạn đã đạt tối đa hạn mức đặt trước
                      </span>
                    )}
                  </div>

                  {/* Search and Filters */}
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', background: '#ffffff' }}>
                    <div>
                      <button
                        type="button"
                        onClick={() => setReserveSearch('')}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          border: '1px solid #ea580c',
                          background: '#fff7ed',
                          color: '#ea580c',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Tất cả ({allEligibleBooks.length})
                      </button>
                    </div>

                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Tìm theo tên sách, tác giả, thể loại..."
                        value={reserveSearch}
                        onChange={(e) => setReserveSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 36px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Books List Grid */}
                  <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, maxHeight: 'calc(90vh - 240px)' }}>
                    {filteredEligibleBooks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                        <BookOpen size={40} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                        <p style={{ margin: 0, fontSize: '13.5px' }}>Không tìm thấy cuốn sách nào phù hợp điều kiện đặt trước.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                        {filteredEligibleBooks.map((item) => {
                          const isAlreadyReserved = cleanActiveReservations.some(
                            r => Number(r.bookId) === Number(item.id)
                          );

                          return (
                            <div
                              key={item.id}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: '10px',
                                padding: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                background: isAlreadyReserved ? '#f8fafc' : '#ffffff',
                                transition: 'all 0.2s ease',
                                position: 'relative'
                              }}
                            >
                              <div>
                                <div
                                  onClick={() => handleOpenBookByTitleOrId(item.title, item.id)}
                                  style={{
                                    height: '140px',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    background: '#f1f5f9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '10px',
                                    position: 'relative',
                                    cursor: 'pointer'
                                  }}
                                  title={`Xem chi tiết ấn phẩm: ${item.title}`}
                                >
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.title}
                                      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <BookOpen size={36} style={{ color: '#cbd5e1' }} />
                                  )}

                                  <div style={{
                                    position: 'absolute',
                                    top: '6px',
                                    right: '6px',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    background: item.isUpcoming ? 'rgba(37, 99, 235, 0.92)' : 'rgba(239, 68, 68, 0.92)',
                                    color: '#ffffff'
                                  }}>
                                    {item.isUpcoming ? 'Sắp phát hành' : 'Hết sách'}
                                  </div>
                                </div>

                                <h4
                                  style={{
                                    fontSize: '13.5px',
                                    fontWeight: 700,
                                    color: '#0f172a',
                                    margin: '0 0 3px 0',
                                    lineHeight: 1.35,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    cursor: 'pointer',
                                    transition: 'color 0.15s ease'
                                  }}
                                  onClick={() => handleOpenBookByTitleOrId(item.title, item.id)}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = '#0f172a'; }}
                                  title={`Xem chi tiết ấn phẩm: ${item.title}`}
                                >
                                  {item.title}
                                </h4>

                                <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 6px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.author || 'Chưa rõ tác giả'}
                                </p>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                                  <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                                    {item.category || 'Manga'}
                                  </span>
                                  {item.releaseDate && (
                                    <span style={{ color: '#2563eb', fontWeight: 600 }}>
                                      Dự kiến: {item.releaseDate}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenBookByTitleOrId(item.title, item.id)}
                                  style={{
                                    padding: '7px 9px',
                                    borderRadius: '6px',
                                    border: '1px solid #bfdbfe',
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                                  title="Xem chi tiết cuốn sách này"
                                >
                                  Chi tiết
                                </button>
                                {isAlreadyReserved ? (
                                  <button
                                    disabled
                                    style={{
                                      flex: 1,
                                      padding: '7px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #bbf7d0',
                                      background: '#f0fdf4',
                                      color: '#16a34a',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px',
                                      cursor: 'default'
                                    }}
                                  >
                                    <Check size={13} /> Đã đặt
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleCreateReservation(item)}
                                    disabled={isReaderLocked || isQuotaFull}
                                    style={{
                                      flex: 1,
                                      padding: '7px 8px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: (isReaderLocked || isQuotaFull)
                                        ? '#94a3b8'
                                        : item.isUpcoming
                                        ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                                        : 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                                      color: '#ffffff',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px',
                                      cursor: (isReaderLocked || isQuotaFull) ? 'not-allowed' : 'pointer',
                                      boxShadow: (isReaderLocked || isQuotaFull) ? 'none' : '0 2px 6px rgba(0,0,0,0.12)'
                                    }}
                                  >
                                    <Clock size={13} /> Đặt trước
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                    <button
                      type="button"
                      onClick={() => setReserveModalOpen(false)}
                      className="btn btn-secondary"
                      style={{ fontSize: '13px', padding: '7px 18px' }}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        );
      })()}

      {/* Modals */}
      <BookDetailModal
        book={selectedBook}
        isOpen={detailModalOpen}
        onClose={() => { setDetailModalOpen(false); setSelectedBook(null); }}
        onBorrow={handleOpenBorrowModal}
        onReserve={handleCreateReservation}
        onCancelReserve={(b) => handleCancelReservationForBook(b.id)}
        activeReservationCount={myReservations.filter(r => r.status !== 'Cancelled' && r.status !== 'Hủy' && r.status !== 'Fulfilled').length}
        isAdmin={false}
        isUserLocked={isReaderLocked}
      />

      <BorrowModal
        book={borrowTargetBook}
        isOpen={borrowModalOpen}
        onClose={() => { setBorrowModalOpen(false); setBorrowTargetBook(null); }}
        onConfirm={handleBorrowRequest}
        onReserve={handleCreateReservation}
        isAdmin={false}
      />

      <VNPayPaymentModal
        isOpen={vnpayModalOpen}
        onClose={() => setVnpayModalOpen(false)}
        fine={selectedFineForPayment || (unpaidFinesList.length > 0 ? unpaidFinesList[0] : {
          id: overdueBorrows[0]?.id || 1,
          borrowRecordId: overdueBorrows[0]?.id || 1,
          bookTitle: overdueBorrows[0]?.bookTitle || 'Phí phạt trễ hạn mượn sách',
          fineAmount: totalUnpaidFineAmount || 10000
        })}
        readerId={user?.id || 2}
        amount={totalUnpaidFineAmount || 10000}
        onSuccess={handleVNPaySuccess}
        onPaymentSuccess={handleVNPaySuccess}
      />

      {/* MODAL XUẤT TRÌNH MÃ QR TRẢ SÁCH TẠI QUẦY (ĐỘC GIẢ) */}
      {qrReturnRecord && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => setQrReturnRecord(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '28px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
              margin: 'auto',
              position: 'relative',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nút đóng */}
            <button
              type="button"
              onClick={() => setQrReturnRecord(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>

            {/* Icon & Title */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#eef2ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto',
                color: '#4f46e5'
              }}
            >
              <QrCode size={24} />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
              Mã QR Trả Sách Tại Quầy
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Vui lòng xuất trình mã này cho Thủ thư khi mang sách đến quầy trả
            </p>

            {/* Khung hiển thị QR code */}
            <div
              style={{
                background: '#f8fafc',
                border: '2px dashed #cbd5e1',
                borderRadius: '16px',
                padding: '16px',
                display: 'inline-block',
                margin: '0 auto 16px auto'
              }}
            >
              {qrReturnDataUrl ? (
                <img
                  src={qrReturnDataUrl}
                  alt={`Mã QR Phiếu #${qrReturnRecord.id}`}
                  style={{ width: '180px', height: '180px', display: 'block', margin: '0 auto' }}
                />
              ) : (
                <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <QrCode size={48} color="#94a3b8" />
                </div>
              )}
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', display: 'block', marginTop: '8px' }}>
                MÃ PHIẾU: #{qrReturnRecord.id}
              </span>
            </div>

            {/* Thông tin phiếu */}
            <div
              style={{
                background: '#f1f5f9',
                borderRadius: '10px',
                padding: '12px 14px',
                textAlign: 'left',
                fontSize: '13px',
                marginBottom: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <div><strong>Sách:</strong> <span style={{ color: '#2563eb', fontWeight: 600 }}>{qrReturnRecord.bookTitle}</span></div>
              <div><strong>Người mượn:</strong> <span>{qrReturnRecord.readerName || user?.fullName}</span></div>
              <div><strong>Hạn trả:</strong> <span style={{ color: qrReturnRecord.status === 'Quá hạn' ? '#dc2626' : '#0f172a', fontWeight: qrReturnRecord.status === 'Quá hạn' ? 700 : 400 }}>{(qrReturnRecord.returnDate || qrReturnRecord.dueDate || '').substring(0, 10)}</span></div>
            </div>

            {/* Lưu ý nghiệp vụ */}
            <div
              style={{
                fontSize: '12px',
                color: '#b45309',
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '8px 12px',
                lineHeight: 1.4,
                marginBottom: '16px',
                textAlign: 'left'
              }}
            >
              ⚠️ <strong>Lưu ý:</strong> Để đảm bảo kiểm kê sách vật lý, độc giả không thể tự xác nhận trả sách từ xa. Thủ thư sẽ quét mã này để hoàn tất nhận sách vào kho.
            </div>

            {/* Các nút tải */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              {qrReturnDataUrl && (
                <a
                  href={qrReturnDataUrl}
                  download={`SmartLib_Phieu_${qrReturnRecord.id}_QR.png`}
                  className="btn btn-outline"
                  style={{
                    fontSize: '12.5px',
                    padding: '8px 14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    textDecoration: 'none'
                  }}
                >
                  <Download size={13} /> Tải ảnh QR
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  exportApi.downloadBorrowReceiptPdf(qrReturnRecord.id);
                }}
                className="btn btn-primary"
                style={{
                  fontSize: '12.5px',
                  padding: '8px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileText size={13} /> Tải phiếu PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Gia hạn mượn sách */}
      {renewRecord && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => !isRenewing && setRenewRecord(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px 28px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'left',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <Clock size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Gia hạn mượn sách
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Phiếu #{renewRecord.id} • {renewRecord.bookTitle}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenewRecord(null)}
                disabled={isRenewing}
                style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Thông tin hạn trả hiện tại & hạn trả mới tính toán */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>Hạn trả hiện tại:</span>
                <strong style={{ color: '#0f172a' }}>
                  {renewRecord.returnDate ? renewRecord.returnDate.substring(0, 10) : (renewRecord.dueDate ? renewRecord.dueDate.substring(0, 10) : '2026-09-30')}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 700 }}>
                <span>Dự kiến hạn trả mới (nếu được duyệt):</span>
                <span>
                  {renewTargetDate ? (() => {
                    const baseStr = renewRecord.returnDate || renewRecord.dueDate;
                    let baseDate = new Date();
                    if (baseStr) { const p = new Date(baseStr); if (!isNaN(p.getTime())) baseDate = p; }
                    const target = new Date(renewTargetDate);
                    target.setHours(0, 0, 0, 0);
                    baseDate.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((target - baseDate) / (1000 * 60 * 60 * 24));
                    if (diffDays < 1) return <span style={{ color: '#ef4444' }}>Ngày không hợp lệ</span>;
                    return `${renewTargetDate} (+${diffDays} ngày)`;
                  })() : <span style={{ color: '#94a3b8' }}>Chưa chọn ngày</span>}
                </span>
              </div>
            </div>

            {/* Chọn ngày hạn trả mới */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                📅 Chọn ngày hạn trả mới *
              </label>
              <input
                type="date"
                value={renewTargetDate}
                min={(() => {
                  const baseStr = renewRecord.returnDate || renewRecord.dueDate;
                  let base = new Date();
                  if (baseStr) { const p = new Date(baseStr); if (!isNaN(p.getTime())) base = p; }
                  base.setDate(base.getDate() + 1);
                  return base.toISOString().substring(0, 10);
                })()}
                max={(() => {
                  const baseStr = renewRecord.returnDate || renewRecord.dueDate;
                  let base = new Date();
                  if (baseStr) { const p = new Date(baseStr); if (!isNaN(p.getTime())) base = p; }
                  base.setDate(base.getDate() + 20);
                  return base.toISOString().substring(0, 10);
                })()}
                onChange={(e) => setRenewTargetDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1.5px solid ${renewTargetDate ? '#2563eb' : '#cbd5e1'}`,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
                autoFocus
              />
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                Tối đa 20 ngày tính từ hạn trả hiện tại.
              </div>
            </div>


            {/* Ghi chú / Lý do gia hạn (tùy chọn) */}
            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Ghi chú / Lý do gia hạn (tùy chọn)
              </label>
              <input
                type="text"
                value={renewNotes}
                onChange={(e) => setRenewNotes(e.target.value)}
                placeholder="Ví dụ: Cần thêm thời gian nghiên cứu tài liệu..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} color="#ea580c" />
                <span>Yêu cầu gia hạn sẽ được gửi đến Thủ thư / Quản trị viên để xét duyệt.</span>
              </div>
            </div>

            {/* Nút hành động */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRenewRecord(null)}
                disabled={isRenewing}
                className="btn btn-outline"
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmRenew}
                disabled={isRenewing}
                className="btn btn-primary"
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isRenewing ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu gia hạn'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notification khi Trả sách thành công */}
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
            zIndex: 10000
          }}
        >
          <CheckCircle size={18} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
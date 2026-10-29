import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { api } from './services/api';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import ReaderPortal from './pages/ReaderPortal';
import ProfilePage from './pages/ProfilePage';
import ExportReportModal from './components/ExportReportModal';
import SearchModal from './components/SearchModal';
import BookDetailModal from './components/BookDetailModal';
import BorrowModal from './components/BorrowModal';
import Footer from './components/Footer';
import AIChatWidget from './components/AIChatWidget';

export default function App() {
  const { isAuthenticated, role, user } = useAuth();
  const [adminTab, setAdminTab] = useState('dashboard'); // 'dashboard' | 'books' | 'pre-orders' | 'readers' | 'settings' | 'profile'
  const [readerTab, setReaderTab] = useState('catalog'); // 'catalog' | 'active-borrows' | 'history' | 'profile'
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Global books state for search & modals (Instant 0ms initial render from cache)
  const [books, setBooks] = useState(() => (api.getCachedBooks ? api.getCachedBooks() : []));
  const [selectedBook, setSelectedBook] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [borrowTargetBook, setBorrowTargetBook] = useState(null);

  const loadBooks = async () => {
    try {
      const data = await api.getBooks();
      setBooks(data);
    } catch (e) {
      console.error('Error loading books:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadBooks();
      const handleDataUpdate = () => loadBooks();
      window.addEventListener('smartlib:data-updated', handleDataUpdate);
      return () => window.removeEventListener('smartlib:data-updated', handleDataUpdate);
    }
  }, [isAuthenticated]);

  // 🚀 Tự động nhận diện mã QR quét sách từ Camera: /?bookId=...
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qBookId = params.get('bookId');
    if (qBookId) {
      sessionStorage.setItem('pending_qr_book_id', qBookId);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && books && books.length > 0) {
      const pendingId = sessionStorage.getItem('pending_qr_book_id');
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('bookId') || pendingId;
      if (targetId) {
        const found = books.find(b => Number(b.id) === Number(targetId));
        if (found) {
          setSelectedBook(found);
          setDetailModalOpen(true);
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('bookId');
            window.history.replaceState({}, '', url.pathname);
          } catch (e) {}
        }
      }
    }

    const handleCustomOpenBook = (e) => {
      const bId = e.detail?.bookId;
      if (bId && books && books.length > 0) {
        const found = books.find(b => Number(b.id) === Number(bId));
        if (found) {
          setSelectedBook(found);
          setDetailModalOpen(true);
        }
      }
    };
    window.addEventListener('smartlib:open-book-detail', handleCustomOpenBook);
    return () => window.removeEventListener('smartlib:open-book-detail', handleCustomOpenBook);
  }, [isAuthenticated, books]);

  // Keyboard shortcut '/' to trigger search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && !searchModalOpen && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchModalOpen]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const isStaff = role === 'Admin' || role === 'Librarian';
  const activeTab = isStaff ? adminTab : readerTab;
  const handleTabChange = (newTab) => {
    if (isStaff) {
      setAdminTab(newTab);
    } else {
      setReaderTab(newTab);
    }
  };

  const handleBorrowRequest = async (formData) => {
    try {
      await api.createBorrowRecord(formData);
      loadBooks();
    } catch (e) {
      console.error('Lỗi mượn sách App:', e);
      throw e;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#f8fafc',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* 1. Menu-Nav nằm dọc ở phía bên trái (Sidebar) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenSearch={() => {
          loadBooks();
          setSearchModalOpen(true);
        }}
        onOpenExport={() => setExportModalOpen(true)}
      />

      {/* 2. Main Content Area */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff'
        }}
      >
        {activeTab === 'profile' ? (
          <ProfilePage onBack={() => handleTabChange(isStaff ? 'dashboard' : 'catalog')} />
        ) : isStaff ? (
          <AdminDashboard
            activeTab={adminTab}
            onTabChange={setAdminTab}
            isLibrarian={role === 'Librarian'}
          />
        ) : (
          <ReaderPortal
            activeTab={readerTab}
            onTabChange={setReaderTab}
          />
        )}


        {/* Footer chỉ hiển thị trong phần Kho sách */}
        {activeTab === 'catalog' && <Footer />}
      </main>

      {/* 3. Global Search Modal (Đề xuất 7-8 cuốn sách & Lọc ký tự tức thì) */}
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        books={books}
        onSelectBook={(book) => {
          setSelectedBook(book);
          setDetailModalOpen(true);
        }}
        onBorrowBook={(book) => {
          setBorrowTargetBook(book);
          setBorrowModalOpen(true);
        }}
        isAdmin={role === 'Admin'}
      />

      {/* 4. Book Detail Modal */}
      <BookDetailModal
        book={selectedBook}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedBook(null);
        }}
        onBorrow={(book) => {
          setBorrowTargetBook(book);
          setBorrowModalOpen(true);
        }}
        onReserve={async (book) => {
          try {
            const uid = user?.id;
            if (!uid) { console.error('Chưa đăng nhập'); return; }
            await api.createReservation({
              bookId: book.id,
              readerId: uid,
              bookTitle: book.title
            });
            window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
          } catch (e) {
            console.error('Error reserving from global modal:', e);
          }
        }}
        onCancelReserve={async (book) => {
          try {
            const uid = user?.id;
            if (!uid) { console.error('Chưa đăng nhập'); return; }
            const list = await api.getReservations(uid);
            const target = (list || []).find(r => Number(r.bookId) === Number(book.id) && r.status !== 'Cancelled' && r.status !== 'Hủy');
            if (target) await api.cancelReservation(target.id);
            window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
          } catch (e) {
            console.error('Error cancelling reservation from global modal:', e);
          }
        }}
        isAdmin={role === 'Admin'}
      />

      {/* 5. Borrow Modal */}
      <BorrowModal
        book={borrowTargetBook}
        isOpen={borrowModalOpen}
        onClose={() => {
          setBorrowModalOpen(false);
          setBorrowTargetBook(null);
        }}
        onConfirm={handleBorrowRequest}
        isAdmin={role === 'Admin'}
      />

      {/* 6. Export Modal */}
      <ExportReportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />

      {/* 7. Trợ lý AI Hỏi đáp ở góc bên phải phía dưới cho độc giả */}
      {role === 'Reader' && <AIChatWidget books={books} />}
    </div>
  );
}
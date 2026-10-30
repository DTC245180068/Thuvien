import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import NotificationDropdown from './NotificationDropdown';
import { BookOpen, MessageSquare, User, LogOut, FileSpreadsheet, ChevronDown } from 'lucide-react';

export default function Header({ activeTab, onTabChange, onOpenExport }) {
  const { user, role, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const isAdmin = role === 'Admin';
  const displayName = isAdmin 
    ? (user?.fullName || user?.FullName || 'Quản trị viên') 
    : (user?.fullName && user.fullName !== 'Độc giả' 
        ? user.fullName 
        : (user?.username === 'reader' ? 'Trần Thị Mai' : (user?.fullName || user?.username || 'Trần Thị Mai')));

  const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : (isAdmin ? 'Q' : 'T');

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header>
      <div className="header-brand" onClick={() => onTabChange('catalog')}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <BookOpen size={18} />
        </div>
        <span>SmartLib {role === 'Admin' ? 'Admin' : ''}</span>
      </div>

      <nav className="nav-menu">
        {role === 'Admin' || role === 'Librarian' ? (
          <>
            <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => onTabChange('dashboard')}>
              Thống kê & Mượn trả
            </div>
            <div className={`nav-item ${activeTab === 'books' ? 'active' : ''}`} onClick={() => onTabChange('books')}>
              Quản lý Kho sách
            </div>
            <div className={`nav-item ${activeTab === 'pre-orders' ? 'active' : ''}`} onClick={() => onTabChange('pre-orders')}>
              Sách đặt trước
            </div>
            <div className={`nav-item ${activeTab === 'readers' ? 'active' : ''}`} onClick={() => onTabChange('readers')}>
              Quản lý Độc giả
            </div>
          </>
        ) : (
          <>
            <div className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => onTabChange('catalog')}>
              Tra cứu sách
            </div>
            <div className={`nav-item ${activeTab === 'active-borrows' ? 'active' : ''}`} onClick={() => onTabChange('active-borrows')}>
              Sách đang mượn
            </div>
            <div className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => onTabChange('history')}>
              Lịch sử mượn trả
            </div>
          </>
        )}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Nút sinh / xuất file báo cáo */}
        {role === 'Admin' && (
          <button
            onClick={onOpenExport}
            className="btn btn-outline"
            style={{ padding: '6px 12px', fontSize: '13px', background: '#f8fafc' }}
            title="Xuất dữ liệu & Sinh file"
          >
            <FileSpreadsheet size={16} className="text-blue-600" />
            <span style={{ display: 'none', md: 'inline' }}>Xuất File</span>
          </button>
        )}

        {/* Nút thông báo chat bubble */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: '1px solid #f1f5f9',
              background: showNotifs ? '#eff6ff' : '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: showNotifs ? '#2563eb' : '#475569',
              transition: 'all 0.2s',
              position: 'relative'
            }}
            title="Thông báo hệ thống"
          >
            <MessageSquare size={17} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#f59e0b',
                  border: '2px solid #ffffff'
                }}
              />
            )}
          </button>
          <NotificationDropdown isOpen={showNotifs} onClose={() => setShowNotifs(false)} align="right" />
        </div>

        {/* User Profile Menu */}
        <div ref={userMenuRef} style={{ position: 'relative' }}>
          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                background: '#2563eb',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: 'white'
              }}
            >
              {initial}
            </div>
            <span style={{ fontSize: '13px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
            <ChevronDown size={14} style={{ color: '#64748b' }} />
          </div>

          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '190px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                padding: '6px',
                zIndex: 1000
              }}
            >
              <div
                onClick={() => {
                  setShowUserMenu(false);
                  onTabChange('profile');
                }}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <User size={15} />
                <span>Trang cá nhân</span>
              </div>
              <div
                onClick={logout}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  borderTop: '1px solid #f1f5f9',
                  marginTop: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <LogOut size={15} />
                <span>Đăng xuất</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
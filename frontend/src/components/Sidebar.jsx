import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import NotificationDropdown from './NotificationDropdown';
import {
  BookOpen, BookmarkCheck, History, Settings, LogOut,
  LayoutDashboard, Users, FileSpreadsheet, MessageSquare, Clock,
  SlidersHorizontal, User
} from 'lucide-react';



function NavItem({ active, onClick, icon, label }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '9px 12px',
        borderRadius: '8px',
        fontSize: '13.5px',
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        background: active ? '#eff6ff' : 'transparent',
        color: active ? '#1d4ed8' : '#475569',
        borderLeft: active ? '3px solid #2563eb' : '3px solid transparent'
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = '#f8fafc';
          e.currentTarget.style.color = '#0f172a';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#475569';
        }
      }}
    >
      <span style={{ color: active ? '#2563eb' : '#64748b', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function Sidebar({ activeTab, onTabChange, onOpenSearch, onOpenExport }) {
  const { user, role, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [showNotifs, setShowNotifs] = useState(false);

  const isAdmin = role === 'Admin';
  const isLibrarian = role === 'Librarian';
  const isStaff = isAdmin || isLibrarian;

  const displayName = isAdmin 
    ? (user?.fullName || user?.FullName || 'Quản trị viên') 
    : isLibrarian
      ? (user?.fullName || user?.FullName || 'Thủ thư Nguyễn Văn Hưng')
      : (user?.fullName && user.fullName !== 'Độc giả' 
          ? user.fullName 
          : (user?.username === 'reader' ? 'Trần Thị Mai' : (user?.fullName || user?.username || 'Trần Thị Mai')));

  const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : (isAdmin ? 'Q' : isLibrarian ? 'H' : 'T');


  return (
    <aside
      style={{
        width: '240px',
        minWidth: '240px',
        background: '#ffffff',
        borderRight: '1px solid #eef2f6',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '18px 14px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 50
      }}
    >
      {/* Top Section */}
      <div>
        {/* Header Bar: Brand Logo on Left + Notification Button on Right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '14px',
            borderBottom: '1px solid #f1f5f9',
            marginBottom: '14px'
          }}
        >
          {/* Logo & Brand */}
          <div
            onClick={() => onTabChange(isAdmin ? 'dashboard' : 'catalog')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer'
            }}
            title={isAdmin ? "Về Bảng điều khiển" : "Trang chủ kho sách"}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 5px rgba(37, 99, 235, 0.25)',
                flexShrink: 0
              }}
            >
              <BookOpen size={17} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px', lineHeight: 1.2 }}>
                SmartLib
              </div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#94a3b8' }}>
                {isAdmin ? 'Quản trị viên' : isLibrarian ? 'Nghiệp vụ Thủ thư' : 'Thư viện số'}
              </div>
            </div>
          </div>

          {/* Notification Chat Bubble */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '1px solid #e2e8f0',
                background: showNotifs ? '#eff6ff' : '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: showNotifs ? '#2563eb' : '#475569',
                transition: 'all 0.15s ease',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eff6ff';
                e.currentTarget.style.color = '#2563eb';
                e.currentTarget.style.borderColor = '#bfdbfe';
              }}
              onMouseLeave={(e) => {
                if (!showNotifs) {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#475569';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }
              }}
              title="Thông báo hệ thống"
            >
              <MessageSquare size={15} strokeWidth={2} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-1px',
                    right: '-1px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#f59e0b',
                    border: '2px solid #ffffff',
                    pointerEvents: 'none'
                  }}
                />
              )}
            </button>
            <NotificationDropdown isOpen={showNotifs} onClose={() => setShowNotifs(false)} />
          </div>
        </div>

        {/* Compact User Info Pill */}
        <div
          onClick={() => onTabChange('profile')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 10px',
            borderRadius: '10px',
            background: activeTab === 'profile' ? '#eff6ff' : '#f8fafc',
            border: activeTab === 'profile' ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
            marginBottom: '16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== 'profile') {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'profile') {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#f1f5f9';
            }
          }}
          title="Xem hồ sơ cá nhân"
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '13px',
              flexShrink: 0
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#2563eb', letterSpacing: '0.02em' }}>
              {isAdmin ? 'Quản trị viên' : isLibrarian ? 'Thủ thư' : (user ? `DG-${String(user.id === 2 ? 1 : (user.id || 1)).padStart(3, '0')}` : 'DG-001')}
            </div>
          </div>
        </div>

        {/* Menu Section Header */}
        <div
          style={{
            fontSize: '10.5px',
            fontWeight: 700,
            color: '#94a3b8',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            paddingLeft: '8px',
            marginBottom: '6px'
          }}
        >
          {isStaff ? (isAdmin ? 'Quản trị hệ thống' : 'Nghiệp vụ Thủ thư') : 'Danh mục'}
        </div>

        {/* Navigation Menu Links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {!isStaff ? (
            /* READER NAVIGATION ITEMS */
            <>
              <NavItem
                active={activeTab === 'catalog'}
                onClick={() => onTabChange('catalog')}
                icon={<BookOpen size={17} strokeWidth={2} />}
                label="Kho sách"
              />
              <NavItem
                active={activeTab === 'active-borrows'}
                onClick={() => onTabChange('active-borrows')}
                icon={<BookmarkCheck size={17} strokeWidth={2} />}
                label="Sách đang mượn"
              />
              <NavItem
                active={activeTab === 'history'}
                onClick={() => onTabChange('history')}
                icon={<History size={17} strokeWidth={2} />}
                label="Lịch sử mượn trả"
              />
              <NavItem
                active={activeTab === 'reservations'}
                onClick={() => onTabChange('reservations')}
                icon={<Clock size={17} strokeWidth={2} />}
                label="Đặt trước sách"
              />
            </>
          ) : (
            /* STAFF (ADMIN & LIBRARIAN) NAVIGATION ITEMS */
            <>
              <NavItem
                active={activeTab === 'dashboard'}
                onClick={() => onTabChange('dashboard')}
                icon={<LayoutDashboard size={17} strokeWidth={2} />}
                label="Thống kê & Mượn trả"
              />
              <NavItem
                active={activeTab === 'books'}
                onClick={() => onTabChange('books')}
                icon={<BookOpen size={17} strokeWidth={2} />}
                label="Quản lý Kho sách"
              />
              <NavItem
                active={activeTab === 'pre-orders'}
                onClick={() => onTabChange('pre-orders')}
                icon={<Clock size={17} strokeWidth={2} />}
                label="Sách đặt trước"
              />
              <NavItem
                active={activeTab === 'readers'}
                onClick={() => onTabChange('readers')}
                icon={<Users size={17} strokeWidth={2} />}
                label="Quản lý Độc giả"
              />
              {isAdmin && (
                <NavItem
                  active={activeTab === 'settings'}
                  onClick={() => onTabChange('settings')}
                  icon={<SlidersHorizontal size={17} strokeWidth={2} />}
                  label="Cài đặt hệ thống"
                />
              )}


              <div
                onClick={onOpenExport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#2563eb',
                  background: '#eff6ff',
                  border: '1px solid #dbeafe',
                  marginTop: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
              >
                <FileSpreadsheet size={16} strokeWidth={2} />
                <span>Xuất file Báo cáo</span>
              </div>
            </>
          )}
        </nav>
      </div>

      {/* Bottom Section (Settings & Logout) */}
      <div style={{ paddingTop: '12px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem
          active={activeTab === 'profile'}
          onClick={() => onTabChange('profile')}
          icon={<User size={17} strokeWidth={2} />}
          label="Hồ sơ"
        />


        <div
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '11px',
            padding: '9px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            color: '#ef4444',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fef2f2';
            e.currentTarget.style.color = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#ef4444';
          }}
        >
          <LogOut size={17} strokeWidth={2} />
          <span>Đăng xuất</span>
        </div>
      </div>
    </aside>
  );
}
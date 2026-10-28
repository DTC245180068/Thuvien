import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext();

export const DEFAULT_ADMIN = {
  id: 1,
  UserID: 1,
  username: 'admin',
  role: 'Admin',
  Role: 'Admin',
  fullName: 'Quản trị viên',
  FullName: 'Quản trị viên',
  email: 'admin@smartlib.edu.vn',
  phone: '0987 654 321',
  address: 'Phòng Quản lý Thư viện, ĐHQG Hà Nội',
  birthDate: '1990-01-01'
};

export const DEFAULT_READER = {
  id: 2,
  UserID: 2,
  username: 'reader',
  role: 'Reader',
  Role: 'Reader',
  fullName: 'Trần Thị Mai',
  FullName: 'Trần Thị Mai',
  email: 'mai.tran@smartlib.edu.vn',
  phone: '0901 234 567',
  address: 'Khu KTX Sinh viên Mễ Trì, Thanh Xuân, Hà Nội',
  birthDate: '2002-10-20'
};

export const DEFAULT_LIBRARIAN = {
  id: 3,
  UserID: 3,
  username: 'librarian',
  role: 'Librarian',
  Role: 'Librarian',
  fullName: 'Thủ thư Nguyễn Văn Hưng',
  FullName: 'Thủ thư Nguyễn Văn Hưng',
  email: 'librarian@smartlib.edu.vn',
  phone: '0912 888 999',
  address: 'Bộ phận Nghiệp vụ Thư viện, ĐHQG Hà Nội',
  birthDate: '1995-05-12'
};

const normalizeUser = (loaded, loadedRole) => {
  if (!loaded) return null;

  // 1. Quản trị viên (Admin)
  const isAdm = loadedRole === 'Admin' || loaded.role === 'Admin' || loaded.Role === 'Admin' || loaded.username === 'admin';
  if (isAdm) {
    const adminUser = {
      ...DEFAULT_ADMIN,
      ...loaded,
      id: 1,
      UserID: 1,
      username: 'admin',
      role: 'Admin',
      Role: 'Admin'
    };
    if (adminUser.fullName === 'Trần Thị Mai' || adminUser.fullName === 'Độc giả') {
      adminUser.fullName = 'Quản trị viên';
      adminUser.FullName = 'Quản trị viên';
    }
    if (adminUser.email && adminUser.email.includes('mai.tran')) {
      adminUser.email = 'admin@smartlib.edu.vn';
    }
    if (adminUser.phone === '0901 234 567') {
      adminUser.phone = '0987 654 321';
    }
    if (adminUser.address && adminUser.address.includes('Mễ Trì')) {
      adminUser.address = 'Phòng Quản lý Thư viện, ĐHQG Hà Nội';
    }
    if (adminUser.birthDate === '2002-10-20') {
      adminUser.birthDate = '1990-01-01';
    }
    return adminUser;
  }

  // 2. Thủ thư (Librarian)
  const isLibrarian = loadedRole === 'Librarian' || loaded.role === 'Librarian' || loaded.Role === 'Librarian' || loaded.username === 'librarian' || loaded.username === 'thuthu';
  if (isLibrarian) {
    const librarianUser = {
      ...DEFAULT_LIBRARIAN,
      ...loaded,
      id: 3,
      UserID: 3,
      username: 'librarian',
      role: 'Librarian',
      Role: 'Librarian'
    };
    return librarianUser;
  }

  // 3. Độc giả (Reader)
  const readerUser = {
    ...DEFAULT_READER,
    ...loaded,
    id: loaded.id && Number(loaded.id) !== 1 && Number(loaded.id) !== 3 ? Number(loaded.id) : (loaded.id || 2),
    UserID: loaded.id && Number(loaded.id) !== 1 && Number(loaded.id) !== 3 ? Number(loaded.id) : (loaded.id || 2),
    username: loaded.username === 'admin' ? 'reader' : (loaded.username || 'reader'),
    role: 'Reader',
    Role: 'Reader'
  };
  // Chỉ dùng fallback demo cho tài khoản mẫu reader hoặc id 2
  if ((readerUser.username === 'reader' || Number(readerUser.id) === 2) && (!readerUser.fullName || readerUser.fullName === 'Độc giả')) {
    readerUser.fullName = 'Trần Thị Mai';
    readerUser.FullName = 'Trần Thị Mai';
  }
  return readerUser;
};


export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      let loaded = null;
      let loadedRole = null;
      if (typeof window !== 'undefined' && window.location.hostname.includes('github.io')) {
        const sessionUser = sessionStorage.getItem('currentUser');
        loaded = sessionUser ? JSON.parse(sessionUser) : null;
        loadedRole = sessionStorage.getItem('currentUserRole');
      } else {
        const saved = localStorage.getItem('currentUser');
        loaded = saved ? JSON.parse(saved) : null;
        loadedRole = localStorage.getItem('currentUserRole');
      }
      return normalizeUser(loaded, loadedRole);
    } catch {
      return null;
    }
  });

  const [role, setRole] = useState(() => {
    if (!user) return null;
    return user.role || user.Role || (user.username === 'admin' ? 'Admin' : 'Reader');
  });

  // Tự động kiểm tra và đồng bộ hai chiều chính xác giữa user và role
  useEffect(() => {
    if (user) {
      const actualRole = user.role || user.Role || (user.username === 'admin' ? 'Admin' : 'Reader');
      if (role !== actualRole) {
        setRole(actualRole);
      }
      sessionStorage.setItem('currentUser', JSON.stringify(user));
      sessionStorage.setItem('currentUserRole', actualRole);
      localStorage.setItem('currentUser', JSON.stringify(user));
      localStorage.setItem('currentUserRole', actualRole);
    }
  }, [user, role]);

  const login = async (username, password) => {
    const res = await api.login(username, password);
    if (res && res.user) {
      const uRole = res.user.Role || res.user.role || (res.user.username === 'admin' ? 'Admin' : 'Reader');
      const normalized = normalizeUser(res.user, uRole);
      setUser(normalized);
      setRole(uRole);
      sessionStorage.setItem('currentUser', JSON.stringify(normalized));
      sessionStorage.setItem('currentUserRole', uRole);
      localStorage.setItem('currentUser', JSON.stringify(normalized));
      localStorage.setItem('currentUserRole', uRole);
      if (res && res.token) {
        localStorage.setItem('token', res.token);
        sessionStorage.setItem('token', res.token);
      }
      return normalized;
    }
    throw new Error('Đăng nhập không thành công');
  };

  const register = async (userData) => {
    const res = await api.register(userData);
    if (res && res.user) {
      const normalized = normalizeUser(res.user, 'Reader');
      setUser(normalized);
      setRole('Reader');
      sessionStorage.setItem('currentUser', JSON.stringify(normalized));
      sessionStorage.setItem('currentUserRole', 'Reader');
      localStorage.setItem('currentUser', JSON.stringify(normalized));
      localStorage.setItem('currentUserRole', 'Reader');
      return normalized;
    }
    return res;
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUserRole');
    sessionStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentUserRole');
    localStorage.removeItem('token');
  };

  const updateUser = (updatedData) => {
    const merged = { ...user, ...updatedData };
    const actualRole = merged.role || merged.Role || role || 'Reader';
    const normalized = normalizeUser(merged, actualRole);
    setUser(normalized);
    setRole(actualRole);
    sessionStorage.setItem('currentUser', JSON.stringify(normalized));
    sessionStorage.setItem('currentUserRole', actualRole);
    localStorage.setItem('currentUser', JSON.stringify(normalized));
    localStorage.setItem('currentUserRole', actualRole);
  };

  return (
    <AuthContext.Provider value={{ user, role, login, register, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
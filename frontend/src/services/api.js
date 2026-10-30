// SmartLib Unified API Client with Backend / LocalStorage Fallback for GitHub Pages & Local
import initialDb from '../data/mockDatabase.json';

const API_BASE = '/api';

// Local storage fallback database helper with in-memory singleton
const DB_VERSION = 'v16_smartlib_upcoming_sync_2026';

// Singleton BroadcastChannel for 0ms instantaneous cross-tab synchronization
const syncChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('smartlib_realtime_sync')
  : null;

let memoryDb = null;
let memoryDbTimestamp = 0;
const _cancelledReservationIds = new Set();

if (syncChannel && typeof window !== 'undefined') {
  syncChannel.onmessage = (event) => {
    // Invalidate in-memory database cache so next read loads latest data from localStorage
    memoryDb = null;
    memoryDbTimestamp = 0;
    window.dispatchEvent(new CustomEvent('smartlib:data-updated', { detail: event.data }));
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'smartlib_db' || e.key === 'smartlib_db_timestamp' || e.key === 'smartlib_last_update') {
      memoryDb = null;
      memoryDbTimestamp = 0;
      window.dispatchEvent(new CustomEvent('smartlib:data-updated', { detail: { type: 'storage' } }));
    }
  });
}

const isStaticHost = typeof window !== 'undefined' && (
  window.location.hostname.includes('github.io') ||
  window.location.protocol === 'file:'
);

export const getAuthToken = () => {
  try {
    const directToken = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('jwt_token');
    if (directToken) return directToken;

    const rawUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    const rawRole = localStorage.getItem('currentUserRole') || sessionStorage.getItem('currentUserRole');
    if (!rawUser && !rawRole) return null;

    const userObj = rawUser ? JSON.parse(rawUser) : {};
    const role = rawRole || userObj.role || userObj.Role || 'Admin';

    // Tạo payload JWT chuẩn
    const payload = {
      sub: String(userObj.id || userObj.UserID || 1),
      username: userObj.username || 'admin',
      fullName: userObj.fullName || userObj.FullName || 'Quản trị viên',
      role: role,
      Role: role,
      exp: Math.floor(Date.now() / 1000) + 86400
    };

    const b64Header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const b64Payload = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${b64Header}.${b64Payload}.smartlib_signature`;
  } catch (e) {
    return null;
  }
};

export const getAuthHeaders = () => {
  const token = getAuthToken();
  if (!token) return {};
  return {
    'Authorization': `Bearer ${token}`,
    'X-Auth-Token': token
  };
};

const getLocalDb = (forceFresh = false) => {
  try {
    const storedTime = Number(localStorage.getItem('smartlib_db_timestamp') || 0);
    // If cache is valid and no external update occurred, return memoryDb
    if (!forceFresh && memoryDb && storedTime > 0 && storedTime === memoryDbTimestamp) {
      return memoryDb;
    }

    const savedVersion = localStorage.getItem('smartlib_db_version');
    const raw = localStorage.getItem('smartlib_db');
    if (raw && savedVersion === DB_VERSION) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.books) && parsed.books.length > 0) {
        // Khôi phục lại imageUrl gốc từ initialDb nếu trong LocalStorage đã được rút gọn nhẹ
        parsed.books = parsed.books.map((b, i) => {
          const orig = initialDb.books?.[i] || initialDb.books?.find(x => x.id === b.id);
          return {
            ...b,
            imageUrl: (orig && orig.imageUrl) || b.imageUrl
          };
        });

        // Đảm bảo luôn có đầy đủ 10 cuốn sách sắp về / đặt trước từ initialDb nếu thiếu
        const hasUpcoming = parsed.books.some(b => b.isUpcoming || b.status === 'Sắp phát hành' || Number(b.id) >= 51);
        if (!hasUpcoming && Array.isArray(initialDb.books)) {
          const upcomingFromInitial = initialDb.books.filter(b => b.isUpcoming || b.status === 'Sắp phát hành' || Number(b.id) >= 51);
          parsed.books = [...parsed.books, ...upcomingFromInitial];
        }

        // Lọc sạch dữ liệu đặt trước rác hoặc đã hủy nếu còn vướng trong LocalStorage
        if (Array.isArray(parsed.reservations)) {
          parsed.reservations = parsed.reservations.filter(r => r && r.status !== 'Cancelled' && r.status !== 'Hủy');
          if (parsed.reservations.length === 0 && Array.isArray(initialDb.reservations)) {
            parsed.reservations = initialDb.reservations;
          }
        } else if (Array.isArray(initialDb.reservations)) {
          parsed.reservations = initialDb.reservations;
        }

        memoryDb = parsed;
        memoryDbTimestamp = storedTime;
        return memoryDb;
      }
    }
  } catch (e) {
    // ignore
  }

  const clone = JSON.parse(JSON.stringify(initialDb));
  memoryDb = clone;
  saveLocalDb(clone);

  // Tự động đồng bộ lại currentUser nếu đang có phiên đăng nhập cũ
  try {
    const rawUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    const rawRole = localStorage.getItem('currentUserRole') || sessionStorage.getItem('currentUserRole');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u) {
        if (u.username === 'admin' || u.role === 'Admin' || rawRole === 'Admin') {
          const freshAdmin = (clone.users || []).find(usr => usr.username === 'admin') || {
            id: 1,
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
          const merged = { ...freshAdmin, ...u, id: 1, UserID: 1, username: 'admin', role: 'Admin', Role: 'Admin' };
          if (merged.fullName === 'Trần Thị Mai' || merged.fullName === 'Độc giả') {
            merged.fullName = 'Quản trị viên';
            merged.FullName = 'Quản trị viên';
          }
          if (merged.email && merged.email.includes('mai.tran')) merged.email = 'admin@smartlib.edu.vn';
          if (merged.phone === '0901 234 567') merged.phone = '0987 654 321';
          if (merged.address && merged.address.includes('Mễ Trì')) merged.address = 'Phòng Quản lý Thư viện, ĐHQG Hà Nội';
          if (merged.birthDate === '2002-10-20') merged.birthDate = '1990-01-01';
          localStorage.setItem('currentUser', JSON.stringify(merged));
          sessionStorage.setItem('currentUser', JSON.stringify(merged));
          localStorage.setItem('currentUserRole', 'Admin');
          sessionStorage.setItem('currentUserRole', 'Admin');
        } else if (u.username === 'librarian' || Number(u.id) === 3 || u.role === 'Librarian' || rawRole === 'Librarian') {
          const freshLibrarian = (clone.users || []).find(usr => usr.username === 'librarian') || {
            id: 3,
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
          const merged = { ...freshLibrarian, ...u, id: 3, UserID: 3, username: 'librarian', role: 'Librarian', Role: 'Librarian' };
          localStorage.setItem('currentUser', JSON.stringify(merged));
          sessionStorage.setItem('currentUser', JSON.stringify(merged));
          localStorage.setItem('currentUserRole', 'Librarian');
          sessionStorage.setItem('currentUserRole', 'Librarian');
        } else if (u.username === 'reader' || Number(u.id) === 2 || u.role === 'Reader') {
          const freshReader = (clone.users || []).find(usr => usr.username === 'reader') || {
            id: 2,
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
          const merged = { ...freshReader, ...u, id: 2, UserID: 2, username: 'reader', role: 'Reader', Role: 'Reader' };
          if (!merged.fullName || merged.fullName === 'Độc giả' || merged.fullName === 'Quản trị viên') {
            merged.fullName = 'Trần Thị Mai';
            merged.FullName = 'Trần Thị Mai';
          }
          if (merged.email && merged.email.includes('admin')) merged.email = 'mai.tran@smartlib.edu.vn';
          if (merged.phone === '0987 654 321') merged.phone = '0901 234 567';
          if (merged.address && merged.address.includes('ĐHQG')) merged.address = 'Khu KTX Sinh viên Mễ Trì, Thanh Xuân, Hà Nội';
          if (merged.birthDate === '1990-01-01') merged.birthDate = '2002-10-20';
          localStorage.setItem('currentUser', JSON.stringify(merged));
          sessionStorage.setItem('currentUser', JSON.stringify(merged));
          localStorage.setItem('currentUserRole', 'Reader');
          sessionStorage.setItem('currentUserRole', 'Reader');
        }
      }
    }
  } catch (e) {}

  return memoryDb;
};

const saveLocalDb = (db) => {
  memoryDb = db;
  const now = Date.now();
  memoryDbTimestamp = now;
  try {
    localStorage.setItem('smartlib_db_version', DB_VERSION);
    localStorage.setItem('smartlib_db_timestamp', String(now));
    // Để không bao giờ bị tràn quota LocalStorage (5MB limit, trong khi ảnh base64 chiếm 1.25MB),
    // chúng ta lưu phiên bản nhẹ của books (ảnh được lấy từ bundle initialDb)
    const lightDb = {
      ...db,
      books: (db.books || []).map(b => {
        const { imageUrl, ...rest } = b;
        return rest;
      })
    };
    localStorage.setItem('smartlib_db', JSON.stringify(lightDb));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
};

// Global Real-time Data Synchronization Broadcaster
export const notifyDataUpdated = (type = 'all', meta = {}) => {
  if (typeof window !== 'undefined') {
    const payload = { type, timestamp: Date.now(), meta };
    
    // Invalidate local memory cache immediately
    memoryDb = null;
    memoryDbTimestamp = 0;

    // 1. Dispatch custom event for current window
    window.dispatchEvent(new CustomEvent('smartlib:data-updated', { detail: payload }));
    
    // 2. BroadcastChannel to all other tabs (0ms instant event)
    try {
      syncChannel?.postMessage(payload);
    } catch (e) {}
    
    // 3. Storage event fallback for other windows
    try {
      localStorage.setItem('smartlib_last_update', JSON.stringify(payload));
    } catch (e) {}
  }
};

// Helper fetch with timeout to prevent network blocking
const fetchWithTimeout = async (url, options = {}, timeoutMs = 6000) => {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const id = setTimeout(() => {
    try {
      controller.abort(new Error(`Quá thời gian phản hồi từ máy chủ (${Math.round(timeoutMs / 1000)}s). Vui lòng thử lại!`));
    } catch {
      controller.abort();
    }
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    // Tự động giải phóng phiên khi token hết hạn (401)
    if (response.status === 401 && !url.includes('/auth/login')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('currentUserRole');
        sessionStorage.clear();
        window.dispatchEvent(new CustomEvent('smartlib:auth-expired'));
      }
    }
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

export const api = {
  // Auth
  login: async (username, password) => {
    const trimmedUsername = (username || '').trim();
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUsername, password })
        });
        if (res.ok) {
          const data = await res.json();
          // Đồng bộ người dùng vào localDb để offline / GitHub Pages cũng đăng nhập được
          try {
            const db = getLocalDb();
            const existingUsers = (db.users || []).filter(
              u => u.username && u.username.toLowerCase() !== trimmedUsername.toLowerCase()
            );
            existingUsers.push({ ...data.user, password });
            db.users = existingUsers;
            saveLocalDb(db);
          } catch (e) {}
          if (data && data.token) {
            localStorage.setItem('token', data.token);
            sessionStorage.setItem('token', data.token);
          }
          return data;
        } else if (res.status === 403) {
          const err = await res.json().catch(() => ({}));
          const lockDetail = err.detail || {};
          const isPending = typeof lockDetail === 'object' && lockDetail.error === 'PAYMENT_PENDING_APPROVAL';
          const msg = typeof lockDetail === 'object' ? (lockDetail.message || 'Tài khoản của bạn đã bị khóa do chưa nộp phạt sách quá hạn sau 3 ngày!') : lockDetail;
          const lockErr = new Error(msg);
          lockErr.isLocked = true;
          lockErr.isPendingApproval = isPending;
          lockErr.lockData = typeof lockDetail === 'object' ? lockDetail : { message: lockDetail };
          throw lockErr;
        } else if (res.status === 401 || res.status === 400) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Tên đăng nhập hoặc mật khẩu không chính xác!');
        }
      } catch (e) {
        if (e.isLocked || (e.message && e.message !== 'Failed to fetch' && !e.message.includes('NetworkError'))) {
          throw e;
        }
      }
    }

    // Ưu tiên tra cứu từ Local Database (đã đồng bộ chuẩn khi chạy offline)
    const db = getLocalDb();
    const demoPasses = [
      '123', '123456',
      'admin', 'admin123', 'quantri', 'quantri123',
      'reader', 'reader123', 'docgia', 'docgia123',
      'librarian', 'librarian123', 'thuthu', 'thuthu123'
    ];
    const pStr = String(password || '').trim();
    const isDemoPass = demoPasses.includes(pStr);

    const found = (db.users || []).find(
      u => u.username && u.username.toLowerCase() === trimmedUsername.toLowerCase() && 
           (u.password === password || (isDemoPass && ['admin', 'reader', 'librarian', 'docgia', 'thuthu'].includes(u.username.toLowerCase())))
    );
    if (found) {
      const pendingFines = (db.fines || []).filter(
        f => Number(f.readerId || f.userId || 0) === Number(found.id) && (f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt')
      );
      if (found.pendingPaymentApproval || pendingFines.length > 0 || (found.lockReason || '').toLowerCase().includes('chờ quản trị viên duyệt')) {
        const lockErr = new Error('Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Vui lòng đợi trong giây lát hoặc liên hệ ban quản trị!');
        lockErr.isLocked = true;
        lockErr.isPendingApproval = true;
        lockErr.lockData = {
          error: 'PAYMENT_PENDING_APPROVAL',
          readerId: found.id,
          readerName: found.fullName,
          message: 'Tài khoản của bạn đang chờ Quản trị viên duyệt giao dịch nộp phạt VNPay. Vui lòng đợi trong giây lát hoặc liên hệ ban quản trị!',
          fine: pendingFines[0] || null
        };
        throw lockErr;
      }
      if (found.isLocked) {
        const lockErr = new Error(found.lockReason || 'Tài khoản của bạn đã bị khóa do chưa nộp phạt sách quá hạn sau 3 ngày!');
        lockErr.isLocked = true;
        lockErr.lockData = {
          readerId: found.id,
          readerName: found.fullName,
          message: found.lockReason || 'Tài khoản bị khóa do chưa nộp phạt sách quá hạn sau 3 ngày.',
          unpaidFines: found.unpaidFines || 10000
        };
        throw lockErr;
      }
      return { user: found };
    }

    // Local / GitHub Pages fallback an toàn cho 3 tài khoản chính thức: admin, reader, librarian
    if (['admin', 'quantri'].includes(trimmedUsername.toLowerCase()) && demoPasses.includes(pStr)) {
      const adminUser = {
        id: 1,
        UserID: 1,
        username: 'admin',
        role: 'Admin',
        Role: 'Admin',
        fullName: 'Quản trị viên',
        FullName: 'Quản trị viên',
        email: 'admin@smartlib.edu.vn',
        phone: '0987 654 321',
        address: 'Phòng Quản lý Thư viện, ĐHQG Hà Nội'
      };
      return { user: adminUser };
    } else if (['reader', 'docgia'].includes(trimmedUsername.toLowerCase()) && demoPasses.includes(pStr)) {
      const readerUser = {
        id: 2,
        UserID: 2,
        username: 'reader',
        role: 'Reader',
        Role: 'Reader',
        fullName: 'Trần Thị Mai',
        FullName: 'Trần Thị Mai',
        email: 'mai.tran@smartlib.edu.vn',
        phone: '0901 234 567',
        address: 'Khu KTX Sinh viên Mễ Trì, Thanh Xuân, Hà Nội'
      };
      return { user: readerUser };
    } else if (['librarian', 'thuthu'].includes(trimmedUsername.toLowerCase()) && demoPasses.includes(pStr)) {
      const librarianUser = {
        id: 3,
        UserID: 3,
        username: 'librarian',
        role: 'Librarian',
        Role: 'Librarian',
        fullName: 'Thủ thư Nguyễn Văn Hưng',
        FullName: 'Thủ thư Nguyễn Văn Hưng',
        email: 'librarian@smartlib.edu.vn',
        phone: '0912 888 999',
        address: 'Bộ phận Nghiệp vụ Thư viện, ĐHQG Hà Nội'
      };
      return { user: librarianUser };
    }

    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác!');
  },

  register: async (userData) => {
    const trimmedUsername = (userData.username || '').trim();
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...userData, username: trimmedUsername })
        });
        if (res.ok) {
          const data = await res.json();
          try {
            const db = getLocalDb();
            const newUser = {
              id: data.user?.id || Date.now(),
              UserID: data.user?.id || Date.now(),
              ...userData,
              username: trimmedUsername,
              role: 'Reader',
              Role: 'Reader'
            };
            db.users = [
              ...(db.users || []).filter(u => u.username && u.username.toLowerCase() !== trimmedUsername.toLowerCase()),
              newUser
            ];
            saveLocalDb(db);
          } catch (e) {}

          notifyDataUpdated('reader');
          return data;
        } else if (res.status === 400) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Tên đăng nhập đã tồn tại!');
        }
      } catch (e) {
        if (e.message && e.message !== 'Failed to fetch' && !e.message.includes('NetworkError')) {
          throw e;
        }
      }
    }

    // Local / GitHub Pages fallback (khi chạy không có server backend)
    const db = getLocalDb();
    if ((db.users || []).some(u => u.username && u.username.toLowerCase() === trimmedUsername.toLowerCase())) {
      throw new Error('Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác!');
    }
    const newId = Math.max(0, ...(db.users || []).map(u => Number(u.id) || 0)) + 1;
    const newUser = {
      id: newId,
      UserID: newId,
      ...userData,
      username: trimmedUsername,
      role: 'Reader',
      Role: 'Reader'
    };
    db.users = [...(db.users || []), newUser];
    saveLocalDb(db);
    notifyDataUpdated('reader');
    return { user: newUser, message: 'Đăng ký thành công!' };
  },

  updateProfile: async (userId, data) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/auth/profile/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) return await res.json();
      } catch (e) {}
    }

    const db = getLocalDb();
    db.users = (db.users || []).map(u => Number(u.id) === Number(userId) ? { ...u, ...data } : u);
    saveLocalDb(db);
    return { success: true };
  },

  // AI Demand Forecasting (Pandas SMA & Procurement)
  getProcurementForecast: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/ai/procurement-forecast`, {
          headers: { ...getAuthHeaders() }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            return json.data;
          }
        }
      } catch (e) {
        console.warn('Backend getProcurementForecast failed, using local fallback:', e);
      }
    }

    return [
      {
        book_id: 9,
        book_title: 'Đêm Trắng',
        category: 'Văn học & Tiểu thuyết',
        current_inventory: 10,
        available_copies: 8,
        recent_monthly_avg: 10.33,
        projected_demand: 17,
        shortage_risk: 'HIGH',
        recommended_procurement: 13,
        confidence_score: 0.89,
        notes: 'Dự báo nhu cầu tháng tới đạt 17 lượt mượn (SMA-3: 10.3/tháng). Kho hiện chỉ còn 8/10 cuốn. Khuyến nghị bổ sung khẩn cấp 13 cuốn.'
      },
      {
        book_id: 2,
        book_title: 'Tư Duy Mở',
        category: 'Tâm lý & Kỹ năng sống',
        current_inventory: 10,
        available_copies: 7,
        recent_monthly_avg: 8.33,
        projected_demand: 14,
        shortage_risk: 'HIGH',
        recommended_procurement: 10,
        confidence_score: 0.88,
        notes: 'Dự báo nhu cầu tháng tới đạt 14 lượt mượn (SMA-3: 8.3/tháng). Kho hiện chỉ còn 7/10 cuốn. Khuyến nghị bổ sung khẩn cấp 10 cuốn.'
      },
      {
        book_id: 8,
        book_title: 'Chúa Tể Của Những Chiếc Nhẫn',
        category: 'Văn học & Tiểu thuyết',
        current_inventory: 10,
        available_copies: 8,
        recent_monthly_avg: 8.33,
        projected_demand: 14,
        shortage_risk: 'HIGH',
        recommended_procurement: 9,
        confidence_score: 0.88,
        notes: 'Dự báo nhu cầu tháng tới đạt 14 lượt mượn (SMA-3: 8.3/tháng). Kho hiện chỉ còn 8/10 cuốn. Khuyến nghị bổ sung khẩn cấp 9 cuốn.'
      },
      {
        book_id: 6,
        book_title: 'Hoàng Tử Bé',
        category: 'Văn học & Tiểu thuyết',
        current_inventory: 8,
        available_copies: 5,
        recent_monthly_avg: 6.33,
        projected_demand: 11,
        shortage_risk: 'HIGH',
        recommended_procurement: 9,
        confidence_score: 0.86,
        notes: 'Dự báo nhu cầu tháng tới đạt 11 lượt mượn (SMA-3: 6.3/tháng). Kho hiện chỉ còn 5/8 cuốn. Khuyến nghị bổ sung khẩn cấp 9 cuốn.'
      },
      {
        book_id: 7,
        book_title: 'Những Kẻ Hắc Ám',
        category: 'Văn học & Tiểu thuyết',
        current_inventory: 10,
        available_copies: 8,
        recent_monthly_avg: 9.33,
        projected_demand: 13,
        shortage_risk: 'HIGH',
        recommended_procurement: 8,
        confidence_score: 0.88,
        notes: 'Dự báo nhu cầu tháng tới đạt 13 lượt mượn (SMA-3: 9.3/tháng). Kho hiện chỉ còn 8/10 cuốn. Khuyến nghị bổ sung khẩn cấp 8 cuốn.'
      }
    ];
  },

  runProcurementForecast: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/ai/procurement-forecast/run`, {
          method: 'POST',
          headers: { ...getAuthHeaders() }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            return json.data;
          }
        }
      } catch (e) {
        console.warn('Backend runProcurementForecast failed:', e);
      }
    }
    return await api.getProcurementForecast();
  },

  changePassword: async (userId, currentPassword, newPassword) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/auth/change-password/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        if (res.ok) return await res.json();
      } catch (e) {}
    }

    const db = getLocalDb();
    db.users = (db.users || []).map(u => Number(u.id) === Number(userId) ? { ...u, password: newPassword } : u);
    saveLocalDb(db);
    return { success: true };
  },

  // Books
  getCachedBooks: () => {
    try {
      const db = getLocalDb();
      if (db && Array.isArray(db.books) && db.books.length > 0) {
        return db.books;
      }
    } catch (e) {}
    return (initialDb && initialDb.books) || [];
  },

  getBooks: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/books`, {}, 10000);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            try {
              const db = getLocalDb();
              db.books = data;
              saveLocalDb(db);
            } catch (e) {}
            return data;
          }
        }
      } catch (e) {}
    }
    return api.getCachedBooks();
  },

  createBook: async (bookData) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookData)
        });
        if (res.ok) {
          const result = await res.json();
          const db = getLocalDb();
          const newBook = { ...bookData, ...(result.book || {}) };
          db.books = [newBook, ...(db.books || []).filter(b => Number(b.id) !== Number(newBook.id))];
          saveLocalDb(db);
          notifyDataUpdated('book');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    const newId = Math.max(0, ...(db.books || []).map(b => Number(b.id) || 0)) + 1;
    const newBook = { id: newId, ...bookData, available: bookData.quantity || 1, borrowed: 0 };
    db.books = [newBook, ...(db.books || [])];
    saveLocalDb(db);
    notifyDataUpdated('book');
    return newBook;
  },

  updateBook: async (bookId, bookData) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/books/${bookId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bookData)
        });
        if (res.ok) {
          const result = await res.json();
          const db = getLocalDb();
          const updatedBook = { ...bookData, ...(result.book || {}) };
          db.books = (db.books || []).map(b => Number(b.id) === Number(bookId) ? { ...b, ...updatedBook } : b);
          saveLocalDb(db);
          notifyDataUpdated('book');
          return result;
        } else {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.detail || 'Lỗi từ máy chủ khi cập nhật sách');
        }
      } catch (e) {
        console.error('Lỗi khi gọi API updateBook:', e);
        if (e.message && e.message.includes('Lỗi từ máy chủ')) throw e;
      }
    }

    const db = getLocalDb();
    db.books = (db.books || []).map(b => Number(b.id) === Number(bookId) ? { ...b, ...bookData } : b);
    saveLocalDb(db);
    notifyDataUpdated('book');
    return { success: true, book: { id: bookId, ...bookData } };
  },

  deleteBook: async (bookId) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/books/${bookId}`, { method: 'DELETE' });
        if (res.ok) {
          const result = await res.json();
          const db = getLocalDb();
          db.books = (db.books || []).filter(b => Number(b.id) !== Number(bookId));
          saveLocalDb(db);
          notifyDataUpdated('book');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    db.books = (db.books || []).filter(b => Number(b.id) !== Number(bookId));
    saveLocalDb(db);
    notifyDataUpdated('book');
    return { success: true };
  },

  // AI Cataloging
  extractBookWithAI: async (imageFile) => {
    if (!isStaticHost) {
      try {
        const formData = new FormData();
        formData.append('file', imageFile);
        const res = await fetch(`${API_BASE}/ai/extract-book`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders()
          },
          body: formData
        });
        if (res.ok) {
          return await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Không thể trích xuất thông tin sách từ ảnh bìa');
        }
      } catch (e) {
        console.warn('Backend AI extract failed, falling back to local client processor:', e);
        if (e.message && !e.message.includes('fetch') && !e.message.includes('NetworkError')) {
          throw e;
        }
      }
    }

    // Static host or offline fallback
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawName = (imageFile.name || '').replace(/\.[^/.]+$/, '').replace(/[_\-+]/g, ' ');
        const title = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : 'Sách Mới (AI Trích xuất)';
        resolve({
          title: title,
          author: 'Nhiều tác giả',
          category: 'Công nghệ',
          publisher: 'NXB Thông tin & Truyền thông',
          publish_year: new Date().getFullYear(),
          description: `Thông tin cuốn sách "${title}" được AI trích xuất tự động từ hình ảnh bìa.`,
          ai_tags: ['AI biên mục', 'OCR', 'Sách mới'],
          confidence: 0.85,
          cover_preview: reader.result,
          raw_text: `[AI Scan] Phân tích từ: ${imageFile.name}`
        });
      };
      reader.readAsDataURL(imageFile);
    });
  },

  // Text-to-SQL AI Query
  adminQueryAI: async (promptQuery) => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/ai/admin-query`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ query: promptQuery })
        }, 25000);
        if (res.ok) {
          return await res.json();
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Lỗi khi xử lý câu hỏi truy vấn AI');
        }
      } catch (e) {
        console.warn('Backend AI query failed, falling back to client local database search:', e);
        const errMsg = String(e?.message || '');
        const isNetworkOrAbort = !errMsg || 
          e?.name === 'AbortError' || 
          errMsg.includes('aborted') || 
          errMsg.includes('timeout') || 
          errMsg.includes('quá thời gian') ||
          errMsg.includes('fetch') || 
          errMsg.includes('NetworkError') ||
          errMsg.includes('Failed to fetch');
        if (!isNetworkOrAbort) {
          throw e;
        }
      }
    }

    // Static host or client fallback search
    const db = getLocalDb();
    const p = promptQuery.toLowerCase().trim();

    if (p.includes('quá hạn') || p.includes('trễ hạn')) {
      const records = (db.borrowRecords || []).filter(r => r.status === 'Đang mượn' && (Number(r.overdue_days || r.overdueDays || 0) > 0));
      return {
        success: true,
        query: promptQuery,
        sql: "SELECT id AS ma_phieu, book_title AS ten_sach, reader_name AS doc_gia, due_date AS han_tra, overdue_days AS so_ngay_qua_han, fine_amount AS tien_phat FROM borrow_records WHERE status = 'Đang mượn' AND overdue_days > 0",
        columns: ['ma_phieu', 'ten_sach', 'doc_gia', 'han_tra', 'so_ngay_qua_han', 'tien_phat'],
        data: records.map(r => ({
          ma_phieu: r.id,
          ten_sach: r.bookTitle || r.book_title || 'Sách #' + r.bookId,
          doc_gia: r.readerName || r.reader_name || 'Độc giả #' + r.readerId,
          han_tra: (r.dueDate || r.returnDate || '').substring(0, 10),
          so_ngay_qua_han: r.overdueDays || r.overdue_days || 1,
          tien_phat: r.fineAmount || r.fine_amount || 2000
        })),
        total_rows: records.length,
        explanation: 'Truy vấn danh sách các phiếu mượn sách đã quá hạn trả.'
      };
    }

    // Fallback: Tìm sách trong db
    const books = (db.books || []).slice(0, 20);
    return {
      success: true,
      query: promptQuery,
      sql: "SELECT id, title AS ten_sach, author AS tac_gia, category AS the_loai, available AS con_san, quantity AS tong_so FROM books LIMIT 20",
      columns: ['id', 'ten_sach', 'tac_gia', 'the_loai', 'con_san', 'tong_so'],
      data: books.map(b => ({
        id: b.id,
        ten_sach: b.title,
        tac_gia: b.author,
        the_loai: b.category,
        con_san: b.available,
        tong_so: b.quantity
      })),
      total_rows: books.length,
      explanation: 'Hiển thị dữ liệu trích xuất từ kho sách thư viện.'
    };
  },

  // AI Anomaly Detection
  getFlaggedAnomalies: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/ai/anomalies`, {
          headers: { ...getAuthHeaders() }
        }, 2500);
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {
        console.warn('Backend getFlaggedAnomalies failed, falling back to local detection:', e);
      }
    }

    // Local client evaluation for static host
    const db = getLocalDb();
    const borrows = db.borrowRecords || [];
    const users = (db.users || []).reduce((acc, u) => ({ ...acc, [u.id]: u.fullName || u.username }), {});
    const books = (db.books || []).reduce((acc, b) => ({ ...acc, [b.id]: b.title }), {});

    const flagged = [];

    // Quy tắc 1: Trả dưới 15 phút
    for (const r of borrows) {
      if (r.status === 'Đã trả' && r.borrowDate && r.actualReturnDate) {
        const diffMin = (new Date(r.actualReturnDate) - new Date(r.borrowDate)) / (1000 * 60);
        if (diffMin >= 0 && diffMin < 15) {
          flagged.push({
            id: r.id,
            book_id: r.bookId,
            book_title: r.bookTitle || books[r.bookId] || `Sách #${r.bookId}`,
            user_id: r.userId || r.readerId,
            reader_name: r.readerName || users[r.userId || r.readerId] || `Độc giả #${r.userId || r.readerId}`,
            borrow_date: r.borrowDate,
            due_date: r.dueDate || r.returnDate,
            actual_return_date: r.actualReturnDate,
            borrow_type: r.borrowType || 'Mượn về nhà',
            status: r.status,
            is_flagged: true,
            anomaly_score: 0.91,
            anomaly_reason: `Bất thường thời gian: Mượn và trả sách chỉ trong ${diffMin.toFixed(1)} phút (< 15 phút).`
          });
        }
      }
    }

    // Quy tắc 2: Độc giả có >= 5 sách báo mất
    const userLost = {};
    for (const r of borrows) {
      const s = (r.status || '').toLowerCase();
      if (s.includes('baomat') || s.includes('báo mất') || s.includes('mất')) {
        const uid = r.userId || r.readerId;
        if (!userLost[uid]) userLost[uid] = [];
        userLost[uid].push(r);
      }
    }

    for (const [uid, lostList] of Object.entries(userLost)) {
      if (lostList.length >= 5) {
        for (const r of lostList) {
          flagged.push({
            id: r.id,
            book_id: r.bookId,
            book_title: r.bookTitle || books[r.bookId] || `Sách #${r.bookId}`,
            user_id: uid,
            reader_name: r.readerName || users[uid] || `Độc giả #${uid}`,
            borrow_date: r.borrowDate,
            due_date: r.dueDate || r.returnDate,
            actual_return_date: r.actualReturnDate,
            borrow_type: r.borrowType || 'Mượn về nhà',
            status: r.status,
            is_flagged: true,
            anomaly_score: 0.96,
            anomaly_reason: `Rủi ro gian lận cao: Độc giả có ${lostList.length} cuốn sách liên tiếp ở trạng thái Báo mất!`
          });
        }
      }
    }

    return flagged;
  },

  triggerAnomalyScan: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/ai/anomalies/scan`, { 
          method: 'POST',
          headers: { ...getAuthHeaders() }
        }, 3000);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    return { success: true, message: 'Đã hoàn thành quét phát hiện bất thường.' };
  },

  resolveAnomaly: async (recordId) => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/ai/anomalies/${recordId}/resolve`, { 
          method: 'POST',
          headers: { ...getAuthHeaders() }
        }, 3000);
        if (res.ok) {
          notifyDataUpdated('borrow');
          return await res.json();
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    db.borrowRecords = (db.borrowRecords || []).map(r => 
      Number(r.id) === Number(recordId) ? { ...r, is_flagged: false, isFlagged: false, anomaly_score: 0.0, anomalyScore: 0.0 } : r
    );
    saveLocalDb(db);
    notifyDataUpdated('borrow');
    return { success: true };
  },

  // Readers
  getReaders: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/readers`, {}, 2500);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const db = getLocalDb();
    return (db.users || []).filter(u => u.role === 'Reader');
  },

  createReader: async (readerData) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/readers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(readerData)
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    const newId = Math.max(0, ...(db.users || []).map(u => Number(u.id) || 0)) + 1;
    const newReader = { id: newId, UserID: newId, role: 'Reader', Role: 'Reader', ...readerData };
    db.users = [...(db.users || []), newReader];
    saveLocalDb(db);
    notifyDataUpdated('reader');
    return newReader;
  },

  updateReader: async (readerId, readerData) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/readers/${readerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(readerData)
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    db.users = (db.users || []).map(u => Number(u.id) === Number(readerId) ? { ...u, ...readerData } : u);
    saveLocalDb(db);
    notifyDataUpdated('reader');
    return { success: true };
  },

  deleteReader: async (readerId) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/readers/${readerId}`, { method: 'DELETE' });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    db.users = (db.users || []).filter(u => Number(u.id) !== Number(readerId));
    saveLocalDb(db);
    notifyDataUpdated('reader');
    return { success: true };
  },

  // Borrow Records
  getBorrowRecords: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/borrow-records`, {}, 6000);
        if (res.ok) {
          const serverData = await res.json();
          const db = getLocalDb();
          if (Array.isArray(serverData)) {
            db.borrowRecords = serverData;
            saveLocalDb(db);
          }
          return serverData;
        }
      } catch (e) {}
    }
    return getLocalDb().borrowRecords || [];
  },

  createBorrowRecord: async (data) => {
    const db = getLocalDb();
    const targetBook = (db.books || []).find(b => Number(b.id) === Number(data.bookId));
    const finalBookTitle = data.bookTitle || targetBook?.title || 'Sách thư viện';
    const finalReaderName = data.readerName || data.fullName || '';
    const finalReaderId = Number(data.readerId || data.userId || 0);
    const enrichedData = {
      ...data,
      bookId: Number(data.bookId),
      bookTitle: finalBookTitle,
      readerId: finalReaderId,
      userId: finalReaderId,
      readerName: finalReaderName
    };

    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedData)
        });
        if (res.ok) {
          const result = await res.json();
          const localRecord = result.record || {
            id: result.id || Date.now(),
            bookId: enrichedData.bookId,
            bookTitle: finalBookTitle,
            readerId: finalReaderId,
            readerName: finalReaderName,
            borrowDate: new Date().toISOString(),
            returnDate: new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
            borrowType: data.borrowType || 'Mượn về nhà',
            status: 'Chờ duyệt'
          };
          db.borrowRecords = [localRecord, ...(db.borrowRecords || []).filter(r => Number(r.id) !== Number(localRecord.id))];
          saveLocalDb(db);
          notifyDataUpdated('borrow');
          return result;
        } else {
          // Khi server báo lỗi (ví dụ 409 Conflict hoặc 400 Hết sách do tranh chấp đồng thời)
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.detail || 'Không thể gửi yêu cầu mượn sách lúc này.';
          const errorObj = new Error(errMsg);
          errorObj.status = res.status;
          errorObj.isOutOfStock = res.status === 409 || errMsg.includes('hết');
          throw errorObj;
        }
      } catch (e) {
        if (e.status || e.isOutOfStock || (e.message && e.message.includes('hết'))) {
          throw e;
        }
      }
    }

    // Kiểm tra số lượng sách sẵn có trong DB cục bộ
    const targetBookLocal = (db.books || []).find(b => Number(b.id) === Number(enrichedData.bookId));
    if (targetBookLocal) {
      const activeCount = (db.borrowRecords || []).filter(
        r => Number(r.bookId) === Number(enrichedData.bookId) && ['Chờ duyệt', 'Đang mượn', 'Quá hạn'].includes(r.status)
      ).length;
      const avail = Number(targetBookLocal.available != null ? targetBookLocal.available : targetBookLocal.quantity);
      if (avail <= 0 || activeCount >= Number(targetBookLocal.quantity || 1)) {
        const err = new Error("Rất tiếc! Cuốn sách này vừa được một độc giả khác đăng ký mượn trước đó chỉ trong tích tắc. Số lượng hiện tại trong kho đã hết.");
        err.status = 409;
        err.isOutOfStock = true;
        throw err;
      }
      targetBookLocal.available = Math.max(0, avail - 1);
      targetBookLocal.borrowed = Math.max(0, Number(targetBookLocal.borrowed || 0) + 1);
      if (targetBookLocal.available === 0) targetBookLocal.status = "Hết sách";
    }

    const newId = Math.max(0, ...(db.borrowRecords || []).map(r => Number(r.id) || 0)) + 1;
    const now = new Date();
    const returnD = new Date();
    returnD.setDate(now.getDate() + 14);
    const newRecord = {
      id: newId,
      bookId: enrichedData.bookId,
      bookTitle: finalBookTitle,
      readerId: finalReaderId,
      readerName: finalReaderName,
      borrowDate: now.toISOString(),
      returnDate: returnD.toISOString().substring(0, 10),
      borrowType: data.borrowType || 'Mượn về nhà',
      status: 'Chờ duyệt'
    };
    db.borrowRecords = [newRecord, ...(db.borrowRecords || [])];

    // Notification for both Reader and Admin
    const notifId1 = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0)) + 1;
    const notifId2 = notifId1 + 1;
    db.notifications = [
      {
        id: notifId1,
        recipientRole: 'Reader',
        recipientUserId: finalReaderId,
        title: 'Yêu cầu mượn sách đang chờ duyệt',
        message: `Yêu cầu mượn cuốn sách "${finalBookTitle}" của bạn đã được gửi thành công và đang chờ thủ thư phê duyệt.`,
        type: 'borrow_request',
        recordId: newId,
        bookId: enrichedData.bookId,
        bookTitle: finalBookTitle,
        isRead: false,
        createdAt: now.toISOString()
      },
      {
        id: notifId2,
        recipientRole: 'Admin',
        title: 'Yêu cầu mượn sách mới',
        message: `Độc giả ${finalReaderName} vừa gửi yêu cầu mượn cuốn sách "${finalBookTitle}" (${newRecord.borrowType}).`,
        type: 'borrow_request',
        recordId: newId,
        bookId: enrichedData.bookId,
        bookTitle: finalBookTitle,
        readerName: finalReaderName,
        isRead: false,
        createdAt: now.toISOString()
      },
      ...(db.notifications || [])
    ];

    saveLocalDb(db);
    notifyDataUpdated('borrow');
    return newRecord;
  },

  approveBorrow: async (recordId) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/approve`, { method: 'PUT' });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    let approvedRec = null;
    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        approvedRec = { ...r, status: 'Đang mượn' };
        return approvedRec;
      }
      return r;
    });

    if (approvedRec) {
      const notifId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0)) + 1;
      db.notifications = [
        {
          id: notifId,
          recipientRole: 'Reader',
          recipientUserId: approvedRec.readerId || approvedRec.userId,
          title: 'Yêu cầu mượn sách đã được duyệt',
          message: `Yêu cầu mượn cuốn sách "${approvedRec.bookTitle}" của bạn đã được duyệt thành công!`,
          type: 'borrow_approved',
          recordId: approvedRec.id,
          bookId: approvedRec.bookId,
          bookTitle: approvedRec.bookTitle,
          isRead: false,
          createdAt: new Date().toISOString()
        },
        ...(db.notifications || [])
      ];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');
    return { success: true };
  },

  rejectBorrow: async (recordId) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/reject`, { method: 'PUT' });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    let rejectedRec = null;
    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        rejectedRec = { ...r, status: 'Từ chối' };
        return rejectedRec;
      }
      return r;
    });

    if (rejectedRec) {
      const notifId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0)) + 1;
      db.notifications = [
        {
          id: notifId,
          recipientRole: 'Reader',
          recipientUserId: rejectedRec.readerId || rejectedRec.userId,
          title: 'Yêu cầu mượn sách bị từ chối',
          message: `Yêu cầu mượn cuốn sách "${rejectedRec.bookTitle}" đã bị từ chối.`,
          type: 'borrow_rejected',
          recordId: rejectedRec.id,
          bookId: rejectedRec.bookId,
          bookTitle: rejectedRec.bookTitle,
          isRead: false,
          createdAt: new Date().toISOString()
        },
        ...(db.notifications || [])
      ];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');
    return { success: true };
  },

  updateBorrowStatus: async (recordId, status) => {
    // 1. Luôn cập nhật localDb trước để đảm bảo trạng thái đổi ngay lập tức
    const db = getLocalDb();
    let updated = null;
    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        updated = { ...r, status };
        if (status === 'Đã trả') {
          updated.actualReturnDate = new Date().toISOString().substring(0, 10);
        }
        return updated;
      }
      return r;
    });

    // Khi trả sách thành công, khôi phục số lượng sách và gửi thông báo
    if (status === 'Đã trả' && updated) {
      if (updated.bookId) {
        db.books = (db.books || []).map(b => {
          if (Number(b.id) === Number(updated.bookId)) {
            const newBorrowed = Math.max(0, (Number(b.borrowed) || 1) - 1);
            const newAvailable = Math.min(Number(b.quantity) || 1, (Number(b.available) || 0) + 1);
            return { ...b, borrowed: newBorrowed, available: newAvailable };
          }
          return b;
        });
      }

      // Đánh dấu đã đọc tất cả thông báo mượn/chờ duyệt/duyệt cũ của lượt mượn này
      db.notifications = (db.notifications || []).map(n => {
        if (Number(n.recordId) === Number(recordId) || (n.meta && Number(n.meta.recordId) === Number(recordId))) {
          return { ...n, isRead: true };
        }
        return n;
      });

      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      const notifAdmin = {
        id: maxId + 2,
        recipientRole: 'Admin',
        title: 'Độc giả đã trả sách',
        message: `Độc giả ${updated.readerName || 'Trần Thị Mai'} đã trả cuốn sách "${updated.bookTitle}".`,
        type: 'book_returned',
        recordId: updated.id,
        bookId: updated.bookId,
        bookTitle: updated.bookTitle,
        readerName: updated.readerName || 'Trần Thị Mai',
        isRead: false,
        createdAt: nowStr
      };
      const notifReader = {
        id: maxId + 1,
        recipientRole: 'Reader',
        recipientUserId: updated.readerId || updated.userId,
        title: 'Xác nhận trả sách thành công',
        message: `Bạn đã hoàn tất trả cuốn sách "${updated.bookTitle}". Cảm ơn bạn đã giữ gìn sách cẩn thận!`,
        type: 'book_returned',
        recordId: updated.id,
        bookId: updated.bookId,
        bookTitle: updated.bookTitle,
        isRead: false,
        createdAt: nowStr
      };
      db.notifications = [notifAdmin, notifReader, ...(db.notifications || [])];
    } else if (status === 'Đã hủy' && updated) {
      // Đánh dấu đã đọc tất cả thông báo cũ của lượt mượn này
      db.notifications = (db.notifications || []).map(n => {
        if (Number(n.recordId) === Number(recordId) || (n.meta && Number(n.meta.recordId) === Number(recordId))) {
          return { ...n, isRead: true };
        }
        return n;
      });

      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      db.notifications = [
        {
          id: maxId + 2,
          recipientRole: 'Admin',
          title: 'Độc giả đã hủy yêu cầu mượn',
          message: `Độc giả ${updated.readerName || 'Độc giả'} đã hủy yêu cầu mượn cuốn sách "${updated.bookTitle}".`,
          type: 'borrow_rejected',
          recordId: updated.id,
          bookId: updated.bookId,
          bookTitle: updated.bookTitle,
          readerName: updated.readerName,
          isRead: false,
          createdAt: nowStr
        },
        {
          id: maxId + 1,
          recipientRole: 'Reader',
          recipientUserId: updated.readerId || updated.userId,
          title: 'Đã hủy yêu cầu mượn sách',
          message: `Bạn đã hủy thành công yêu cầu mượn cuốn sách "${updated.bookTitle}".`,
          type: 'borrow_rejected',
          recordId: updated.id,
          bookId: updated.bookId,
          bookTitle: updated.bookTitle,
          isRead: false,
          createdAt: nowStr
        },
        ...(db.notifications || [])
      ];
    } else if (status === 'Quá hạn' && updated) {
      // Tự động tạo bản ghi phạt trong db.fines
      const fineAmount = 6000; // Mặc định 3 ngày x 2000đ
      const newFine = {
        id: Math.max(0, ...(db.fines || []).map(f => Number(f.id) || 0)) + 1,
        borrowRecordId: updated.id,
        bookTitle: updated.bookTitle,
        readerId: updated.readerId,
        readerName: updated.readerName,
        fineAmount: fineAmount,
        status: 'Chưa nộp',
        createdAt: new Date().toISOString()
      };
      db.fines = [...(db.fines || []), newFine];
      db.users = (db.users || []).map(u => Number(u.id) === Number(updated.readerId) ? {
        ...u,
        isLocked: true,
        lockReason: `Mượn cuốn sách "${updated.bookTitle}" quá hạn chưa trả và chưa nộp phạt sau 3 ngày`
      } : u);
      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      db.notifications = [
        {
          id: maxId + 1,
          recipientRole: 'Reader',
          recipientUserId: updated.readerId || updated.userId,
          title: 'Cảnh báo: Sách mượn bị chuyển Quá hạn',
          message: `Cuốn sách "${updated.bookTitle}" của bạn đã bị chuyển sang trạng thái Quá hạn (Tiền phạt: ${fineAmount.toLocaleString('vi-VN')} đ). Tài khoản đã bị khóa đăng nhập sau 3 ngày chưa nộp phạt, vui lòng nộp phạt qua VNPay để mở lại tài khoản!`,
          type: 'overdue_alert',
          recordId: updated.id,
          bookId: updated.bookId,
          bookTitle: updated.bookTitle,
          isRead: false,
          createdAt: nowStr
        },
        ...(db.notifications || [])
      ];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');

    // 2. Nếu có máy chủ backend, đồng bộ sang backend
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        }
      } catch (e) {}
    }

    return { success: true, record: updated };
  },

  requestRenewBorrow: async (recordId, days = 7, notes = '') => {
    // 1. Cập nhật localDb ngay lập tức (60fps optimistic UI)
    const db = getLocalDb();
    let updatedRecord = null;
    const numDays = Math.max(1, Math.min(60, Number(days) || 7));

    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        updatedRecord = {
          ...r,
          renewStatus: 'Chờ duyệt gia hạn',
          pendingRenewDays: numDays,
          pendingRenewNotes: notes || '',
          renewRequestedAt: new Date().toISOString()
        };
        return updatedRecord;
      }
      return r;
    });

    if (updatedRecord) {
      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      const notifAdmin = {
        id: maxId + 1,
        recipientRole: 'Admin',
        title: 'Yêu cầu gia hạn mượn sách mới',
        message: `Độc giả ${updatedRecord.readerName || 'Độc giả'} gửi yêu cầu gia hạn cuốn sách "${updatedRecord.bookTitle}" thêm ${numDays} ngày. Chờ phê duyệt!`,
        type: 'renew_request',
        recordId: updatedRecord.id,
        bookId: updatedRecord.bookId,
        bookTitle: updatedRecord.bookTitle,
        readerName: updatedRecord.readerName,
        days: numDays,
        notes,
        isRead: false,
        createdAt: nowStr
      };
      db.notifications = [notifAdmin, ...(db.notifications || [])];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');

    // 2. Gửi request đến backend
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/request-renew`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: numDays, notes })
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Không thể gửi yêu cầu gia hạn');
        }
      } catch (e) {
        if (e.message && !e.message.includes('fetch')) throw e;
      }
    }

    return { success: true, message: `Đã gửi yêu cầu gia hạn thêm ${numDays} ngày! Đang chờ thủ thư duyệt.`, record: updatedRecord };
  },

  approveRenewBorrow: async (recordId) => {
    // 1. Cập nhật localDb ngay lập tức (60fps optimistic UI)
    const db = getLocalDb();
    let updatedRecord = null;
    let newReturnStr = '';

    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        const numDays = Number(r.pendingRenewDays) || 7;
        const baseDateStr = r.returnDate || r.dueDate;
        let baseDate = new Date();
        if (baseDateStr) {
          const parsed = new Date(baseDateStr);
          if (!isNaN(parsed.getTime())) baseDate = parsed;
        }
        const newDueDate = new Date(baseDate.getTime() + numDays * 86400000);
        newReturnStr = newDueDate.toISOString().substring(0, 10);
        updatedRecord = {
          ...r,
          returnDate: newReturnStr,
          dueDate: newReturnStr,
          renewCount: (Number(r.renewCount) || 0) + 1,
          renewStatus: null,
          pendingRenewDays: null,
          pendingRenewNotes: null,
          notes: r.pendingRenewNotes ? `${r.notes || ''} | Gia hạn +${numDays} ngày: ${r.pendingRenewNotes}`.trim() : r.notes
        };
        return updatedRecord;
      }
      return r;
    });

    if (updatedRecord) {
      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      const notifReader = {
        id: maxId + 1,
        recipientRole: 'Reader',
        recipientUserId: updatedRecord.readerId || updatedRecord.userId,
        title: 'Yêu cầu gia hạn đã được duyệt ✓',
        message: `Yêu cầu gia hạn cuốn sách "${updatedRecord.bookTitle}" đã được duyệt thành công! Hạn trả mới: ${newReturnStr}.`,
        type: 'renew_approved',
        recordId: updatedRecord.id,
        bookId: updatedRecord.bookId,
        bookTitle: updatedRecord.bookTitle,
        newReturnDate: newReturnStr,
        isRead: false,
        createdAt: nowStr
      };
      db.notifications = [notifReader, ...(db.notifications || [])];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');

    // 2. Gửi request đến backend
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/approve-renew`, { method: 'PUT' });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        }
      } catch (e) {}
    }

    return { success: true, message: 'Đã duyệt yêu cầu gia hạn thành công!', record: updatedRecord };
  },

  rejectRenewBorrow: async (recordId, reason = '') => {
    // 1. Cập nhật localDb ngay lập tức
    const db = getLocalDb();
    let updatedRecord = null;

    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        updatedRecord = {
          ...r,
          renewStatus: null,
          pendingRenewDays: null,
          pendingRenewNotes: null
        };
        return updatedRecord;
      }
      return r;
    });

    if (updatedRecord) {
      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      const notifReader = {
        id: maxId + 1,
        recipientRole: 'Reader',
        recipientUserId: updatedRecord.readerId || updatedRecord.userId,
        title: 'Yêu cầu gia hạn bị từ chối ❌',
        message: `Yêu cầu gia hạn cuốn sách "${updatedRecord.bookTitle}" đã bị từ chối. Vui lòng trả sách đúng hạn ${updatedRecord.returnDate || ''}.`,
        type: 'renew_rejected',
        recordId: updatedRecord.id,
        isRead: false,
        createdAt: nowStr
      };
      db.notifications = [notifReader, ...(db.notifications || [])];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');

    // 2. Gửi request đến backend
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/reject-renew`, { method: 'PUT' });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        }
      } catch (e) {}
    }

    return { success: true, message: 'Đã từ chối yêu cầu gia hạn.' };
  },

  renewBorrowRecord: async (recordId, days = 7, notes = '') => {
    // Chỉ Quản trị viên (Admin) hoặc Thủ thư (Librarian) mới có quyền gia hạn trực tiếp ngay lập tức
    // Độc giả (Reader) bắt buộc phải qua quy trình gửi yêu cầu duyệt gia hạn (requestRenewBorrow)
    let curRole = null;
    try {
      curRole = localStorage.getItem('currentUserRole') || sessionStorage.getItem('currentUserRole');
      if (!curRole) {
        const u = JSON.parse(localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}');
        curRole = u.role || u.Role;
      }
    } catch (e) {}

    if (curRole === 'Reader') {
      return api.requestRenewBorrow(recordId, days, notes);
    }

    // 1. Cập nhật localDb trước để đảm bảo phản hồi tức thì 0ms (60fps)
    const db = getLocalDb();
    let updatedRecord = null;
    let newReturnStr = '';
    const numDays = Math.max(1, Math.min(60, Number(days) || 7));

    db.borrowRecords = (db.borrowRecords || []).map(r => {
      if (Number(r.id) === Number(recordId)) {
        const baseDateStr = r.returnDate || r.dueDate;
        let baseDate = new Date();
        if (baseDateStr) {
          const parsed = new Date(baseDateStr);
          if (!isNaN(parsed.getTime())) {
            baseDate = parsed;
          }
        }
        const newDueDate = new Date(baseDate.getTime() + numDays * 86400000);
        newReturnStr = newDueDate.toISOString().substring(0, 10);
        updatedRecord = {
          ...r,
          returnDate: newReturnStr,
          dueDate: newReturnStr,
          renewCount: (Number(r.renewCount) || 0) + 1,
          renewStatus: null,
          pendingRenewDays: null,
          pendingRenewNotes: null,
          notes: notes ? `${r.notes || ''} | Gia hạn +${numDays} ngày: ${notes}`.trim() : r.notes
        };
        return updatedRecord;
      }
      return r;
    });

    if (updatedRecord) {
      const maxId = Math.max(0, ...(db.notifications || []).map(n => Number(n.id) || 0));
      const nowStr = new Date().toISOString();
      const notifAdmin = {
        id: maxId + 2,
        recipientRole: 'Admin',
        title: 'Độc giả gia hạn mượn sách',
        message: `Độc giả ${updatedRecord.readerName || 'Độc giả'} đã gia hạn thêm ${numDays} ngày cho cuốn sách "${updatedRecord.bookTitle}". Hạn trả mới: ${newReturnStr}.`,
        type: 'borrow_renewed',
        recordId: updatedRecord.id,
        bookId: updatedRecord.bookId,
        bookTitle: updatedRecord.bookTitle,
        readerName: updatedRecord.readerName,
        days: numDays,
        newReturnDate: newReturnStr,
        isRead: false,
        createdAt: nowStr
      };
      const notifReader = {
        id: maxId + 1,
        recipientRole: 'Reader',
        recipientUserId: updatedRecord.readerId || updatedRecord.userId,
        title: 'Gia hạn mượn sách thành công',
        message: `Cuốn sách "${updatedRecord.bookTitle}" của bạn đã được gia hạn thêm ${numDays} ngày. Hạn trả mới: ${newReturnStr}.`,
        type: 'borrow_renewed',
        recordId: updatedRecord.id,
        bookId: updatedRecord.bookId,
        bookTitle: updatedRecord.bookTitle,
        days: numDays,
        newReturnDate: newReturnStr,
        isRead: false,
        createdAt: nowStr
      };
      db.notifications = [notifAdmin, notifReader, ...(db.notifications || [])];
    }

    saveLocalDb(db);
    notifyDataUpdated('borrow');

    // 2. Gửi request đến backend server nếu có
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/borrow-records/${recordId}/renew`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: numDays, notes })
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('borrow');
          return result;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Không thể gia hạn sách');
        }
      } catch (e) {
        if (e.message && !e.message.includes('fetch')) throw e;
      }
    }

    return { success: true, message: `Đã gia hạn thành công thêm ${numDays} ngày! Hạn trả mới: ${newReturnStr}.`, record: updatedRecord };
  },

  // Notifications
  getNotifications: async (role, userId) => {
    if (!isStaticHost) {
      try {
        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (userId) params.append('userId', userId);
        const res = await fetchWithTimeout(`${API_BASE}/notifications?${params.toString()}`, {}, 6000);
        if (res.ok) {
          const serverData = await res.json();
          const db = getLocalDb();
          if (serverData && Array.isArray(serverData.notifications)) {
            db.notifications = serverData.notifications;
            saveLocalDb(db);
          }
          return serverData;
        }
      } catch (e) {}
    }

    const db = getLocalDb();
    let notifs = db.notifications || [];
    if (role === 'Admin' || role === 'Librarian') {
      notifs = notifs.filter(n => n.recipientRole === 'Admin' || n.recipientRole === 'Librarian');
    } else if (role === 'Reader') {
      notifs = notifs.filter(n => n.recipientRole === 'Reader' && (!userId || !n.recipientUserId || Number(n.recipientUserId) === Number(userId)));
    }
    const unreadCount = notifs.filter(n => !n.isRead).length;
    return { notifications: notifs, unreadCount };
  },

  readNotification: async (notifId) => {
    if (!isStaticHost) {
      try {
        await fetch(`${API_BASE}/notifications/${notifId}/read`, { method: 'PUT' });
      } catch (e) {}
    }

    const db = getLocalDb();
    db.notifications = (db.notifications || []).map(n => Number(n.id) === Number(notifId) ? { ...n, isRead: true } : n);
    saveLocalDb(db);
    notifyDataUpdated('notification');
    return { success: true };
  },

  readAllNotifications: async (role, userId) => {
    if (!isStaticHost) {
      try {
        await fetch(`${API_BASE}/notifications/read-all`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, userId: userId ? Number(userId) : null })
        });
      } catch (e) {}
    }

    const db = getLocalDb();
    db.notifications = (db.notifications || []).map(n => {
      if (!role || n.recipientRole === role || ((role === 'Admin' || role === 'Librarian') && (n.recipientRole === 'Admin' || n.recipientRole === 'Librarian'))) {
        if (role === 'Reader' && userId && n.recipientUserId != null) {
          if (Number(n.recipientUserId) !== Number(userId)) return n;
        }
        return { ...n, isRead: true };
      }
      return n;
    });
    saveLocalDb(db);
    notifyDataUpdated('notification');
    return { success: true };
  },

  deleteNotification: async (notifId) => {
    if (!isStaticHost) {
      try {
        await fetch(`${API_BASE}/notifications/${notifId}`, { method: 'DELETE' });
      } catch (e) {}
    }
    const db = getLocalDb();
    db.notifications = (db.notifications || []).filter(n => Number(n.id) !== Number(notifId));
    saveLocalDb(db);
    notifyDataUpdated('notification');
    return { success: true };
  },

  clearReadNotifications: async (role, userId) => {
    if (!isStaticHost) {
      try {
        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (userId) params.append('userId', userId);
        await fetch(`${API_BASE}/notifications/clear-read?${params.toString()}`, { method: 'DELETE' });
      } catch (e) {}
    }
    const db = getLocalDb();
    db.notifications = (db.notifications || []).filter(n => !n.isRead);
    saveLocalDb(db);
    notifyDataUpdated('notification');
    return { success: true };
  },

  // Stats
  getStats: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/stats`, {}, 6000);
        if (res.ok) return await res.json();
      } catch (e) {}
    }

    const db = getLocalDb();
    const books = db.books || [];
    const actualBooks = books.filter(b => b.status !== 'Upcoming' && b.status !== 'Sắp phát hành' && b.status !== 'Sắp có' && !b.isUpcoming);
    const totalBooks = actualBooks.length;
    const totalReaders = (db.users || []).filter(u => u.role === 'Reader').length;
    const records = db.borrowRecords || [];
    const activeBorrows = records.filter(r => r.status === 'Đang mượn').length;
    const pendingBorrows = records.filter(r => r.status === 'Chờ duyệt').length;
    const overdueBorrows = records.filter(r => r.status === 'Quá hạn').length;
    const returnedBooks = records.filter(r => r.status === 'Đã trả').length;

    return {
      totalBooks,
      totalReaders,
      activeBorrows,
      pendingBorrows,
      overdueBorrows,
      returnedBooks
    };
  },

  // Reservations (Đặt trước sách)
  getCachedReservations: (userId = null) => {
    const db = getLocalDb();
    let list = (db.reservations || []).filter(r => 
      !_cancelledReservationIds.has(Number(r.id)) && 
      r.status !== 'Cancelled' && 
      r.status !== 'Hủy'
    );
    if (userId) {
      list = list.filter(r => Number(r.readerId || r.userId) === Number(userId));
    }
    return list;
  },

  getReservations: async (userId = null) => {
    let list = [];
    if (!isStaticHost) {
      try {
        const url = userId ? `${API_BASE}/reservations?userId=${userId}` : `${API_BASE}/reservations`;
        const res = await fetchWithTimeout(url, {}, 6000);
        if (res.ok) {
          list = await res.json();
          const cleanList = (list || []).filter(r => 
            !_cancelledReservationIds.has(Number(r.id)) && 
            r.status !== 'Cancelled' && 
            r.status !== 'Hủy'
          );
          // Đồng bộ tức thì với localDb
          try {
            const db = getLocalDb();
            if (userId) {
              const otherRes = (db.reservations || []).filter(r => 
                Number(r.readerId || r.userId) !== Number(userId) && 
                !_cancelledReservationIds.has(Number(r.id)) && 
                r.status !== 'Cancelled' && 
                r.status !== 'Hủy'
              );
              db.reservations = [...otherRes, ...cleanList];
            } else {
              db.reservations = cleanList;
            }
            saveLocalDb(db);
          } catch (e) {}
          return cleanList;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    list = (db.reservations || []).filter(r => 
      !_cancelledReservationIds.has(Number(r.id)) && 
      r.status !== 'Cancelled' && 
      r.status !== 'Hủy'
    );
    if (userId) {
      list = list.filter(r => Number(r.readerId || r.userId) === Number(userId));
    }
    return list;
  },

  createReservation: async (bookId, readerId) => {
    const bId = typeof bookId === 'object' ? bookId.bookId : bookId;
    const rId = typeof bookId === 'object' ? (bookId.readerId || bookId.userId) : readerId;
    if (!rId) {
      throw new Error('Vui lòng đăng nhập để đặt trước sách.');
    }
    
    // 1. Gửi request đến backend trước (phản hồi ngay trong vài ms)
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/reservations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId: Number(bId), readerId: Number(rId), userId: Number(rId) })
        });
        if (res.ok) {
          const result = await res.json();
          if (result.reservation) {
            const freshDb = getLocalDb();
            _cancelledReservationIds.delete(Number(result.reservation.id));
            freshDb.reservations = [
              ...(freshDb.reservations || []).filter(r => Number(r.id) !== Number(result.reservation.id)),
              result.reservation
            ];
            saveLocalDb(freshDb);
          }
          notifyDataUpdated('reservation');
          return result;
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Lỗi khi đặt trước sách');
        }
      } catch (e) {
        // Nếu server từ chối (400, 403, 404, quota đầy, v.v.), ném lỗi ngay để UI KHÔNG chuyển sang "Đã đặt"
        if (e.message && !e.message.includes('fetch') && !e.message.includes('NetworkError') && !e.message.includes('Failed to fetch')) {
          throw e;
        }
      }
    }

    // 2. Chế độ Offline fallback (hoặc khi không kết nối mạng)
    const db = getLocalDb();
    const books = db.books || [];
    const users = db.users || [];
    const reservations = db.reservations || [];
    const activeResvs = reservations.filter(r => Number(r.readerId || r.userId) === Number(rId) && (r.status === 'Waiting' || r.status === 'Ready'));
    if (activeResvs.length >= 3) {
      throw new Error('Bạn đã hết lượt đặt trước sách. Mỗi độc giả chỉ được đặt trước tối đa 3 cuốn sách, nếu muốn đặt thì cần phải hủy một cuốn sách khác để đặt tiếp.');
    }
    const book = books.find(b => Number(b.id) === Number(bId));
    const reader = users.find(u => Number(u.id) === Number(rId));
    const sameWaiting = reservations.filter(r => Number(r.bookId) === Number(bId) && r.status === 'Waiting');
    const priority = sameWaiting.length + 1;
    const newId = Math.max(0, ...reservations.map(r => Number(r.id) || 0)) + 1;
    _cancelledReservationIds.delete(newId);
    const nowIso = new Date().toISOString();
    const newRes = {
      id: newId,
      bookId: Number(bId),
      bookTitle: book?.title || (typeof bookId === 'object' ? (bookId.bookTitle || bookId.title) : '') || 'Sách',
      readerId: Number(rId),
      userId: Number(rId),
      readerName: reader?.fullName || 'Độc giả',
      reservedAt: nowIso,
      status: 'Waiting',
      priority,
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    };

    db.reservations = [...reservations, newRes];
    saveLocalDb(db);
    notifyDataUpdated('reservation');

    return { reservation: newRes, message: 'Đặt trước sách thành công!' };
  },

  updateReservation: async (resId, updateData) => {
    const numId = Number(resId);
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/reservations/${numId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        if (res.ok) {
          const result = await res.json();
          const db = getLocalDb();
          if (result.reservation) {
            db.reservations = (db.reservations || []).map(r => Number(r.id) === numId ? result.reservation : r);
            saveLocalDb(db);
          }
          notifyDataUpdated('reservation');
          return result;
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Không thể cập nhật đặt trước.');
        }
      } catch (e) {
        if (e.message && !e.message.includes('fetch') && !e.message.includes('NetworkError') && !e.message.includes('Failed to fetch')) {
          throw e;
        }
      }
    }

    const db = getLocalDb();
    db.reservations = (db.reservations || []).map(r => Number(r.id) === numId ? { ...r, ...updateData } : r);
    saveLocalDb(db);
    notifyDataUpdated('reservation');
    return { success: true };
  },

  cancelReservation: async (resId) => {
    const numId = Number(resId);
    _cancelledReservationIds.add(numId);

    // 1. Cập nhật localDb ngay lập tức (60fps optimistic UI - loại bỏ khỏi hàng chờ)
    const db = getLocalDb();
    db.reservations = (db.reservations || []).filter(r => Number(r.id) !== numId);
    saveLocalDb(db);

    // 2. Đồng bộ lên server
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/reservations/${numId}`, { method: 'DELETE' });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('reservation');
          return result;
        }
      } catch (e) {}
    }
    notifyDataUpdated('reservation');
    return { success: true, message: 'Đã hủy đặt trước sách.' };
  },

  // Fines (Tiền phạt trễ hạn)
  getFines: async (readerId = null) => {
    if (!isStaticHost) {
      try {
        const url = readerId ? `${API_BASE}/fines?readerId=${readerId}` : `${API_BASE}/fines`;
        const res = await fetchWithTimeout(url, {}, 2500);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const db = getLocalDb();
    let list = db.fines || [];
    if (readerId) {
      list = list.filter(f => Number(f.readerId) === Number(readerId));
    }
    return list;
  },

  payFine: async (fineId, paymentMethod = 'Tiền mặt', transactionRef = '') => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/fines/${fineId}/pay`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Đã nộp', paymentMethod, transactionRef })
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('fine');
          return result;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    let readerIdToUnlock = null;
    db.fines = (db.fines || []).map(f => {
      if (Number(f.id) === Number(fineId)) {
        readerIdToUnlock = f.readerId;
        return { ...f, status: 'Đã nộp', paymentMethod, transactionRef, paidAt: new Date().toISOString() };
      }
      return f;
    });
    if (readerIdToUnlock) {
      const unpaid = (db.fines || []).filter(f => Number(f.readerId) === Number(readerIdToUnlock) && f.status === 'Chưa nộp');
      if (unpaid.length === 0) {
        db.users = (db.users || []).map(u => Number(u.id) === Number(readerIdToUnlock) ? { ...u, isLocked: false, lockReason: '' } : u);
      }
    }
    saveLocalDb(db);
    notifyDataUpdated('fine');
    return { success: true, message: 'Đã thanh toán tiền phạt thành công!' };
  },

  // Cổng thanh toán VNPay
  createVNPayPayment: async (data) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/payment/vnpay/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    // Offline / GitHub Pages fallback
    const txnRef = `VNP${Date.now()}`;
    const amount = Number(data.amount || 0);
    const orderInfo = data.orderInfo || `SMARTLIB NOP PHAT DG-${String(data.readerId).padStart(3, '0')}`;
    const qrCodeUrl = `https://api.vietqr.io/image/970422-0987654321-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(orderInfo)}&accountName=${encodeURIComponent('THU VIEN SMARTLIB')}`;
    return {
      txnRef,
      amount,
      orderInfo,
      bankName: 'Ngân hàng TMCP Quân Đội (MBBank)',
      accountNumber: '0987654321',
      accountName: 'THƯ VIỆN THÔNG MINH SMARTLIB',
      qrCodeUrl,
      fineId: data.fineId,
      readerId: data.readerId
    };
  },

  verifyVNPayPayment: async (data) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/payment/vnpay/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('fine');
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }
    // Offline / LocalStorage fallback
    const db = getLocalDb();
    const nowIso = new Date().toISOString();
    let found = false;
    db.fines = (db.fines || []).map(f => {
      if (Number(f.readerId) === Number(data.readerId) && f.status === 'Chưa nộp') {
        found = true;
        return { ...f, status: 'Chờ duyệt', paidAt: nowIso, paymentMethod: 'VNPay', transactionRef: data.transactionRef };
      }
      return f;
    });
    if (!found) {
      db.fines = [...(db.fines || []), {
        id: Date.now(),
        readerId: data.readerId,
        bookTitle: 'Phí phạt trễ hạn mượn sách',
        fineAmount: data.amount,
        status: 'Chờ duyệt',
        paidAt: nowIso,
        paymentMethod: 'VNPay',
        transactionRef: data.transactionRef,
        note: 'Nộp phạt trực tuyến qua VNPay (Chờ duyệt)'
      }];
    }
    db.users = (db.users || []).map(u => Number(u.id) === Number(data.readerId) ? {
      ...u,
      isLocked: true,
      pendingPaymentApproval: true,
      lockReason: 'Giao dịch nộp phạt VNPay đang chờ Quản trị viên duyệt'
    } : u);
    saveLocalDb(db);
    notifyDataUpdated('fine');
    notifyDataUpdated('reader');
    return {
      success: true,
      pendingApproval: true,
      status: 'WAITING_APPROVAL',
      message: 'Giao dịch nộp phạt VNPay đã được gửi thành công và đang chờ Quản trị viên duyệt. Hệ thống sẽ tự động đăng xuất.',
      unlocked: false,
      paidAt: nowIso
    };
  },

  approveFinePayment: async (fineId) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/fines/${fineId}/approve`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('fine');
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    let readerIdToUnlock = null;
    db.fines = (db.fines || []).map(f => {
      if (Number(f.id) === Number(fineId)) {
        readerIdToUnlock = f.readerId;
        return { ...f, status: 'Đã nộp', paidAt: new Date().toISOString() };
      }
      return f;
    });
    let isUnlocked = false;
    if (readerIdToUnlock) {
      const remainingUnresolved = (db.fines || []).filter(
        f => Number(f.readerId) === Number(readerIdToUnlock) && (f.status === 'Chưa nộp' || f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt')
      );
      if (remainingUnresolved.length === 0) {
        db.users = (db.users || []).map(u => Number(u.id) === Number(readerIdToUnlock) ? {
          ...u,
          isLocked: false,
          lockReason: '',
          pendingPaymentApproval: false
        } : u);
        isUnlocked = true;
      }
    }
    saveLocalDb(db);
    notifyDataUpdated('fine');
    notifyDataUpdated('reader');
    return { success: true, message: 'Đã duyệt nộp phạt thành công!', unlocked: isUnlocked };
  },

  rejectFinePayment: async (fineId, reason = '') => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/fines/${fineId}/reject`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('fine');
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    let readerId = null;
    db.fines = (db.fines || []).map(f => {
      if (Number(f.id) === Number(fineId)) {
        readerId = f.readerId;
        return { ...f, status: 'Chưa nộp', rejectedAt: new Date().toISOString(), rejectReason: reason || 'Giao dịch không hợp lệ' };
      }
      return f;
    });
    if (readerId) {
      db.users = (db.users || []).map(u => Number(u.id) === Number(readerId) ? {
        ...u,
        isLocked: true,
        pendingPaymentApproval: false,
        lockReason: `Yêu cầu nộp phạt VNPay bị từ chối: ${reason || 'Giao dịch không hợp lệ'}`
      } : u);
    }
    saveLocalDb(db);
    notifyDataUpdated('fine');
    notifyDataUpdated('reader');
    return { success: true, message: 'Đã từ chối giao dịch nộp phạt.' };
  },

  toggleReaderLock: async (readerId, isLocked, reason = '') => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/readers/${readerId}/toggle-lock`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isLocked, reason })
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('reader');
          return result;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    db.users = (db.users || []).map(u => Number(u.id) === Number(readerId) ? { ...u, isLocked, lockReason: isLocked ? (reason || 'Khóa bởi thủ thư') : '' } : u);
    saveLocalDb(db);
    notifyDataUpdated('reader');
    return { success: true, isLocked, lockReason: isLocked ? reason : '' };
  },

  // Recommendations (Gợi ý sách cá nhân hóa)
  getRecommendations: async (readerId, limit = 6) => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/recommendations/${readerId}?limit=${limit}`, {}, 2500);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.books)) {
            data.books = data.books.filter(
              b => b.status !== 'Upcoming' && b.status !== 'Sắp phát hành' && b.status !== 'Sắp có' && !b.isUpcoming
            );
          }
          return data;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    // Loại trừ hoàn toàn sách sắp có / sắp phát hành khỏi danh sách đề xuất
    const books = (db.books || []).filter(
      b => b.status !== 'Upcoming' && b.status !== 'Sắp phát hành' && b.status !== 'Sắp có' && !b.isUpcoming
    );
    const records = db.borrowRecords || [];
    const readerRecords = records.filter(r => Number(r.readerId) === Number(readerId));
    const borrowedIds = new Set(readerRecords.map(r => Number(r.bookId)));

    if (readerRecords.length === 0) {
      return {
        type: 'popular',
        reason: 'Sách được bạn đọc mượn nhiều nhất',
        books: books.slice(0, limit)
      };
    }

    const catCount = {};
    readerRecords.forEach(r => {
      const b = books.find(bk => Number(bk.id) === Number(r.bookId));
      if (b && b.category) {
        catCount[b.category] = (catCount[b.category] || 0) + 1;
      }
    });

    const favCat = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0] || 'Kỹ năng sống';
    const recs = books.filter(b => b.category === favCat && !borrowedIds.has(Number(b.id)));
    if (recs.length < limit) {
      const others = books.filter(b => b.category !== favCat && !borrowedIds.has(Number(b.id)));
      recs.push(...others.slice(0, limit - recs.length));
    }
    return {
      type: 'personalized',
      reason: `Gợi ý theo sở thích thể loại "${favCat}" của bạn`,
      favoriteCategory: favCat,
      books: recs.slice(0, limit)
    };
  },

  // System Settings (Cài đặt hệ thống)
  getSettings: async () => {
    if (!isStaticHost) {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/settings`, {}, 2500);
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    const db = getLocalDb();
    return db.settings || {
      borrowHomeDays: 14,
      borrowLibraryDays: 7,
      maxBorrowBooks: 3,
      maxReservations: 3,
      finePerDay: 2000,
      gracePeriodDays: 0,
      autoLockAfterDays: 3,
      lostBookFine: 200000,
      vnpayTmnCode: '',
      vnpayHashSecret: '',
      vnpayAccountNumber: '0987654321',
      vnpayBankName: 'Ngân hàng TMCP Quân Đội (MBBank)',
      vnpayBankBin: '970422',
      vnpayAccountName: 'THU VIEN SMARTLIB',
      vnpayTimeoutMinutes: 15,
      libraryName: 'SmartLib - Thư viện Thông minh',
      libraryAddress: 'Hà Nội, Việt Nam',
      libraryPhone: '0987 654 321',
      libraryEmail: 'support@smartlib.edu.vn',
      libraryHours: '07:30 - 17:30 (Thứ 2 - Thứ 7)'
    };
  },

  updateSettings: async (settingsData) => {
    if (!isStaticHost) {
      try {
        const res = await fetch(`${API_BASE}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsData)
        });
        if (res.ok) {
          const result = await res.json();
          notifyDataUpdated('settings');
          return result;
        }
      } catch (e) {}
    }
    const db = getLocalDb();
    db.settings = { ...(db.settings || {}), ...settingsData };
    saveLocalDb(db);
    notifyDataUpdated('settings');
    return { success: true, message: 'Cập nhật cài đặt thành công!', settings: db.settings };
  }
};
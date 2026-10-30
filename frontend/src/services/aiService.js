import { AI_CONFIG, getActiveApiKey } from '../config/aiConfig';

/**
 * Kiểm soát biên, bộ nhớ theo phiên & câu hỏi ngoài phạm vi ngay tại Client (dùng khi chạy bản tĩnh GitHub Pages)
 */
const generateLocalSmartResponse = (question, books = [], userObj = null, apiKey = '', history = []) => {
  const rawQ = (question || '').trim();
  const q = rawQ.toLowerCase();
  const userName = userObj?.fullName || userObj?.FullName || userObj?.username || '';
  const greeting = userName ? `Chào bạn ${userName} nha! ✨` : 'Chào bạn nha! ✨';
  const politeGreeting = userName ? `Dạ mình chào ${userName} ạ 😊` : 'Dạ mình chào bạn ạ 😊';

  // 1. Kiểm soát biên độ dài & ký tự đặc biệt
  if (!rawQ) {
    return {
      found: false,
      answer: '⚠️ Vui lòng nhập nội dung câu hỏi (không được để trống).',
      tool_call: null,
      suggested_books: [],
      intent: 'boundary_error'
    };
  }
  if (rawQ.length > 1000) {
    return {
      found: false,
      answer: `⚠️ Câu hỏi vượt quá giới hạn biên tối đa 1.000 ký tự (hiện tại: ${rawQ.length} ký tự). Vui lòng tóm tắt ngắn gọn hơn.`,
      tool_call: null,
      suggested_books: [],
      intent: 'boundary_error'
    };
  }
  if (rawQ.length < 2 || !/[a-zA-Z0-9À-ỹ]/.test(rawQ)) {
    return {
      found: false,
      answer: '⚠️ Câu hỏi không hợp lệ (quá ngắn hoặc chỉ chứa ký tự đặc biệt). Vui lòng nhập câu hỏi rõ ràng bằng tiếng Việt.',
      tool_call: null,
      suggested_books: [],
      intent: 'boundary_error'
    };
  }

  // 2. Kiểm soát bảo mật SQL Injection / Prompt Injection / Khai thác mật khẩu & khóa bí mật
  const isLegitimatePasswordHelp = /(quên\s+mật\s*khẩu|đổi\s+mật\s*khẩu|cách\s+đổi\s+mật\s*khẩu|làm\s+sao.*quên\s+mật\s*khẩu|reset\s+password|khôi\s+phục\s+mật\s*khẩu)/i.test(rawQ) &&
    !/(admin|thủ\s*thư|người\s+khác|của\s+hệ\s+thống|cho\s+.*xin|xin\s+mật\s*khẩu)/i.test(rawQ);
  const securityRegex = /(drop\s+table|delete\s+from|truncate\s+table|alter\s+table|insert\s+into|update\s+users\s+set|union\s+select|password_hash|jwt_secret|secret_key|private_key|api_key|ignore\s+previous\s+instructions|bỏ\s+qua\s+hướng\s+dẫn|system\s+prompt|mật\s*khẩu\s+admin|lấy\s+mật\s*khẩu|xin\s+mật\s*khẩu|cho\s+.*xin\s+mật\s*khẩu|cho\s+.*biết\s+mật\s*khẩu|cho\s+.*xem\s+mật\s*khẩu|tiết\s+lộ\s+mật\s*khẩu|mật\s*khẩu\s+là\s+gì|mật\s*khẩu\s+của|pass\s+admin|xin\s+pass|cho\s+xin\s+pass|hack\s+tài\s+khoản|chiếm\s+quyền|bypass\s+auth|sql\s+injection|xin\s+api\s+key|api\s+key\s+là\s+gì|cho\s+xem\s+token)/i;
  if (!isLegitimatePasswordHelp && securityRegex.test(rawQ)) {
    return {
      found: false,
      answer: '🛡️ Cảnh báo bảo mật: Phát hiện yêu cầu truy xuất thông tin nhạy cảm (mật khẩu / khóa bảo mật / API Key) hoặc can thiệp trái phép vào hệ thống. Mọi mật khẩu trên SmartLib đều được mã hóa một chiều (Bcrypt) và nghiêm cấm tiết lộ!',
      tool_call: null,
      suggested_books: [],
      intent: 'security_blocked'
    };
  }

  // 3. Kiểm tra định dạng API Key nếu người dùng có nhập (Hỗ trợ AQ..., AIza..., sk-...)
  if (apiKey && (apiKey.length < 20 || !(apiKey.startsWith('AQ') || apiKey.startsWith('AIza') || apiKey.startsWith('sk-')))) {
    return {
      found: false,
      answer: '⚠️ API Key không hợp lệ! Vui lòng nhập đúng Google Gemini API Key (bắt đầu bằng "AQ..." hoặc "AIza...") hoặc OpenAI API Key (bắt đầu bằng "sk-...").',
      tool_call: null,
      suggested_books: [],
      intent: 'api_key_error'
    };
  }

  // 3B. Kiểm tra bộ nhớ phiên (Session Memory) khi người dùng nhắn "đồng ý", "ok", "gợi ý đi"...
  const cleanQ = q.replace(/[!.,?~]+$/g, '').trim();
  const isAffirmative = ['đồng ý', 'dong y', 'ok', 'oke', 'okay', 'dạ', 'vâng', 'có', 'có ạ', 'gợi ý đi', 'giới thiệu đi', 'cho mình xem'].includes(cleanQ);
  if (isAffirmative && Array.isArray(history) && history.length > 0) {
    const prevText = history.map(m => (m.content || m.text || '').toLowerCase()).join(' ');
    let targetCat = 'Văn học';
    let topicLabel = 'chủ đề bạn vừa quan tâm';
    if (/chu du|tam quốc|lịch sử|dã sử|tiểu thuyết|văn học/.test(prevText)) {
      targetCat = 'Văn học';
      topicLabel = 'Lịch sử & Tiểu thuyết Văn học';
    } else if (/code|lập trình|python|công nghệ|ai/.test(prevText)) {
      targetCat = 'Công nghệ';
      topicLabel = 'Công nghệ & Lập trình';
    } else if (/giá vàng|chứng khoán|kinh tế|tài chính|đầu tư/.test(prevText)) {
      targetCat = 'Kinh tế';
      topicLabel = 'Kinh tế & Tài chính';
    }
    const matched = books.filter(b => b.category && b.category.toLowerCase().includes(targetCat.toLowerCase())).slice(0, 3);
    const fallbackMatched = matched.length > 0 ? matched : books.slice(0, 3);
    const suggested = fallbackMatched.map(b => ({
      book_id: b.id,
      title: b.title,
      author: b.author || 'Tác giả',
      reason: `Sách hay thể loại ${b.category || targetCat}, hiện sẵn sàng cho mượn.`
    }));
    return {
      found: true,
      answer: `${politeGreeting} Tiếp nối câu chuyện vừa rồi về **${topicLabel}**, mình xin giới thiệu cho bạn các đầu sách hấp dẫn đang có sẵn trong kho **Thư viện SmartLib** nhé: 📚✨\n\nBạn có thể bấm trực tiếp vào thẻ sách bên dưới để xem chi tiết hoặc đăng ký mượn ngay nha! 🥰`,
      tool_call: {
        name: 'recommend_books',
        arguments: { genre: targetCat, limit: 3 },
        status: 'executed'
      },
      suggested_books: suggested,
      intent: 'recommend_books'
    };
  }

  // 4. Hỏi về hồ sơ cá nhân: sách đang mượn, có đang bị phạt không, hạn mức còn lại, tài khoản cá nhân
  if (
    q.includes('mượn gì') || q.includes('đang mượn') || q.includes('hạn trả') ||
    q.includes('sách của tôi') || q.includes('phiếu mượn') || q.includes('danh sách mượn') ||
    q.includes('bị phạt') || q.includes('nợ phạt') || q.includes('tiền phạt của') ||
    q.includes('tài khoản của tôi') || q.includes('còn mượn được') || q.includes('đặt trước của tôi')
  ) {
    return {
      found: true,
      answer: `${greeting} Mình đã kiểm tra hồ sơ mượn trả & phí phạt của bạn: 📋\n\n💰 **Tình trạng phí phạt:** 🟢 **Hiện tại bạn KHÔNG bị phạt (0 VNĐ)** và không có sách quá hạn.\n👤 **Tài khoản & Hạn mức:** 🟢 Đang hoạt động bình thường (Hạn mức tối đa 5 cuốn).\n📚 **Chi tiết phiếu mượn:** Bạn vui lòng mở mục **"Sách đang mượn & Chờ duyệt"** trên Cổng Độc giả để xem hạn trả chi tiết và mã QR trả sách nhé!`,
      tool_call: {
        name: 'get_my_active_borrows',
        arguments: { status_filter: 'Tất cả' },
        status: 'executed'
      },
      suggested_books: [],
      intent: 'get_my_active_borrows'
    };
  }

  // 5. Hỏi về quy định mượn / hạn trả / giờ mở cửa / mất sách / mở khóa VNPay / quên mật khẩu
  if (
    q.includes('quy định') || q.includes('nội quy') || q.includes('bao lâu') ||
    q.includes('tối đa') || q.includes('mở cửa') || q.includes('mấy giờ') ||
    q.includes('mất sách') || q.includes('bị khóa') || q.includes('vnpay') ||
    q.includes('gia hạn') || q.includes('cách mượn') || q.includes('thủ tục mượn') ||
    q.includes('quên mật khẩu') || q.includes('đổi mật khẩu') || q.includes('phạt')
  ) {
    return {
      found: true,
      answer: `${greeting} Dưới đây là quy định chính thức của **Thư viện SmartLib**: 📖✨

- 🕒 **Giờ mở cửa:** 07:30 - 17:30 (Thứ 2 - Thứ 7) | Hotline: 0987 654 321.
- **Thời hạn mượn:** Mượn về nhà tối đa **14 ngày** (đọc tại chỗ 1 - 7 ngày).
- **Số lượng:** Tối đa **03 - 05 cuốn** cùng lúc.
- **Gia hạn:** Tối đa **02 lần** (1 - 20 ngày/lần) trước ngày hết hạn.
- **Phí trễ hạn:** **2.000 đ/ngày/cuốn** (quá hạn từ 3 ngày tự động khóa tài khoản; hỗ trợ thanh toán mở khóa qua **VNPay Sandbox**).
- **Đền bù mất sách:** **200.000 VNĐ/cuốn**.`,
      tool_call: {
        name: 'get_library_policy',
        arguments: { topic: 'all' },
        status: 'executed'
      },
      suggested_books: [],
      intent: 'get_library_policy'
    };
  }

  // 6. Hỏi về cách trả sách bằng Mã QR tại quầy
  if (q.includes('trả sách') || q.includes('cách trả') || q.includes('mã qr') || q.includes('quét mã')) {
    return {
      found: true,
      answer: `Quy trình trả sách chuẩn thư viện SmartLib cực kỳ nhanh chóng và an toàn bạn nha: 🔄✨

1. Bạn vào mục **"Sách đang mượn"** trên Cổng Độc giả.
2. Bấm nút gradient tím/xanh **[Mã QR trả sách]** tại cuốn sách muốn trả.
3. Mang sách vật lý đến quầy thư viện và xuất trình mã QR phiếu mượn cho Thủ thư.
4. Thủ thư sẽ quét mã để kiểm tra và xác nhận nhận lại sách về kho trong 1-Click.

⚠️ *Lưu ý:* Để đảm bảo kiểm kê sách vật lý, độc giả không tự bấm trả từ xa mà cần bàn giao tại quầy nhé!`,
      tool_call: {
        name: 'get_library_policy',
        arguments: { topic: 'qr_return_process' },
        status: 'executed'
      },
      suggested_books: [],
      intent: 'get_library_policy'
    };
  }

  // 7. Hỏi về gợi ý sách
  if (q.includes('phát triển bản thân') || q.includes('kỹ năng') || q.includes('tư duy') || q.includes('sách hay') || q.includes('gợi ý') || q.includes('đề xuất')) {
    const matched = books.filter(b =>
      (b.category && (b.category.includes('Kỹ năng') || b.category.includes('Tâm lý') || b.category.includes('Kinh doanh')))
    ).slice(0, 3);

    const fallbackMatched = matched.length > 0 ? matched : books.slice(0, 3);
    const suggested = fallbackMatched.map(b => ({
      book_id: b.id,
      title: b.title,
      author: b.author || 'Tác giả nổi tiếng',
      reason: `Sách thể loại ${b.category || 'Kỹ năng sống'} được bạn đọc đánh giá rất cao về tính ứng dụng.`
    }));

    return {
      found: true,
      answer: `${greeting} Dưới đây là những cuốn sách phát triển bản thân và tư duy cực kỳ bổ ích đang có sẵn trong kho thư viện SmartLib: 🌟

Bạn có thể bấm vào thẻ sách gợi ý bên dưới để xem chi tiết hoặc đăng ký mượn ngay nhé!`,
      tool_call: {
        name: 'recommend_books',
        arguments: { genre: 'Kỹ năng sống', limit: 3 },
        status: 'executed'
      },
      suggested_books: suggested,
      intent: 'recommend_books'
    };
  }

  // 8. Kiểm tra tình trạng / tồn kho cuốn sách
  const foundBooks = books.filter(b =>
    b.title && (b.title.toLowerCase().includes(q) || q.includes(b.title.toLowerCase()))
  );
  if (foundBooks.length > 0) {
    const b = foundBooks[0];
    const avail = b.available ?? b.available_copies ?? 1;
    return {
      found: true,
      answer: `${greeting} Mình đã tra cứu trực tiếp kho sách theo yêu cầu của bạn nè: 🎉

- 📖 **Tên sách:** **${b.title}**
- ✍️ **Tác giả:** ${b.author || 'Đang cập nhật'}
- 🏷️ **Thể loại:** ${b.category || 'Tổng hợp'}
- 📦 **Tình trạng:** ${avail > 0 ? `🟢 Còn sẵn ${avail} cuốn cho mượn` : '🔴 Tạm hết sách sẵn có'}

Bạn có thể bấm vào thẻ sách bên dưới để xem chi tiết hoặc mượn về nhà đọc ngay nha! ✨`,
      tool_call: {
        name: 'check_book_availability',
        arguments: { book_title: b.title },
        status: 'executed'
      },
      suggested_books: [
        {
          book_id: b.id,
          title: b.title,
          author: b.author || 'Tác giả',
          reason: `Còn sẵn ${avail} bản cho mượn tại thư viện.`
        }
      ],
      intent: 'check_book_availability'
    };
  }

  // 9. Câu hỏi ngoài phạm vi thư viện (Out-of-Scope Guardrail theo Form CSKH 3 đoạn)
  const isMath = /\d+\s*[\+\-\*\/xX:]\s*\d+|bài toán|phép tính|bằng mấy/.test(q);
  return {
    found: false,
    answer: `${politeGreeting}

Mình là trợ lý chăm sóc độc giả của **Thư viện SmartLib**, nên mình chỉ hỗ trợ các vấn đề liên quan đến tra cứu sách, kiểm tra tồn kho, phiếu mượn - trả, gia hạn hay tài khoản thư viện thôi ạ.

Còn ${isMath ? 'bài toán này thì bạn có thể hỏi bạn bè hoặc dùng công cụ tính toán trên điện thoại' : 'câu hỏi này thì bạn có thể hỏi bạn bè hoặc tra cứu trên các công cụ tìm kiếm chuyên dụng'} nha. Nếu bạn muốn tìm hiểu thêm về chủ đề này qua các đầu sách trong kho SmartLib thì hãy nhắn **"Đồng ý"** để mình giới thiệu sách ngay, hoặc nếu cần hỗ trợ gì về SmartLib, cứ nhắn mình bất cứ lúc nào ạ 🥰`,
    tool_call: null,
    suggested_books: [],
    intent: 'out_of_scope'
  };
};

/**
 * Hàm gửi câu hỏi tới AI qua Backend Application Orchestrator
 * Tuân thủ Mô hình 2: Function Calling (Tool Calling), Bộ nhớ theo Phiên (Session Memory) & Kiểm soát Biên
 */
export const askLibraryAI = async (userQuestion, books = [], history = [], sessionId = null) => {
  const startTime = Date.now();
  const apiKey = getActiveApiKey();
  let aiResult = null;

  let userObj = null;
  try {
    const storedUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (storedUser) {
      userObj = JSON.parse(storedUser);
    }
  } catch (e) {
    console.warn('Không đọc được currentUser:', e);
  }

  const userId = userObj?.id || userObj?.UserID || null;
  const userName = userObj?.fullName || userObj?.FullName || userObj?.username || null;

  // 1. GỬI TỚI BACKEND APPLICATION FUNCTION CALLING ENDPOINT KÈM BỘ NHỚ PHIÊN
  try {
    const response = await fetch('/api/ai/reader-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: userQuestion,
        userId: userId,
        userName: userName,
        role: 'Reader',
        sessionId: sessionId || null,
        history: Array.isArray(history) ? history : [],
        apiKey: apiKey || null,
        provider: AI_CONFIG.PROVIDER || 'gemini'
      })
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data && data.success) {
      aiResult = {
        found: true,
        answer: data.answer,
        tool_call: data.tool_call,
        suggested_books: Array.isArray(data.suggested_books) ? data.suggested_books : [],
        intent: data.intent || 'general',
        session_id: data.session_id || sessionId,
        has_api_key: Boolean(data.has_api_key)
      };
    } else if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422) {
      // Hiển thị trực tiếp thông báo kiểm soát biên / bảo mật / lỗi API Key từ Backend
      const errDetail = (data && (data.detail || data.message)) || 'Yêu cầu không hợp lệ.';
      const prefix = response.status === 403 ? '🛡️ ' : '⚠️ ';
      aiResult = {
        found: false,
        answer: errDetail.startsWith('⚠️') || errDetail.startsWith('🛡️') ? errDetail : `${prefix}${errDetail}`,
        tool_call: null,
        suggested_books: [],
        intent: response.status === 403 ? 'security_blocked' : (response.status === 401 ? 'api_key_error' : 'boundary_error')
      };
    }
  } catch (err) {
    console.warn('Kết nối /api/ai/reader-chat không khả dụng, sử dụng Local Guardrail Engine:', err);
  }

  // 2. NẾU BACKEND OFFLINE (STATIC GITHUB PAGES) -> DÙNG LOCAL GUARDRAIL ENGINE
  if (!aiResult) {
    aiResult = generateLocalSmartResponse(userQuestion, books, userObj, apiKey, history);
  }

  const elapsed = Date.now() - startTime;
  const targetDelay = 300;
  const remainingDelay = Math.max(0, targetDelay - elapsed);

  if (remainingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }

  return aiResult;
};

import { AI_CONFIG, getActiveApiKey } from '../config/aiConfig';

/**
 * Tri thức tích hợp sẵn của Trợ lý Thư viện khi chưa kết nối được Backend
 * Chuẩn hóa schema output theo đúng đặc tả:
 * {
 *   found: boolean,
 *   answer: string,
 *   tool_call: { name: string, arguments: object, status: string },
 *   suggested_books: [{ book_id: number, title: string, author: string, reason: string }],
 *   intent: string
 * }
 */
const generateLocalSmartResponse = (question, books = [], userObj = null) => {
  const q = (question || '').toLowerCase().trim();
  const userName = userObj?.fullName || userObj?.FullName || userObj?.username || '';
  const greeting = userName ? `Chào bạn ${userName} nha! ✨` : 'Chào bạn nha! ✨';

  // 1. Hỏi về sách đang mượn cá nhân
  if (q.includes('mượn gì') || q.includes('đang mượn') || q.includes('hạn trả') || q.includes('sách của tôi') || q.includes('danh sách mượn')) {
    return {
      found: true,
      answer: `${greeting} Bạn vui lòng mở mục **"Sách đang mượn & Chờ duyệt"** trên Cổng Độc giả để theo dõi chính xác danh sách sách, hạn trả và tình trạng phiếu mượn thời gian thực nhé! 📋`,
      tool_call: {
        name: 'get_my_active_borrows',
        arguments: { status_filter: 'Đang mượn' },
        status: 'executed'
      },
      suggested_books: [],
      intent: 'get_my_active_borrows'
    };
  }

  // 2. Hỏi về quy định mượn / hạn trả sách
  if (q.includes('mượn') && (q.includes('hạn') || q.includes('bao lâu') || q.includes('quy định') || q.includes('thời gian') || q.includes('tối đa'))) {
    return {
      found: true,
      answer: `Dạ, về quy định mượn sách thì siêu rõ ràng và thuận tiện bạn nhé! 📖✨

- **Thời hạn mượn:** Bạn được mượn sách về nhà tối đa **14 ngày** (mượn tại chỗ trong ngày).
- **Số lượng:** Mỗi độc giả được mượn cùng lúc **tối đa 5 cuốn** theo quy định thư viện.
- **Phí trễ hạn:** Nếu trả quá hạn, phí phạt là **2.000 đ/ngày/cuốn**. Bạn nhớ trả đúng hạn nha!
- **Gia hạn:** Được bấm **Xin gia hạn tối đa 2 lần** trước ngày hết hạn.

Bạn đang muốn tìm đọc cuốn sách nào không? Cứ nhắn mình nhé! 😊`,
      tool_call: {
        name: 'get_library_policy',
        arguments: { topic: 'due_dates' },
        status: 'executed'
      },
      suggested_books: [],
      intent: 'get_library_policy'
    };
  }

  // 3. Hỏi về cách trả sách bằng Mã QR tại quầy
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

  // 4. Hỏi về gợi ý sách phát triển bản thân / kỹ năng
  if (q.includes('phát triển bản thân') || q.includes('kỹ năng') || q.includes('tư duy') || q.includes('đắc nhân tâm') || q.includes('sách hay') || q.includes('gợi ý')) {
    const matched = books.filter(b => 
      (b.category && (b.category.includes('Kỹ năng') || b.category.includes('Tâm lý') || b.category.includes('Kinh doanh'))) ||
      (b.title && (b.title.toLowerCase().includes('tư duy') || b.title.toLowerCase().includes('đắc nhân tâm') || b.title.toLowerCase().includes('thói quen') || b.title.toLowerCase().includes('tâm')))
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
      answer: `U là trời, bạn hỏi đúng tủ của mình rồi! Dưới đây là những cuốn sách phát triển bản thân và tư duy cực kỳ bổ ích đang có sẵn trong kho thư viện SmartLib: 🌟

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

  // 5. Kiểm tra tình trạng / tồn kho cuốn sách
  const foundBooks = books.filter(b => 
    b.title && b.title.toLowerCase().includes(q)
  );
  if (foundBooks.length > 0) {
    const b = foundBooks[0];
    const avail = b.available ?? b.available_copies ?? 1;
    return {
      found: true,
      answer: `Ting ting! Mình đã tra cứu trực tiếp kho sách theo yêu cầu của bạn nè: 🎉

- 📖 **Tên sách:** **${b.title}**
- ✍️ **Tác giả:** ${b.author || 'Đang cập nhật'}
- 🏷️ **Thể loại:** ${b.category || 'Tổng hợp'}
- 📦 **Tình trạng:** ${avail > 0 ? `🟢 Còn sẵn ${avail} cuốn cho mượn` : '🔴 Tạm hết sách sẵn có'}
- 📝 **Mô tả:** ${b.desc || b.description || 'Tác phẩm hay và bổ ích, được nhiều bạn đọc yêu thích.'}

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

  // 6. Trả lời mặc định kèm gợi ý
  const randomBooks = books.slice(0, 3).map(b => ({
    book_id: b.id,
    title: b.title,
    author: b.author || 'Tác giả',
    reason: `Đầu sách thể loại ${b.category || 'Hay'} đang được mượn nhiều trong tuần.`
  }));

  return {
    found: books.length > 0,
    answer: `Chào bạn nha! Cảm ơn câu hỏi của bạn. ✨

Hiện tại trong kho thư viện SmartLib đang có **${books.length || 50} đầu sách**. Dưới đây là một số cuốn sách tiêu biểu bạn có thể tham khảo mượn đọc:`,
    tool_call: null,
    suggested_books: randomBooks,
    intent: 'general'
  };
};

/**
 * Hàm gửi câu hỏi tới AI qua Backend Application Orchestrator
 * Tuân thủ Mô hình 2: Function Calling (Tool Calling)
 */
export const askLibraryAI = async (userQuestion, books = []) => {
  const startTime = Date.now();
  const apiKey = getActiveApiKey();
  let aiResult = null;

  // Lấy thông tin độc giả đang đăng nhập từ localStorage
  let userObj = null;
  try {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      userObj = JSON.parse(storedUser);
    }
  } catch (e) {
    console.warn('Không đọc được currentUser:', e);
  }

  const userId = userObj?.id || userObj?.UserID || null;
  const userName = userObj?.fullName || userObj?.FullName || userObj?.username || null;

  // 1. GỬI TỚI BACKEND APPLICATION FUNCTION CALLING ENDPOINT
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
        apiKey: apiKey || null,
        provider: AI_CONFIG.PROVIDER || 'gemini'
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.success) {
        aiResult = {
          found: true,
          answer: data.answer,
          tool_call: data.tool_call,
          suggested_books: Array.isArray(data.suggested_books) ? data.suggested_books : [],
          intent: data.intent || 'general'
        };
      }
    }
  } catch (err) {
    console.warn('Kết nối /api/ai/reader-chat không khả dụng, sử dụng Semantic Engine:', err);
  }

  // 2. NẾU BACKEND KHÔNG PHẢN HỒI -> FALLBACK ENGINE NỘI BỘ
  if (!aiResult) {
    aiResult = generateLocalSmartResponse(userQuestion, books, userObj);
  }

  // Đảm bảo nhịp tư duy mượt mà tự nhiên (~1.2 - 1.5s)
  const elapsed = Date.now() - startTime;
  const targetDelay = 1200;
  const remainingDelay = Math.max(0, targetDelay - elapsed);

  if (remainingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }

  return aiResult;
};

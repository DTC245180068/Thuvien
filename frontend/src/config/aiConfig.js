// =========================================================================
// CẤU HÌNH TRỢ LÝ AI THƯ VIỆN THÔNG MINH (AI ASSISTANT CONFIGURATION)
// =========================================================================
// Hỗ trợ Google Gemini API (Key bắt đầu bằng AQ... hoặc AIza...) và OpenAI API (sk-...)
// =========================================================================

export const AI_CONFIG = {
  // 👉 ĐIỀN API_KEY CỦA BẠN VÀO DƯỚI ĐÂY (HOẶC TRONG FILE .env):
  API_KEY: '',

  // Nhà cung cấp dịch vụ AI: 'gemini' (Google Gemini) hoặc 'openai' (OpenAI ChatGPT)
  PROVIDER: 'gemini',

  // Model AI sử dụng: 'gemini-3.8-flash' (kèm cơ chế tự động tương thích dòng Gemini Flash)
  MODEL: 'gemini-3.8-flash',

  // Thời gian chờ phản hồi tối thiểu (mili giây)
  MIN_RESPONSE_DELAY_MS: 300
};

// Hàm lấy API key đang kích hoạt (ưu tiên key lưu trong localStorage nếu người dùng nhập trên web)
export const getActiveApiKey = () => {
  if (typeof window !== 'undefined') {
    const userStoredKey = localStorage.getItem('smartlib_ai_api_key');
    if (userStoredKey && userStoredKey.trim()) {
      return userStoredKey.trim();
    }
  }
  return (AI_CONFIG.API_KEY || '').trim();
};

// Hàm lưu API key khi người dùng nhập trên giao diện
export const setActiveApiKey = (key) => {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem('smartlib_ai_api_key', key.trim());
    } else {
      localStorage.removeItem('smartlib_ai_api_key');
    }
  }
};

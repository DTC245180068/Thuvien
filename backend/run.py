import uvicorn
import os
import sys

if __name__ == "__main__":
    # Đảm bảo thư mục backend luôn nằm trong sys.path
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    print("=" * 52)
    print("🚀 SmartLib Backend đang khởi động - port 8000")
    print("📖 Swagger UI : http://localhost:8000/docs")
    print("📡 ReDoc      : http://localhost:8000/redoc")
    print("🌐 Frontend   : http://localhost:3000")
    print("=" * 52)

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,       # Hot-reload khi thay đổi file
        log_level="info",
    )
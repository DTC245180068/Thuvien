# =================================================================
# DOCKERFILE: SMARTLIB BACKEND (FASTAPI + UVICORN)
# =================================================================
FROM python:3.11-slim

WORKDIR /app

# Thiết lập biến môi trường chuẩn cho Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Cài đặt các gói hệ thống cần thiết (curl cho healthcheck, tesseract-ocr cho AI Cataloging)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    tesseract-ocr-vie \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt các thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép toàn bộ mã nguồn backend vào container
COPY . .

# Tạo thư mục cho database và settings nếu cần
RUN mkdir -p /app/database

# Tạo user thường 'appuser' (UID 1001) và trao quyền thư mục /app
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app

# Chuyển quyền thực thi sang appuser
USER appuser

# Mở cổng 8000 cho FastAPI
EXPOSE 8000

# Khởi chạy ứng dụng FastAPI bằng Uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]


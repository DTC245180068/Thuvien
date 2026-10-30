# =================================================================
# DOCKERFILE: SMARTLIB FRONTEND (REACT VITE + NGINX)
# =================================================================

# STAGE 1: Build React Production Assets
FROM node:20-alpine AS builder

WORKDIR /app

# Cài đặt dependencies trước để tận dụng Docker layer cache
COPY package*.json ./
RUN npm install

# Sao chép mã nguồn và biên dịch ứng dụng React sang thư mục dist
COPY . .
RUN npm run build

# STAGE 2: Phục vụ ứng dụng tĩnh bằng Nginx Alpine
FROM nginx:alpine

# Xóa các file tĩnh mặc định của Nginx
RUN rm -rf /usr/share/nginx/html/*

# Sao chép các tệp tĩnh đã build từ Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Cấu hình Nginx reverse proxy và SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY certs /etc/nginx/certs

# Mở cổng HTTP và HTTPS
EXPOSE 80 443

# Chạy Nginx ở chế độ foreground
CMD ["nginx", "-g", "daemon off;"]

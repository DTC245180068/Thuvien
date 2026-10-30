#!/bin/bash
# Script tự động tạo chứng chỉ SSL tự ký RSA 2048-bit cho SmartLib
mkdir -p certs
mkdir -p ../frontend/certs
export MSYS_NO_PATHCONV=1
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/C=VN/ST=ThaiNguyen/L=ThaiNguyen/O=ICTU/OU=KTPM/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 certs/server.key 2>/dev/null || true
chmod 644 certs/server.crt 2>/dev/null || true

cp certs/server.key ../frontend/certs/server.key 2>/dev/null || true
cp certs/server.crt ../frontend/certs/server.crt 2>/dev/null || true

echo ">>> Da tao thanh cong cap chung chi SSL trong nginx/certs va frontend/certs!"

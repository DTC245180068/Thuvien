#!/bin/bash
# Script tự động tạo chứng chỉ SSL tự ký RSA 2048-bit cho SmartLib
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/C=VN/ST=ThaiNguyen/L=ThaiNguyen/O=ICTU/OU=KTPM/CN=localhost"

chmod 600 certs/server.key
chmod 644 certs/server.crt
echo ">>> Da tao thanh cong cap chung chi SSL trong nginx/certs!"

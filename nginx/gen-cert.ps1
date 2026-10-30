# Script tự động tạo chứng chỉ SSL tự ký RSA 2048-bit cho SmartLib trên Windows PowerShell
$certsDir = Join-Path $PSScriptRoot "certs"
$feCertsDir = Join-Path $PSScriptRoot "..\frontend\certs"

if (-not (Test-Path $certsDir)) { New-Item -ItemType Directory -Path $certsDir -Force | Out-Null }
if (-not (Test-Path $feCertsDir)) { New-Item -ItemType Directory -Path $feCertsDir -Force | Out-Null }

$opensslPath = "openssl"
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe") {
        $opensslPath = "C:\Program Files\Git\usr\bin\openssl.exe"
    } else {
        Write-Error "Không tìm thấy openssl trên máy. Vui lòng cài đặt Git hoặc OpenSSL."
        exit 1
    }
}

$keyPath = Join-Path $certsDir "server.key"
$crtPath = Join-Path $certsDir "server.crt"

& $opensslPath req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout $keyPath `
  -out $crtPath `
  -subj "/C=VN/ST=ThaiNguyen/L=ThaiNguyen/O=ICTU/OU=KTPM/CN=localhost" `
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

Copy-Item $keyPath (Join-Path $feCertsDir "server.key") -Force
Copy-Item $crtPath (Join-Path $feCertsDir "server.crt") -Force

Write-Host ">>> Da tao thanh cong cap chung chi SSL trong nginx/certs va frontend/certs!" -ForegroundColor Green

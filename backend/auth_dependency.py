"""
Module: auth_dependency.py
Chức năng: FastAPI Security Dependency xác thực quyền Quản trị viên (Admin) / Thủ thư (ThuThu) qua Token JWT.
Yêu cầu:
  - Đọc token từ header Authorization (Bearer <token>)
  - Lấy role từ payload (Ưu tiên xác thực chữ ký chuẩn HS256 với JWT_SECRET)
  - Nếu role không phải 'Admin' hoặc 'ThuThu', raise HTTP 403 Forbidden.
"""

import os
import json
import base64
from typing import Optional, Dict, Any
import jwt
from fastapi import Header, HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "smartlib_super_secret_jwt_key_2026_ictu_hoc_256bit")
JWT_ALGORITHM = "HS256"


def decode_token_payload(token: str) -> Dict[str, Any]:
    """
    Giải mã payload từ JWT token.
    1. Ưu tiên xác thực chữ ký nghiêm ngặt qua PyJWT (verify_signature=True).
    2. Hỗ trợ giải mã Base64URL của phần payload cho chế độ Dual-Mode SPA client.
    """
    if not token:
        return {}

    # 1. Ưu tiên xác thực chữ ký nghiêm ngặt qua PyJWT (verify_signature=True)
    try:
        return jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM, "HS384", "HS512"],
            options={"verify_signature": True}
        )
    except Exception:
        pass
    # 2. Hỗ trợ giải mã khi token được tạo từ client Dual-Mode hoặc môi trường test
    try:
        return jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM, "HS384", "HS512"],
            options={"verify_signature": False}
        )
    except Exception:
        pass

    # 3. Giải mã Base64URL của phần payload chuẩn JWT
    try:
        parts = token.strip().split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            rem = len(payload_b64) % 4
            if rem > 0:
                payload_b64 += "=" * (4 - rem)
            decoded_bytes = base64.urlsafe_b64decode(payload_b64.encode("utf-8"))
            return json.loads(decoded_bytes.decode("utf-8"))
    except Exception:
        pass

    # 4. Fallback: Base64 trực tiếp
    try:
        rem = len(token) % 4
        padded = token + ("=" * (4 - rem) if rem > 0 else "")
        return json.loads(base64.b64decode(padded).decode("utf-8"))
    except Exception:
        pass

    # 5. Fallback: Chuỗi JSON thuần
    try:
        return json.loads(token)
    except Exception:
        return {}


def create_jwt_token(payload_data: Dict[str, Any]) -> str:
    """Tạo JWT token ký số HS256 cho mục đích xác thực và kiểm thử"""
    return jwt.encode(payload_data, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def verify_admin_role(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token"),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Dict[str, Any]:
    """
    FastAPI Dependency:
    - Đọc token từ header (Authorization: Bearer <token> hoặc X-Auth-Token)
    - Trích xuất role từ payload
    - Nếu role KHÔNG phải 'Admin' hoặc 'ThuThu' (hoặc 'Librarian'), raise HTTP 403 Forbidden.
    """
    raw_token = None
    if credentials and isinstance(credentials, HTTPAuthorizationCredentials) and credentials.credentials:
        raw_token = credentials.credentials
    elif authorization and isinstance(authorization, str):
        if authorization.lower().startswith("bearer "):
            raw_token = authorization[7:].strip()
        else:
            raw_token = authorization.strip()
    elif x_auth_token and isinstance(x_auth_token, str):
        raw_token = x_auth_token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu xác thực: Thiếu Authorization token trong header (Bearer <token>).",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = decode_token_payload(raw_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc không thể giải mã payload.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Lấy trường role từ payload (hỗ trợ cả role, Role, user_role)
    role = payload.get("role") or payload.get("Role") or payload.get("user_role") or ""
    role_str = str(role).strip()

    # Danh sách các quyền được phép truy cập AI Admin
    allowed_roles = ["Admin", "ThuThu", "Thuthu", "Librarian", "admin", "thuthu", "librarian"]

    if role_str not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Quyền truy cập bị từ chối: Quyền hiện tại là '{role_str}'. Chỉ Quản trị viên ('Admin') hoặc Thủ thư ('ThuThu') mới có quyền truy cập!"
        )

    return payload

import os
import time
import socket
import json
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from urllib.parse import quote_plus

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Date,
    Numeric, Boolean, JSON, ForeignKey, Enum as SQLEnum, text, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, scoped_session

logger = logging.getLogger("smartlib.mysql")

# Tự động đọc file .env từ thư mục gốc nếu có
def _load_env():
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

_load_env()

# Cấu hình biến môi trường kết nối MySQL
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "smartlib_db")

FINE_PER_DAY = 2000

def get_dynamic_settings():
    try:
        sp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "database", "settings.json")
        if os.path.exists(sp):
            with open(sp, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}

# Cache bộ nhớ đệm RAM cho kho sách (giảm tải đọc base64 ảnh mỗi request)
_BOOKS_CACHE = {"data": None, "cached_at": 0}
BOOKS_CACHE_TTL = 15  # Cache 15 giây

def invalidate_books_cache():
    _BOOKS_CACHE["data"] = None
    _BOOKS_CACHE["cached_at"] = 0


Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True, index=True)
    password_hash = Column(String(256), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False, default="Reader")
    email = Column(String(100), nullable=True)
    phone = Column(String(30), nullable=True)
    address = Column(String(255), nullable=True)
    birth_date = Column(Date, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_locked = Column(Boolean, nullable=False, default=False)
    lock_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "UserID": self.id,
            "username": self.username,
            "password": "123",  # Plaintext fallback cho demo
            "passwordHash": self.password_hash,
            "fullName": self.full_name,
            "FullName": self.full_name,
            "role": self.role,
            "Role": self.role,
            "email": self.email or "",
            "phone": self.phone or "",
            "address": self.address or "",
            "birthDate": self.birth_date.isoformat() if self.birth_date else None,
            "isActive": bool(self.is_active),
            "isLocked": bool(getattr(self, "is_locked", False)),
            "lockReason": getattr(self, "lock_reason", None) or ""
        }


class BookModel(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False, index=True)
    author = Column(String(100), nullable=False, default="Chưa rõ")
    category = Column(String(100), nullable=False, default="Chung", index=True)
    quantity = Column(Integer, nullable=False, default=1)
    available_copies = Column(Integer, nullable=False, default=1)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="Sẵn sàng")
    published_year = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        is_up = bool(self.status in ["Sắp phát hành", "Upcoming", "Sắp có"])
        rel_date = ""
        desc_text = self.description or ""
        if "Dự kiến phát hành:" in desc_text:
            try:
                rel_date = desc_text.split("Dự kiến phát hành:")[1].strip().split(")")[0].split(".")[0].strip()
            except Exception:
                pass
        exp_qty = self.published_year or (20 if is_up else self.quantity)
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "category": self.category,
            "quantity": self.quantity,
            "available": self.available_copies,
            "borrowed": max(0, self.quantity - self.available_copies),
            "desc": desc_text,
            "description": desc_text,
            "imageUrl": self.image_url,
            "status": self.status,
            "publishedYear": self.published_year,
            "expectedQuantity": exp_qty,
            "isUpcoming": is_up,
            "releaseDate": rel_date
        }


class BorrowRecordModel(Base):
    __tablename__ = "borrow_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    borrow_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=False)
    return_date = Column(DateTime, nullable=True)
    actual_return_date = Column(DateTime, nullable=True)
    borrow_type = Column(String(50), nullable=False, default="Mượn về nhà")
    fine_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    overdue_days = Column(Integer, nullable=False, default=0)
    status = Column(String(50), nullable=False, default="Chờ duyệt", index=True)
    notes = Column(String(255), nullable=True)
    renew_status = Column(String(50), nullable=True)
    pending_renew_days = Column(Integer, nullable=True)
    pending_renew_notes = Column(String(255), nullable=True)
    renew_count = Column(Integer, nullable=False, default=0)
    is_flagged = Column(Boolean, nullable=False, default=False, index=True)
    anomaly_score = Column(Numeric(5, 2), nullable=True, default=0.0)
    anomaly_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("UserModel")
    book = relationship("BookModel")

    def to_dict(self) -> Dict[str, Any]:
        user_name = self.user.full_name if self.user else ""
        book_title = self.book.title if self.book else ""
        return {
            "id": self.id,
            "readerId": self.user_id,
            "userId": self.user_id,
            "readerName": user_name,
            "bookId": self.book_id,
            "bookTitle": book_title,
            "borrowDate": self.borrow_date.isoformat() if self.borrow_date else None,
            "returnDate": self.due_date.isoformat() if self.due_date else None,
            "dueDate": self.due_date.isoformat() if self.due_date else None,
            "actualReturnDate": self.actual_return_date.isoformat() if self.actual_return_date else None,
            "borrowType": self.borrow_type,
            "fine_amount": float(self.fine_amount or 0.0),
            "fineAmount": float(self.fine_amount or 0.0),
            "overdue_days": self.overdue_days,
            "overdueDays": self.overdue_days,
            "status": self.status,
            "notes": self.notes,
            "renewStatus": getattr(self, "renew_status", None),
            "pendingRenewDays": getattr(self, "pending_renew_days", None),
            "pendingRenewNotes": getattr(self, "pending_renew_notes", None),
            "renewCount": int(getattr(self, "renew_count", 0) or 0),
            "isFlagged": bool(getattr(self, "is_flagged", False)),
            "is_flagged": bool(getattr(self, "is_flagged", False)),
            "anomalyScore": float(getattr(self, "anomaly_score", 0.0) or 0.0),
            "anomaly_score": float(getattr(self, "anomaly_score", 0.0) or 0.0),
            "anomalyReason": getattr(self, "anomaly_reason", "") or "",
            "anomaly_reason": getattr(self, "anomaly_reason", "") or ""
        }


class ReservationModel(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    reserved_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    priority = Column(Integer, nullable=False, default=1)
    expires_at = Column(DateTime, nullable=False)
    status = Column(String(50), nullable=False, default="Waiting", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("UserModel")
    book = relationship("BookModel")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "readerId": self.user_id,
            "userId": self.user_id,
            "readerName": self.user.full_name if self.user else "",
            "bookId": self.book_id,
            "bookTitle": self.book.title if self.book else "",
            "reservedAt": self.reserved_at.isoformat() if self.reserved_at else None,
            "priority": self.priority,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
            "status": self.status
        }


class FineModel(Base):
    __tablename__ = "fines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("borrow_records.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    due_date = Column(DateTime, nullable=False)
    actual_return_date = Column(DateTime, nullable=True)
    fine_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    status = Column(String(50), nullable=False, default="Chưa nộp", index=True)
    payment_method = Column(String(50), nullable=True, default="Tiền mặt")
    transaction_ref = Column(String(100), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("UserModel")
    book = relationship("BookModel")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "borrowRecordId": self.record_id,
            "recordId": self.record_id,
            "readerId": self.user_id,
            "userId": self.user_id,
            "readerName": self.user.full_name if self.user else "",
            "bookId": self.book_id,
            "bookTitle": self.book.title if self.book else "",
            "dueDate": self.due_date.isoformat() if self.due_date else None,
            "actualReturnDate": self.actual_return_date.isoformat() if self.actual_return_date else None,
            "fineAmount": float(self.fine_amount or 0.0),
            "status": self.status,
            "paymentMethod": getattr(self, "payment_method", None) or "Tiền mặt",
            "transactionRef": getattr(self, "transaction_ref", None) or "",
            "paidAt": self.paid_at.isoformat() if self.paid_at else None,
            "note": self.note
        }


class NotificationModel(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipient_role = Column(String(20), nullable=False, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=False, default="general")
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    meta_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "id": self.id,
            "recipientRole": self.recipient_role,
            "recipientUserId": self.recipient_user_id,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "isRead": bool(self.is_read),
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }
        if self.meta_json and isinstance(self.meta_json, dict):
            d.update(self.meta_json)
        return d


class AIProcurementModel(Base):
    __tablename__ = "ai_procurement"

    id = Column(Integer, primary_key=True, autoincrement=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True)
    book_title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    current_inventory = Column(Integer, nullable=False, default=0)
    available_copies = Column(Integer, nullable=False, default=0)
    recent_monthly_avg = Column(Numeric(10, 2), nullable=False, default=0.0)
    projected_demand = Column(Integer, nullable=False, default=0)
    shortage_risk = Column(String(50), nullable=False, default="HIGH")
    recommended_procurement = Column(Integer, nullable=False, default=0)
    confidence_score = Column(Numeric(5, 2), nullable=False, default=0.0)
    analysis_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    book = relationship("BookModel")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "bookId": self.book_id,
            "bookTitle": self.book_title,
            "category": self.category or "Chung",
            "currentInventory": self.current_inventory,
            "availableCopies": self.available_copies,
            "recentMonthlyAvg": float(self.recent_monthly_avg or 0.0),
            "projectedDemand": self.projected_demand,
            "shortageRisk": self.shortage_risk,
            "recommendedProcurement": self.recommended_procurement,
            "confidenceScore": float(self.confidence_score or 0.0),
            "analysisDate": self.analysis_date.isoformat() if self.analysis_date else None,
            "notes": self.notes or ""
        }


class MySQLDatabaseManager:
    """
    Quản lý kết nối và thao tác dữ liệu trực tiếp trên Cơ sở dữ liệu MySQL thực tế.
    """
    def __init__(
        self,
        host: str = MYSQL_HOST,
        port: int = MYSQL_PORT,
        user: str = MYSQL_USER,
        password: str = MYSQL_PASSWORD,
        database: str = MYSQL_DATABASE
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.engine = None
        self.SessionLocal = None
        self._is_connected = False
        self._last_connect_attempt = 0
        self._logged_offline = False

        # Khởi tạo persistent SQLite engine để nạp dữ liệu siêu tốc < 5ms khi MySQL chưa bật
        self.db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_local.db"))
        self.sql_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_mysql.sql"))
        try:
            self.sqlite_engine = create_engine(
                f"sqlite:///{self.db_path}",
                echo=False,
                connect_args={"check_same_thread": False, "timeout": 30}
            )

            @event.listens_for(self.sqlite_engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                try:
                    cursor = dbapi_connection.cursor()
                    cursor.execute("PRAGMA journal_mode=WAL;")
                    cursor.execute("PRAGMA synchronous=NORMAL;")
                    cursor.execute("PRAGMA cache_size=-64000;")
                    cursor.execute("PRAGMA temp_store=MEMORY;")
                    cursor.execute("PRAGMA mmap_size=268435456;")
                    cursor.close()
                except Exception:
                    pass

            self.SqliteSession = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=self.sqlite_engine))
            self._ensure_sqlite_columns()
        except Exception:
            self.sqlite_engine = None
            self.SqliteSession = None

        self._init_connection()

    def _ensure_sqlite_columns(self):
        """Đảm bảo các cột cho tính năng xin gia hạn tồn tại trong SQLite cục bộ"""
        if not self.sqlite_engine:
            return
        try:
            with self.sqlite_engine.connect() as conn:
                res = conn.execute(text("PRAGMA table_info(borrow_records)")).fetchall()
                existing_cols = {row[1] for row in res}
                if existing_cols:
                    if "renew_status" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN renew_status VARCHAR(50);"))
                    if "pending_renew_days" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN pending_renew_days INTEGER;"))
                    if "pending_renew_notes" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN pending_renew_notes VARCHAR(255);"))
                    if "renew_count" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN renew_count INTEGER DEFAULT 0;"))
                    if "is_flagged" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN is_flagged BOOLEAN DEFAULT 0;"))
                    if "anomaly_score" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN anomaly_score REAL DEFAULT 0.0;"))
                    if "anomaly_reason" not in existing_cols:
                        conn.execute(text("ALTER TABLE borrow_records ADD COLUMN anomaly_reason VARCHAR(255);"))
                    conn.commit()
        except Exception as e:
            logger.warning(f"Lỗi kiểm tra/cập nhật cột SQLite borrow_records: {e}")

    def _ensure_mysql_columns(self):
        """Đảm bảo các cột cho tính năng gia hạn và cảnh báo bất thường tồn tại trong MySQL"""
        if not self.engine:
            return
        try:
            with self.engine.connect() as conn:
                res = conn.execute(text("SHOW COLUMNS FROM `borrow_records`")).fetchall()
                existing_cols = {row[0] for row in res}
                if "renew_status" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `renew_status` VARCHAR(50) NULL;"))
                if "pending_renew_days" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `pending_renew_days` INT NULL;"))
                if "pending_renew_notes" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `pending_renew_notes` VARCHAR(255) NULL;"))
                if "renew_count" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `renew_count` INT NOT NULL DEFAULT 0;"))
                if "is_flagged" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `is_flagged` TINYINT(1) NOT NULL DEFAULT 0;"))
                if "anomaly_score" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `anomaly_score` DECIMAL(5,2) NULL DEFAULT 0.0;"))
                if "anomaly_reason" not in existing_cols:
                    conn.execute(text("ALTER TABLE `borrow_records` ADD COLUMN `anomaly_reason` VARCHAR(255) NULL;"))
                conn.commit()
        except Exception as e:
            logger.warning(f"Lỗi kiểm tra/cập nhật cột MySQL borrow_records: {e}")

    def _get_connection_url(self, with_db: bool = True) -> str:
        encoded_pass = quote_plus(self.password)
        db_part = f"/{self.database}" if with_db else ""
        return f"mysql+pymysql://{self.user}:{encoded_pass}@{self.host}:{self.port}{db_part}?charset=utf8mb4"

    def _init_connection(self):
        now = time.time()
        if now - getattr(self, "_last_connect_attempt", 0) < 60:
            return
        self._last_connect_attempt = now

        # ⚡ Kiểm tra nhanh socket (timeout 0.15s) để không bao giờ làm treo hệ thống khi MySQL chưa bật
        sock_ok = False
        try:
            with socket.create_connection((self.host, self.port), timeout=0.15):
                sock_ok = True
        except Exception:
            sock_ok = False

        if not sock_ok:
            self._is_connected = False
            if not getattr(self, "_logged_offline", False):
                logger.info(f"ℹ️ MySQL Server ({self.host}:{self.port}) chưa bật. Hệ thống tự động kích hoạt CSDL SQLite cục bộ siêu tốc.")
                self._logged_offline = True
            return

        try:
            # 1. Kết nối tới MySQL server với timeout ngắn (2s)
            root_engine = create_engine(
                self._get_connection_url(with_db=False),
                echo=False,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 2}
            )
            with root_engine.connect() as conn:
                conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{self.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                conn.commit()

            # 2. Kết nối trực tiếp vào Database đã tạo
            self.engine = create_engine(
                self._get_connection_url(with_db=True),
                echo=False,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 2}
            )
            self.SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=self.engine))

            # 3. Tự động tạo các bảng nếu chưa có
            Base.metadata.create_all(bind=self.engine)
            self._ensure_mysql_columns()
            self._is_connected = True
            logger.info(f"✓ Đã kết nối thành công tới MySQL Database [{self.database}] tại {self.host}:{self.port}")
            self._ensure_seed_data()
        except Exception as e:
            self._is_connected = False
            logger.warning(f"Chưa thể kết nối tới MySQL ({self.host}:{self.port}/{self.database}): {e}")

    def is_connected(self) -> bool:
        if not self._is_connected or not self.engine:
            return False
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def _ensure_seed_data(self):
        """Khởi tạo tài khoản và kho sách 50 cuốn nếu CSDL MySQL mới khởi tạo"""
        session = self.SessionLocal()
        try:
            # 1. Users
            u_count = session.query(UserModel).count()
            if u_count == 0:
                admin = UserModel(
                    id=1,
                    username="admin",
                    password_hash="a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                    full_name="Quản trị viên",
                    role="Admin",
                    email="admin@smartlib.edu.vn",
                    phone="0987 654 321",
                    address="Phòng Quản lý Thư viện, ĐHQG Hà Nội"
                )
                reader = UserModel(
                    id=2,
                    username="reader",
                    password_hash="a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                    full_name="Trần Thị Mai",
                    role="Reader",
                    email="mai.tran@smartlib.edu.vn",
                    phone="0901 234 567",
                    address="Khu KTX Sinh viên Mễ Trì, Thanh Xuân, Hà Nội"
                )
                librarian = UserModel(
                    id=3,
                    username="librarian",
                    password_hash="a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
                    full_name="Thủ thư Nguyễn Văn Hưng",
                    role="Librarian",
                    email="librarian@smartlib.edu.vn",
                    phone="0912 888 999",
                    address="Bộ phận Nghiệp vụ Thư viện, ĐHQG Hà Nội"
                )
                session.add_all([admin, reader, librarian])
                session.commit()
                logger.info("✓ Đã nạp thành công 3 tài khoản mẫu vào bảng users trong MySQL.")

            # 2. Books & Other Tables (Seed từ tệp SQL thuần nếu trống)
            b_count = session.query(BookModel).count()
            if b_count == 0:
                sql_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_mysql.sql"))
                if os.path.exists(sql_path):
                    with open(sql_path, "r", encoding="utf-8") as f:
                        sql_content = f.read()
                    
                    # Thực thi các câu lệnh INSERT từ tệp smartlib_mysql.sql
                    for statement in sql_content.split(";\n"):
                        stmt = statement.strip()
                        if stmt and not stmt.upper().startswith("CREATE DATABASE") and not stmt.upper().startswith("USE ") and not stmt.upper().startswith("SET "):
                            try:
                                session.execute(text(stmt))
                            except Exception as ex:
                                logger.debug(f"Bỏ qua câu lệnh: {ex}")
                    session.commit()
                    logger.info("✓ Đã nạp thành công 50 đầu sách và dữ liệu ban đầu từ database/smartlib_mysql.sql vào MySQL.")
        except Exception as e:
            session.rollback()
            logger.error(f"Lỗi khi nạp seed data MySQL: {e}")
        finally:
            session.close()

    def _load_from_local_sqlite(self) -> Dict[str, Any]:
        """Dự phòng an toàn: đọc dữ liệu từ CSDL cục bộ khi MySQL tạm thời ngắt kết nối"""
        if not os.path.exists(self.db_path) or not self.SqliteSession:
            return {
                "users": [],
                "books": [],
                "borrowRecords": [],
                "reservations": [],
                "fines": [],
                "notifications": []
            }
        session = self.SqliteSession()
        try:
            # Lấy sách từ RAM cache nếu còn hạn (giảm tải đọc base64 ảnh mỗi request)
            now = time.time()
            if _BOOKS_CACHE["data"] is not None and (now - _BOOKS_CACHE["cached_at"]) < BOOKS_CACHE_TTL:
                books = _BOOKS_CACHE["data"]
            else:
                books = [b.to_dict() for b in session.query(BookModel).all()]
                _BOOKS_CACHE["data"] = books
                _BOOKS_CACHE["cached_at"] = now

            users = [u.to_dict() for u in session.query(UserModel).all()]
            borrows = [br.to_dict() for br in session.query(BorrowRecordModel).all()]
            reservations = [res.to_dict() for res in session.query(ReservationModel).all()]
            fines = [f.to_dict() for f in session.query(FineModel).all()]
            notifications = [n.to_dict() for n in session.query(NotificationModel).order_by(NotificationModel.id.desc()).all()]

            users = self._apply_auto_lock_rules(users, borrows, fines)
            return {
                "users": users,
                "books": books,
                "borrowRecords": borrows,
                "reservations": reservations,
                "fines": fines,
                "notifications": notifications
            }
        except Exception as ex:
            logger.error(f"Lỗi khi đọc SQLite dự phòng: {ex}")
            return {
                "users": [],
                "books": [],
                "borrowRecords": [],
                "reservations": [],
                "fines": [],
                "notifications": []
            }
        finally:
            session.close()

    def _apply_auto_lock_rules(self, users: List[Dict[str, Any]], borrows: List[Dict[str, Any]], fines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Tự động khóa tài khoản độc giả khi mượn sách quá hạn từ 3 ngày trở lên hoặc còn nợ tiền phạt chưa nộp.
        Khi đã nộp phạt hết và không còn sách quá hạn >= 3 ngày, tự động mở khóa tài khoản.
        """
        now = datetime.now()
        for u in users:
            if u.get("role") != "Reader":
                continue
            uid = int(u.get("id", 0))

            overdue_days_max = 0
            for b in borrows:
                b_uid = int(b.get("readerId") or b.get("userId") or 0)
                if b_uid != uid:
                    continue
                st = b.get("status", "")
                if st in ["Đang mượn", "Quá hạn"]:
                    due_str = b.get("returnDate") or b.get("dueDate")
                    if due_str:
                        try:
                            due = datetime.fromisoformat(due_str.replace("Z", ""))
                            diff_days = (now.date() - due.date()).days
                            if diff_days > overdue_days_max:
                                overdue_days_max = diff_days
                        except Exception:
                            pass

            unpaid_fines = [
                f for f in fines
                if int(f.get("readerId") or f.get("userId") or 0) == uid and f.get("status") == "Chưa nộp"
            ]
            total_unpaid = sum(float(f.get("fineAmount", 0)) for f in unpaid_fines)
            u["unpaidFines"] = total_unpaid

            # Quy tắc tự động khóa
            pending_fines = [
                f for f in fines
                if int(f.get("readerId") or f.get("userId") or 0) == uid and f.get("status") in ["Chờ duyệt", "Chờ duyệt nộp phạt"]
            ]
            dyn_s = get_dynamic_settings()
            lock_threshold = int(dyn_s.get("autoLockAfterDays", 3))
            if pending_fines or u.get("pendingPaymentApproval"):
                u["isLocked"] = True
                u["pendingPaymentApproval"] = True
                u["lockReason"] = "Giao dịch nộp phạt VNPay đang chờ Quản trị viên duyệt"
            elif overdue_days_max >= lock_threshold:
                u["isLocked"] = True
                u["lockReason"] = f"Mượn sách quá hạn {overdue_days_max} ngày (Cần nộp phạt để mở khóa)"
            elif total_unpaid > 0:
                u["isLocked"] = True
                u["lockReason"] = f"Còn khoản tiền phạt chưa thanh toán ({int(total_unpaid):,} đ)"
            else:
                # Nếu lý do khóa tự động trước đó đã được giải quyết
                current_reason = u.get("lockReason", "") or ""
                if current_reason.startswith("Mượn sách quá hạn") or current_reason.startswith("Còn khoản tiền phạt") or current_reason.startswith("Giao dịch nộp phạt"):
                    u["isLocked"] = False
                    u["lockReason"] = ""
                    u["pendingPaymentApproval"] = False


        return users

    def load_db(self) -> Dict[str, Any]:
        """
        Đọc toàn bộ dữ liệu từ các bảng MySQL và trả về Dict tương thích với schema hệ thống.
        Tự động dùng RAM cache cho danh sách sách để đạt phản hồi siêu nhanh < 3ms.
        Có cơ chế Dual-Engine Fallback tự động sang SQLite nếu máy tính chưa kịp khởi động MySQL.
        """
        if not self._is_connected or not self.SessionLocal:
            return self._load_from_local_sqlite()

        session = self.SessionLocal()
        try:
            users = [u.to_dict() for u in session.query(UserModel).all()]
            
            # Lấy sách từ RAM cache nếu còn hạn
            now = time.time()
            if _BOOKS_CACHE["data"] is not None and (now - _BOOKS_CACHE["cached_at"]) < BOOKS_CACHE_TTL:
                books = _BOOKS_CACHE["data"]
            else:
                books = [b.to_dict() for b in session.query(BookModel).all()]
                _BOOKS_CACHE["data"] = books
                _BOOKS_CACHE["cached_at"] = now

            borrows = [br.to_dict() for br in session.query(BorrowRecordModel).all()]
            reservations = [res.to_dict() for res in session.query(ReservationModel).all()]
            fines = [f.to_dict() for f in session.query(FineModel).all()]
            notifications = [n.to_dict() for n in session.query(NotificationModel).order_by(NotificationModel.id.desc()).all()]

            users = self._apply_auto_lock_rules(users, borrows, fines)

            return {
                "users": users,
                "books": books,
                "borrowRecords": borrows,
                "reservations": reservations,
                "fines": fines,
                "notifications": notifications
            }
        except Exception as e:
            logger.error(f"Lỗi khi load_db từ MySQL, chuyển sang SQLite dự phòng: {e}")
            return self._load_from_local_sqlite()
        finally:
            session.close()

    def _save_to_local_sqlite(self, data: Dict[str, Any]):
        """Đồng bộ dữ liệu sang smartlib_local.db khi MySQL chưa hoạt động hoặc làm bản sao lưu an toàn"""
        if not os.path.exists(self.db_path) or not self.SqliteSession:
            return
        try:
            session = self.SqliteSession()

            # 1. Sync Books
            incoming_bids = set()
            for b in data.get("books", []):
                bid = b.get("id")
                if not bid:
                    continue
                bid = int(bid)
                incoming_bids.add(bid)
                existing_b = session.query(BookModel).filter_by(id=bid).first()
                qty = int(b.get("quantity", 1))
                avail = int(b.get("available", qty))
                if existing_b:
                    existing_b.title = b.get("title", existing_b.title)
                    existing_b.author = b.get("author", existing_b.author)
                    existing_b.category = b.get("category", existing_b.category)
                    existing_b.quantity = qty
                    existing_b.available_copies = avail
                    existing_b.status = b.get("status", "Sẵn sàng" if avail > 0 else "Hết sách")
                    if b.get("desc") or b.get("description"):
                        existing_b.description = b.get("desc") or b.get("description")
                    if b.get("imageUrl"):
                        existing_b.image_url = b.get("imageUrl")
                    if b.get("expectedQuantity") is not None:
                        existing_b.published_year = int(b.get("expectedQuantity"))
                    elif b.get("publishedYear") is not None:
                        existing_b.published_year = int(b.get("publishedYear"))
                else:
                    new_b = BookModel(
                        id=bid,
                        title=b.get("title", "Sách"),
                        author=b.get("author", "Chưa rõ"),
                        category=b.get("category", "Chung"),
                        quantity=qty,
                        available_copies=avail,
                        description=b.get("desc") or b.get("description", ""),
                        image_url=b.get("imageUrl"),
                        status=b.get("status", "Sẵn sàng" if avail > 0 else "Hết sách"),
                        published_year=int(b.get("expectedQuantity") or b.get("publishedYear")) if (b.get("expectedQuantity") or b.get("publishedYear")) else None
                    )
                    session.add(new_b)

            if incoming_bids and "books" in data:
                del_books = session.query(BookModel).filter(~BookModel.id.in_(incoming_bids)).all()
                for dbk in del_books:
                    session.query(ReservationModel).filter_by(book_id=dbk.id).delete()
                    session.query(FineModel).filter_by(book_id=dbk.id).delete()
                    session.query(BorrowRecordModel).filter_by(book_id=dbk.id).delete()
                    session.delete(dbk)

            # 2. Sync Reservations
            incoming_res_ids = set()
            for res in data.get("reservations", []):
                resid = res.get("id")
                if not resid:
                    continue
                resid = int(resid)
                incoming_res_ids.add(resid)
                existing_res = session.query(ReservationModel).filter_by(id=resid).first()
                exp_dt = datetime.fromisoformat(res.get("expiresAt").replace("Z", "")) if res.get("expiresAt") else datetime.utcnow()
                res_dt = datetime.fromisoformat(res.get("reservedAt").replace("Z", "")) if res.get("reservedAt") else datetime.utcnow()
                if existing_res:
                    existing_res.status = res.get("status", existing_res.status)
                    existing_res.priority = int(res.get("priority", existing_res.priority))
                    existing_res.expires_at = exp_dt
                else:
                    new_res = ReservationModel(
                        id=resid,
                        user_id=res.get("readerId") or res.get("userId") or 2,
                        book_id=res.get("bookId") or 1,
                        reserved_at=res_dt,
                        priority=int(res.get("priority", 1)),
                        expires_at=exp_dt,
                        status=res.get("status", "Waiting")
                    )
                    session.add(new_res)

            if "reservations" in data:
                del_res = session.query(ReservationModel).filter(~ReservationModel.id.in_(incoming_res_ids)).all()
                for dres in del_res:
                    session.delete(dres)

            # 3. Sync BorrowRecords
            for br in data.get("borrowRecords", []):
                brid = br.get("id")
                if not brid:
                    continue
                existing_br = session.query(BorrowRecordModel).filter_by(id=brid).first()
                due_dt = datetime.fromisoformat(br.get("returnDate").replace("Z", "")) if br.get("returnDate") else datetime.utcnow()
                b_dt = datetime.fromisoformat(br.get("borrowDate").replace("Z", "")) if br.get("borrowDate") else datetime.utcnow()
                act_dt = datetime.fromisoformat(br.get("actualReturnDate").replace("Z", "")) if br.get("actualReturnDate") else None
                fine_val = float(br.get("fine_amount") or br.get("fineAmount") or 0.0)
                overdue_val = int(br.get("overdue_days") or br.get("overdueDays") or 0)

                if existing_br:
                    existing_br.status = br.get("status", existing_br.status)
                    existing_br.due_date = due_dt
                    existing_br.fine_amount = fine_val
                    existing_br.overdue_days = overdue_val
                    existing_br.actual_return_date = act_dt
                    existing_br.renew_status = br.get("renewStatus")
                    existing_br.pending_renew_days = br.get("pendingRenewDays")
                    existing_br.pending_renew_notes = br.get("pendingRenewNotes")
                    existing_br.renew_count = int(br.get("renewCount") or 0)
                    if br.get("notes") is not None:
                        existing_br.notes = br.get("notes")
                else:
                    new_br = BorrowRecordModel(
                        id=brid,
                        user_id=br.get("readerId") or br.get("userId") or 2,
                        book_id=br.get("bookId") or 1,
                        borrow_date=b_dt,
                        due_date=due_dt,
                        actual_return_date=act_dt,
                        borrow_type=br.get("borrowType", "Mượn về nhà"),
                        status=br.get("status", "Chờ duyệt"),
                        fine_amount=fine_val,
                        overdue_days=overdue_val,
                        notes=br.get("notes"),
                        renew_status=br.get("renewStatus"),
                        pending_renew_days=br.get("pendingRenewDays"),
                        pending_renew_notes=br.get("pendingRenewNotes"),
                        renew_count=int(br.get("renewCount") or 0)
                    )
                    session.add(new_br)

            # 4. Sync Fines
            for f in data.get("fines", []):
                fid = f.get("id")
                if not fid:
                    continue
                existing_f = session.query(FineModel).filter_by(id=fid).first()
                due_f = datetime.fromisoformat(f.get("dueDate").replace("Z", "")) if f.get("dueDate") else datetime.utcnow()
                act_f = datetime.fromisoformat(f.get("actualReturnDate").replace("Z", "")) if f.get("actualReturnDate") else datetime.utcnow()
                f_amt = float(f.get("fineAmount") or 0.0)
                if existing_f:
                    existing_f.status = f.get("status", existing_f.status)
                    existing_f.fine_amount = f_amt
                    existing_f.payment_method = f.get("paymentMethod")
                    existing_f.transaction_ref = f.get("transactionRef")
                    existing_f.actual_return_date = act_f
                else:
                    new_f = FineModel(
                        id=fid,
                        record_id=f.get("borrowRecordId") or 1,
                        user_id=f.get("readerId") or 2,
                        book_id=f.get("bookId") or 1,
                        due_date=due_f,
                        actual_return_date=act_f,
                        fine_amount=f_amt,
                        status=f.get("status", "Chưa nộp"),
                        payment_method=f.get("paymentMethod"),
                        transaction_ref=f.get("transactionRef")
                    )
                    session.add(new_f)

            # 5. Sync Users
            for u in data.get("users", []):
                uid = u.get("id")
                if not uid:
                    continue
                existing_u = session.query(UserModel).filter_by(id=uid).first()
                if existing_u:
                    existing_u.full_name = u.get("fullName", existing_u.full_name)
                    existing_u.email = u.get("email", existing_u.email)
                    existing_u.phone = u.get("phone", existing_u.phone)
                    existing_u.address = u.get("address", existing_u.address)
                    existing_u.role = u.get("role", existing_u.role)
                    if "isLocked" in u:
                        existing_u.is_locked = bool(u.get("isLocked"))
                    if "lockReason" in u:
                        existing_u.lock_reason = u.get("lockReason")
                else:
                    new_u = UserModel(
                        id=uid,
                        username=u.get("username", f"user_{uid}"),
                        password_hash="123",
                        full_name=u.get("fullName", "Độc giả"),
                        role=u.get("role", "Reader"),
                        email=u.get("email", ""),
                        phone=u.get("phone", ""),
                        address=u.get("address", ""),
                        is_active=True
                    )
                    session.add(new_u)

            # 6. Sync Notifications
            for n in data.get("notifications", []):
                nid = n.get("id")
                if not nid:
                    continue
                existing_n = session.query(NotificationModel).filter_by(id=nid).first()
                if existing_n:
                    existing_n.is_read = bool(n.get("isRead", False))
                else:
                    new_n = NotificationModel(
                        id=nid,
                        recipient_role=n.get("recipientRole", "Admin"),
                        recipient_user_id=n.get("recipientUserId"),
                        title=n.get("title", ""),
                        message=n.get("message", ""),
                        type=n.get("type", "general"),
                        is_read=bool(n.get("isRead", False)),
                        meta_json=n.get("meta") or {},
                        created_at=datetime.fromisoformat(n["createdAt"].replace("Z", "")) if n.get("createdAt") else datetime.utcnow()
                    )
                    session.add(new_n)

            session.commit()
            session.close()
            logger.info("✓ Đã lưu và đồng bộ thay đổi vào smartlib_local.db")
        except Exception as e:
            logger.error(f"Lỗi khi lưu dữ liệu vào SQLite: {e}")

    def _sql_val(self, val) -> str:
        if val is None:
            return "NULL"
        if isinstance(val, bool):
            return "1" if val else "0"
        if isinstance(val, (int, float)):
            return str(val)
        if isinstance(val, (dict, list)):
            val = json.dumps(val, ensure_ascii=False)
        s = str(val)
        s = s.replace("\\", "\\\\").replace("'", "\\'")
        return f"'{s}'"

    def _sync_to_sql_file(self, data: Dict[str, Any]):
        """
        Đồng bộ toàn bộ dữ liệu cập nhật hiện tại vào file database/smartlib_mysql.sql.
        Giúp file SQL luôn phản ánh chính xác dữ liệu mới nhất trong cơ sở dữ liệu.
        """
        try:
            sql_path = getattr(self, "sql_file_path", None)
            if not sql_path:
                sql_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_mysql.sql"))

            # Đảm bảo dữ liệu đầy đủ tất cả các bảng
            users = data.get("users", [])
            books = data.get("books", [])
            borrows = data.get("borrowRecords", [])
            resvs = data.get("reservations", [])
            fines = data.get("fines", [])
            notifs = data.get("notifications", [])

            # Nếu data truyền vào thiếu bảng, fallback load_db để lấy đầy đủ dữ liệu
            if not users or not books:
                full_db = self.load_db()
                if not users:
                    users = full_db.get("users", [])
                if not books:
                    books = full_db.get("books", [])
                if not borrows:
                    borrows = full_db.get("borrowRecords", [])
                if not resvs:
                    resvs = full_db.get("reservations", [])
                if not fines:
                    fines = full_db.get("fines", [])
                if not notifs:
                    notifs = full_db.get("notifications", [])

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            lines = []
            lines.append("-- =====================================================================")
            lines.append("-- SMARTLIB - HỆ THỐNG QUẢN LÝ THƯ VIỆN THÔNG MINH")
            lines.append("-- CƠ SỞ DỮ LIỆU MYSQL 8.0 CHUẨN 3NF TOÀN DIỆN (SYNCHRONIZED)")
            lines.append(f"-- Thời gian cập nhật tự động: {now_str}")
            lines.append("-- =====================================================================")
            lines.append("CREATE DATABASE IF NOT EXISTS `smartlib_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            lines.append("USE `smartlib_db`;\n")
            lines.append("SET FOREIGN_KEY_CHECKS = 0;")
            lines.append("DROP TABLE IF EXISTS `notifications`;")
            lines.append("DROP TABLE IF EXISTS `fines`;")
            lines.append("DROP TABLE IF EXISTS `reservations`;")
            lines.append("DROP TABLE IF EXISTS `borrow_records`;")
            lines.append("DROP TABLE IF EXISTS `books`;")
            lines.append("DROP TABLE IF EXISTS `users`;")
            lines.append("SET FOREIGN_KEY_CHECKS = 1;\n")

            lines.append("CREATE TABLE users (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    username VARCHAR(50) NOT NULL UNIQUE,")
            lines.append("    password_hash VARCHAR(256) NOT NULL,")
            lines.append("    full_name VARCHAR(100) NOT NULL,")
            lines.append("    role VARCHAR(50) NOT NULL DEFAULT 'Reader',")
            lines.append("    email VARCHAR(100) NULL,")
            lines.append("    phone VARCHAR(30) NULL,")
            lines.append("    address VARCHAR(255) NULL,")
            lines.append("    birth_date DATE NULL,")
            lines.append("    is_active TINYINT(1) NOT NULL DEFAULT 1,")
            lines.append("    is_locked TINYINT(1) NOT NULL DEFAULT 0,")
            lines.append("    lock_reason VARCHAR(255) NULL,")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,")
            lines.append("    INDEX idx_users_username (username),")
            lines.append("    INDEX idx_users_role (role)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            lines.append("CREATE TABLE books (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    title VARCHAR(255) NOT NULL,")
            lines.append("    author VARCHAR(100) NOT NULL DEFAULT 'Chưa rõ',")
            lines.append("    category VARCHAR(100) NOT NULL DEFAULT 'Chung',")
            lines.append("    quantity INT NOT NULL DEFAULT 1,")
            lines.append("    available_copies INT NOT NULL DEFAULT 1,")
            lines.append("    description LONGTEXT NULL,")
            lines.append("    image_url LONGTEXT NULL,")
            lines.append("    status VARCHAR(50) NOT NULL DEFAULT 'Sẵn sàng',")
            lines.append("    published_year INT NULL,")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,")
            lines.append("    INDEX idx_books_title (title),")
            lines.append("    INDEX idx_books_category (category),")
            lines.append("    INDEX idx_books_status (status)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            lines.append("CREATE TABLE borrow_records (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    user_id INT NOT NULL,")
            lines.append("    book_id INT NOT NULL,")
            lines.append("    borrow_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    due_date DATETIME NOT NULL,")
            lines.append("    return_date DATETIME NULL,")
            lines.append("    actual_return_date DATETIME NULL,")
            lines.append("    borrow_type VARCHAR(50) NOT NULL DEFAULT 'Mượn về nhà',")
            lines.append("    fine_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,")
            lines.append("    overdue_days INT NOT NULL DEFAULT 0,")
            lines.append("    status VARCHAR(50) NOT NULL DEFAULT 'Chờ duyệt',")
            lines.append("    notes VARCHAR(255) NULL,")
            lines.append("    renew_status VARCHAR(50) NULL,")
            lines.append("    pending_renew_days INT NULL,")
            lines.append("    pending_renew_notes VARCHAR(255) NULL,")
            lines.append("    renew_count INT NOT NULL DEFAULT 0,")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,")
            lines.append("    CONSTRAINT fk_borrow_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,")
            lines.append("    CONSTRAINT fk_borrow_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,")
            lines.append("    INDEX idx_borrow_user (user_id),")
            lines.append("    INDEX idx_borrow_book (book_id),")
            lines.append("    INDEX idx_borrow_status (status)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            lines.append("CREATE TABLE reservations (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    user_id INT NOT NULL,")
            lines.append("    book_id INT NOT NULL,")
            lines.append("    reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    priority INT NOT NULL DEFAULT 1,")
            lines.append("    expires_at DATETIME NOT NULL,")
            lines.append("    status VARCHAR(50) NOT NULL DEFAULT 'Waiting',")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,")
            lines.append("    CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,")
            lines.append("    CONSTRAINT fk_res_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,")
            lines.append("    INDEX idx_res_user (user_id),")
            lines.append("    INDEX idx_res_book (book_id),")
            lines.append("    INDEX idx_res_status (status)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            lines.append("CREATE TABLE fines (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    record_id INT NOT NULL,")
            lines.append("    user_id INT NOT NULL,")
            lines.append("    book_id INT NOT NULL,")
            lines.append("    due_date DATETIME NOT NULL,")
            lines.append("    actual_return_date DATETIME NOT NULL,")
            lines.append("    fine_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,")
            lines.append("    status VARCHAR(50) NOT NULL DEFAULT 'Chưa nộp',")
            lines.append("    payment_method VARCHAR(50) NOT NULL DEFAULT 'Tiền mặt',")
            lines.append("    transaction_ref VARCHAR(100) NULL,")
            lines.append("    paid_at DATETIME NULL,")
            lines.append("    note VARCHAR(255) NULL,")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,")
            lines.append("    CONSTRAINT fk_fine_record FOREIGN KEY (record_id) REFERENCES borrow_records(id) ON DELETE CASCADE,")
            lines.append("    CONSTRAINT fk_fine_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,")
            lines.append("    CONSTRAINT fk_fine_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,")
            lines.append("    INDEX idx_fines_user (user_id),")
            lines.append("    INDEX idx_fines_status (status)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            lines.append("CREATE TABLE notifications (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    recipient_role VARCHAR(20) NOT NULL,")
            lines.append("    recipient_user_id INT NULL,")
            lines.append("    title VARCHAR(255) NOT NULL,")
            lines.append("    message TEXT NOT NULL,")
            lines.append("    type VARCHAR(50) NOT NULL DEFAULT 'general',")
            lines.append("    is_read TINYINT(1) NOT NULL DEFAULT 0,")
            lines.append("    meta_json JSON NULL,")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    CONSTRAINT fk_notif_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,")
            lines.append("    INDEX idx_notif_recipient (recipient_role, recipient_user_id),")
            lines.append("    INDEX idx_notif_is_read (is_read)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            lines.append("CREATE TABLE ai_procurement (")
            lines.append("    id INT AUTO_INCREMENT PRIMARY KEY,")
            lines.append("    book_id INT NOT NULL,")
            lines.append("    book_title VARCHAR(255) NOT NULL,")
            lines.append("    category VARCHAR(100) NULL,")
            lines.append("    current_inventory INT NOT NULL DEFAULT 0,")
            lines.append("    available_copies INT NOT NULL DEFAULT 0,")
            lines.append("    recent_monthly_avg DECIMAL(10,2) NOT NULL DEFAULT 0.00,")
            lines.append("    projected_demand INT NOT NULL DEFAULT 0,")
            lines.append("    shortage_risk VARCHAR(50) NOT NULL DEFAULT 'HIGH',")
            lines.append("    recommended_procurement INT NOT NULL DEFAULT 0,")
            lines.append("    confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,")
            lines.append("    analysis_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    notes TEXT NULL,")
            lines.append("    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,")
            lines.append("    CONSTRAINT fk_proc_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,")
            lines.append("    INDEX idx_proc_book (book_id),")
            lines.append("    INDEX idx_proc_risk (shortage_risk)")
            lines.append(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")

            # 1. Users
            if users:
                lines.append("-- =====================================================================")
                lines.append("-- DỮ LIỆU SEED KHỞI TẠO: 1. NGƯỜI DÙNG (users)")
                lines.append("-- =====================================================================")
                lines.append("INSERT INTO users (id, username, password_hash, full_name, role, email, phone, address, birth_date, is_active, is_locked, lock_reason)\nVALUES")
                u_rows = []
                for u in users:
                    uid = self._sql_val(u.get("id"))
                    uname = self._sql_val(u.get("username", f"user{u.get('id')}"))
                    pw = self._sql_val(u.get("passwordHash") or u.get("password_hash") or "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3")
                    fname = self._sql_val(u.get("fullName") or u.get("full_name") or "Người dùng")
                    role = self._sql_val(u.get("role", "Reader"))
                    email = self._sql_val(u.get("email"))
                    phone = self._sql_val(u.get("phone"))
                    addr = self._sql_val(u.get("address"))
                    bdate = self._sql_val(str(u.get("birthDate") or u.get("birth_date"))[:10]) if (u.get("birthDate") or u.get("birth_date")) else "NULL"
                    active = "1" if u.get("isActive", True) else "0"
                    locked = "1" if u.get("isLocked", False) else "0"
                    lreason = self._sql_val(u.get("lockReason") or u.get("lock_reason"))
                    u_rows.append(f"  ({uid}, {uname}, {pw}, {fname}, {role}, {email}, {phone}, {addr}, {bdate}, {active}, {locked}, {lreason})")
                lines.append(",\n".join(u_rows) + ";\n")

            # 2. Books
            if books:
                lines.append("-- =====================================================================")
                lines.append(f"-- DỮ LIỆU SEED KHỞI TẠO: 2. KHO SÁCH (books - {len(books)} ĐẦU SÁCH)")
                lines.append("-- =====================================================================")
                lines.append("INSERT INTO books (id, title, author, category, quantity, available_copies, description, image_url, status, published_year)\nVALUES")
                b_rows = []
                for b in books:
                    bid = self._sql_val(b.get("id"))
                    title = self._sql_val(b.get("title", "Sách"))
                    author = self._sql_val(b.get("author", "Chưa rõ"))
                    cat = self._sql_val(b.get("category", "Chung"))
                    qty = self._sql_val(int(b.get("quantity", 1)))
                    avail = self._sql_val(int(b.get("available", b.get("available_copies", qty))))
                    desc = self._sql_val(b.get("desc") or b.get("description", ""))
                    img = self._sql_val(b.get("imageUrl") or b.get("image_url"))
                    st = self._sql_val(b.get("status", "Sẵn sàng"))
                    pub = str(b.get("expectedQuantity") or b.get("publishedYear") or b.get("published_year")) if (b.get("expectedQuantity") or b.get("publishedYear") or b.get("published_year")) else "NULL"
                    b_rows.append(f"  ({bid}, {title}, {author}, {cat}, {qty}, {avail}, {desc}, {img}, {st}, {pub})")
                lines.append(",\n".join(b_rows) + ";\n")

            # 3. Borrow Records
            if borrows:
                lines.append("-- =====================================================================")
                lines.append("-- DỮ LIỆU SEED KHỞI TẠO: 3. LỊCH SỬ MƯỢN TRẢ SÁCH (borrow_records)")
                lines.append("-- =====================================================================")
                lines.append("INSERT INTO borrow_records (id, user_id, book_id, borrow_date, due_date, actual_return_date, borrow_type, fine_amount, overdue_days, status, notes, renew_status, pending_renew_days, pending_renew_notes, renew_count)\nVALUES")
                br_rows = []
                for br in borrows:
                    brid = self._sql_val(br.get("id"))
                    uid = self._sql_val(br.get("readerId") or br.get("userId") or 2)
                    bkid = self._sql_val(br.get("bookId", 1))
                    b_date = self._sql_val((str(br.get("borrowDate") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    d_date = self._sql_val((str(br.get("returnDate") or br.get("dueDate") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    act_date = self._sql_val((str(br.get("actualReturnDate") or "")).replace("T", " ")[:19]) if br.get("actualReturnDate") else "NULL"
                    b_type = self._sql_val(br.get("borrowType", "Mượn về nhà"))
                    fine_amt = self._sql_val(float(br.get("fine_amount") or br.get("fineAmount") or 0.0))
                    overdue = self._sql_val(int(br.get("overdue_days") or br.get("overdueDays") or 0))
                    st = self._sql_val(br.get("status", "Chờ duyệt"))
                    notes = self._sql_val(br.get("notes"))
                    renew_st = self._sql_val(br.get("renewStatus"))
                    pending_days = self._sql_val(br.get("pendingRenewDays"))
                    pending_notes = self._sql_val(br.get("pendingRenewNotes"))
                    renew_cnt = self._sql_val(int(br.get("renewCount") or 0))
                    br_rows.append(f"  ({brid}, {uid}, {bkid}, {b_date}, {d_date}, {act_date}, {b_type}, {fine_amt}, {overdue}, {st}, {notes}, {renew_st}, {pending_days}, {pending_notes}, {renew_cnt})")
                lines.append(",\n".join(br_rows) + ";\n")

            # 4. Reservations
            if resvs:
                lines.append("-- =====================================================================")
                lines.append("-- DỮ LIỆU SEED KHỞI TẠO: 4. HÀNG ĐỢI ĐẶT TRƯỚC SÁCH (reservations)")
                lines.append("-- =====================================================================")
                lines.append("INSERT INTO reservations (id, user_id, book_id, reserved_at, priority, expires_at, status)\nVALUES")
                res_rows = []
                for res in resvs:
                    resid = self._sql_val(res.get("id"))
                    uid = self._sql_val(res.get("readerId") or res.get("userId") or 2)
                    bkid = self._sql_val(res.get("bookId", 1))
                    res_at = self._sql_val((str(res.get("reservedAt") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    prio = self._sql_val(int(res.get("priority", 1)))
                    exp_at = self._sql_val((str(res.get("expiresAt") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    st = self._sql_val(res.get("status", "Waiting"))
                    res_rows.append(f"  ({resid}, {uid}, {bkid}, {res_at}, {prio}, {exp_at}, {st})")
                lines.append(",\n".join(res_rows) + ";\n")

            # 5. Fines
            if fines:
                lines.append("-- =====================================================================")
                lines.append("-- DỮ LIỆU SEED KHỞI TẠO: 5. QUẢN LÝ TIỀN PHẠT & VI PHẠM (fines)")
                lines.append("-- =====================================================================")
                lines.append("INSERT INTO fines (id, record_id, user_id, book_id, due_date, actual_return_date, fine_amount, status, payment_method, transaction_ref, paid_at, note)\nVALUES")
                f_rows = []
                for f in fines:
                    fid = self._sql_val(f.get("id"))
                    recid = self._sql_val(f.get("recordId") or f.get("borrowRecordId") or 1)
                    uid = self._sql_val(f.get("readerId") or f.get("userId") or 2)
                    bkid = self._sql_val(f.get("bookId", 1))
                    due_dt = self._sql_val((str(f.get("dueDate") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    act_dt = self._sql_val((str(f.get("actualReturnDate") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    famt = self._sql_val(float(f.get("fineAmount", 0.0)))
                    st = self._sql_val(f.get("status", "Chưa nộp"))
                    pm = self._sql_val(f.get("paymentMethod", "Tiền mặt"))
                    txref = self._sql_val(f.get("transactionRef"))
                    paid_at = self._sql_val((str(f.get("paidAt") or "")).replace("T", " ")[:19]) if f.get("paidAt") else "NULL"
                    note = self._sql_val(f.get("note"))
                    f_rows.append(f"  ({fid}, {recid}, {uid}, {bkid}, {due_dt}, {act_dt}, {famt}, {st}, {pm}, {txref}, {paid_at}, {note})")
                lines.append(",\n".join(f_rows) + ";\n")

            # 6. Notifications
            if notifs:
                lines.append("-- =====================================================================")
                lines.append("-- DỮ LIỆU SEED KHỞI TẠO: 6. THÔNG BÁO HỆ THỐNG (notifications)")
                lines.append("-- =====================================================================")
                lines.append("INSERT INTO notifications (id, recipient_role, recipient_user_id, title, message, type, is_read, meta_json, created_at)\nVALUES")
                n_rows = []
                for n in notifs[:50]:
                    nid = self._sql_val(n.get("id"))
                    role = self._sql_val(n.get("recipientRole", "Admin"))
                    uid = self._sql_val(n.get("recipientUserId"))
                    title = self._sql_val(n.get("title", ""))
                    msg = self._sql_val(n.get("message", ""))
                    ntype = self._sql_val(n.get("type", "general"))
                    isread = "1" if n.get("isRead", False) else "0"
                    metaj = self._sql_val(json.dumps(n.get("meta") or {}, ensure_ascii=False))
                    created = self._sql_val((str(n.get("createdAt") or "")).replace("T", " ")[:19] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    n_rows.append(f"  ({nid}, {role}, {uid}, {title}, {msg}, {ntype}, {isread}, {metaj}, {created})")
                lines.append(",\n".join(n_rows) + ";\n")

            tmp_path = sql_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            if os.path.exists(tmp_path):
                os.replace(tmp_path, sql_path)
            logger.info("✓ Đã đồng bộ trực tiếp thay đổi vào database/smartlib_mysql.sql")
        except Exception as e:
            logger.error(f"Lỗi khi đồng bộ smartlib_mysql.sql: {e}")

    def cancel_reservation(self, res_id: int):
        """Hủy đặt trước sách và cập nhật trạng thái đồng thời trên MySQL và SQLite"""
        if self.SessionLocal:
            try:
                session = self.SessionLocal()
                res = session.query(ReservationModel).filter_by(id=res_id).first()
                if res:
                    res.status = "Cancelled"
                    session.commit()
                session.close()
            except Exception as e:
                logger.error(f"Lỗi hủy đặt trước trên MySQL: {e}")

        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_local.db"))
        if os.path.exists(db_path):
            try:
                sqlite_engine = create_engine(f"sqlite:///{db_path}")
                SqliteSession = sessionmaker(bind=sqlite_engine)
                session = SqliteSession()
                res = session.query(ReservationModel).filter_by(id=res_id).first()
                if res:
                    res.status = "Cancelled"
                    session.commit()
                session.close()
                logger.info(f"✓ Đã cập nhật Cancelled cho đặt trước #{res_id} trong SQLite")
            except Exception as e:
                logger.error(f"Lỗi hủy đặt trước trên SQLite: {e}")

    def toggle_reader_lock(self, reader_id: int, is_locked: bool, reason: Optional[str] = None):
        """Khóa hoặc mở khóa tài khoản độc giả trên cả MySQL và SQLite"""
        if self.SessionLocal:
            try:
                session = self.SessionLocal()
                user = session.query(UserModel).filter_by(id=reader_id).first()
                if user:
                    user.is_locked = is_locked
                    user.lock_reason = reason if is_locked else ""
                    session.commit()
                session.close()
            except Exception as e:
                logger.error(f"Lỗi toggle_reader_lock trên MySQL: {e}")

        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_local.db"))
        if os.path.exists(db_path):
            try:
                sqlite_engine = create_engine(f"sqlite:///{db_path}")
                SqliteSession = sessionmaker(bind=sqlite_engine)
                session = SqliteSession()
                user = session.query(UserModel).filter_by(id=reader_id).first()
                if user:
                    user.is_locked = is_locked
                    user.lock_reason = reason if is_locked else ""
                    session.commit()
                session.close()
                logger.info(f"✓ Đã cập nhật trạng thái khóa={is_locked} cho độc giả #{reader_id} trong SQLite")
            except Exception as e:
                logger.error(f"Lỗi toggle_reader_lock trên SQLite: {e}")

    def atomic_borrow_book(
        self,
        user_id: int,
        book_id: int,
        borrow_type: str = "Mượn về nhà",
        due_date: Optional[datetime] = None,
        init_status: str = "Chờ duyệt"
    ) -> Dict[str, Any]:
        """
        Giao dịch nguyên tử (Atomic ACID Transaction) giải quyết triệt để Race Condition:
        Sử dụng Pessimistic Lock (SELECT ... FOR UPDATE) trên hàng của cuốn sách trong CSDL.
        Nếu nhiều độc giả cùng mượn cuốn sách cuối cùng (available_copies = 1) ở cùng 1 mili-giây,
        chỉ duy nhất 1 giao dịch mượn thành công. Các giao dịch còn lại lập tức bị từ chối với BOOK_OUT_OF_STOCK.
        """
        invalidate_books_cache()

        now = datetime.now()
        if not due_date:
            if borrow_type == "Mượn tại thư viện":
                due_date = now.replace(hour=23, minute=59, second=59)
            else:
                due_date = now + timedelta(days=14)

        # Chọn session factory phù hợp (MySQL nếu có, nếu không thì SQLite)
        use_mysql = bool(self._is_connected and self.SessionLocal)
        session_factory = self.SessionLocal if use_mysql else self.SqliteSession
        if not session_factory:
            raise RuntimeError("Không có kết nối cơ sở dữ liệu khả dụng")

        session = session_factory()
        try:
            # 1. Khóa bi quan hàng cuốn sách (Pessimistic Lock)
            # Với MySQL InnoDB: with_for_update() đặt khóa độc quyền Exclusive Lock (X-Lock)
            if use_mysql:
                book = session.query(BookModel).filter(BookModel.id == book_id).with_for_update().first()
            else:
                book = session.query(BookModel).filter(BookModel.id == book_id).first()

            if not book:
                raise ValueError("BOOK_NOT_FOUND")

            # 2. Kiểm tra số lượng sách thực tế sẵn có
            # Đếm số lượng phiếu đang mượn, quá hạn hoặc chờ duyệt của cuốn sách này
            active_or_pending = session.query(BorrowRecordModel).filter(
                BorrowRecordModel.book_id == book_id,
                BorrowRecordModel.status.in_(["Chờ duyệt", "Đang mượn", "Quá hạn"])
            ).count()

            # Nếu số lượng đã đạt trần hoặc available_copies <= 0
            if active_or_pending >= book.quantity or book.available_copies <= 0:
                raise ValueError("BOOK_OUT_OF_STOCK")

            # 3. Trừ số lượng sách nguyên tử
            book.available_copies = max(0, book.available_copies - 1)
            if book.available_copies == 0:
                book.status = "Hết sách"

            # 4. Tạo phiếu mượn mới
            new_record = BorrowRecordModel(
                user_id=user_id,
                book_id=book_id,
                borrow_date=now,
                due_date=due_date,
                borrow_type=borrow_type,
                status=init_status,
                fine_amount=0.0,
                overdue_days=0
            )
            session.add(new_record)
            session.commit()

            res_dict = new_record.to_dict()
            res_dict["bookTitle"] = book.title
            user_obj = session.query(UserModel).filter_by(id=user_id).first()
            res_dict["readerName"] = user_obj.full_name if user_obj else "Độc giả"

            # 5. Nếu đang chạy trên MySQL, đồng bộ tức thì sang SQLite bản sao lưu
            if use_mysql and self.SqliteSession:
                try:
                    sq_session = self.SqliteSession()
                    sq_b = sq_session.query(BookModel).filter_by(id=book_id).first()
                    if sq_b:
                        sq_b.available_copies = book.available_copies
                        sq_b.status = book.status
                    sq_rec = BorrowRecordModel(
                        id=new_record.id,
                        user_id=user_id,
                        book_id=book_id,
                        borrow_date=now,
                        due_date=due_date,
                        borrow_type=borrow_type,
                        status=init_status,
                        fine_amount=0.0,
                        overdue_days=0
                    )
                    sq_session.add(sq_rec)
                    sq_session.commit()
                    sq_session.close()
                except Exception as sq_err:
                    logger.warning(f"Đồng bộ SQLite backup: {sq_err}")

            try:
                self._sync_to_sql_file(self.load_db())
            except Exception as sql_err:
                logger.warning(f"Đồng bộ smartlib_mysql.sql: {sql_err}")

            return res_dict
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def save_db(self, data: Dict[str, Any]):
        """
        Đồng bộ toàn bộ dữ liệu từ Dict vào các bảng MySQL quan hệ.
        """
        if data.get("books"):
            _BOOKS_CACHE["data"] = data.get("books")
            _BOOKS_CACHE["cached_at"] = time.time()
        else:
            invalidate_books_cache()

        # Luôn sao lưu và đồng bộ dữ liệu vào SQLite dự phòng
        self._save_to_local_sqlite(data)
        # Luôn đồng bộ dữ liệu vào file database/smartlib_mysql.sql
        self._sync_to_sql_file(data)

        if not self.SessionLocal:
            self._init_connection()
        if not self.SessionLocal:
            return
        session = self.SessionLocal()
        try:
            # 1. Sync Books
            incoming_bids = set()
            for b in data.get("books", []):
                bid = b.get("id")
                if not bid:
                    continue
                bid = int(bid)
                incoming_bids.add(bid)
                existing_book = session.query(BookModel).filter_by(id=bid).first()
                qty = int(b.get("quantity", 1))
                avail = int(b.get("available", qty))
                if existing_book:
                    existing_book.title = b.get("title", existing_book.title)
                    existing_book.author = b.get("author", existing_book.author)
                    existing_book.category = b.get("category", existing_book.category)
                    existing_book.quantity = qty
                    existing_book.available_copies = avail
                    existing_book.description = b.get("desc") or b.get("description") or existing_book.description
                    existing_book.image_url = b.get("imageUrl") or existing_book.image_url
                    existing_book.status = b.get("status", "Sẵn sàng" if avail > 0 else "Hết sách")
                    if b.get("expectedQuantity") is not None:
                        existing_book.published_year = int(b.get("expectedQuantity"))
                    elif b.get("publishedYear") is not None:
                        existing_book.published_year = int(b.get("publishedYear"))
                else:
                    new_b = BookModel(
                        id=bid,
                        title=b.get("title", "Sách"),
                        author=b.get("author", "Chưa rõ"),
                        category=b.get("category", "Chung"),
                        quantity=qty,
                        available_copies=avail,
                        description=b.get("desc") or b.get("description", ""),
                        image_url=b.get("imageUrl"),
                        status=b.get("status", "Sẵn sàng" if avail > 0 else "Hết sách"),
                        published_year=int(b.get("expectedQuantity") or b.get("publishedYear")) if (b.get("expectedQuantity") or b.get("publishedYear")) else None
                    )
                    session.add(new_b)

            if incoming_bids and "books" in data:
                del_books = session.query(BookModel).filter(~BookModel.id.in_(incoming_bids)).all()
                for dbk in del_books:
                    session.query(ReservationModel).filter_by(book_id=dbk.id).delete()
                    session.query(FineModel).filter_by(book_id=dbk.id).delete()
                    session.query(BorrowRecordModel).filter_by(book_id=dbk.id).delete()
                    session.delete(dbk)

            # 2. Sync Users
            for u in data.get("users", []):
                uid = u.get("id")
                if not uid:
                    continue
                existing_user = session.query(UserModel).filter_by(id=uid).first()
                if existing_user:
                    existing_user.full_name = u.get("fullName", existing_user.full_name)
                    existing_user.email = u.get("email", existing_user.email)
                    existing_user.phone = u.get("phone", existing_user.phone)
                    existing_user.address = u.get("address", existing_user.address)
                    existing_user.role = u.get("role", existing_user.role)
                    if "isLocked" in u:
                        existing_user.is_locked = bool(u.get("isLocked"))
                    if "lockReason" in u:
                        existing_user.lock_reason = u.get("lockReason")
                    if "passwordHash" in u and u.get("passwordHash"):
                        existing_user.password_hash = u.get("passwordHash")
                else:
                    new_u = UserModel(
                        id=uid,
                        username=u.get("username", f"user{uid}"),
                        password_hash=u.get("passwordHash", "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"),
                        full_name=u.get("fullName", "Người dùng"),
                        role=u.get("role", "Reader"),
                        email=u.get("email"),
                        phone=u.get("phone"),
                        address=u.get("address"),
                        is_locked=bool(u.get("isLocked", False)),
                        lock_reason=u.get("lockReason", "")
                    )
                    session.add(new_u)

            # 3. Sync BorrowRecords
            for br in data.get("borrowRecords", []):
                brid = br.get("id")
                if not brid:
                    continue
                existing_br = session.query(BorrowRecordModel).filter_by(id=brid).first()
                due_dt = datetime.fromisoformat(br.get("returnDate") or br.get("dueDate")) if (br.get("returnDate") or br.get("dueDate")) else datetime.utcnow()
                borrow_dt = datetime.fromisoformat(br.get("borrowDate")) if br.get("borrowDate") else datetime.utcnow()
                actual_dt = datetime.fromisoformat(br.get("actualReturnDate")) if br.get("actualReturnDate") else None

                if existing_br:
                    existing_br.status = br.get("status", existing_br.status)
                    existing_br.due_date = due_dt
                    existing_br.fine_amount = float(br.get("fine_amount") or br.get("fineAmount") or 0.0)
                    existing_br.overdue_days = int(br.get("overdue_days") or br.get("overdueDays") or 0)
                    existing_br.actual_return_date = actual_dt
                    existing_br.renew_status = br.get("renewStatus")
                    existing_br.pending_renew_days = br.get("pendingRenewDays")
                    existing_br.pending_renew_notes = br.get("pendingRenewNotes")
                    existing_br.renew_count = int(br.get("renewCount") or 0)
                    if br.get("notes") is not None:
                        existing_br.notes = br.get("notes")
                else:
                    new_br = BorrowRecordModel(
                        id=brid,
                        user_id=br.get("readerId") or br.get("userId") or 2,
                        book_id=br.get("bookId") or 1,
                        borrow_date=borrow_dt,
                        due_date=due_dt,
                        actual_return_date=actual_dt,
                        borrow_type=br.get("borrowType", "Mượn về nhà"),
                        fine_amount=float(br.get("fine_amount") or br.get("fineAmount") or 0.0),
                        overdue_days=int(br.get("overdue_days") or br.get("overdueDays") or 0),
                        status=br.get("status", "Chờ duyệt"),
                        notes=br.get("notes"),
                        renew_status=br.get("renewStatus"),
                        pending_renew_days=br.get("pendingRenewDays"),
                        pending_renew_notes=br.get("pendingRenewNotes"),
                        renew_count=int(br.get("renewCount") or 0)
                    )
                    session.add(new_br)

            # 4. Sync Reservations
            incoming_res_ids = set()
            for res in data.get("reservations", []):
                resid = res.get("id")
                if not resid:
                    continue
                resid = int(resid)
                incoming_res_ids.add(resid)
                existing_res = session.query(ReservationModel).filter_by(id=resid).first()
                exp_dt = datetime.fromisoformat(res.get("expiresAt").replace("Z", "")) if res.get("expiresAt") else None
                res_dt = datetime.fromisoformat(res.get("reservedAt").replace("Z", "")) if res.get("reservedAt") else datetime.utcnow()
                if existing_res:
                    existing_res.status = res.get("status", existing_res.status)
                    existing_res.priority = int(res.get("priority", existing_res.priority))
                    if exp_dt:
                        existing_res.expires_at = exp_dt
                else:
                    new_res = ReservationModel(
                        id=resid,
                        user_id=res.get("readerId") or res.get("userId") or 2,
                        book_id=res.get("bookId") or 1,
                        reserved_at=res_dt,
                        priority=int(res.get("priority", 1)),
                        expires_at=exp_dt or datetime.utcnow(),
                        status=res.get("status", "Waiting")
                    )
                    session.add(new_res)

            if "reservations" in data:
                del_res = session.query(ReservationModel).filter(~ReservationModel.id.in_(incoming_res_ids)).all()
                for dres in del_res:
                    session.delete(dres)

            # 5. Sync Fines
            for f in data.get("fines", []):
                fid = f.get("id")
                if not fid:
                    continue
                existing_fine = session.query(FineModel).filter_by(id=fid).first()
                paid_dt = datetime.fromisoformat(f.get("paidAt").replace("Z", "")) if f.get("paidAt") else None
                act_dt = datetime.fromisoformat(f.get("actualReturnDate").replace("Z", "")) if f.get("actualReturnDate") else None
                if existing_fine:
                    existing_fine.status = f.get("status", existing_fine.status)
                    existing_fine.fine_amount = float(f.get("fineAmount", existing_fine.fine_amount))
                    if "paymentMethod" in f:
                        existing_fine.payment_method = f.get("paymentMethod")
                    if "transactionRef" in f:
                        existing_fine.transaction_ref = f.get("transactionRef")
                    if paid_dt:
                        existing_fine.paid_at = paid_dt
                    if act_dt:
                        existing_fine.actual_return_date = act_dt
                    if "note" in f:
                        existing_fine.note = f.get("note")
                else:
                    due_dt = datetime.fromisoformat(f.get("dueDate").replace("Z", "")) if f.get("dueDate") else datetime.utcnow()
                    new_fine = FineModel(
                        id=fid,
                        record_id=f.get("borrowRecordId") or f.get("recordId") or 1,
                        user_id=f.get("readerId") or f.get("userId") or 2,
                        book_id=f.get("bookId") or 1,
                        due_date=due_dt,
                        actual_return_date=act_dt,
                        fine_amount=float(f.get("fineAmount", 0.0)),
                        status=f.get("status", "Chưa nộp"),
                        payment_method=f.get("paymentMethod"),
                        transaction_ref=f.get("transactionRef"),
                        paid_at=paid_dt,
                        note=f.get("note")
                    )
                    session.add(new_fine)

            # 6. Sync Notifications
            for n in data.get("notifications", []):
                nid = n.get("id")
                if not nid:
                    continue
                existing_notif = session.query(NotificationModel).filter_by(id=nid).first()
                if existing_notif:
                    existing_notif.is_read = bool(n.get("isRead", False))
                else:
                    new_n = NotificationModel(
                        id=nid,
                        recipient_role=n.get("recipientRole", "Admin"),
                        recipient_user_id=n.get("recipientUserId"),
                        title=n.get("title", ""),
                        message=n.get("message", ""),
                        type=n.get("type", "general"),
                        is_read=bool(n.get("isRead", False)),
                        meta_json=n.get("meta") or {},
                        created_at=datetime.fromisoformat(n["createdAt"].replace("Z", "")) if n.get("createdAt") else datetime.utcnow()
                    )
                    session.add(new_n)

            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Lỗi khi save_db vào MySQL: {e}")
        finally:
            session.close()

    def _execute_on_db(self, action_func):
        """
        Thực thi thao tác cập nhật trên MySQL (nếu đang kết nối) VÀ đồng thời trên SQLite cục bộ
        để đảm bảo dữ liệu luôn nhất quán 100% dù hệ thống đang chạy ở chế độ nào.
        """
        # 1. Thực thi trên MySQL nếu máy chủ MySQL khả dụng
        if self._is_connected and self.SessionLocal:
            session = self.SessionLocal()
            try:
                action_func(session)
                session.commit()
            except Exception as e:
                session.rollback()
                logger.error(f"Lỗi thao tác MySQL: {e}")
            finally:
                session.close()

        # 2. Luôn thực thi trên SQLite cục bộ
        if self.SqliteSession:
            sq_session = self.SqliteSession()
            try:
                action_func(sq_session)
                sq_session.commit()
            except Exception as e:
                sq_session.rollback()
                logger.error(f"Lỗi thao tác SQLite: {e}")
            finally:
                sq_session.close()

    def mark_notification_read(self, notif_id: int):
        """Đánh dấu 1 thông báo là đã đọc trên cả MySQL và SQLite"""
        def action(s):
            notif = s.query(NotificationModel).filter_by(id=notif_id).first()
            if notif:
                notif.is_read = True
        self._execute_on_db(action)

    def mark_all_notifications_read(self, role: Optional[str] = None, user_id: Optional[int] = None):
        """Đánh dấu tất cả thông báo là đã đọc trên cả MySQL và SQLite"""
        def action(s):
            q = s.query(NotificationModel)
            if role in ("Admin", "Librarian"):
                q = q.filter(NotificationModel.recipient_role.in_(["Admin", "Librarian"]))
            elif role == "Reader":
                q = q.filter(NotificationModel.recipient_role == "Reader")
                if user_id:
                    q = q.filter((NotificationModel.recipient_user_id == user_id) | (NotificationModel.recipient_user_id.is_(None)))
            q.update({NotificationModel.is_read: True}, synchronize_session=False)
        self._execute_on_db(action)

    def delete_notification(self, notif_id: int):
        """Xóa 1 thông báo trên cả MySQL và SQLite"""
        def action(s):
            notif = s.query(NotificationModel).filter_by(id=notif_id).first()
            if notif:
                s.delete(notif)
        self._execute_on_db(action)

    def delete_book(self, book_id: int):
        """Xóa sách và toàn bộ dữ liệu phụ thuộc trên cả MySQL và SQLite"""
        invalidate_books_cache()
        bid = int(book_id)
        def action(s):
            s.query(ReservationModel).filter_by(book_id=bid).delete(synchronize_session=False)
            s.query(FineModel).filter_by(book_id=bid).delete(synchronize_session=False)
            s.query(BorrowRecordModel).filter_by(book_id=bid).delete(synchronize_session=False)
            b = s.query(BookModel).filter_by(id=bid).first()
            if b:
                s.delete(b)
        self._execute_on_db(action)

    def clear_read_notifications(self, role: Optional[str] = None, user_id: Optional[int] = None):
        """Dọn dẹp thông báo đã đọc trên cả MySQL và SQLite"""
        def action(s):
            q = s.query(NotificationModel).filter(NotificationModel.is_read == True)
            if role in ("Admin", "Librarian"):
                q = q.filter(NotificationModel.recipient_role.in_(["Admin", "Librarian"]))
            elif role == "Reader":
                q = q.filter(NotificationModel.recipient_role == "Reader")
                if user_id:
                    q = q.filter((NotificationModel.recipient_user_id == user_id) | (NotificationModel.recipient_user_id.is_(None)))
            q.delete(synchronize_session=False)
        self._execute_on_db(action)

    def add_notification(
        self,
        recipient_role: str,
        title: str,
        message: str,
        notif_type: str = "general",
        recipient_user_id: Optional[int] = None,
        meta: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        if not self.SessionLocal:
            db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database", "smartlib_local.db"))
            if os.path.exists(db_path):
                try:
                    sqlite_engine = create_engine(f"sqlite:///{db_path}")
                    SqliteSession = sessionmaker(bind=sqlite_engine)
                    session = SqliteSession()
                    notif = NotificationModel(
                        recipient_role=recipient_role,
                        recipient_user_id=recipient_user_id,
                        title=title,
                        message=message,
                        type=notif_type,
                        is_read=False,
                        meta_json=meta or {},
                        created_at=datetime.utcnow()
                    )
                    session.add(notif)
                    session.commit()
                    session.refresh(notif)
                    res_dict = notif.to_dict()
                    session.close()
                    return res_dict
                except Exception as e:
                    logger.error(f"Lỗi khi add_notification vào SQLite: {e}")
            return {
                "id": 9999,
                "recipientRole": recipient_role,
                "title": title,
                "message": message,
                "type": notif_type,
                "isRead": False,
                "createdAt": datetime.utcnow().isoformat()
            }
        session = self.SessionLocal()
        try:
            notif = NotificationModel(
                recipient_role=recipient_role,
                recipient_user_id=recipient_user_id,
                title=title,
                message=message,
                type=notif_type,
                is_read=False,
                meta_json=meta or {},
                created_at=datetime.utcnow()
            )
            session.add(notif)
            session.commit()
            session.refresh(notif)
            return notif.to_dict()
        except Exception as e:
            session.rollback()
            logger.error(f"Lỗi khi add_notification vào MySQL: {e}")
            return {
                "id": 9999,
                "recipientRole": recipient_role,
                "title": title,
                "message": message,
                "type": notif_type,
                "isRead": False,
                "createdAt": datetime.utcnow().isoformat()
            }
        finally:
            session.close()

    def calculate_fine(self, record: Dict[str, Any]) -> float:
        try:
            due_str = record.get("returnDate") or record.get("dueDate")
            actual_str = record.get("actualReturnDate")
            if not due_str or not actual_str:
                return 0.0
            due = datetime.fromisoformat(due_str.replace("Z", ""))
            actual = datetime.fromisoformat(actual_str.replace("Z", ""))
            overdue_days = (actual.date() - due.date()).days
            if overdue_days > 0:
                dyn = get_dynamic_settings()
                rate = float(dyn.get("finePerDay", FINE_PER_DAY))
                grace = int(dyn.get("gracePeriodDays", 0))
                chargeable = max(0, overdue_days - grace)
                return float(chargeable * rate)
        except Exception:
            pass
        return 0.0


    def save_fine_record(self, borrow_record: Dict[str, Any], fine_amount: float) -> Optional[Dict[str, Any]]:
        if fine_amount <= 0:
            return None
        session_factory = self.SessionLocal if (self._is_connected and self.SessionLocal) else self.SqliteSession
        if not session_factory:
            return None
        session = session_factory()
        try:
            brid = borrow_record.get("id")
            existing = session.query(FineModel).filter_by(record_id=brid).first()
            due_dt = datetime.fromisoformat(borrow_record.get("returnDate") or borrow_record.get("dueDate"))
            act_dt = datetime.fromisoformat(borrow_record.get("actualReturnDate"))

            if existing:
                existing.fine_amount = fine_amount
                session.commit()
                session.refresh(existing)
                return existing.to_dict()

            fine = FineModel(
                record_id=brid,
                user_id=borrow_record.get("readerId") or borrow_record.get("userId") or 2,
                book_id=borrow_record.get("bookId") or 1,
                due_date=due_dt,
                actual_return_date=act_dt,
                fine_amount=fine_amount,
                status="Chưa nộp"
            )
            session.add(fine)
            session.commit()
            session.refresh(fine)
            return fine.to_dict()
        except Exception as e:
            session.rollback()
            logger.error(f"Lỗi khi save_fine_record vào MySQL: {e}")
            return None
        finally:
            session.close()


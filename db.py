import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Đọc DATABASE_URL từ environment variable (Replit tự cấp khi có PostgreSQL)
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL chưa được set. Hãy thêm PostgreSQL database trong Replit.")

# Engine kết nối tới PostgreSQL
engine = create_engine(DATABASE_URL)

# Session factory — dùng để mở/đóng DB session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class cho toàn bộ ORM models kế thừa
Base = declarative_base()


def get_db():
    """FastAPI dependency: tự động mở và đóng session sau mỗi request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Tạo tất cả bảng trong DB nếu chưa tồn tại (gọi lúc server khởi động)."""
    import models  # import ở đây để tránh circular import
    Base.metadata.create_all(bind=engine)

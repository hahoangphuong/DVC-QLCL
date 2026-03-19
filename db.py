import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Đọc DATABASE_URL từ biến môi trường (Replit tự cung cấp)
DATABASE_URL = os.environ["DATABASE_URL"]

# Tạo engine kết nối PostgreSQL
engine = create_engine(DATABASE_URL)

# Session factory dùng để thao tác với DB
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class cho tất cả ORM models
Base = declarative_base()


def get_db():
    """Dependency dùng trong FastAPI để inject DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Tạo tất cả bảng nếu chưa tồn tại."""
    from models import Base as ModelsBase  # import tránh circular
    ModelsBase.metadata.create_all(bind=engine)

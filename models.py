from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from db import Base


class FetchedRecord(Base):
    """Lưu dữ liệu thô lấy được từ API của website ASP.NET."""
    __tablename__ = "fetched_records"

    id = Column(Integer, primary_key=True, index=True)

    # Tên endpoint / nguồn dữ liệu (ví dụ: "orders", "products")
    source = Column(String(100), nullable=False, index=True)

    # Toàn bộ payload JSON trả về từ API, lưu dưới dạng JSONB
    payload = Column(JSON, nullable=True)

    # Tóm tắt hoặc key nhận dạng từ response (tuỳ chỉnh)
    summary = Column(Text, nullable=True)

    # Thời điểm lấy dữ liệu
    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<FetchedRecord id={self.id} source={self.source} at={self.fetched_at}>"

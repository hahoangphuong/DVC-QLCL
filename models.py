from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from db import Base


class RemoteFetchLog(Base):
    """
    Ghi lại mỗi lần fetch dữ liệu từ nguồn bên ngoài (ví dụ: ASP.NET API).
    Lưu đầy đủ endpoint, status code, payload JSON và raw text để debug.
    """
    __tablename__ = "remote_fetch_logs"

    # Khoá chính tự tăng
    id = Column(Integer, primary_key=True, index=True)

    # Tên nguồn dữ liệu, ví dụ: "orders", "inventory", "customers"
    source = Column(String(100), nullable=False, index=True)

    # URL endpoint đã được gọi
    endpoint = Column(String(500), nullable=False)

    # HTTP status code trả về (200, 401, 500, ...)
    status_code = Column(Integer, nullable=False)

    # Payload JSON từ response, lưu dạng JSONB để query nhanh trong PostgreSQL
    payload = Column(JSONB, nullable=True)

    # Raw text của response (dùng khi response không phải JSON)
    raw_text = Column(Text, nullable=True)

    # Thời điểm fetch, mặc định là thời điểm hiện tại (UTC)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self):
        return (
            f"<RemoteFetchLog id={self.id} source={self.source!r} "
            f"status={self.status_code} at={self.created_at}>"
        )

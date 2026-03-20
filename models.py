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

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(100), nullable=False, index=True)
    endpoint = Column(String(2000), nullable=False)
    status_code = Column(Integer, nullable=False)
    payload = Column(JSONB, nullable=True)
    raw_text = Column(Text, nullable=True)
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


# ---------------------------------------------------------------------------
# Bảng dùng chung cho 7 bộ dữ liệu hồ sơ
# Mỗi row là 1 hồ sơ (record) từ API, lưu nguyên JSON trong cột `data`.
# synced_at là thời điểm đồng bộ — tất cả record trong cùng 1 lần sync
# có cùng synced_at, giúp biết dữ liệu mới nhất từ lúc nào.
# ---------------------------------------------------------------------------

class _HoSoBase:
    """Mixin chung — không tạo bảng, chỉ định nghĩa cột."""
    id = Column(Integer, primary_key=True, autoincrement=True)
    synced_at = Column(DateTime(timezone=True), nullable=False, index=True)
    data = Column(JSONB, nullable=False)


class TraCuuChung(_HoSoBase, Base):
    """Tra cứu chung tất cả hồ sơ (TT46 + TT47 + TT48)."""
    __tablename__ = "tra_cuu_chung"


class TT48DaXuLy(_HoSoBase, Base):
    """Hồ sơ TT48 đã được xử lý."""
    __tablename__ = "tt48_da_xu_ly"


class TT48DangXuLy(_HoSoBase, Base):
    """Hồ sơ TT48 đang được xử lý."""
    __tablename__ = "tt48_dang_xu_ly"


class TT47DaXuLy(_HoSoBase, Base):
    """Hồ sơ TT47 đã được xử lý."""
    __tablename__ = "tt47_da_xu_ly"


class TT47DangXuLy(_HoSoBase, Base):
    """Hồ sơ TT47 đang được xử lý."""
    __tablename__ = "tt47_dang_xu_ly"


class TT46DaXuLy(_HoSoBase, Base):
    """Hồ sơ TT46 đã được xử lý."""
    __tablename__ = "tt46_da_xu_ly"


class TT46DangXuLy(_HoSoBase, Base):
    """Hồ sơ TT46 đang được xử lý."""
    __tablename__ = "tt46_dang_xu_ly"

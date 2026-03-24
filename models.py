from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from db import Base


class SyncMeta(Base):
    """
    Lưu thời gian sync gần nhất và số bản ghi cho từng bảng dữ liệu.
    Thay thế cho cột synced_at trên từng row — tiết kiệm lưu trữ đáng kể.
    Mỗi bảng có đúng 1 dòng; được INSERT ON CONFLICT UPDATE sau mỗi lần sync.
    """
    __tablename__ = "sync_meta"

    table_name   = Column(String(100), primary_key=True)
    synced_at    = Column(DateTime(timezone=True), nullable=False)
    record_count = Column(Integer, nullable=False, default=0)

    def __repr__(self):
        return (
            f"<SyncMeta table={self.table_name!r} "
            f"synced_at={self.synced_at} count={self.record_count}>"
        )


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
# synced_at đã được chuyển sang bảng sync_meta — không còn per-row nữa.
# ---------------------------------------------------------------------------

class _HoSoBase:
    """Mixin chung — không tạo bảng, chỉ định nghĩa cột."""
    id   = Column(Integer, primary_key=True, autoincrement=True)
    data = Column(JSONB, nullable=False)


class TraCuuChung(_HoSoBase, Base):
    """Tra cứu chung tất cả hồ sơ (TT46 + TT47 + TT48)."""
    __tablename__ = "tra_cuu_chung"


class DaXuLy(_HoSoBase, Base):
    """
    Hồ sơ ĐÃ xử lý — gộp chung TT46 + TT47 + TT48.
    Cột thu_tuc (46/47/48) dùng để phân loại, JSONB data cũng có thuTucId.
    """
    __tablename__ = "da_xu_ly"
    thu_tuc = Column(Integer, nullable=False, index=True)


class DangXuLy(_HoSoBase, Base):
    """
    Hồ sơ ĐANG xử lý — gộp chung TT46 + TT47 + TT48.
    Cột thu_tuc (46/47/48) dùng để phân loại, JSONB data cũng có thuTucId.
    """
    __tablename__ = "dang_xu_ly"
    thu_tuc = Column(Integer, nullable=False, index=True)


class TT48DaXuLy(_HoSoBase, Base):
    """Hồ sơ TT48 đã được xử lý (giữ để backward-compat, không còn ghi mới)."""
    __tablename__ = "tt48_da_xu_ly"


class TT48DangXuLy(_HoSoBase, Base):
    """Hồ sơ TT48 đang được xử lý (giữ để backward-compat, không còn ghi mới)."""
    __tablename__ = "tt48_dang_xu_ly"


class TT47DaXuLy(_HoSoBase, Base):
    """Hồ sơ TT47 đã được xử lý (giữ để backward-compat, không còn ghi mới)."""
    __tablename__ = "tt47_da_xu_ly"


class TT47DangXuLy(_HoSoBase, Base):
    """Hồ sơ TT47 đang được xử lý (giữ để backward-compat, không còn ghi mới)."""
    __tablename__ = "tt47_dang_xu_ly"


class TT46DaXuLy(_HoSoBase, Base):
    """Hồ sơ TT46 đã được xử lý (giữ để backward-compat, không còn ghi mới)."""
    __tablename__ = "tt46_da_xu_ly"


class TT46DangXuLy(_HoSoBase, Base):
    """Hồ sơ TT46 đang được xử lý (giữ để backward-compat, không còn ghi mới)."""
    __tablename__ = "tt46_dang_xu_ly"

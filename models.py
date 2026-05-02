from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from db import Base


class SyncMeta(Base):
    """
    Lưu thời gian sync gần nhất và số bản ghi cho từng bảng dữ liệu.
    Thay thế cho cột synced_at trên từng row — tiết kiệm lưu trữ đáng kể.
    Mỗi bảng có đúng 1 dòng; được INSERT ON CONFLICT UPDATE sau mỗi lần sync.

    fetch_sec   : thời gian (giây) gọi API từ xa và nhận dữ liệu về
    insert_sec  : thời gian (giây) để xử lý + bulk INSERT vào DB (bao gồm commit)
    """
    __tablename__ = "sync_meta"

    table_name   = Column(String(100), primary_key=True)
    synced_at    = Column(DateTime(timezone=True), nullable=False)
    record_count = Column(Integer, nullable=False, default=0)
    fetch_sec    = Column(Float, nullable=True)
    insert_sec   = Column(Float, nullable=True)

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
    co_so_dang_ky = Column(Text, nullable=True)
    co_so_san_xuat = Column(Text, nullable=True)


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


class Tt48CvBuoc(Base):
    """
    Bảng phụ TT48: phân loại hồ sơ đang ở bước Chuyên viên theo từng sub-bước.
    Được rebuild hoàn toàn mỗi lần sync từ 3 API phụ (formCase 2, 3, 5).
    Chỉ lưu 2 trường cần thiết — không lưu toàn bộ JSON để tiết kiệm bộ nhớ.

    buoc: "chua_xu_ly" | "bi_tra_lai" | "cho_tong_hop" | "cho_ket_thuc"
    """
    __tablename__ = "tt48_cv_buoc"
    ma_ho_so = Column(String(100), primary_key=True)
    buoc     = Column(String(50),  nullable=False)


class Tt47Tt46DangXuLyStatus(Base):
    """
    Bảng phụ TT46/TT47: lưu sub-status của nhóm "Đang xử lý" theo mã hồ sơ.
    Dùng cho dashboard stats đọc dữ liệu đã sync định kỳ.
    """
    __tablename__ = "tt47_46_dang_xu_ly_status"
    thu_tuc = Column(Integer, primary_key=True)
    ma_ho_so = Column(String(100), primary_key=True)
    trang_thai_xu_ly = Column(Integer, nullable=False)


class Tt47Tt46ChoThamDinh(Base):
    """
    Bảng phụ TT46/TT47: lưu tập hồ sơ ở nhánh "chờ thẩm định" theo mã hồ sơ.
    Dùng cho dashboard stats/lookup đọc dữ liệu đã sync định kỳ thay vì fetch DAV runtime.
    """
    __tablename__ = "tt47_46_cho_tham_dinh"
    thu_tuc = Column(Integer, primary_key=True)
    ma_ho_so = Column(String(100), primary_key=True)
    chuyen_vien_thu_ly = Column(String(255), nullable=False)

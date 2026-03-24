import logging
import logging.handlers
import os
import re
import time as _time
import requests
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from db import Base, engine, SessionLocal
from models import (
    SyncMeta,
    RemoteFetchLog,
    TraCuuChung,
    DaXuLy, DangXuLy,
    TT48DaXuLy, TT48DangXuLy,
    TT47DaXuLy, TT47DangXuLy,
    TT46DaXuLy, TT46DangXuLy,
)
from auth_client import RemoteClient, RemoteAuthError


# ===========================================================================
# FILE LOGGER — ghi chi tiết mỗi lần sync vào logs/sync.log
# Rotating: tối đa 5 file × 10 MB = 50 MB, sau đó ghi đè file cũ nhất
# ===========================================================================
_LOG_DIR = Path("logs")
_LOG_DIR.mkdir(exist_ok=True)

_sync_log = logging.getLogger("sync_job")
_sync_log.setLevel(logging.INFO)
_sync_log.propagate = False  # không đẩy lên root logger của uvicorn

_fh = logging.handlers.RotatingFileHandler(
    _LOG_DIR / "sync.log",
    maxBytes=10 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
_fh.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)-5s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
_sync_log.addHandler(_fh)

# Bộ đếm thứ tự mỗi lần chạy job (dễ theo dõi trong log)
_job_run_counter = 0


# ===========================================================================
# SCHEDULER — APScheduler chạy job mỗi N giờ (mặc định 3h, có thể thay đổi)
# ===========================================================================
_scheduler = BackgroundScheduler(timezone="UTC")
_sync_interval_hours: float = 3.0  # giá trị hiện tại, cập nhật khi reschedule

# Tên các bảng dữ liệu hồ sơ (không tính sync_meta, logs, ...)
_DATA_TABLES = [
    "tra_cuu_chung",
    "dang_xu_ly",
    "da_xu_ly",
    "tt48_da_xu_ly", "tt48_dang_xu_ly",
    "tt47_da_xu_ly", "tt47_dang_xu_ly",
    "tt46_da_xu_ly", "tt46_dang_xu_ly",
]


def _migrate_schema():
    """
    Migration idempotent chạy mỗi lần server khởi động.

    1. Xóa cột synced_at (không còn per-row — đã chuyển sang sync_meta).
    2. Tạo các functional index JSONB còn thiếu để tăng tốc query thống kê.
    """
    with engine.begin() as conn:
        # -- 1. Bỏ cột synced_at khỏi tất cả bảng dữ liệu ------------------
        for t in _DATA_TABLES:
            conn.execute(text(
                f'ALTER TABLE IF EXISTS "{t}" DROP COLUMN IF EXISTS synced_at'
            ))

        # -- 2. Thêm cột fetch_sec / insert_sec vào sync_meta nếu chưa có -----
        conn.execute(text(
            "ALTER TABLE IF EXISTS sync_meta "
            "ADD COLUMN IF NOT EXISTS fetch_sec FLOAT"
        ))
        conn.execute(text(
            "ALTER TABLE IF EXISTS sync_meta "
            "ADD COLUMN IF NOT EXISTS insert_sec FLOAT"
        ))

        # -- 3. Thêm JSONB indexes còn thiếu ---------------------------------
        # dang_xu_ly — thiếu index maHoSo, id, tenDonViXuLy (dùng trong JOIN/CTE)
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_ma_ho_so "
            "ON dang_xu_ly ((data->>'maHoSo'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_id "
            "ON dang_xu_ly ((data->>'id'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_don_vi "
            "ON dang_xu_ly ((data->>'tenDonViXuLy'))"
        ))

        # tra_cuu_chung — index text cho ngayTiepNhan, ngayHenTra (ISO 8601 → so sánh text đúng)
        # Lưu ý: không thể index ::timestamptz vì cast không phải IMMUTABLE trong PostgreSQL
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_ngay_tiep_nhan "
            "ON tra_cuu_chung ((data->>'ngayTiepNhan'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_ngay_hen_tra "
            "ON tra_cuu_chung ((data->>'ngayHenTra'))"
        ))

        # da_xu_ly — index text cho ngayTraKetQua và trangThaiHoSo
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_ngay_tra "
            "ON da_xu_ly ((data->>'ngayTraKetQua'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_trang_thai "
            "ON da_xu_ly ((data->>'trangThaiHoSo'))"
        ))


def _upsert_sync_meta(
    db,
    table_name: str,
    synced_at,
    record_count: int,
    fetch_sec: float = 0.0,
    insert_sec: float = 0.0,
):
    """Cập nhật bảng sync_meta cho một bảng dữ liệu (INSERT hoặc UPDATE)."""
    db.execute(
        text("""
            INSERT INTO sync_meta (table_name, synced_at, record_count, fetch_sec, insert_sec)
            VALUES (:tn, :sa, :rc, :fs, :is)
            ON CONFLICT (table_name)
            DO UPDATE SET synced_at    = EXCLUDED.synced_at,
                          record_count = EXCLUDED.record_count,
                          fetch_sec    = EXCLUDED.fetch_sec,
                          insert_sec   = EXCLUDED.insert_sec
        """),
        {"tn": table_name, "sa": synced_at, "rc": record_count,
         "fs": round(fetch_sec, 2), "is": round(insert_sec, 2)},
    )


# Tạo tất cả bảng + khởi động scheduler khi server start
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    # next_run_time=now → chạy sync ngay lập tức khi server khởi động,
    # sau đó lặp lại mỗi 3 giờ tự động
    _scheduler.add_job(
        _run_sync_all_job,
        trigger="interval",
        hours=3,
        id="sync_all_3h",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    _sync_log.info("=" * 70)
    _sync_log.info("SERVER KHỞI ĐỘNG — sync ngay lập tức + scheduler mỗi 3h")
    _sync_log.info("=" * 70)
    yield
    _scheduler.shutdown(wait=False)


app = FastAPI(
    title="DAV PQLCL Scraper",
    description="Đăng nhập dichvucong.dav.gov.vn, lấy 7 bộ dữ liệu hồ sơ, lưu vào PostgreSQL",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helper: lấy DenNgay động — luôn là thời điểm hiện tại (UTC)
# Định dạng khớp chính xác với cURL: "2026-03-20T05:59:19.118Z"
# ---------------------------------------------------------------------------
def _den_ngay_now() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime(f"%Y-%m-%dT%H:%M:%S.{now.microsecond // 1000:03d}Z")


# ---------------------------------------------------------------------------
# Helper: làm sạch giá trị ngày từ API nguồn
# Xử lý các trường hợp:
#   1. Lặp có ký tự ngắt: "23/05/2025\n23/05/2025"
#   2. Lặp không có ký tự ngắt (ghép liền): "23/05/202523/05/2025"
#   3. ISO timestamp ghép liền: "2025-05-23T10:00:00+07:002025-05-23T10:00:00+07:00"
#   4. Chuyển đổi DD/MM/YYYY → ISO 8601
# ---------------------------------------------------------------------------
_DATE_FIELDS = {
    "ngayTraKetQua", "ngayTiepNhan", "ngayHenTra",
    "phoPhongNgayDuyet", "vanThuNgayDongDau",
    "ngayDoanhNghiepNopHoSo", "ngayChuyenAuto",
    "ngayMotCuaChuyen", "ngayThanhToan", "ngayXacNhanThanhToan",
}

# Regex trích xuất phần đầu hợp lệ của một date string
# - ISO timestamp: YYYY-MM-DDTHH:MM:SS[.sss]+HH:MM
# - DD/MM/YYYY
_RE_ISO_TS   = re.compile(
    r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z))'
)
_RE_DDMMYYYY = re.compile(r'(\d{2}/\d{2}/\d{4})')


def _clean_date_value(val: str) -> str | None:
    """
    Làm sạch một chuỗi ngày trả về từ API:
    1. Strip khoảng trắng, newline, carriage return
    2. Nếu bị lặp qua ký tự ngắt (\n, \r): lấy phần trước ký tự đầu tiên
    3. Nếu bắt đầu bằng DD/MM/YYYY (kể cả bị ghép liền): trích regex → ISO 8601
    4. Nếu bắt đầu bằng ISO timestamp (kể cả bị ghép liền): trích regex → lấy match đầu
    Trả None nếu rỗng; trả nguyên giá trị nếu không nhận dạng được.
    """
    if not val or not isinstance(val, str):
        return val

    # Bước 1: strip + tách tại ký tự ngắt dòng / CR
    cleaned = val.strip().split("\n")[0].split("\r")[0].strip()
    if not cleaned:
        return None

    # Bước 2: DD/MM/YYYY (đơn hoặc ghép liền "23/05/202523/05/2025")
    if _RE_DDMMYYYY.match(cleaned):
        m = _RE_DDMMYYYY.match(cleaned)
        date_part = m.group(1)  # luôn lấy đúng 10 ký tự DD/MM/YYYY đầu tiên
        try:
            day, month, year = date_part.split("/")
            return f"{year}-{month}-{day}T00:00:00+07:00"
        except ValueError:
            return None

    # Bước 3: ISO timestamp (đơn hoặc ghép liền)
    m = _RE_ISO_TS.match(cleaned)
    if m:
        return m.group(1)  # lấy timestamp đầu tiên hợp lệ

    # Fallback: trả nguyên giá trị (đã strip)
    return cleaned


def _clean_record(item: dict) -> dict:
    """Áp dụng _clean_date_value cho tất cả trường ngày trong một record.

    Fallback: nếu ngayTraKetQua bị null/rỗng mà vanThuNgayDongDau có giá trị
    thì dùng vanThuNgayDongDau làm ngày trả kết quả (đây là ngày văn thư
    đóng dấu — chính là ngày website hiển thị cho người dùng).
    """
    for field in _DATE_FIELDS:
        if field in item and isinstance(item[field], str):
            item[field] = _clean_date_value(item[field])

    # Fallback: vanThuNgayDongDau → ngayTraKetQua
    if not item.get("ngayTraKetQua") and item.get("vanThuNgayDongDau"):
        item["ngayTraKetQua"] = item["vanThuNgayDongDau"]

    return item


# ---------------------------------------------------------------------------
# Helper chung: login → POST JSON → xoá table → insert records
#
# model_class : SQLAlchemy model tương ứng (ví dụ: TraCuuChung)
# api_url     : URL API đầy đủ
# body        : JSON body sẽ gửi lên (DenNgay đã được set trước khi truyền vào)
# label       : tên hiển thị trong response (ví dụ: "tra_cuu_chung")
# ---------------------------------------------------------------------------
def _do_sync(model_class, api_url: str, body: dict, label: str, referer: str | None = None) -> dict:
    db = SessionLocal()
    try:
        # Bước 1: đăng nhập + fetch (đo thời gian kéo dữ liệu)
        t_fetch = _time.monotonic()
        client = RemoteClient()
        client.login()

        # Bước 2: POST JSON tới API dữ liệu
        resp = client.post_json(api_url, body, referer=referer)
        payload = resp.json()

        # Bước 3: trích xuất danh sách records từ response ABP
        # Cấu trúc thường gặp: {"result": {"items": [...]}, "success": true}
        # Hoặc: {"result": [...], "success": true}
        if not payload.get("success", True):
            raise ValueError(f"API trả về lỗi: {payload.get('error', 'unknown')}")

        result = payload.get("result", payload)
        if isinstance(result, dict):
            items = result.get("items", result.get("data", []))
            total = result.get("totalCount", len(items))
        elif isinstance(result, list):
            items = result
            total = len(items)
        else:
            raise ValueError(f"Không thể parse result từ response: type={type(result)}")

        # Làm sạch date fields ngay sau khi nhận về
        for item in items:
            _clean_record(item)
        fetch_sec = _time.monotonic() - t_fetch

        # Bước 4: TRUNCATE + bulk INSERT (đo thời gian xử lý / ghi DB)
        t_insert = _time.monotonic()
        synced_at = datetime.now(timezone.utc)
        tbl = model_class.__tablename__
        db.execute(text(f'TRUNCATE TABLE "{tbl}" RESTART IDENTITY'))
        if items:
            db.execute(model_class.__table__.insert(), [{"data": item} for item in items])
        _upsert_sync_meta(db, tbl, synced_at, len(items),
                          fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert)
        db.commit()

        return {
            "ok": True,
            "dataset": label,
            "inserted": len(items),
            "total_from_api": total,
            "synced_at": synced_at.isoformat(),
        }

    except RemoteAuthError as e:
        db.rollback()
        raise HTTPException(status_code=401, detail=str(e))
    except EnvironmentError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Thiếu cấu hình: {e}")
    except requests.HTTPError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Lỗi HTTP từ API: {e}")
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ===========================================================================
# ENDPOINTS
# ===========================================================================

# ---------------------------------------------------------------------------
# 1. GET / — kiểm tra server đang chạy
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"ok": True, "message": "Backend is running"}


# ---------------------------------------------------------------------------
# 2. GET /test-login — thử đăng nhập, trả về danh sách tên cookie
# ---------------------------------------------------------------------------
@app.get("/test-login")
def test_login():
    try:
        client = RemoteClient()
        client.login()
        return {
            "ok": True,
            "cookies": list(client.debug_cookies().keys()),
        }
    except RemoteAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# 3. POST /sync — endpoint cũ (legacy), giữ lại để không break
# ---------------------------------------------------------------------------
@app.post("/sync")
def sync():
    db = SessionLocal()
    try:
        client = RemoteClient()
        client.login()
        resp = client.fetch_data()
        status_code = resp.status_code
        try:
            payload = resp.json()
            raw_text = None
        except Exception:
            payload = None
            raw_text = resp.text[:5000]
        record = RemoteFetchLog(
            source="sync",
            endpoint=str(resp.url),
            status_code=status_code,
            payload=payload,
            raw_text=raw_text,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return {"ok": True, "saved_id": record.id, "status_code": status_code}
    except RemoteAuthError as e:
        db.rollback()
        raise HTTPException(status_code=401, detail=str(e))
    except EnvironmentError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    except requests.HTTPError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 4. POST /sync/tra-cuu-chung
#    Tra cứu chung TT46 + TT47 + TT48 — lưu vào bảng tra_cuu_chung
#    DenNgay tự động = ngày hiện tại
# ---------------------------------------------------------------------------
@app.post("/sync/tra-cuu-chung")
def sync_tra_cuu_chung():
    base_url = os.environ.get("BASE_URL", "").rstrip("/")
    api_url = f"{base_url}/api/services/app/traCuu_PQLCL/TraCuu"
    body = {
        "formId": 14,
        "formCase": 1,
        "formCase2": 0,
        "page": 1,
        "pageSize": 100000,
        "maxResultCount": 100000,
        "DoanhNghiepId": None,
        "NhomThuTucId": None,
        "ThuTucHienHanh": [46, 47, 48],
        "phongBanId": 5,
        "MaHoSo": "",
        "LoaiDonHangIds": None,
        "TrangThai": None,
        "checkQuaHanPGia": False,
        "TuNgay": "2019-12-31T17:00:00.000Z",
        "DenNgay": _den_ngay_now(),          # ← cập nhật tự động mỗi lần gọi
        "ChuyenVienThuLyId": "",
        "thuTucId": "",
    }
    return _do_sync(TraCuuChung, api_url, body, "tra_cuu_chung")


# ---------------------------------------------------------------------------
# Helper: URL và body dùng chung cho 6 endpoint dashboard
# URL:  /api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc
# Body: strTuNgay cố định, strDenNgay = hôm nay (DD/MM/YYYY), ThuTucEnum, isDone
# Referer: /lanhdaocuc/index (khác với tra_cuu_chung dùng /Application)
# ---------------------------------------------------------------------------
def _dashboard_body(thu_tuc: int, is_done: bool) -> dict:
    """Tạo body cho dashboard API với ngày hiện tại."""
    today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    return {
        "strTuNgay": "01/01/2018",
        "strDenNgay": today,           # ← cập nhật tự động mỗi lần gọi
        "ThuTucEnum": [thu_tuc],
        "isDone": is_done,
    }


def _sync_unified(
    unified_model,
    legacy_model,
    thu_tuc: int,
    is_done: bool,
) -> dict:
    """
    Hàm sync tổng quát cho cả đã xử lý và đang xử lý:
    - Fetch dữ liệu từ API remote
    - Làm sạch date fields ngay khi nhận về (_clean_record)
    - Ghi vào bảng gộp (da_xu_ly / dang_xu_ly) bằng bulk INSERT
    - Bảng legacy (tt48/47/46_*) không còn được ghi vào — chỉ giữ cho compat đọc
    """
    trang_thai = "đã" if is_done else "đang"
    label = f"{'da' if is_done else 'dang'}_xu_ly (TT{thu_tuc})"

    base_url = os.environ.get("BASE_URL", "").rstrip("/")
    api_url = (
        f"{base_url}/api/services/app/dashBoard"
        "/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
    )
    referer = f"{base_url}/lanhdaocuc/index"
    body = _dashboard_body(thu_tuc, is_done=is_done)

    db = SessionLocal()
    try:
        t_fetch = _time.monotonic()
        client = RemoteClient()
        client.login()
        resp = client.post_json(api_url, body, referer=referer)
        payload = resp.json()

        if not payload.get("success", True):
            raise ValueError(f"API trả về lỗi: {payload.get('error', 'unknown')}")

        result = payload.get("result", payload)
        if isinstance(result, dict):
            items = result.get("items", result.get("data", []))
            total = result.get("totalCount", len(items))
        elif isinstance(result, list):
            items = result
            total = len(items)
        else:
            raise ValueError(f"Không thể parse result: type={type(result)}")

        fetch_sec = _time.monotonic() - t_fetch

        # Làm sạch date fields + đảm bảo thuTucId đúng
        for item in items:
            _clean_record(item)
            item["thuTucId"] = thu_tuc

        # Xóa dữ liệu cũ của thu_tuc này trong bảng gộp, sau đó bulk INSERT
        t_insert = _time.monotonic()
        synced_at = datetime.now(timezone.utc)
        unified_tbl = unified_model.__tablename__
        db.execute(
            text(f'DELETE FROM "{unified_tbl}" WHERE thu_tuc = :tt'),
            {"tt": thu_tuc},
        )
        if items:
            db.execute(
                unified_model.__table__.insert(),
                [{"thu_tuc": thu_tuc, "data": item} for item in items],
            )
        _upsert_sync_meta(db, unified_tbl, synced_at, len(items),
                          fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert)
        db.commit()

        inserted = len(items)
        _sync_log.info(
            f"[{label}] {trang_thai} xử lý: {inserted}/{total} records"
        )
        return {
            "ok":             True,
            "dataset":        label,
            "inserted":       inserted,
            "total_from_api": total,
            "synced_at":      synced_at.isoformat(),
        }

    except RemoteAuthError as e:
        db.rollback()
        raise HTTPException(status_code=401, detail=str(e))
    except EnvironmentError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Thiếu cấu hình: {e}")
    except requests.HTTPError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Lỗi HTTP từ API: {e}")
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 5. POST /sync/tt48-da-xu-ly  → da_xu_ly (thu_tuc=48) + tt48_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt48-da-xu-ly")
def sync_tt48_da_xu_ly():
    return _sync_unified(DaXuLy, TT48DaXuLy, thu_tuc=48, is_done=True)


# ---------------------------------------------------------------------------
# 6. POST /sync/tt48-dang-xu-ly  → dang_xu_ly (thu_tuc=48) + tt48_dang_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt48-dang-xu-ly")
def sync_tt48_dang_xu_ly():
    return _sync_unified(DangXuLy, TT48DangXuLy, thu_tuc=48, is_done=False)


# ---------------------------------------------------------------------------
# 7. POST /sync/tt47-da-xu-ly  → da_xu_ly (thu_tuc=47) + tt47_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt47-da-xu-ly")
def sync_tt47_da_xu_ly():
    return _sync_unified(DaXuLy, TT47DaXuLy, thu_tuc=47, is_done=True)


# ---------------------------------------------------------------------------
# 8. POST /sync/tt47-dang-xu-ly  → dang_xu_ly (thu_tuc=47) + tt47_dang_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt47-dang-xu-ly")
def sync_tt47_dang_xu_ly():
    return _sync_unified(DangXuLy, TT47DangXuLy, thu_tuc=47, is_done=False)


# ---------------------------------------------------------------------------
# 9. POST /sync/tt46-da-xu-ly  → da_xu_ly (thu_tuc=46) + tt46_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt46-da-xu-ly")
def sync_tt46_da_xu_ly():
    return _sync_unified(DaXuLy, TT46DaXuLy, thu_tuc=46, is_done=True)


# ---------------------------------------------------------------------------
# 10. POST /sync/tt46-dang-xu-ly  → dang_xu_ly (thu_tuc=46) + tt46_dang_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt46-dang-xu-ly")
def sync_tt46_dang_xu_ly():
    return _sync_unified(DangXuLy, TT46DangXuLy, thu_tuc=46, is_done=False)


# ---------------------------------------------------------------------------
# _run_sync_all_job — hàm core: chạy 7 dataset, log từng bước
# Dùng chung cho cả scheduler (tự động) và endpoint /sync/all (thủ công)
#
# triggered_by : "scheduler" | "manual" — hiển thị trong log để phân biệt
# Trả về dict {"ok", "results", "errors", "run_id"}
# ---------------------------------------------------------------------------
def _run_sync_all_job(triggered_by: str = "scheduler") -> dict:
    global _job_run_counter
    _job_run_counter += 1
    run_id = _job_run_counter

    base_url = os.environ.get("BASE_URL", "").rstrip("/")

    # Danh sách 7 task: (label hiển thị, hàm sync, path API để ghi log)
    _TASKS = [
        (
            "tra_cuu_chung",
            sync_tra_cuu_chung,
            f"{base_url}/api/services/app/traCuu_PQLCL/TraCuu",
        ),
        (
            "tt48_da_xu_ly",
            sync_tt48_da_xu_ly,
            f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
            " [ThuTucEnum=48, isDone=True]",
        ),
        (
            "tt48_dang_xu_ly",
            sync_tt48_dang_xu_ly,
            f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
            " [ThuTucEnum=48, isDone=False]",
        ),
        (
            "tt47_da_xu_ly",
            sync_tt47_da_xu_ly,
            f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
            " [ThuTucEnum=47, isDone=True]",
        ),
        (
            "tt47_dang_xu_ly",
            sync_tt47_dang_xu_ly,
            f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
            " [ThuTucEnum=47, isDone=False]",
        ),
        (
            "tt46_da_xu_ly",
            sync_tt46_da_xu_ly,
            f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
            " [ThuTucEnum=46, isDone=True]",
        ),
        (
            "tt46_dang_xu_ly",
            sync_tt46_dang_xu_ly,
            f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
            " [ThuTucEnum=46, isDone=False]",
        ),
    ]

    _sync_log.info("─" * 70)
    _sync_log.info(f"[run #{run_id}] SYNC/ALL BẮT ĐẦU | triggered_by={triggered_by}")

    results = []
    errors = []

    for label, fn, api_info in _TASKS:
        t0 = _time.monotonic()
        try:
            result = fn()
            elapsed = _time.monotonic() - t0
            inserted = result.get("inserted", "?")
            total    = result.get("total_from_api", "?")
            _sync_log.info(
                f"[run #{run_id}] [{label}] POST {api_info}"
                f" → OK | {inserted}/{total} records | {elapsed:.1f}s"
            )
            results.append(result)
        except HTTPException as e:
            elapsed = _time.monotonic() - t0
            _sync_log.error(
                f"[run #{run_id}] [{label}] POST {api_info}"
                f" → HTTP {e.status_code} | {e.detail} | {elapsed:.1f}s"
            )
            errors.append({"dataset": label, "http_status": e.status_code, "error": e.detail})
        except Exception as e:
            elapsed = _time.monotonic() - t0
            _sync_log.error(
                f"[run #{run_id}] [{label}] POST {api_info}"
                f" → EXCEPTION {type(e).__name__} | {e} | {elapsed:.1f}s"
            )
            errors.append({"dataset": label, "error": f"{type(e).__name__}: {e}"})

    status_str = f"{len(results)} OK, {len(errors)} lỗi"
    if errors:
        _sync_log.warning(f"[run #{run_id}] SYNC/ALL HOÀN THÀNH (có lỗi) | {status_str}")
    else:
        _sync_log.info(f"[run #{run_id}] SYNC/ALL HOÀN THÀNH | {status_str}")

    return {"ok": len(errors) == 0, "run_id": run_id, "results": results, "errors": errors}


# ---------------------------------------------------------------------------
# 11. POST /sync/all — gọi thủ công đồng bộ (blocking, giữ nguyên để compat)
# ---------------------------------------------------------------------------
@app.post("/sync/all")
def sync_all():
    return _run_sync_all_job(triggered_by="manual")


# ---------------------------------------------------------------------------
# 11b. POST /sync/all/async — kích hoạt sync ngay trong background, trả về ngay
# Dùng APScheduler để trigger 1 lần tức thì → không block HTTP request
# ---------------------------------------------------------------------------
@app.post("/sync/all/async")
def sync_all_async():
    _scheduler.add_job(
        _run_sync_all_job,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id="manual_sync_now",
        replace_existing=True,
        kwargs={"triggered_by": "manual"},
        misfire_grace_time=60,
    )
    _sync_log.info("SYNC/ALL ASYNC được kích hoạt thủ công — chạy trong background")
    return {
        "ok": True,
        "message": "Sync đã bắt đầu chạy trong background. Xem log để theo dõi tiến trình.",
    }


# ---------------------------------------------------------------------------
# GET /logs/sync — xem N dòng cuối của file log sync (mặc định 100)
# Query param: lines=200 để xem nhiều hơn
# ---------------------------------------------------------------------------
@app.get("/logs/sync")
def logs_sync(lines: int = Query(default=100, ge=1, le=5000)):
    log_file = _LOG_DIR / "sync.log"
    if not log_file.exists():
        return {"ok": True, "lines": [], "message": "File log chưa có (chưa chạy sync nào)."}

    all_lines = log_file.read_text(encoding="utf-8").splitlines()
    tail = all_lines[-lines:]
    return {
        "ok": True,
        "file": str(log_file),
        "total_lines": len(all_lines),
        "showing_last": len(tail),
        "lines": tail,
    }


# ---------------------------------------------------------------------------
# 12. GET /latest — bản ghi mới nhất trong remote_fetch_logs (legacy)
# ---------------------------------------------------------------------------
@app.get("/latest")
def latest():
    db = SessionLocal()
    try:
        record = (
            db.query(RemoteFetchLog)
            .order_by(RemoteFetchLog.created_at.desc())
            .first()
        )
        if record is None:
            return {"ok": True, "data": None}
        return {
            "ok": True,
            "data": {
                "id": record.id,
                "source": record.source,
                "endpoint": record.endpoint,
                "status_code": record.status_code,
                "created_at": record.created_at.isoformat(),
                "payload": record.payload,
                "raw_text": record.raw_text,
            },
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 13. GET /logs — 10 bản ghi mới nhất (legacy)
# ---------------------------------------------------------------------------
@app.get("/logs")
def logs():
    db = SessionLocal()
    try:
        records = (
            db.query(RemoteFetchLog)
            .order_by(RemoteFetchLog.created_at.desc())
            .limit(10)
            .all()
        )
        return {
            "ok": True,
            "logs": [
                {
                    "id": r.id,
                    "endpoint": r.endpoint,
                    "status_code": r.status_code,
                    "created_at": r.created_at.isoformat(),
                }
                for r in records
            ],
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /status — xem số record hiện có trong mỗi bảng
# ---------------------------------------------------------------------------
@app.get("/status")
def status():
    db = SessionLocal()
    try:
        return {
            "ok": True,
            "tables": {
                "tra_cuu_chung": db.query(TraCuuChung).count(),
                "tt48_da_xu_ly": db.query(TT48DaXuLy).count(),
                "tt48_dang_xu_ly": db.query(TT48DangXuLy).count(),
                "tt47_da_xu_ly": db.query(TT47DaXuLy).count(),
                "tt47_dang_xu_ly": db.query(TT47DangXuLy).count(),
                "tt46_da_xu_ly": db.query(TT46DaXuLy).count(),
                "tt46_dang_xu_ly": db.query(TT46DangXuLy).count(),
            },
        }
    finally:
        db.close()


# ===========================================================================
# THỐNG KÊ — endpoints cho React Dashboard
# ===========================================================================

@app.get("/stats/earliest-date")
def stats_earliest_date(
    thu_tuc: int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
):
    """Trả về ngày tiếp nhận sớm nhất (YYYY-MM-DD) của hồ sơ theo phân loại."""
    db = SessionLocal()
    try:
        row = db.execute(text("""
            SELECT MIN((data->>'ngayTiepNhan')::timestamptz)
            FROM tra_cuu_chung
            WHERE (data->>'thuTucId')::int = :thu_tuc
              AND data->>'ngayTiepNhan' IS NOT NULL
        """), {"thu_tuc": thu_tuc}).fetchone()

        earliest = row[0]
        if earliest is None:
            raise HTTPException(status_code=404, detail="Không có dữ liệu")
        # Chuyển sang múi giờ +07 và lấy phần ngày
        from datetime import timezone, timedelta
        vn_tz = timezone(timedelta(hours=7))
        date_str = earliest.astimezone(vn_tz).strftime("%Y-%m-%d")
        return {"thu_tuc": thu_tuc, "earliest_date": date_str}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Stats: Bảng chi tiết theo chuyên viên
# ---------------------------------------------------------------------------
@app.get("/stats/chuyen-vien")
def stats_chuyen_vien(
    thu_tuc:   int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
    from_date: str = Query(..., description="Từ ngày YYYY-MM-DD"),
    to_date:   str = Query(..., description="Đến ngày YYYY-MM-DD"),
):
    """
    Thống kê đầy đủ theo chuyên viên:
    Tồn trước / Đã nhận / GQ (tổng + phân loại + đúng/quá hạn + TBTG) / Tồn sau.
    Thứ tự hiển thị theo hình Excel của người dùng.
    """
    if thu_tuc not in (46, 47, 48):
        raise HTTPException(status_code=400, detail="thu_tuc phải là 46, 47, hoặc 48")

    # Thứ tự ưu tiên hiển thị — khớp với hình Excel người dùng cung cấp
    PRIORITY: list[str] = [
        "CV thụ lý : Lê Thị Cẩm Hương",
        "CV thụ lý : Vũ Đức Cảnh",
        "CV thụ lý : Hà Hoàng Phương",
        "CV thụ lý : Nguyễn Vũ Hùng",
        "CV thụ lý : Nguyễn Trung Hiếu",
        "CV thụ lý : Nguyễn Thị Lan Hương",
        "CV thụ lý : Hà Thị Minh Châu",
        "CV thụ lý : Nguyễn Thị Huyền",
        "CV thụ lý : Đỗ Thị Ngọc Lan",
        "CV thụ lý : Lê Thị Quỳnh Nga",
        "CV thụ lý : Lương Hoàng Việt",
        "CV thụ lý : Nguyễn Đức Toàn",
        "CV thụ lý : Trần Thị Phương Thanh",
    ]
    known_set = set(PRIORITY)

    db = SessionLocal()
    try:
        from_dt = f"{from_date}T00:00:00+07:00"
        to_dt   = f"{to_date}T23:59:59+07:00"

        rows = db.execute(text("""
            WITH base AS (
                SELECT
                    COALESCE(NULLIF(TRIM(t.data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name,
                    (t.data->>'ngayTiepNhan')::timestamptz                                      AS ngay_nhan,
                    (t.data->>'ngayHenTra')::timestamptz                                        AS nhan_hen_tra,
                    CASE WHEN NULLIF(d.data->>'ngayTraKetQua','') IS NOT NULL
                         THEN (d.data->>'ngayTraKetQua')::timestamptz ELSE NULL END             AS ngay_tra,
                    CASE WHEN NULLIF(d.data->>'ngayHenTra','') IS NOT NULL
                         THEN (d.data->>'ngayHenTra')::timestamptz ELSE NULL END                AS kq_hen_tra,
                    d.data->>'trangThaiHoSo'                                                    AS trang_thai
                FROM tra_cuu_chung t
                LEFT JOIN da_xu_ly d
                    ON t.data->>'id' = d.data->>'id'
                   AND d.thu_tuc = :thu_tuc
                WHERE (t.data->>'thuTucId')::int = :thu_tuc
            )
            SELECT
                cv_name,
                -- Tồn trước: nhận trước kỳ + chưa có KQ hoặc KQ trong/sau kỳ
                COUNT(*) FILTER (
                    WHERE ngay_nhan < :from_dt
                      AND (ngay_tra IS NULL OR ngay_tra >= :from_dt)
                ) AS ton_truoc,
                -- Đã nhận: tiếp nhận trong kỳ
                COUNT(*) FILTER (
                    WHERE ngay_nhan >= :from_dt AND ngay_nhan <= :to_dt
                ) AS da_nhan,
                -- GQ tổng: trả KQ trong kỳ
                COUNT(*) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt
                ) AS gq_tong,
                -- Cần bổ sung (trangThaiHoSo=4)
                COUNT(*) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt AND trang_thai = '4'
                ) AS can_bo_sung,
                -- Không đạt (trangThaiHoSo=7)
                COUNT(*) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt AND trang_thai = '7'
                ) AS khong_dat,
                -- Hoàn thành (trangThaiHoSo=6)
                COUNT(*) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt AND trang_thai = '6'
                ) AS hoan_thanh,
                -- Đúng hạn: trả KQ <= ngayHenTra
                COUNT(*) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt
                      AND kq_hen_tra IS NOT NULL AND ngay_tra <= kq_hen_tra
                ) AS dung_han,
                -- Quá hạn: trả KQ > ngayHenTra hoặc không có ngayHenTra
                COUNT(*) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt
                      AND (kq_hen_tra IS NULL OR ngay_tra > kq_hen_tra)
                ) AS qua_han,
                -- Thời gian TB (ngày)
                ROUND(AVG(
                    EXTRACT(EPOCH FROM (ngay_tra - ngay_nhan)) / 86400.0
                ) FILTER (
                    WHERE ngay_tra >= :from_dt AND ngay_tra <= :to_dt
                ))::int AS tg_tb,
                -- Tồn sau tổng
                COUNT(*) FILTER (
                    WHERE ngay_nhan <= :to_dt
                      AND (ngay_tra IS NULL OR ngay_tra > :to_dt)
                ) AS ton_sau_tong,
                -- Tồn sau còn hạn: ngayHenTra > to_date
                COUNT(*) FILTER (
                    WHERE ngay_nhan <= :to_dt
                      AND (ngay_tra IS NULL OR ngay_tra > :to_dt)
                      AND nhan_hen_tra IS NOT NULL AND nhan_hen_tra > :to_dt
                ) AS ton_sau_con_han,
                -- Tồn sau quá hạn: ngayHenTra IS NULL hoặc ngayHenTra <= to_date
                COUNT(*) FILTER (
                    WHERE ngay_nhan <= :to_dt
                      AND (ngay_tra IS NULL OR ngay_tra > :to_dt)
                      AND (nhan_hen_tra IS NULL OR nhan_hen_tra <= :to_dt)
                ) AS ton_sau_qua_han
            FROM base
            GROUP BY cv_name
        """), {"thu_tuc": thu_tuc, "from_dt": from_dt, "to_dt": to_dt}).fetchall()

        result_map: dict[str, dict] = {}
        cho_phan_cong: dict | None = None

        for r in rows:
            cv, tt, dn, gq, cbs, kd, ht, dh, qh, tg, tst, tsc, tsq = (
                r[0], int(r[1]), int(r[2]), int(r[3]), int(r[4]),
                int(r[5]), int(r[6]), int(r[7]), int(r[8]),
                int(r[9]) if r[9] is not None else None,
                int(r[10]), int(r[11]), int(r[12]),
            )
            rec = {
                "ten_cv":          cv,
                "ton_truoc":       tt,
                "da_nhan":         dn,
                "gq_tong":         gq,
                "can_bo_sung":     cbs,
                "khong_dat":       kd,
                "hoan_thanh":      ht,
                "dung_han":        dh,
                "qua_han":         qh,
                "tg_tb":           tg,
                "pct_gq_dung_han": round(dh / gq * 100) if gq > 0 else 0,
                "pct_da_gq":       round(gq / (tt + dn) * 100) if (tt + dn) > 0 else 0,
                "ton_sau_tong":    tst,
                "ton_sau_con_han": tsc,
                "ton_sau_qua_han": tsq,
            }
            if cv == "__CHUA_PHAN__":
                cho_phan_cong = rec
            else:
                result_map[cv] = rec

        data: list[dict] = []
        extras: list[dict] = []

        # Thứ tự ưu tiên
        for name in PRIORITY:
            if name in result_map:
                data.append(result_map[name])

        # CV mới chưa trong danh sách ưu tiên → thêm cuối
        for name, rec in result_map.items():
            if name not in known_set:
                extras.append(rec)
        extras.sort(key=lambda x: x["ten_cv"])
        data.extend(extras)

        return {
            "thu_tuc":        thu_tuc,
            "from_date":      from_date,
            "to_date":        to_date,
            "cho_phan_cong":  cho_phan_cong,
            "rows":           data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Stats: Biểu đồ xu hướng theo tháng
# ---------------------------------------------------------------------------
@app.get("/stats/monthly")
def stats_monthly(
    thu_tuc: int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
):
    """
    Trả về dữ liệu theo tháng cho biểu đồ xu hướng:
    - da_nhan (tiếp nhận theo tháng)
    - da_giai_quyet (giải quyết theo tháng)
    - ton_sau (tồn lũy kế cuối tháng = cumsum da_nhan - cumsum da_gq)
    """
    if thu_tuc not in (46, 47, 48):
        raise HTTPException(status_code=400, detail="thu_tuc phải là 46, 47, hoặc 48")
    db = SessionLocal()
    try:
        # Hồ sơ tiếp nhận theo tháng
        nhan_rows = db.execute(text("""
            SELECT
                EXTRACT(YEAR  FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
                EXTRACT(MONTH FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
                COUNT(*) AS cnt
            FROM tra_cuu_chung
            WHERE (data->>'thuTucId')::int = :thu_tuc
              AND data->>'ngayTiepNhan' IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1, 2
        """), {"thu_tuc": thu_tuc}).fetchall()

        # Hồ sơ giải quyết theo tháng
        gq_rows = db.execute(text("""
            SELECT
                EXTRACT(YEAR  FROM (data->>'ngayTraKetQua')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
                EXTRACT(MONTH FROM (data->>'ngayTraKetQua')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
                COUNT(*) AS cnt
            FROM da_xu_ly
            WHERE thu_tuc = :thu_tuc
              AND data->>'ngayTraKetQua' IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1, 2
        """), {"thu_tuc": thu_tuc}).fetchall()

        # Gộp theo tháng
        nhan_map: dict[tuple, int] = {(r[0], r[1]): int(r[2]) for r in nhan_rows}
        gq_map:   dict[tuple, int] = {(r[0], r[1]): int(r[2]) for r in gq_rows}

        all_keys = sorted(set(nhan_map.keys()) | set(gq_map.keys()))

        cum_nhan = 0
        cum_gq   = 0
        months = []
        for yr, mo in all_keys:
            dn = nhan_map.get((yr, mo), 0)
            gq = gq_map.get((yr, mo), 0)
            cum_nhan += dn
            cum_gq   += gq
            months.append({
                "label":           f"T{mo}-{yr}",
                "year":            yr,
                "month":           mo,
                "da_nhan":         dn,
                "da_giai_quyet":   gq,
                "ton_sau":         cum_nhan - cum_gq,
            })

        return {"thu_tuc": thu_tuc, "months": months}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Stats: JOIN với bảng gộp da_xu_ly (thu_tuc để lọc)
# ---------------------------------------------------------------------------
@app.get("/stats/ton-sau")
def stats_ton_sau(
    thu_tuc: int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
    to_date: str = Query(..., description="Đến ngày YYYY-MM-DD"),
):
    """
    Phân tích hồ sơ TỒN SAU:
      - ngayTiepNhan (từ tra_cuu_chung) <= to_date
      - ngayTraKetQua (từ da_xu_ly) > to_date HOẶC không có kết quả (null/empty)
    Chia thành:
      - Còn hạn: ngayHenTra (từ tra_cuu_chung) > to_date
      - Quá hạn: ngayHenTra IS NULL hoặc ngayHenTra <= to_date
    """
    if thu_tuc not in (46, 47, 48):
        raise HTTPException(status_code=400, detail="thu_tuc phải là 46, 47, hoặc 48")
    db = SessionLocal()
    try:
        to_dt = f"{to_date}T23:59:59+07:00"

        row = db.execute(text("""
            WITH joined AS (
                SELECT
                    t.data AS tcc,
                    NULLIF(d.data->>'ngayTraKetQua', '') AS kq
                FROM tra_cuu_chung t
                LEFT JOIN da_xu_ly d
                    ON t.data->>'id' = d.data->>'id'
                   AND d.thu_tuc = :thu_tuc
                WHERE (t.data->>'thuTucId')::int = :thu_tuc
            )
            SELECT
                COUNT(*) FILTER (
                    WHERE (tcc->>'ngayTiepNhan')::timestamptz <= :to_dt
                      AND (kq IS NULL OR kq::timestamptz > :to_dt)
                      AND tcc->>'ngayHenTra' IS NOT NULL
                      AND (tcc->>'ngayHenTra')::timestamptz > :to_dt
                ) AS con_han,

                COUNT(*) FILTER (
                    WHERE (tcc->>'ngayTiepNhan')::timestamptz <= :to_dt
                      AND (kq IS NULL OR kq::timestamptz > :to_dt)
                      AND (
                            tcc->>'ngayHenTra' IS NULL
                         OR (tcc->>'ngayHenTra')::timestamptz <= :to_dt
                          )
                ) AS qua_han
            FROM joined
        """), {"thu_tuc": thu_tuc, "to_dt": to_dt}).fetchone()

        con_han = int(row[0])
        qua_han = int(row[1])
        total   = con_han + qua_han
        return {
            "thu_tuc":     thu_tuc,
            "to_date":     to_date,
            "con_han":     con_han,
            "qua_han":     qua_han,
            "total":       total,
            "pct_con_han": round(con_han / total * 100, 1) if total > 0 else 0,
            "pct_qua_han": round(qua_han  / total * 100, 1) if total > 0 else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/stats/giai-quyet")
def stats_giai_quyet(
    thu_tuc: int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
    from_date: str = Query(..., description="Từ ngày YYYY-MM-DD"),
    to_date: str = Query(..., description="Đến ngày YYYY-MM-DD"),
):
    """
    Phân tích hồ sơ ĐÃ GIẢI QUYẾT trong kỳ thành Đúng hạn / Quá hạn.
    ngayTraKetQua lấy từ da_xu_ly qua JOIN hoSoXuLyId_Active.
    ngayHenTra lấy từ tra_cuu_chung.
    - Đúng hạn: ngayTraKetQua trong kỳ VÀ ngayTraKetQua <= ngayHenTra
    - Quá hạn:  ngayTraKetQua trong kỳ VÀ (ngayHenTra IS NULL HOẶC ngayTraKetQua > ngayHenTra)
    """
    if thu_tuc not in (46, 47, 48):
        raise HTTPException(status_code=400, detail="thu_tuc phải là 46, 47, hoặc 48")
    db = SessionLocal()
    try:
        from_dt = f"{from_date}T00:00:00+07:00"
        to_dt   = f"{to_date}T23:59:59+07:00"

        row = db.execute(text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
                      AND (data->>'ngayTraKetQua')::timestamptz >= :from_dt
                      AND (data->>'ngayTraKetQua')::timestamptz <= :to_dt
                      AND NULLIF(data->>'ngayHenTra', '') IS NOT NULL
                      AND (data->>'ngayTraKetQua')::timestamptz
                              <= (data->>'ngayHenTra')::timestamptz
                ) AS dung_han,

                COUNT(*) FILTER (
                    WHERE NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
                      AND (data->>'ngayTraKetQua')::timestamptz >= :from_dt
                      AND (data->>'ngayTraKetQua')::timestamptz <= :to_dt
                      AND (
                            NULLIF(data->>'ngayHenTra', '') IS NULL
                         OR (data->>'ngayTraKetQua')::timestamptz
                                > (data->>'ngayHenTra')::timestamptz
                          )
                ) AS qua_han
            FROM da_xu_ly
            WHERE thu_tuc = :thu_tuc
        """), {"thu_tuc": thu_tuc, "from_dt": from_dt, "to_dt": to_dt}).fetchone()

        dung_han = int(row[0])
        qua_han  = int(row[1])
        total    = dung_han + qua_han
        return {
            "thu_tuc":      thu_tuc,
            "from_date":    from_date,
            "to_date":      to_date,
            "dung_han":     dung_han,
            "qua_han":      qua_han,
            "total":        total,
            "pct_dung_han": round(dung_han / total * 100, 1) if total > 0 else 0,
            "pct_qua_han":  round(qua_han  / total * 100, 1) if total > 0 else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.get("/stats/summary")
def stats_summary(
    thu_tuc: int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
    from_date: str = Query(..., description="Từ ngày YYYY-MM-DD"),
    to_date: str = Query(..., description="Đến ngày YYYY-MM-DD"),
):
    """
    4 chỉ số tổng hợp. ngayTraKetQua lấy từ da_xu_ly qua JOIN hoSoXuLyId_Active.
    - ton_truoc: ngayTiepNhan < from_date AND (kq >= from_date OR kq IS NULL)
    - da_nhan:   from_date <= ngayTiepNhan <= to_date
    - da_giai_quyet: kq trong kỳ [from_date, to_date]
    - ton_sau:   ngayTiepNhan <= to_date AND (kq > to_date OR kq IS NULL)
    """
    if thu_tuc not in (46, 47, 48):
        raise HTTPException(status_code=400, detail="thu_tuc phải là 46, 47, hoặc 48")
    db = SessionLocal()
    try:
        from_dt = f"{from_date}T00:00:00+07:00"
        to_dt   = f"{to_date}T23:59:59+07:00"

        row = db.execute(text("""
            WITH joined AS (
                SELECT
                    t.data AS tcc,
                    NULLIF(d.data->>'ngayTraKetQua', '') AS kq
                FROM tra_cuu_chung t
                LEFT JOIN da_xu_ly d
                    ON t.data->>'id' = d.data->>'id'
                   AND d.thu_tuc = :thu_tuc
                WHERE (t.data->>'thuTucId')::int = :thu_tuc
            ),
            gq AS (
                SELECT COUNT(*) AS cnt
                FROM da_xu_ly
                WHERE thu_tuc = :thu_tuc
                  AND NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
                  AND (data->>'ngayTraKetQua')::timestamptz >= :from_dt
                  AND (data->>'ngayTraKetQua')::timestamptz <= :to_dt
            )
            SELECT
                COUNT(*) FILTER (
                    WHERE (tcc->>'ngayTiepNhan')::timestamptz < :from_dt
                      AND (kq IS NULL OR kq::timestamptz >= :from_dt)
                ) AS ton_truoc,

                COUNT(*) FILTER (
                    WHERE (tcc->>'ngayTiepNhan')::timestamptz >= :from_dt
                      AND (tcc->>'ngayTiepNhan')::timestamptz <= :to_dt
                ) AS da_nhan,

                (SELECT cnt FROM gq) AS da_giai_quyet,

                COUNT(*) FILTER (
                    WHERE (tcc->>'ngayTiepNhan')::timestamptz <= :to_dt
                      AND (kq IS NULL OR kq::timestamptz > :to_dt)
                ) AS ton_sau
            FROM joined
        """), {"thu_tuc": thu_tuc, "from_dt": from_dt, "to_dt": to_dt}).fetchone()

        return {
            "thu_tuc":       thu_tuc,
            "from_date":     from_date,
            "to_date":       to_date,
            "ton_truoc":     int(row[0]),
            "da_nhan":       int(row[1]),
            "da_giai_quyet": int(row[2]),
            "ton_sau":       int(row[3]),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# GET /admin/scheduler — trả về interval hiện tại
# POST /admin/scheduler — thay đổi interval (body JSON: {"hours": N})
# Không cần token riêng vì đã được api-server proxy sau khi xác thực token
# ---------------------------------------------------------------------------
@app.get("/admin/scheduler")
def admin_scheduler_get():
    global _sync_interval_hours
    job = _scheduler.get_job("sync_all_3h")
    next_run = None
    if job and job.next_run_time:
        next_run = job.next_run_time.isoformat()
    return {
        "ok": True,
        "interval_hours": _sync_interval_hours,
        "next_run": next_run,
    }


@app.post("/admin/scheduler")
def admin_scheduler_set(payload: dict):
    global _sync_interval_hours
    hours = payload.get("hours")
    if hours is None:
        raise HTTPException(status_code=400, detail="Thiếu trường 'hours'")
    try:
        hours = float(hours)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="'hours' phải là số")
    if hours < 0.1:
        raise HTTPException(status_code=400, detail="Tần suất tối thiểu là 0.1 giờ (6 phút)")
    if hours > 24:
        raise HTTPException(status_code=400, detail="Tần suất tối đa là 24 giờ")

    _sync_interval_hours = hours
    _scheduler.reschedule_job(
        "sync_all_3h",
        trigger="interval",
        hours=hours,
    )
    job = _scheduler.get_job("sync_all_3h")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    _sync_log.info(f"SCHEDULER cập nhật: interval={hours}h, next_run={next_run}")
    return {
        "ok": True,
        "interval_hours": hours,
        "next_run": next_run,
    }


# ---------------------------------------------------------------------------
# Chạy trực tiếp: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

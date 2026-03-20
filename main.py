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
# SCHEDULER — APScheduler chạy job mỗi 3 giờ
# ===========================================================================
_scheduler = BackgroundScheduler(timezone="UTC")


# Tạo tất cả bảng + khởi động scheduler khi server start
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _scheduler.add_job(
        _run_sync_all_job,
        trigger="interval",
        hours=3,
        id="sync_all_3h",
        replace_existing=True,
    )
    _scheduler.start()
    _sync_log.info("=" * 70)
    _sync_log.info("SERVER KHỞI ĐỘNG — scheduler sync/all mỗi 3h đã được kích hoạt")
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
        # Bước 1: đăng nhập
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

        # Bước 4: xoá toàn bộ dữ liệu cũ trong bảng
        db.query(model_class).delete()

        # Bước 5: làm sạch date fields + insert dữ liệu mới
        synced_at = datetime.now(timezone.utc)
        for item in items:
            _clean_record(item)
            db.add(model_class(synced_at=synced_at, data=item))

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
    - Ghi vào bảng gộp (da_xu_ly / dang_xu_ly) với cột thu_tuc
    - Ghi đồng thời vào bảng legacy (tt48/47/46_da/dang_xu_ly) để backward-compat
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

        synced_at = datetime.now(timezone.utc)

        # Xóa dữ liệu cũ trong cả bảng gộp (theo thu_tuc) và bảng legacy
        db.query(unified_model).filter(unified_model.thu_tuc == thu_tuc).delete()
        db.query(legacy_model).delete()

        cleaned  = 0
        skipped  = 0   # số record bị lọc ra (pId≠null cho da_xu_ly)
        inserted = 0

        for item in items:
            # Làm sạch date fields ngay khi nhận về — đếm số record có thay đổi
            before = str({k: item.get(k) for k in _DATE_FIELDS if item.get(k)})
            _clean_record(item)
            after  = str({k: item.get(k) for k in _DATE_FIELDS if item.get(k)})
            if before != after:
                cleaned += 1

            # Đảm bảo thuTucId có trong JSONB
            item["thuTucId"] = thu_tuc

            db.add(legacy_model(synced_at=synced_at, data=item))
            db.add(unified_model(synced_at=synced_at, thu_tuc=thu_tuc, data=item))
            inserted += 1

        db.commit()
        _sync_log.info(
            f"[{label}] {trang_thai} xử lý: "
            f"{inserted}/{total} records | {cleaned} ngày làm sạch / fallback"
        )
        return {
            "ok":             True,
            "dataset":        label,
            "inserted":       inserted,
            "total_from_api": total,
            "dates_cleaned":  cleaned,
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
# 11. POST /sync/all — gọi thủ công, cũng ghi vào file log
# ---------------------------------------------------------------------------
@app.post("/sync/all")
def sync_all():
    return _run_sync_all_job(triggered_by="manual")


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
# Chạy trực tiếp: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

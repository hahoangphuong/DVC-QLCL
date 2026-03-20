import logging
import logging.handlers
import os
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

        # Bước 5: insert dữ liệu mới
        synced_at = datetime.now(timezone.utc)
        for item in items:
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


def _sync_dashboard(model_class, thu_tuc: int, is_done: bool, label: str) -> dict:
    """Wrapper gọi _do_sync cho 6 endpoint dashboard."""
    base_url = os.environ.get("BASE_URL", "").rstrip("/")
    api_url = (
        f"{base_url}/api/services/app/dashBoard"
        "/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
    )
    referer = f"{base_url}/lanhdaocuc/index"
    body = _dashboard_body(thu_tuc, is_done)
    return _do_sync(model_class, api_url, body, label, referer=referer)


# ---------------------------------------------------------------------------
# 5. POST /sync/tt48-da-xu-ly  → bảng tt48_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt48-da-xu-ly")
def sync_tt48_da_xu_ly():
    return _sync_dashboard(TT48DaXuLy, thu_tuc=48, is_done=True, label="tt48_da_xu_ly")


# ---------------------------------------------------------------------------
# 6. POST /sync/tt48-dang-xu-ly  → bảng tt48_dang_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt48-dang-xu-ly")
def sync_tt48_dang_xu_ly():
    return _sync_dashboard(TT48DangXuLy, thu_tuc=48, is_done=False, label="tt48_dang_xu_ly")


# ---------------------------------------------------------------------------
# 7. POST /sync/tt47-da-xu-ly  → bảng tt47_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt47-da-xu-ly")
def sync_tt47_da_xu_ly():
    return _sync_dashboard(TT47DaXuLy, thu_tuc=47, is_done=True, label="tt47_da_xu_ly")


# ---------------------------------------------------------------------------
# 8. POST /sync/tt47-dang-xu-ly  → bảng tt47_dang_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt47-dang-xu-ly")
def sync_tt47_dang_xu_ly():
    return _sync_dashboard(TT47DangXuLy, thu_tuc=47, is_done=False, label="tt47_dang_xu_ly")


# ---------------------------------------------------------------------------
# 9. POST /sync/tt46-da-xu-ly  → bảng tt46_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt46-da-xu-ly")
def sync_tt46_da_xu_ly():
    return _sync_dashboard(TT46DaXuLy, thu_tuc=46, is_done=True, label="tt46_da_xu_ly")


# ---------------------------------------------------------------------------
# 10. POST /sync/tt46-dang-xu-ly  → bảng tt46_dang_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt46-dang-xu-ly")
def sync_tt46_dang_xu_ly():
    return _sync_dashboard(TT46DangXuLy, thu_tuc=46, is_done=False, label="tt46_dang_xu_ly")


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


@app.get("/stats/summary")
def stats_summary(
    thu_tuc: int = Query(..., description="Phân loại: 46, 47, hoặc 48"),
    from_date: str = Query(..., description="Từ ngày YYYY-MM-DD"),
    to_date: str = Query(..., description="Đến ngày YYYY-MM-DD"),
):
    """
    Trả về 4 chỉ số tổng hợp từ tra_cuu_chung:
    - ton_truoc: ngayTiepNhan < from_date AND (ngayTraKetQua >= to_date OR null)
    - da_nhan: from_date <= ngayTiepNhan <= to_date
    - da_giai_quyet: from_date <= ngayTraKetQua <= to_date
    - ton_sau: ngayTiepNhan <= to_date AND (ngayTraKetQua > to_date OR null)
    Hồ sơ chưa có ngày trả kết quả được coi là vô cùng lớn.
    """
    db = SessionLocal()
    try:
        from_dt = f"{from_date}T00:00:00+07:00"
        to_dt   = f"{to_date}T23:59:59+07:00"

        row = db.execute(text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE (data->>'ngayTiepNhan')::timestamptz < :from_dt
                      AND (
                            data->>'ngayTraKetQua' IS NULL
                         OR (data->>'ngayTraKetQua')::timestamptz >= :to_dt
                          )
                ) AS ton_truoc,

                COUNT(*) FILTER (
                    WHERE (data->>'ngayTiepNhan')::timestamptz >= :from_dt
                      AND (data->>'ngayTiepNhan')::timestamptz <= :to_dt
                ) AS da_nhan,

                COUNT(*) FILTER (
                    WHERE data->>'ngayTraKetQua' IS NOT NULL
                      AND (data->>'ngayTraKetQua')::timestamptz >= :from_dt
                      AND (data->>'ngayTraKetQua')::timestamptz <= :to_dt
                ) AS da_giai_quyet,

                COUNT(*) FILTER (
                    WHERE (data->>'ngayTiepNhan')::timestamptz <= :to_dt
                      AND (
                            data->>'ngayTraKetQua' IS NULL
                         OR (data->>'ngayTraKetQua')::timestamptz > :to_dt
                          )
                ) AS ton_sau
            FROM tra_cuu_chung
            WHERE (data->>'thuTucId')::int = :thu_tuc
        """), {"thu_tuc": thu_tuc, "from_dt": from_dt, "to_dt": to_dt}).fetchone()

        return {
            "thu_tuc": thu_tuc,
            "from_date": from_date,
            "to_date": to_date,
            "ton_truoc":      int(row[0]),
            "da_nhan":        int(row[1]),
            "da_giai_quyet":  int(row[2]),
            "ton_sau":        int(row[3]),
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

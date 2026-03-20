import os
import requests
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException

from db import Base, engine, SessionLocal
from models import (
    RemoteFetchLog,
    TraCuuChung,
    TT48DaXuLy, TT48DangXuLy,
    TT47DaXuLy, TT47DangXuLy,
    TT46DaXuLy, TT46DangXuLy,
)
from auth_client import RemoteClient, RemoteAuthError


# Tạo tất cả bảng khi server khởi động (nếu chưa tồn tại)
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="DAV PQLCL Scraper",
    description="Đăng nhập dichvucong.dav.gov.vn, lấy 7 bộ dữ liệu hồ sơ, lưu vào PostgreSQL",
    version="2.0.0",
    lifespan=lifespan,
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
# 11. POST /sync/all — chạy cả 7 dataset trong một lần gọi
# ---------------------------------------------------------------------------
@app.post("/sync/all")
def sync_all():
    results = []
    errors = []

    for fn, label in [
        (sync_tra_cuu_chung,    "tra_cuu_chung"),
        (sync_tt48_da_xu_ly,    "tt48_da_xu_ly"),
        (sync_tt48_dang_xu_ly,  "tt48_dang_xu_ly"),
        (sync_tt47_da_xu_ly,    "tt47_da_xu_ly"),
        (sync_tt47_dang_xu_ly,  "tt47_dang_xu_ly"),
        (sync_tt46_da_xu_ly,    "tt46_da_xu_ly"),
        (sync_tt46_dang_xu_ly,  "tt46_dang_xu_ly"),
    ]:
        try:
            results.append(fn())
        except HTTPException as e:
            errors.append({"dataset": label, "error": e.detail})

    return {
        "ok": len(errors) == 0,
        "results": results,
        "errors": errors,
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


# ---------------------------------------------------------------------------
# Chạy trực tiếp: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

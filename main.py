import os
import requests
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException

from db import Base, engine, SessionLocal
from models import RemoteFetchLog
from auth_client import RemoteClient, RemoteAuthError


# Tạo tất cả bảng khi server khởi động (nếu chưa tồn tại)
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="ASP.NET Scraper API",
    description="Đăng nhập ASP.NET, lấy dữ liệu API, lưu vào PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)


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
# 3. POST /sync — đăng nhập, lấy dữ liệu, lưu vào DB
# ---------------------------------------------------------------------------
@app.post("/sync")
def sync():
    db = SessionLocal()
    try:
        # Bước 1: đăng nhập
        client = RemoteClient()
        client.login()

        # Bước 2: gọi API lấy dữ liệu
        resp = client.fetch_data()
        status_code = resp.status_code

        # Thử parse JSON, nếu không được thì lưu raw text
        try:
            payload = resp.json()
            raw_text = None
        except Exception:
            payload = None
            raw_text = resp.text[:5000]

        # Bước 3: lưu vào DB
        record = RemoteFetchLog(
            source="sync",
            endpoint=resp.url,
            status_code=status_code,
            payload=payload,
            raw_text=raw_text,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return {
            "ok": True,
            "saved_id": record.id,
            "status_code": status_code,
            "has_json": payload is not None,
        }

    except RemoteAuthError as e:
        db.rollback()
        raise HTTPException(status_code=401, detail=str(e))
    except requests.HTTPError as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Lỗi HTTP từ server: {e}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 4. GET /latest — bản ghi mới nhất trong DB
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
# 5. GET /logs — 10 bản ghi mới nhất (chỉ thông tin tóm tắt)
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
# Chạy trực tiếp: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db, init_db
from models import RemoteFetchLog
from auth_client import create_authenticated_session, fetch_api_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Tạo bảng DB khi server khởi động lần đầu."""
    init_db()
    yield


app = FastAPI(
    title="ASP.NET Scraper API",
    description="Đăng nhập ASP.NET, lấy dữ liệu API, lưu vào PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Endpoint 1: Health check
# ---------------------------------------------------------------------------
@app.get("/health")
def health_check():
    """Kiểm tra server còn sống."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Endpoint 2: Test đăng nhập ASP.NET
# ---------------------------------------------------------------------------
@app.post("/auth/login-test")
def test_login():
    """Thử đăng nhập vào website ASP.NET, trả về danh sách cookie key nhận được."""
    try:
        session = create_authenticated_session()
        cookie_keys = list(session.cookies.keys())
        return {
            "success": True,
            "message": "Đăng nhập thành công",
            "cookies_received": cookie_keys,
        }
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Endpoint 3: Lấy dữ liệu từ API và lưu vào DB
# ---------------------------------------------------------------------------
@app.post("/data/fetch-and-save")
def fetch_and_save(
    api_url: str = Query(..., description="URL đầy đủ của API cần gọi"),
    source: str = Query("default", description="Nhãn nguồn dữ liệu, vd: orders, products"),
    db: Session = Depends(get_db),
):
    """
    Đăng nhập ASP.NET → gọi api_url → lưu kết quả vào bảng remote_fetch_logs.
    """
    # Bước 1: Đăng nhập lấy session
    try:
        session = create_authenticated_session()
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đăng nhập: {e}")

    # Bước 2: Gọi API, ghi lại cả response thô
    try:
        resp = session.get(api_url, timeout=15)
        status_code = resp.status_code
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Lỗi gọi API: {e}")

    # Thử parse JSON, nếu không được thì lưu raw text
    try:
        payload = resp.json()
        raw_text = None
    except Exception:
        payload = None
        raw_text = resp.text[:5000]  # giới hạn 5000 ký tự

    # Bước 3: Lưu vào PostgreSQL
    record = RemoteFetchLog(
        source=source,
        endpoint=api_url,
        status_code=status_code,
        payload=payload,
        raw_text=raw_text,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "record_id": record.id,
        "source": record.source,
        "endpoint": record.endpoint,
        "status_code": record.status_code,
        "created_at": record.created_at.isoformat(),
        "data_preview": str(payload or raw_text)[:200],
    }


# ---------------------------------------------------------------------------
# Endpoint 4: Xem danh sách bản ghi đã lưu
# ---------------------------------------------------------------------------
@app.get("/data/records")
def list_records(
    source: str = Query(None, description="Lọc theo source (bỏ trống = lấy tất cả)"),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Xem danh sách các lần fetch đã lưu trong DB."""
    query = db.query(RemoteFetchLog)
    if source:
        query = query.filter(RemoteFetchLog.source == source)
    records = query.order_by(RemoteFetchLog.created_at.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "source": r.source,
            "endpoint": r.endpoint,
            "status_code": r.status_code,
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]


# ---------------------------------------------------------------------------
# Endpoint 5: Xem chi tiết 1 bản ghi (payload đầy đủ)
# ---------------------------------------------------------------------------
@app.get("/data/records/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    """Xem đầy đủ payload và raw text của một bản ghi."""
    record = db.query(RemoteFetchLog).filter(RemoteFetchLog.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")
    return {
        "id": record.id,
        "source": record.source,
        "endpoint": record.endpoint,
        "status_code": record.status_code,
        "payload": record.payload,
        "raw_text": record.raw_text,
        "created_at": record.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Chạy trực tiếp: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

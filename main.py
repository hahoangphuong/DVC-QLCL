import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db, init_db
from models import FetchedRecord
from auth_client import create_authenticated_session, fetch_api_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo bảng DB khi server khởi động."""
    init_db()
    yield


app = FastAPI(
    title="ASP.NET Scraper API",
    description="Đăng nhập ASP.NET, lấy dữ liệu API, lưu vào PostgreSQL",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Endpoint 1: Kiểm tra health
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
    """
    Thử đăng nhập vào website ASP.NET.
    Trả về thông báo thành công hoặc lỗi chi tiết.
    """
    try:
        session = create_authenticated_session()
        cookies = {k: v for k, v in session.cookies.items()}
        return {
            "success": True,
            "message": "Đăng nhập thành công",
            "cookies_received": list(cookies.keys()),  # chỉ log tên key, không log giá trị
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
    source: str = Query("default", description="Nhãn nguồn dữ liệu (vd: orders, products)"),
    db: Session = Depends(get_db),
):
    """
    Đăng nhập ASP.NET → gọi api_url → lưu kết quả vào PostgreSQL.

    Params:
    - api_url: URL API muốn gọi (phải cùng domain với LOGIN_URL)
    - source:  Tên nhãn để phân loại dữ liệu trong DB
    """
    # Bước 1: Đăng nhập lấy session
    try:
        session = create_authenticated_session()
    except PermissionError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đăng nhập: {e}")

    # Bước 2: Gọi API
    try:
        data = fetch_api_data(session, api_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Lỗi gọi API: {e}")

    # Bước 3: Lưu vào PostgreSQL
    record = FetchedRecord(
        source=source,
        payload=data,
        summary=str(data)[:500],  # lưu tóm tắt 500 ký tự đầu
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "record_id": record.id,
        "source": record.source,
        "fetched_at": record.fetched_at.isoformat(),
        "data_preview": str(data)[:200],
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
    """Xem các bản ghi dữ liệu đã lưu trong DB."""
    query = db.query(FetchedRecord)
    if source:
        query = query.filter(FetchedRecord.source == source)
    records = query.order_by(FetchedRecord.fetched_at.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "source": r.source,
            "summary": r.summary,
            "fetched_at": r.fetched_at.isoformat(),
        }
        for r in records
    ]


# ---------------------------------------------------------------------------
# Endpoint 5: Xem chi tiết 1 bản ghi (bao gồm payload đầy đủ)
# ---------------------------------------------------------------------------
@app.get("/data/records/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    """Xem đầy đủ payload của một bản ghi."""
    record = db.query(FetchedRecord).filter(FetchedRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")
    return {
        "id": record.id,
        "source": record.source,
        "payload": record.payload,
        "summary": record.summary,
        "fetched_at": record.fetched_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Chạy trực tiếp bằng: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

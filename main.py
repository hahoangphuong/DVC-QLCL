from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import Base, SessionLocal, engine
from internal_routes import create_internal_router
from migration_service import migrate_schema, migrate_stats_schema
from public_routes import create_public_router
from runtime_state import SyncRuntime
from scheduler_service import create_lifespan
from sync_service import SyncService

runtime = SyncRuntime()
sync_service = SyncService(SessionLocal, runtime)

app = FastAPI(
    title="DAV PQLCL Scraper",
    description="Đăng nhập dichvucong.dav.gov.vn, lấy 7 bộ dữ liệu hồ sơ, lưu vào PostgreSQL",
    version="2.0.0",
    lifespan=create_lifespan(Base.metadata, engine, migrate_schema, runtime, sync_service),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(create_public_router(sync_service))
app.include_router(create_internal_router(sync_service, runtime, engine=engine, migrate_stats_schema=migrate_stats_schema))


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

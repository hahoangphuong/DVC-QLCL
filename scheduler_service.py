from contextlib import asynccontextmanager
from datetime import datetime, timezone


def create_lifespan(base_metadata, engine, migrate_schema, runtime, sync_service):
    @asynccontextmanager
    async def lifespan(app):
        base_metadata.create_all(bind=engine)
        migrate_schema(engine)
        runtime.scheduler.add_job(
            sync_service.run_sync_all_job,
            trigger="interval",
            hours=3,
            id="sync_all_3h",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc),
        )
        runtime.scheduler.add_job(
            sync_service.prune_remote_fetch_logs,
            trigger="interval",
            hours=24,
            id="prune_logs_24h",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc),
        )
        runtime.scheduler.start()
        runtime.sync_log.info("=" * 70)
        runtime.sync_log.info("SERVER KHỞI ĐỘNG — sync ngay lập tức + scheduler mỗi 3h")
        runtime.sync_log.info(
            f"LOG ROTATION — remote_fetch_logs giữ tối đa {runtime.prune_keep_rows} dòng, prune mỗi 24h"
        )
        runtime.sync_log.info("=" * 70)
        yield
        runtime.scheduler.shutdown(wait=False)

    return lifespan


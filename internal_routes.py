import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query


def create_internal_router(sync_service, runtime):
    router = APIRouter()

    @router.post("/internal/sync/all/async")
    def sync_all_async():
        already_running = not runtime.sync_lock.acquire(blocking=False)
        if not already_running:
            runtime.sync_lock.release()
        if already_running:
            runtime.sync_log.warning("SYNC/ALL ASYNC bị từ chối — sync đang chạy")
            return {
                "ok": False,
                "running": True,
                "message": "Sync đang chạy. Vui lòng đợi kết thúc rồi thử lại.",
            }
        runtime.scheduler.add_job(
            sync_service.run_sync_all_job,
            trigger="date",
            run_date=datetime.now(timezone.utc),
            id="manual_sync_now",
            replace_existing=True,
            kwargs={"triggered_by": "manual"},
            misfire_grace_time=60,
        )
        runtime.sync_log.info("SYNC/ALL ASYNC được kích hoạt thủ công — chạy trong background")
        return {
            "ok": True,
            "message": "Sync đã bắt đầu chạy trong background. Xem log để theo dõi tiến trình.",
        }

    @router.get("/internal/logs/sync")
    def logs_sync(lines: int = Query(default=100, ge=1, le=5000)):
        return sync_service.logs_sync(lines)

    @router.get("/internal/logs/db-stats")
    def logs_db_stats():
        return sync_service.logs_db_stats()

    @router.post("/internal/logs/prune")
    def internal_logs_prune(
        keep_rows: int = Query(default=runtime.prune_keep_rows, ge=100, le=100_000),
        token: str = Query(default=""),
    ):
        expected = os.environ.get("ADMIN_EXPORT_TOKEN", "")
        if not expected or token != expected:
            raise HTTPException(status_code=403, detail="Token không hợp lệ")
        result = sync_service.prune_remote_fetch_logs(keep_rows=keep_rows)
        return {"ok": True, **result}

    @router.get("/internal/scheduler")
    def internal_scheduler_get():
        job = runtime.scheduler.get_job("sync_all_3h")
        next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
        return {
            "ok": True,
            "interval_hours": runtime.sync_interval_hours,
            "next_run": next_run,
        }

    @router.post("/internal/scheduler")
    def internal_scheduler_set(payload: dict):
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

        runtime.sync_interval_hours = hours
        runtime.scheduler.reschedule_job("sync_all_3h", trigger="interval", hours=hours)
        job = runtime.scheduler.get_job("sync_all_3h")
        next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
        runtime.sync_log.info(f"SCHEDULER cập nhật: interval={hours}h, next_run={next_run}")
        return {"ok": True, "interval_hours": hours, "next_run": next_run}

    @router.get("/internal/dav/tt48/ho-so/{ho_so_id}")
    def internal_dav_tt48_hoso_detail(ho_so_id: int):
        if ho_so_id <= 0:
            raise HTTPException(status_code=400, detail="ho_so_id phai la so duong")
        return sync_service.get_tt48_hoso_detail(ho_so_id)

    return router

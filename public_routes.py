from fastapi import APIRouter


def create_public_router(sync_service):
    router = APIRouter()

    @router.get("/")
    def root():
        return {"ok": True, "message": "Backend is running"}

    @router.get("/test-login")
    def test_login():
        return sync_service.test_login()

    @router.post("/sync")
    def sync():
        return sync_service.legacy_sync()

    @router.post("/sync/tra-cuu-chung")
    def sync_tra_cuu_chung():
        return sync_service.sync_tra_cuu_chung()

    @router.post("/sync/tt48-da-xu-ly")
    def sync_tt48_da_xu_ly():
        return sync_service.sync_tt48_da_xu_ly()

    @router.post("/sync/tt48-dang-xu-ly")
    def sync_tt48_dang_xu_ly():
        return sync_service.sync_tt48_dang_xu_ly()

    @router.post("/sync/tt47-da-xu-ly")
    def sync_tt47_da_xu_ly():
        return sync_service.sync_tt47_da_xu_ly()

    @router.post("/sync/tt47-dang-xu-ly")
    def sync_tt47_dang_xu_ly():
        return sync_service.sync_tt47_dang_xu_ly()

    @router.post("/sync/tt46-da-xu-ly")
    def sync_tt46_da_xu_ly():
        return sync_service.sync_tt46_da_xu_ly()

    @router.post("/sync/tt46-dang-xu-ly")
    def sync_tt46_dang_xu_ly():
        return sync_service.sync_tt46_dang_xu_ly()

    @router.post("/sync/tt48-cv-buoc")
    def sync_tt48_cv_buoc():
        return sync_service.sync_tt48_cv_buoc()

    @router.post("/sync/all")
    def sync_all():
        return sync_service.run_sync_all_job(triggered_by="manual")

    return router


import os
import time as _time
import json
from datetime import datetime, timezone

import requests
from fastapi import HTTPException
from sqlalchemy import text

from auth_client import RemoteAuthError, RemoteClient
from models import DaXuLy, DangXuLy, RemoteFetchLog, TraCuuChung, Tt48CvBuoc
from stats_views import refresh_stats_materialized_views
from sync_utils import batched_insert, calc_batch_size, clean_record, den_ngay_now


class SyncService:
    def __init__(self, session_factory, runtime) -> None:
        self.session_factory = session_factory
        self.runtime = runtime

    def _upsert_sync_meta(
        self,
        db,
        table_name: str,
        synced_at,
        record_count: int,
        fetch_sec: float = 0.0,
        insert_sec: float = 0.0,
    ):
        db.execute(
            text("""
                INSERT INTO sync_meta (table_name, synced_at, record_count, fetch_sec, insert_sec)
                VALUES (:tn, :sa, :rc, :fs, :is)
                ON CONFLICT (table_name)
                DO UPDATE SET synced_at    = EXCLUDED.synced_at,
                              record_count = EXCLUDED.record_count,
                              fetch_sec    = EXCLUDED.fetch_sec,
                              insert_sec   = EXCLUDED.insert_sec
            """),
            {"tn": table_name, "sa": synced_at, "rc": record_count,
             "fs": round(fetch_sec, 2), "is": round(insert_sec, 2)},
        )

    def prune_remote_fetch_logs(self, keep_rows: int | None = None) -> dict:
        keep_rows = keep_rows or self.runtime.prune_keep_rows
        db = self.session_factory()
        try:
            total_before = db.query(RemoteFetchLog).count()
            deleted = 0
            if total_before > keep_rows:
                cutoff_row = (
                    db.query(RemoteFetchLog.id)
                    .order_by(RemoteFetchLog.id.desc())
                    .offset(keep_rows - 1)
                    .limit(1)
                    .scalar()
                )
                if cutoff_row is not None:
                    deleted = (
                        db.query(RemoteFetchLog)
                        .filter(RemoteFetchLog.id < cutoff_row)
                        .delete(synchronize_session=False)
                    )
                    db.commit()
            total_after = db.query(RemoteFetchLog).count()
            result = {
                "rows_before": total_before,
                "rows_after": total_after,
                "rows_deleted": deleted,
                "keep_rows": keep_rows,
            }
            self.runtime.sync_log.info(
                f"[log-prune] remote_fetch_logs: {total_before} → {total_after} "
                f"(đã xoá {deleted} dòng, giữ {keep_rows})"
            )
            return result
        except Exception as exc:
            db.rollback()
            self.runtime.sync_log.error(f"[log-prune] Lỗi khi prune remote_fetch_logs: {exc}")
            raise
        finally:
            db.close()

    def test_login(self):
        try:
            client = RemoteClient()
            client.login()
            return {"ok": True, "cookies": list(client.debug_cookies().keys())}
        except RemoteAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    def _dav_result_or_raise(self, payload: dict, label: str):
        if not isinstance(payload, dict):
            raise ValueError(f"{label}: response khong hop le")
        if payload.get("success") is False:
            error = payload.get("error") or {}
            if isinstance(error, dict):
                msg = error.get("message") or error.get("details") or str(error)
            else:
                msg = str(error)
            raise ValueError(f"{label}: {msg or 'API tra ve loi'}")
        return payload.get("result")

    def _parse_json_field(self, value):
        if not isinstance(value, str) or not value.strip():
            return None
        try:
            return json.loads(value)
        except Exception:
            return None

    def get_tt48_hoso_detail(self, ho_so_id: int) -> dict:
        base_url = os.environ.get("BASE_URL", "").rstrip("/")
        if not base_url:
            raise HTTPException(status_code=500, detail="Thieu cau hinh BASE_URL")

        referer = f"{base_url}/Application"
        view_url = f"{base_url}/api/services/app/xuLyHoSoView48/GetViewHoSo?hoSoId={ho_so_id}"
        history_url = f"{base_url}/api/services/app/xuLyHoSoView48/GetHistory?hoSoId={ho_so_id}"

        try:
            client = RemoteClient()
            client.login()
            view_payload = client.post_json(view_url, {}, referer=referer).json()
            history_payload = client.post_json(history_url, {}, referer=referer).json()

            view_result = self._dav_result_or_raise(view_payload, "GetViewHoSo")
            history_result = self._dav_result_or_raise(history_payload, "GetHistory")

            ho_so = (view_result or {}).get("hoSo") or {}
            if not isinstance(ho_so, dict) or not ho_so:
                raise ValueError("Khong tim thay thong tin ho so")

            parsed_json_don_hang = self._parse_json_field(ho_so.get("jsonDonHang"))
            parsed_json_pham_vi = self._parse_json_field(ho_so.get("jsonPhamViKinhDoanh"))
            parsed_json_kiem_soat = self._parse_json_field(ho_so.get("jsonKiemSoatDacBiet"))

            return {
                "ok": True,
                "thu_tuc": 48,
                "ho_so_id": ho_so_id,
                "view": {
                    "hoSo": ho_so,
                    "trangThaiHoSo": (view_result or {}).get("trangThaiHoSo"),
                    "urlGiayBaoThu": (view_result or {}).get("urlGiayBaoThu"),
                    "urlBanDangKy": (view_result or {}).get("urlBanDangKy"),
                    "listTepHoSo": (view_result or {}).get("listTepHoSo") or [],
                    "listTepHoSoXuLy": (view_result or {}).get("listTepHoSoXuLy") or [],
                    "danhSachCongVan": (view_result or {}).get("danhSachCongVan") or [],
                    "hosoXuLy": (view_result or {}).get("hosoXuLy") or [],
                    "taiLieuDinhKemChuyenVien": (view_result or {}).get("taiLieuDinhKemChuyenVien") or [],
                    "bienBanThamXet": (view_result or {}).get("bienBanThamXet"),
                    "parsedJsonDonHang": parsed_json_don_hang,
                    "parsedJsonPhamViKinhDoanh": parsed_json_pham_vi,
                    "parsedJsonKiemSoatDacBiet": parsed_json_kiem_soat,
                },
                "history": {
                    "listYKien": (history_result or {}).get("listYKien") or [],
                },
            }
        except RemoteAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc))
        except EnvironmentError as exc:
            raise HTTPException(status_code=500, detail=f"Thieu cau hinh: {exc}")
        except requests.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Loi HTTP tu DAV: {exc}")
        except ValueError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Loi lay chi tiet ho so TT48: {exc}")

    def legacy_sync(self):
        db = self.session_factory()
        try:
            client = RemoteClient()
            client.login()
            response = client.fetch_data()
            status_code = response.status_code
            try:
                payload = response.json()
                raw_text = None
            except Exception:
                payload = None
                raw_text = response.text[:5000]
            record = RemoteFetchLog(
                source="sync",
                endpoint=str(response.url),
                status_code=status_code,
                payload=payload,
                raw_text=raw_text,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return {"ok": True, "saved_id": record.id, "status_code": status_code}
        except RemoteAuthError as exc:
            db.rollback()
            raise HTTPException(status_code=401, detail=str(exc))
        except EnvironmentError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(exc))
        except requests.HTTPError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=str(exc))
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(exc))
        finally:
            db.close()

    def do_sync(self, model_class, api_url: str, body: dict, label: str, referer: str | None = None) -> dict:
        db = self.session_factory()
        try:
            t_fetch = _time.monotonic()
            client = RemoteClient()
            client.login()
            response = client.post_json(api_url, body, referer=referer)
            payload = response.json()

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

            for item in items:
                clean_record(item)
            fetch_sec = _time.monotonic() - t_fetch

            t_insert = _time.monotonic()
            synced_at = datetime.now(timezone.utc)
            table_name = model_class.__tablename__
            db.execute(text(f'TRUNCATE TABLE "{table_name}" RESTART IDENTITY'))
            if items:
                batch_size = calc_batch_size(items)
                rows = [{"data": item} for item in items]
                batched_insert(db, model_class.__table__, rows, batch_size)
            self._upsert_sync_meta(
                db, table_name, synced_at, len(items),
                fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert,
            )
            refresh_stats_materialized_views(
                db,
                "received",
                "tt48_received_by_loai",
                "received_bounds",
                "case_facts",
                "workflow_cases",
                "treo_by_cv",
                "tt48_treo_by_loai",
            )
            db.commit()
            return {
                "ok": True,
                "dataset": label,
                "inserted": len(items),
                "total_from_api": total,
                "synced_at": synced_at.isoformat(),
            }
        except RemoteAuthError as exc:
            db.rollback()
            raise HTTPException(status_code=401, detail=str(exc))
        except EnvironmentError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Thiếu cấu hình: {exc}")
        except requests.HTTPError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=f"Lỗi HTTP từ API: {exc}")
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=str(exc))
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(exc))
        finally:
            db.close()

    def sync_tra_cuu_chung(self):
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
            "DenNgay": den_ngay_now(),
            "ChuyenVienThuLyId": "",
            "thuTucId": "",
        }
        return self.do_sync(TraCuuChung, api_url, body, "tra_cuu_chung")

    def _dashboard_body(self, thu_tuc: int, is_done: bool) -> dict:
        today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        return {
            "strTuNgay": "01/01/2018",
            "strDenNgay": today,
            "ThuTucEnum": [thu_tuc],
            "isDone": is_done,
        }

    def sync_unified(self, unified_model, thu_tuc: int, is_done: bool) -> dict:
        label = f"{'da' if is_done else 'dang'}_xu_ly (TT{thu_tuc})"
        trang_thai = "đã" if is_done else "đang"
        base_url = os.environ.get("BASE_URL", "").rstrip("/")
        api_url = (
            f"{base_url}/api/services/app/dashBoard"
            "/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
        )
        referer = f"{base_url}/lanhdaocuc/index"
        body = self._dashboard_body(thu_tuc, is_done=is_done)

        db = self.session_factory()
        try:
            t_fetch = _time.monotonic()
            client = RemoteClient()
            client.login()
            response = client.post_json(api_url, body, referer=referer)
            payload = response.json()

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

            fetch_sec = _time.monotonic() - t_fetch
            for item in items:
                clean_record(item)
                item["thuTucId"] = thu_tuc

            t_insert = _time.monotonic()
            synced_at = datetime.now(timezone.utc)
            table_name = unified_model.__tablename__
            db.execute(text(f'DELETE FROM "{table_name}" WHERE thu_tuc = :tt'), {"tt": thu_tuc})
            if items:
                batch_size = calc_batch_size(items)
                rows = [{"thu_tuc": thu_tuc, "data": item} for item in items]
                batched_insert(db, unified_model.__table__, rows, batch_size)
            self._upsert_sync_meta(
                db, table_name, synced_at, len(items),
                fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert,
            )
            refresh_kinds = ["resolved" if is_done else "inflight", "case_facts"]
            if not is_done:
                refresh_kinds.append("workflow_cases")
            if is_done:
                refresh_kinds.extend(["resolved_facts", "treo_by_cv", "tt48_treo_by_loai"])
            refresh_stats_materialized_views(db, *refresh_kinds)
            db.commit()

            inserted = len(items)
            self.runtime.sync_log.info(f"[{label}] {trang_thai} xử lý: {inserted}/{total} records")
            return {
                "ok": True,
                "dataset": label,
                "inserted": inserted,
                "total_from_api": total,
                "synced_at": synced_at.isoformat(),
            }
        except RemoteAuthError as exc:
            db.rollback()
            raise HTTPException(status_code=401, detail=str(exc))
        except EnvironmentError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Thiếu cấu hình: {exc}")
        except requests.HTTPError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=f"Lỗi HTTP từ API: {exc}")
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=str(exc))
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(exc))
        finally:
            db.close()

    def sync_tt48_da_xu_ly(self):
        return self.sync_unified(DaXuLy, thu_tuc=48, is_done=True)

    def sync_tt48_dang_xu_ly(self):
        return self.sync_unified(DangXuLy, thu_tuc=48, is_done=False)

    def sync_tt47_da_xu_ly(self):
        return self.sync_unified(DaXuLy, thu_tuc=47, is_done=True)

    def sync_tt47_dang_xu_ly(self):
        return self.sync_unified(DangXuLy, thu_tuc=47, is_done=False)

    def sync_tt46_da_xu_ly(self):
        return self.sync_unified(DaXuLy, thu_tuc=46, is_done=True)

    def sync_tt46_dang_xu_ly(self):
        return self.sync_unified(DangXuLy, thu_tuc=46, is_done=False)

    def fetch_all_paged(self, client, api_url: str, body: dict, referer: str | None = None) -> list[dict]:
        page_size = 5000
        body = {**body, "skipCount": 0, "maxResultCount": page_size, "pageSize": page_size, "page": 1}
        response = client.post_json(api_url, body, referer=referer)
        payload = response.json()
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
            raise ValueError(f"Không parse được result: type={type(result)}")
        while len(items) < total:
            body = {**body, "skipCount": len(items)}
            response = client.post_json(api_url, body, referer=referer)
            payload = response.json()
            result = payload.get("result", payload)
            chunk = result.get("items", result.get("data", [])) if isinstance(result, dict) else result
            if not chunk:
                break
            items.extend(chunk)
        return items

    def sync_tt48_cv_buoc(self):
        base_url = os.environ.get("BASE_URL", "").rstrip("/")
        api_url = f"{base_url}/api/services/app/xuLyHoSoGridView48/GetListHoSoPaging"
        referer = f"{base_url}/Application"
        common = {
            "keyword": None, "ngayGuiTu": None, "ngayGuiToi": None,
            "loaiHoSoId": 50, "tinhId": None, "doanhNghiepId": None,
            "phongBanId": 5, "ngayNopTu": None, "ngayNopToi": None,
            "sorting": None,
        }

        db = self.session_factory()
        try:
            started = _time.monotonic()
            client = RemoteClient()
            client.login()

            buoc_rows: dict[str, str] = {}

            body_a = {**common, "formId": 21, "formCase": 2, "formCase2": 0}
            items_a = self.fetch_all_paged(client, api_url, body_a, referer=referer)
            for item in items_a:
                ma_ho_so = item.get("maHoSo") or item.get("strSoHieuHoSo") or ""
                if ma_ho_so:
                    buoc_rows[ma_ho_so] = "chua_xu_ly"
            self.runtime.sync_log.info(f"[tt48_cv_buoc] (a) chua_xu_ly: {len(items_a)} records")

            body_b = {**common, "formId": 21, "formCase": 3, "formCase2": 0}
            items_b = self.fetch_all_paged(client, api_url, body_b, referer=referer)
            cnt_bi_tra = 0
            cnt_cho_th = 0
            for item in items_b:
                ma_ho_so = item.get("maHoSo") or item.get("strSoHieuHoSo") or ""
                don_vi_gui = (item.get("strDonViGui") or "").strip()
                don_vi_xu_ly = (item.get("strDonViXuLy") or "").strip()
                if not ma_ho_so:
                    continue
                if don_vi_xu_ly == "Chuyên viên thẩm định":
                    if don_vi_gui in ("Tổ trưởng chuyên gia", "Trưởng phòng"):
                        buoc_rows[ma_ho_so] = "bi_tra_lai"
                        cnt_bi_tra += 1
                    elif don_vi_gui == "Chuyên gia":
                        buoc_rows[ma_ho_so] = "cho_tong_hop"
                        cnt_cho_th += 1
            self.runtime.sync_log.info(
                f"[tt48_cv_buoc] (b) dang_xu_ly {len(items_b)} records → "
                f"bi_tra_lai={cnt_bi_tra}, cho_tong_hop={cnt_cho_th}"
            )

            body_c = {**common, "formId": 4, "formCase": 5}
            items_c = self.fetch_all_paged(client, api_url, body_c, referer=referer)
            for item in items_c:
                ma_ho_so = item.get("maHoSo") or item.get("strSoHieuHoSo") or ""
                if ma_ho_so:
                    buoc_rows[ma_ho_so] = "cho_ket_thuc"
            self.runtime.sync_log.info(f"[tt48_cv_buoc] (c) cho_ket_thuc: {len(items_c)} records")

            t_insert = _time.monotonic()
            synced_at = datetime.now(timezone.utc)
            db.execute(text('TRUNCATE TABLE "tt48_cv_buoc" RESTART IDENTITY'))
            if buoc_rows:
                db.execute(
                    Tt48CvBuoc.__table__.insert(),
                    [{"ma_ho_so": key, "buoc": value} for key, value in buoc_rows.items()],
                )
            fetch_sec = t_insert - started
            self._upsert_sync_meta(
                db, "tt48_cv_buoc", synced_at, len(buoc_rows),
                fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert,
            )
            refresh_stats_materialized_views(db, "workflow_cases")
            db.commit()
            self.runtime.sync_log.info(
                f"[tt48_cv_buoc] Tổng: {len(buoc_rows)} records → DB | fetch={fetch_sec:.1f}s"
            )
            return {
                "ok": True,
                "dataset": "tt48_cv_buoc",
                "inserted": len(buoc_rows),
                "synced_at": synced_at.isoformat(),
            }
        except RemoteAuthError as exc:
            db.rollback()
            raise HTTPException(status_code=401, detail=str(exc))
        except EnvironmentError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Thiếu cấu hình: {exc}")
        except requests.HTTPError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=f"Lỗi HTTP từ API: {exc}")
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=502, detail=str(exc))
        except Exception as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(exc))
        finally:
            db.close()

    def run_sync_all_job(self, triggered_by: str = "scheduler") -> dict:
        if not self.runtime.sync_lock.acquire(blocking=False):
            self.runtime.sync_log.warning(
                f"[SKIP] Sync đang chạy — bỏ qua lần kích hoạt này (triggered_by={triggered_by})"
            )
            return {"ok": False, "skipped": True, "reason": "Sync đang chạy, bỏ qua"}

        try:
            self.runtime.job_run_counter += 1
            run_id = self.runtime.job_run_counter
            base_url = os.environ.get("BASE_URL", "").rstrip("/")
            tasks = [
                ("tra_cuu_chung", self.sync_tra_cuu_chung, f"{base_url}/api/services/app/traCuu_PQLCL/TraCuu"),
                ("tt48_da_xu_ly", self.sync_tt48_da_xu_ly, f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc [ThuTucEnum=48, isDone=True]"),
                ("tt48_dang_xu_ly", self.sync_tt48_dang_xu_ly, f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc [ThuTucEnum=48, isDone=False]"),
                ("tt48_cv_buoc", self.sync_tt48_cv_buoc, f"{base_url}/api/services/app/xuLyHoSoGridView48/GetListHoSoPaging [formCase 2/3/5]"),
                ("tt47_da_xu_ly", self.sync_tt47_da_xu_ly, f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc [ThuTucEnum=47, isDone=True]"),
                ("tt47_dang_xu_ly", self.sync_tt47_dang_xu_ly, f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc [ThuTucEnum=47, isDone=False]"),
                ("tt46_da_xu_ly", self.sync_tt46_da_xu_ly, f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc [ThuTucEnum=46, isDone=True]"),
                ("tt46_dang_xu_ly", self.sync_tt46_dang_xu_ly, f"{base_url}/api/services/app/dashBoard/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc [ThuTucEnum=46, isDone=False]"),
            ]

            self.runtime.sync_log.info("─" * 70)
            self.runtime.sync_log.info(f"[run #{run_id}] SYNC/ALL BẮT ĐẦU | triggered_by={triggered_by}")
            results = []
            errors = []
            for label, fn, api_info in tasks:
                started = _time.monotonic()
                try:
                    result = fn()
                    elapsed = _time.monotonic() - started
                    inserted = result.get("inserted", "?")
                    total = result.get("total_from_api", "?")
                    self.runtime.sync_log.info(
                        f"[run #{run_id}] [{label}] POST {api_info} → OK | {inserted}/{total} records | {elapsed:.1f}s"
                    )
                    results.append(result)
                except HTTPException as exc:
                    elapsed = _time.monotonic() - started
                    self.runtime.sync_log.error(
                        f"[run #{run_id}] [{label}] POST {api_info} → HTTP {exc.status_code} | {exc.detail} | {elapsed:.1f}s"
                    )
                    errors.append({"dataset": label, "http_status": exc.status_code, "error": exc.detail})
                except Exception as exc:
                    elapsed = _time.monotonic() - started
                    self.runtime.sync_log.error(
                        f"[run #{run_id}] [{label}] POST {api_info} → EXCEPTION {type(exc).__name__} | {exc} | {elapsed:.1f}s"
                    )
                    errors.append({"dataset": label, "error": f"{type(exc).__name__}: {exc}"})

            status_str = f"{len(results)} OK, {len(errors)} lỗi"
            if errors:
                self.runtime.sync_log.warning(f"[run #{run_id}] SYNC/ALL HOÀN THÀNH (có lỗi) | {status_str}")
            else:
                self.runtime.sync_log.info(f"[run #{run_id}] SYNC/ALL HOÀN THÀNH | {status_str}")
            return {"ok": len(errors) == 0, "run_id": run_id, "results": results, "errors": errors}
        finally:
            self.runtime.sync_lock.release()

    def logs_sync(self, lines: int):
        log_file = self.runtime.log_dir / "sync.log"
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

    def logs_db_stats(self):
        file_stats = []
        for path in sorted(self.runtime.log_dir.glob("sync.log*")):
            size_bytes = path.stat().st_size
            file_stats.append({
                "file": path.name,
                "size_bytes": size_bytes,
                "size_kb": round(size_bytes / 1024, 1),
            })

        db = self.session_factory()
        try:
            db_count = db.query(RemoteFetchLog).count()
            oldest = db.query(RemoteFetchLog.created_at).order_by(RemoteFetchLog.created_at.asc()).limit(1).scalar()
            newest = db.query(RemoteFetchLog.created_at).order_by(RemoteFetchLog.created_at.desc()).limit(1).scalar()
        finally:
            db.close()

        return {
            "ok": True,
            "log_files": file_stats,
            "log_files_total_kb": round(sum(item["size_bytes"] for item in file_stats) / 1024, 1),
            "db_remote_fetch_logs": {
                "row_count": db_count,
                "keep_limit": self.runtime.prune_keep_rows,
                "over_limit": max(0, db_count - self.runtime.prune_keep_rows),
                "oldest_record": oldest.isoformat() if oldest else None,
                "newest_record": newest.isoformat() if newest else None,
            },
            "note": (
                "Log file: RotatingFileHandler 5×10 MB = tối đa 50 MB. "
                f"DB table: prune tự động mỗi 24h, giữ tối đa {self.runtime.prune_keep_rows} dòng."
            ),
        }

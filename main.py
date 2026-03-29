import json as _json
import logging
import logging.handlers
import os
import re
import threading
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
    SyncMeta,
    RemoteFetchLog,
    TraCuuChung,
    DaXuLy, DangXuLy, Tt48CvBuoc,
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

# Lock ngăn nhiều phiên sync chạy đồng thời → tránh tốn RAM nhân đôi
_sync_lock = threading.Lock()


# ===========================================================================
# SCHEDULER — APScheduler chạy job mỗi N giờ (mặc định 3h, có thể thay đổi)
# ===========================================================================
_scheduler = BackgroundScheduler(timezone="UTC")
_sync_interval_hours: float = 3.0  # giá trị hiện tại, cập nhật khi reschedule

# Tên các bảng dữ liệu hồ sơ (không tính sync_meta, logs, ...)
_DATA_TABLES = [
    "tra_cuu_chung",
    "dang_xu_ly",
    "da_xu_ly",
]

_STATS_MATERIALIZED_VIEWS = {
    "received": "mv_stats_received_monthly",
    "received_bounds": "mv_stats_received_bounds",
    "resolved": "mv_stats_resolved_monthly",
    "resolved_facts": "mv_stats_resolved_facts",
    "inflight": "mv_stats_inflight_monthly",
    "case_facts": "mv_stats_case_facts",
    "workflow_cases": "mv_stats_workflow_cases",
    "treo_by_cv": "mv_stats_treo_by_cv",
    "tt48_treo_by_loai": "mv_stats_tt48_treo_by_loai",
}


def _migrate_schema():
    """
    Migration idempotent chạy mỗi lần server khởi động.

    1. Xóa cột synced_at (không còn per-row — đã chuyển sang sync_meta).
    2. Tạo các functional index JSONB còn thiếu để tăng tốc query thống kê.
    """
    with engine.begin() as conn:
        # -- 1. Bỏ cột synced_at khỏi tất cả bảng dữ liệu ------------------
        for t in _DATA_TABLES:
            conn.execute(text(
                f'ALTER TABLE IF EXISTS "{t}" DROP COLUMN IF EXISTS synced_at'
            ))

        # -- 2. Thêm cột fetch_sec / insert_sec vào sync_meta nếu chưa có -----
        conn.execute(text(
            "ALTER TABLE IF EXISTS sync_meta "
            "ADD COLUMN IF NOT EXISTS fetch_sec FLOAT"
        ))
        conn.execute(text(
            "ALTER TABLE IF EXISTS sync_meta "
            "ADD COLUMN IF NOT EXISTS insert_sec FLOAT"
        ))

        # -- 3. Thêm JSONB indexes còn thiếu ---------------------------------
        # Các index bên dưới bám trực tiếp vào hot path của stats TS hiện tại:
        # - overview.ts: summary / giai-quyet / ton-sau / monthly
        # - workflow.ts: chuyen-vien / dang-xu-ly / chuyen-gia
        #
        # Nguyên tắc:
        # - Ưu tiên composite index có thu_tuc ở đầu cho bảng unified (da_xu_ly, dang_xu_ly)
        # - Giữ functional index trên JSONB text vì cast ::timestamptz không IMMUTABLE
        # - Bổ sung các key JOIN/GROUP BY/ORDER BY xuất hiện lặp lại trong CTE

        # dang_xu_ly — index cũ đơn cột (tương thích ngược)
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_ma_ho_so "
            "ON dang_xu_ly ((data->>'maHoSo'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_id "
            "ON dang_xu_ly ((data->>'id'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_don_vi "
            "ON dang_xu_ly ((data->>'tenDonViXuLy'))"
        ))

        # dang_xu_ly — composite index cho workflow stats
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_thu_tuc_ma_ho_so "
            "ON dang_xu_ly (thu_tuc, (data->>'maHoSo'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_thu_tuc_don_vi "
            "ON dang_xu_ly (thu_tuc, (data->>'tenDonViXuLy'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_thu_tuc_nguoi_xu_ly "
            "ON dang_xu_ly (thu_tuc, (data->>'nguoiXuLy'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_thu_tuc_ngay_tiep_nhan "
            "ON dang_xu_ly (thu_tuc, (data->>'ngayTiepNhan'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxly_thu_tuc_qua_han "
            "ON dang_xu_ly (thu_tuc, (data->>'soNgayQuaHan'))"
        ))

        # tra_cuu_chung — index text cho ngày, key JOIN và chuyên viên
        # Lưu ý: không thể index ::timestamptz vì cast không phải IMMUTABLE trong PostgreSQL
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_thu_tuc_id "
            "ON tra_cuu_chung ((data->>'thuTucId'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_ma_ho_so "
            "ON tra_cuu_chung ((data->>'maHoSo'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_ho_so_xu_ly_active "
            "ON tra_cuu_chung ((data->>'hoSoXuLyId_Active'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_ngay_tiep_nhan "
            "ON tra_cuu_chung ((data->>'ngayTiepNhan'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_ngay_hen_tra "
            "ON tra_cuu_chung ((data->>'ngayHenTra'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_cv_thu_ly "
            "ON tra_cuu_chung ((data->>'chuyenVienThuLyName'))"
        ))

        # da_xu_ly — index cũ đơn cột
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_ngay_tra "
            "ON da_xu_ly ((data->>'ngayTraKetQua'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_trang_thai "
            "ON da_xu_ly ((data->>'trangThaiHoSo'))"
        ))

        # da_xu_ly — composite index cho summary/giai-quyet/chuyen-vien
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_thu_tuc_id "
            "ON da_xu_ly (thu_tuc, (data->>'id'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_thu_tuc_ma_ho_so "
            "ON da_xu_ly (thu_tuc, (data->>'maHoSo'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_thu_tuc_ngay_tra "
            "ON da_xu_ly (thu_tuc, (data->>'ngayTraKetQua'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_thu_tuc_ngay_tiep_nhan "
            "ON da_xu_ly (thu_tuc, (data->>'ngayTiepNhan'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_thu_tuc_ngay_hen_tra "
            "ON da_xu_ly (thu_tuc, (data->>'ngayHenTra'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_thu_tuc_trang_thai "
            "ON da_xu_ly (thu_tuc, (data->>'trangThaiHoSo'))"
        ))

        # tt48_cv_buoc — index trên cột buoc (để GROUP BY / FILTER nhanh)
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tt48_buoc "
            "ON tt48_cv_buoc (buoc)"
        ))

        # -- 4. Materialized views cho thống kê tháng ------------------------
        # Được refresh sau mỗi lần sync thành công để dashboard không phải
        # GROUP BY trực tiếp trên raw JSONB cho các biểu đồ theo tháng.
        #
        # Luôn DROP + CREATE lại để definition trong DB không bị lệch với code
        # sau các lần refactor materialized view.
        for view_name in (
            _STATS_MATERIALIZED_VIEWS["tt48_treo_by_loai"],
            _STATS_MATERIALIZED_VIEWS["treo_by_cv"],
            _STATS_MATERIALIZED_VIEWS["workflow_cases"],
            _STATS_MATERIALIZED_VIEWS["case_facts"],
            _STATS_MATERIALIZED_VIEWS["inflight"],
            _STATS_MATERIALIZED_VIEWS["resolved_facts"],
            _STATS_MATERIALIZED_VIEWS["resolved"],
            _STATS_MATERIALIZED_VIEWS["received_bounds"],
            _STATS_MATERIALIZED_VIEWS["received"],
        ):
            conn.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {view_name} CASCADE"))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["received"]} AS
            SELECT
                (data->>'thuTucId')::int AS thu_tuc,
                EXTRACT(YEAR  FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
                EXTRACT(MONTH FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
                COUNT(*)::bigint AS cnt
            FROM tra_cuu_chung
            WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
              AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
            GROUP BY 1, 2, 3
        """))
        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["received_bounds"]} AS
            SELECT
                (data->>'thuTucId')::int AS thu_tuc,
                MIN((data->>'ngayTiepNhan')::timestamptz) AS earliest_ngay_nhan
            FROM tra_cuu_chung
            WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
              AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
            GROUP BY 1
        """))
        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["resolved"]} AS
            SELECT
                thu_tuc,
                EXTRACT(YEAR  FROM (data->>'ngayTraKetQua')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
                EXTRACT(MONTH FROM (data->>'ngayTraKetQua')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
                COUNT(*)::bigint AS cnt
            FROM da_xu_ly
            WHERE NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
            GROUP BY 1, 2, 3
        """))
        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["resolved_facts"]} AS
            SELECT
                thu_tuc,
                data->>'maHoSo' AS ma_ho_so,
                CASE
                    WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
                    THEN (data->>'ngayTiepNhan')::timestamptz
                    ELSE NULL
                END AS ngay_nhan,
                CASE
                    WHEN NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
                    THEN (data->>'ngayTraKetQua')::timestamptz
                    ELSE NULL
                END AS ngay_tra,
                CASE
                    WHEN NULLIF(data->>'ngayHenTra', '') IS NOT NULL
                    THEN (data->>'ngayHenTra')::timestamptz
                    ELSE NULL
                END AS kq_hen_tra,
                data->>'trangThaiHoSo' AS trang_thai
            FROM da_xu_ly
        """))
        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["inflight"]} AS
            SELECT
                thu_tuc,
                EXTRACT(YEAR  FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
                EXTRACT(MONTH FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
                COUNT(*)::bigint AS cnt
            FROM dang_xu_ly
            WHERE NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
            GROUP BY 1, 2, 3
        """))

        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['received']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['received']} (thu_tuc, yr, mo)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['received_bounds']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['received_bounds']} (thu_tuc)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['resolved']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['resolved']} (thu_tuc, yr, mo)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['resolved_facts']}_ngay_tra "
            f"ON {_STATS_MATERIALIZED_VIEWS['resolved_facts']} (thu_tuc, ngay_tra)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['resolved_facts']}_ma_ho_so "
            f"ON {_STATS_MATERIALIZED_VIEWS['resolved_facts']} (thu_tuc, ma_ho_so, ngay_nhan)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['inflight']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['inflight']} (thu_tuc, yr, mo)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["case_facts"]} AS
            WITH
            dxl_active AS (
                SELECT DISTINCT
                    thu_tuc,
                    data->>'maHoSo' AS ma_ho_so
                FROM dang_xu_ly
            ),
            dxl_cho_pc AS (
                SELECT DISTINCT
                    thu_tuc,
                    data->>'maHoSo' AS ma_ho_so
                FROM dang_xu_ly
                WHERE data->>'tenDonViXuLy' = 'Phòng ban phân công'
            )
            SELECT
                (t.data->>'thuTucId')::int AS thu_tuc,
                t.data->>'id' AS tcc_id,
                t.data->>'maHoSo' AS ma_ho_so,
                t.data->>'loaiHoSo' AS loai_ho_so,
                CASE
                    WHEN NULLIF(t.data->>'strLanBoSung', '') = 'Lần đầu' THEN 'first'
                    WHEN NULLIF(t.data->>'strLanBoSung', '') IS NOT NULL THEN 'supplement'
                    WHEN COALESCE(NULLIF(t.data->>'lanBoSung', ''), '0') = '0' THEN 'first'
                    ELSE 'supplement'
                END AS submission_kind,
                COALESCE(NULLIF(TRIM(t.data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name_raw,
                CASE
                    WHEN NULLIF(t.data->>'ngayTiepNhan', '') IS NOT NULL
                    THEN (t.data->>'ngayTiepNhan')::timestamptz
                    ELSE NULL
                END AS ngay_nhan,
                CASE
                    WHEN NULLIF(t.data->>'ngayHenTra', '') IS NOT NULL
                    THEN (t.data->>'ngayHenTra')::timestamptz
                    ELSE NULL
                END AS nhan_hen_tra,
                NULLIF(d.data->>'id', '') AS da_xu_ly_id,
                CASE
                    WHEN NULLIF(d.data->>'ngayTraKetQua', '') IS NOT NULL
                    THEN (d.data->>'ngayTraKetQua')::timestamptz
                    ELSE NULL
                END AS ngay_tra,
                CASE
                    WHEN NULLIF(d.data->>'ngayHenTra', '') IS NOT NULL
                    THEN (d.data->>'ngayHenTra')::timestamptz
                    ELSE NULL
                END AS kq_hen_tra,
                d.data->>'trangThaiHoSo' AS trang_thai,
                (da.ma_ho_so IS NOT NULL) AS is_active,
                (dcp.ma_ho_so IS NOT NULL) AS is_cho_phan_cong
            FROM tra_cuu_chung t
            LEFT JOIN da_xu_ly d
              ON t.data->>'id' = d.data->>'id'
             AND d.thu_tuc = (t.data->>'thuTucId')::int
            LEFT JOIN dxl_active da
              ON da.thu_tuc = (t.data->>'thuTucId')::int
             AND da.ma_ho_so = t.data->>'maHoSo'
            LEFT JOIN dxl_cho_pc dcp
              ON dcp.thu_tuc = (t.data->>'thuTucId')::int
             AND dcp.ma_ho_so = t.data->>'maHoSo'
            WHERE NULLIF(t.data->>'thuTucId', '') IS NOT NULL
        """))

        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['case_facts']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, tcc_id)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['case_facts']}_ngay_nhan "
            f"ON {_STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, ngay_nhan)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['case_facts']}_ngay_tra "
            f"ON {_STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, ngay_tra)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['case_facts']}_cv "
            f"ON {_STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, cv_name_raw)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['case_facts']}_loai_submit "
            f"ON {_STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, loai_ho_so, submission_kind)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['case_facts']}_active "
            f"ON {_STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, is_active, ngay_nhan)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["workflow_cases"]} AS
            WITH
            cv_from_tcc AS (
                SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'maHoSo')
                    (data->>'thuTucId')::int AS thu_tuc,
                    data->>'maHoSo' AS ma_ho_so,
                    COALESCE(NULLIF(TRIM(data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name
                FROM tra_cuu_chung
                WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
                  AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
                ORDER BY (data->>'thuTucId')::int, data->>'maHoSo', (data->>'ngayTiepNhan')::timestamptz DESC
            )
            SELECT
                d.thu_tuc,
                CASE
                    WHEN d.data->>'tenDonViXuLy' = 'Phòng ban phân công' THEN '__CHUA_PHAN__'
                    ELSE COALESCE(c.cv_name, '__CHUA_PHAN__')
                END AS cv_name,
                d.data->>'tenDonViXuLy' AS don_vi,
                d.data->>'maHoSo' AS ma_ho_so,
                COALESCE(NULLIF(d.data->>'soNgayQuaHan', ''), '0')::int AS qua_han_ngay,
                CASE
                    WHEN NULLIF(d.data->>'ngayTiepNhan', '') IS NOT NULL
                    THEN (d.data->>'ngayTiepNhan')::timestamptz
                    ELSE NULL
                END AS ngay_nhan,
                NULLIF(d.data->>'nguoiXuLy', '') AS nguoi_xu_ly,
                COALESCE(b.buoc, '') AS buoc
            FROM dang_xu_ly d
            LEFT JOIN cv_from_tcc c
              ON c.thu_tuc = d.thu_tuc
             AND c.ma_ho_so = d.data->>'maHoSo'
            LEFT JOIN tt48_cv_buoc b
              ON d.thu_tuc = 48
             AND b.ma_ho_so = d.data->>'maHoSo'
        """))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['workflow_cases']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, ma_ho_so, don_vi, cv_name)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['workflow_cases']}_cv "
            f"ON {_STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, cv_name)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['workflow_cases']}_don_vi "
            f"ON {_STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, don_vi)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['workflow_cases']}_qua_han "
            f"ON {_STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, qua_han_ngay)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['workflow_cases']}_nguoi_xu_ly "
            f"ON {_STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, nguoi_xu_ly)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['workflow_cases']}_buoc "
            f"ON {_STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, buoc)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["treo_by_cv"]} AS
            WITH
            latest_dxl_treo AS (
                SELECT DISTINCT ON (thu_tuc, ma_ho_so)
                    thu_tuc,
                    ma_ho_so,
                    trang_thai,
                    ngay_nhan AS ngay_nhan_dxl
                FROM {_STATS_MATERIALIZED_VIEWS["resolved_facts"]}
                WHERE ngay_nhan IS NOT NULL
                ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC
            ),
            latest_tcc_treo AS (
                SELECT DISTINCT ON (thu_tuc, ma_ho_so)
                    thu_tuc,
                    ma_ho_so,
                    cv_name_raw AS cv_name,
                    ngay_nhan AS ngay_nhan_tcc
                FROM {_STATS_MATERIALIZED_VIEWS["case_facts"]}
                WHERE ngay_nhan IS NOT NULL
                ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC
            )
            SELECT
                ld.thu_tuc,
                COALESCE(NULLIF(lt.cv_name, ''), '__CHUA_PHAN__') AS cv_name,
                COUNT(*)::bigint AS treo
            FROM latest_dxl_treo ld
            JOIN latest_tcc_treo lt
              ON lt.thu_tuc = ld.thu_tuc
             AND lt.ma_ho_so = ld.ma_ho_so
            WHERE ld.trang_thai = '4'
              AND lt.ngay_nhan_tcc <= ld.ngay_nhan_dxl
            GROUP BY 1, 2
        """))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['treo_by_cv']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['treo_by_cv']} (thu_tuc, cv_name)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {_STATS_MATERIALIZED_VIEWS["tt48_treo_by_loai"]} AS
            WITH
            latest_dxl_treo AS (
                SELECT DISTINCT ON (ma_ho_so)
                    ma_ho_so,
                    trang_thai,
                    ngay_nhan AS ngay_nhan_dxl
                FROM {_STATS_MATERIALIZED_VIEWS["resolved_facts"]}
                WHERE thu_tuc = 48
                  AND ngay_nhan IS NOT NULL
                ORDER BY ma_ho_so, ngay_nhan DESC
            ),
            latest_tcc_treo AS (
                SELECT DISTINCT ON (ma_ho_so)
                    ma_ho_so,
                    loai_ho_so,
                    ngay_nhan AS ngay_nhan_tcc
                FROM {_STATS_MATERIALIZED_VIEWS["case_facts"]}
                WHERE thu_tuc = 48
                  AND ngay_nhan IS NOT NULL
                  AND loai_ho_so IN ('A', 'B', 'C', 'D')
                ORDER BY ma_ho_so, ngay_nhan DESC
            )
            SELECT
                lt.loai_ho_so,
                COUNT(*)::bigint AS treo
            FROM latest_dxl_treo ld
            JOIN latest_tcc_treo lt
              ON lt.ma_ho_so = ld.ma_ho_so
            WHERE ld.trang_thai = '4'
              AND lt.ngay_nhan_tcc <= ld.ngay_nhan_dxl
            GROUP BY lt.loai_ho_so
        """))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{_STATS_MATERIALIZED_VIEWS['tt48_treo_by_loai']}_key "
            f"ON {_STATS_MATERIALIZED_VIEWS['tt48_treo_by_loai']} (loai_ho_so)"
        ))


def _refresh_stats_materialized_views(db, *kinds: str):
    targets = kinds or tuple(_STATS_MATERIALIZED_VIEWS.keys())
    for kind in targets:
        view_name = _STATS_MATERIALIZED_VIEWS.get(kind)
        if not view_name:
            raise ValueError(f"Unknown stats materialized view kind: {kind}")
        db.execute(text(f"REFRESH MATERIALIZED VIEW {view_name}"))


def _upsert_sync_meta(
    db,
    table_name: str,
    synced_at,
    record_count: int,
    fetch_sec: float = 0.0,
    insert_sec: float = 0.0,
):
    """Cập nhật bảng sync_meta cho một bảng dữ liệu (INSERT hoặc UPDATE)."""
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


# ===========================================================================
# LOG ROTATION — giới hạn kích thước bảng remote_fetch_logs trong PostgreSQL
# ===========================================================================
# Mặc định giữ lại 10 000 bản ghi mới nhất, xoá phần còn lại.
# Số dòng này đủ để debug nhưng không để bảng phình vô hạn.
_PRUNE_KEEP_ROWS: int = 10_000


def _prune_remote_fetch_logs(keep_rows: int = _PRUNE_KEEP_ROWS) -> dict:
    """
    Xoá các bản ghi cũ trong remote_fetch_logs, chỉ giữ lại `keep_rows` mới nhất.
    Trả về dict với số dòng trước/sau và số dòng đã xoá.
    """
    db = SessionLocal()
    try:
        total_before = db.query(RemoteFetchLog).count()
        deleted = 0
        if total_before > keep_rows:
            # Tìm id ngưỡng: id nhỏ hơn ngưỡng này sẽ bị xoá
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
            "rows_after":  total_after,
            "rows_deleted": deleted,
            "keep_rows": keep_rows,
        }
        _sync_log.info(
            f"[log-prune] remote_fetch_logs: {total_before} → {total_after} "
            f"(đã xoá {deleted} dòng, giữ {keep_rows})"
        )
        return result
    except Exception as exc:
        db.rollback()
        _sync_log.error(f"[log-prune] Lỗi khi prune remote_fetch_logs: {exc}")
        raise
    finally:
        db.close()


# Tạo tất cả bảng + khởi động scheduler khi server start
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    # next_run_time=now → chạy sync ngay lập tức khi server khởi động,
    # sau đó lặp lại mỗi 3 giờ tự động
    _scheduler.add_job(
        _run_sync_all_job,
        trigger="interval",
        hours=3,
        id="sync_all_3h",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )
    # Prune log DB mỗi 24h; lần đầu chạy ngay khi server khởi động
    _scheduler.add_job(
        _prune_remote_fetch_logs,
        trigger="interval",
        hours=24,
        id="prune_logs_24h",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    _sync_log.info("=" * 70)
    _sync_log.info("SERVER KHỞI ĐỘNG — sync ngay lập tức + scheduler mỗi 3h")
    _sync_log.info(f"LOG ROTATION — remote_fetch_logs giữ tối đa {_PRUNE_KEEP_ROWS} dòng, prune mỗi 24h")
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
# Helper: làm sạch giá trị ngày từ API nguồn
# Xử lý các trường hợp:
#   1. Lặp có ký tự ngắt: "23/05/2025\n23/05/2025"
#   2. Lặp không có ký tự ngắt (ghép liền): "23/05/202523/05/2025"
#   3. ISO timestamp ghép liền: "2025-05-23T10:00:00+07:002025-05-23T10:00:00+07:00"
#   4. Chuyển đổi DD/MM/YYYY → ISO 8601
# ---------------------------------------------------------------------------
_DATE_FIELDS = {
    "ngayTraKetQua", "ngayTiepNhan", "ngayHenTra",
    "phoPhongNgayDuyet", "vanThuNgayDongDau",
    "ngayDoanhNghiepNopHoSo", "ngayChuyenAuto",
    "ngayMotCuaChuyen", "ngayThanhToan", "ngayXacNhanThanhToan",
}

# Regex trích xuất phần đầu hợp lệ của một date string
# - ISO timestamp: YYYY-MM-DDTHH:MM:SS[.sss]+HH:MM
# - DD/MM/YYYY
_RE_ISO_TS   = re.compile(
    r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z))'
)
_RE_DDMMYYYY = re.compile(r'(\d{2}/\d{2}/\d{4})')


def _clean_date_value(val: str) -> str | None:
    """
    Làm sạch một chuỗi ngày trả về từ API:
    1. Strip khoảng trắng, newline, carriage return
    2. Nếu bị lặp qua ký tự ngắt (\n, \r): lấy phần trước ký tự đầu tiên
    3. Nếu bắt đầu bằng DD/MM/YYYY (kể cả bị ghép liền): trích regex → ISO 8601
    4. Nếu bắt đầu bằng ISO timestamp (kể cả bị ghép liền): trích regex → lấy match đầu
    Trả None nếu rỗng; trả nguyên giá trị nếu không nhận dạng được.
    """
    if not val or not isinstance(val, str):
        return val

    # Bước 1: strip + tách tại ký tự ngắt dòng / CR
    cleaned = val.strip().split("\n")[0].split("\r")[0].strip()
    if not cleaned:
        return None

    # Bước 2: DD/MM/YYYY (đơn hoặc ghép liền "23/05/202523/05/2025")
    if _RE_DDMMYYYY.match(cleaned):
        m = _RE_DDMMYYYY.match(cleaned)
        date_part = m.group(1)  # luôn lấy đúng 10 ký tự DD/MM/YYYY đầu tiên
        try:
            day, month, year = date_part.split("/")
            return f"{year}-{month}-{day}T00:00:00+07:00"
        except ValueError:
            return None

    # Bước 3: ISO timestamp (đơn hoặc ghép liền)
    m = _RE_ISO_TS.match(cleaned)
    if m:
        return m.group(1)  # lấy timestamp đầu tiên hợp lệ

    # Fallback: trả nguyên giá trị (đã strip)
    return cleaned


def _clean_record(item: dict) -> dict:
    """Áp dụng _clean_date_value cho tất cả trường ngày trong một record.

    Fallback: nếu ngayTraKetQua bị null/rỗng mà vanThuNgayDongDau có giá trị
    thì dùng vanThuNgayDongDau làm ngày trả kết quả (đây là ngày văn thư
    đóng dấu — chính là ngày website hiển thị cho người dùng).
    """
    for field in _DATE_FIELDS:
        if field in item and isinstance(item[field], str):
            item[field] = _clean_date_value(item[field])

    # Fallback: vanThuNgayDongDau → ngayTraKetQua
    if not item.get("ngayTraKetQua") and item.get("vanThuNgayDongDau"):
        item["ngayTraKetQua"] = item["vanThuNgayDongDau"]

    return item


# ---------------------------------------------------------------------------
# RAM-aware batch INSERT helpers
# ---------------------------------------------------------------------------
def _get_free_ram_mb() -> int:
    """Đọc MemAvailable từ /proc/meminfo (Linux). Fallback 512 MB nếu lỗi."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024  # KiB → MiB
    except Exception:
        pass
    return 512


def _calc_batch_size(items: list, safety_factor: float = 0.25) -> int:
    """Tính batch size INSERT động.

    Ước tính từ 20 record đầu (serialized JSON) × overhead ×4,
    rồi chia vào RAM budget = free_ram × safety_factor.
    Clamp kết quả vào [50, 2000].
    """
    if not items:
        return 500
    sample = items[:20]
    avg_bytes = sum(len(_json.dumps(r, ensure_ascii=False).encode()) for r in sample) / len(sample)
    # ×4: Python dict + SQLAlchemy binding + PostgreSQL row buffer + safety
    size_per_record = avg_bytes * 4
    budget_bytes = _get_free_ram_mb() * 1024 * 1024 * safety_factor
    batch = int(budget_bytes / size_per_record) if size_per_record > 0 else 500
    return max(50, min(batch, 2000))


def _batched_insert(db, table, rows: list, batch_size: int) -> None:
    """INSERT theo batch để tránh OOM; flush sau mỗi batch để giải phóng bộ nhớ."""
    for i in range(0, len(rows), batch_size):
        db.execute(table.insert(), rows[i: i + batch_size])
        db.flush()


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
        # Bước 1: đăng nhập + fetch (đo thời gian kéo dữ liệu)
        t_fetch = _time.monotonic()
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

        # Làm sạch date fields ngay sau khi nhận về
        for item in items:
            _clean_record(item)
        fetch_sec = _time.monotonic() - t_fetch

        # Bước 4: TRUNCATE + bulk INSERT theo batch (đo thời gian xử lý / ghi DB)
        t_insert = _time.monotonic()
        synced_at = datetime.now(timezone.utc)
        tbl = model_class.__tablename__
        db.execute(text(f'TRUNCATE TABLE "{tbl}" RESTART IDENTITY'))
        if items:
            batch_size = _calc_batch_size(items)
            rows = [{"data": item} for item in items]
            _batched_insert(db, model_class.__table__, rows, batch_size)
        _upsert_sync_meta(db, tbl, synced_at, len(items),
                          fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert)
        _refresh_stats_materialized_views(
            db,
            "received",
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


def _sync_unified(
    unified_model,
    thu_tuc: int,
    is_done: bool,
) -> dict:
    """
    Hàm sync tổng quát cho cả đã xử lý và đang xử lý:
    - Fetch dữ liệu từ API remote
    - Làm sạch date fields ngay khi nhận về (_clean_record)
    - Ghi vào bảng gộp (da_xu_ly / dang_xu_ly) bằng bulk INSERT
    """
    trang_thai = "đã" if is_done else "đang"
    label = f"{'da' if is_done else 'dang'}_xu_ly (TT{thu_tuc})"

    base_url = os.environ.get("BASE_URL", "").rstrip("/")
    api_url = (
        f"{base_url}/api/services/app/dashBoard"
        "/Get_DanhSachHoSoXuLyTrucTuyen_ByThuTuc"
    )
    referer = f"{base_url}/lanhdaocuc/index"
    body = _dashboard_body(thu_tuc, is_done=is_done)

    db = SessionLocal()
    try:
        t_fetch = _time.monotonic()
        client = RemoteClient()
        client.login()
        resp = client.post_json(api_url, body, referer=referer)
        payload = resp.json()

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

        # Làm sạch date fields + đảm bảo thuTucId đúng
        for item in items:
            _clean_record(item)
            item["thuTucId"] = thu_tuc

        # Xóa dữ liệu cũ của thu_tuc này trong bảng gộp, sau đó bulk INSERT
        t_insert = _time.monotonic()
        synced_at = datetime.now(timezone.utc)
        unified_tbl = unified_model.__tablename__
        db.execute(
            text(f'DELETE FROM "{unified_tbl}" WHERE thu_tuc = :tt'),
            {"tt": thu_tuc},
        )
        if items:
            batch_size = _calc_batch_size(items)
            rows = [{"thu_tuc": thu_tuc, "data": item} for item in items]
            _batched_insert(db, unified_model.__table__, rows, batch_size)
        _upsert_sync_meta(db, unified_tbl, synced_at, len(items),
                          fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert)
        refresh_kinds = ["resolved" if is_done else "inflight", "case_facts"]
        if not is_done:
            refresh_kinds.append("workflow_cases")
        if is_done:
            refresh_kinds.extend(["resolved_facts", "treo_by_cv", "tt48_treo_by_loai"])
        _refresh_stats_materialized_views(db, *refresh_kinds)
        db.commit()

        inserted = len(items)
        _sync_log.info(
            f"[{label}] {trang_thai} xử lý: {inserted}/{total} records"
        )
        return {
            "ok":             True,
            "dataset":        label,
            "inserted":       inserted,
            "total_from_api": total,
            "synced_at":      synced_at.isoformat(),
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


# ---------------------------------------------------------------------------
# 5. POST /sync/tt48-da-xu-ly  → da_xu_ly (thu_tuc=48) + tt48_da_xu_ly
# ---------------------------------------------------------------------------
@app.post("/sync/tt48-da-xu-ly")
def sync_tt48_da_xu_ly():
    return _sync_unified(DaXuLy, thu_tuc=48, is_done=True)


# ---------------------------------------------------------------------------
# 6. POST /sync/tt48-dang-xu-ly  → dang_xu_ly (thu_tuc=48)
# ---------------------------------------------------------------------------
@app.post("/sync/tt48-dang-xu-ly")
def sync_tt48_dang_xu_ly():
    return _sync_unified(DangXuLy, thu_tuc=48, is_done=False)


# ---------------------------------------------------------------------------
# 7. POST /sync/tt47-da-xu-ly  → da_xu_ly (thu_tuc=47)
# ---------------------------------------------------------------------------
@app.post("/sync/tt47-da-xu-ly")
def sync_tt47_da_xu_ly():
    return _sync_unified(DaXuLy, thu_tuc=47, is_done=True)


# ---------------------------------------------------------------------------
# 8. POST /sync/tt47-dang-xu-ly  → dang_xu_ly (thu_tuc=47)
# ---------------------------------------------------------------------------
@app.post("/sync/tt47-dang-xu-ly")
def sync_tt47_dang_xu_ly():
    return _sync_unified(DangXuLy, thu_tuc=47, is_done=False)


# ---------------------------------------------------------------------------
# 9. POST /sync/tt46-da-xu-ly  → da_xu_ly (thu_tuc=46)
# ---------------------------------------------------------------------------
@app.post("/sync/tt46-da-xu-ly")
def sync_tt46_da_xu_ly():
    return _sync_unified(DaXuLy, thu_tuc=46, is_done=True)


# ---------------------------------------------------------------------------
# 10. POST /sync/tt46-dang-xu-ly  → dang_xu_ly (thu_tuc=46)
# ---------------------------------------------------------------------------
@app.post("/sync/tt46-dang-xu-ly")
def sync_tt46_dang_xu_ly():
    return _sync_unified(DangXuLy, thu_tuc=46, is_done=False)


# ---------------------------------------------------------------------------
# Helper: fetch TẤT CẢ bản ghi từ ABP paging API (tự động phân trang)
# Dùng maxResultCount lớn để lấy 1 lần; nếu totalCount > count thì lặp thêm.
# ---------------------------------------------------------------------------
def _fetch_all_paged(client, api_url: str, body: dict, referer: str | None = None) -> list[dict]:
    """
    Gọi ABP paging API với body đã cho, lấy toàn bộ bản ghi (phân trang nếu cần).
    Trả về list[dict] — danh sách record thô từ API.
    """
    PAGE_SIZE = 5000
    body = {**body, "skipCount": 0, "maxResultCount": PAGE_SIZE, "pageSize": PAGE_SIZE, "page": 1}
    resp = client.post_json(api_url, body, referer=referer)
    payload = resp.json()
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
    # Phân trang thêm nếu cần
    while len(items) < total:
        body = {**body, "skipCount": len(items)}
        resp = client.post_json(api_url, body, referer=referer)
        pl = resp.json()
        res = pl.get("result", pl)
        chunk = res.get("items", res.get("data", [])) if isinstance(res, dict) else res
        if not chunk:
            break
        items.extend(chunk)
    return items


# ---------------------------------------------------------------------------
# 11. POST /sync/tt48-cv-buoc
#     Fetch 3 API phụ (formCase 2/3/5) → classify → lưu vào tt48_cv_buoc
#     Mỗi record chỉ lưu (ma_ho_so, buoc) — tối giản bộ nhớ
# ---------------------------------------------------------------------------
def _sync_tt48_cv_buoc_inner() -> dict:
    """
    Core logic sync tt48_cv_buoc — dùng chung cho endpoint và scheduler.

    Luồng xử lý hồ sơ TT48 ở bước Chuyên viên có 4 sub-bước:
      (a) formCase=2: Đã phân công, chưa xử lý         → buoc = "chua_xu_ly"
      (b) formCase=3: Đang xử lý — classify theo strDonViGui/strDonViXuLy:
          - strDonViGui in (Tổ trưởng chuyên gia, Trưởng phòng) + strDonViXuLy = Chuyên viên thẩm định
            → buoc = "bi_tra_lai"
          - strDonViGui = Chuyên gia + strDonViXuLy = Chuyên viên thẩm định
            → buoc = "cho_tong_hop"
      (c) formCase=5 (formId=4): Đạt, chờ kết thúc     → buoc = "cho_ket_thuc"
    """
    base_url = os.environ.get("BASE_URL", "").rstrip("/")
    api_url  = f"{base_url}/api/services/app/xuLyHoSoGridView48/GetListHoSoPaging"
    referer  = f"{base_url}/Application"

    # Body chung cho cả 3 table
    _common = {
        "keyword": None, "ngayGuiTu": None, "ngayGuiToi": None,
        "loaiHoSoId": 50, "tinhId": None, "doanhNghiepId": None,
        "phongBanId": 5, "ngayNopTu": None, "ngayNopToi": None,
        "sorting": None,
    }

    db = SessionLocal()
    try:
        t0 = _time.monotonic()
        client = RemoteClient()
        client.login()

        buoc_rows: dict[str, str] = {}  # ma_ho_so → buoc

        # ----- (a) Đã phân công, chưa xử lý -----
        body_a = {**_common, "formId": 21, "formCase": 2, "formCase2": 0}
        items_a = _fetch_all_paged(client, api_url, body_a, referer=referer)
        for item in items_a:
            ma = item.get("maHoSo") or item.get("strSoHieuHoSo") or ""
            if ma:
                buoc_rows[ma] = "chua_xu_ly"
        _sync_log.info(f"[tt48_cv_buoc] (a) chua_xu_ly: {len(items_a)} records")

        # ----- (b) Đang xử lý — classify theo strDonViGui/strDonViXuLy -----
        body_b = {**_common, "formId": 21, "formCase": 3, "formCase2": 0}
        items_b = _fetch_all_paged(client, api_url, body_b, referer=referer)
        cnt_bi_tra = 0
        cnt_cho_th = 0
        for item in items_b:
            ma          = item.get("maHoSo") or item.get("strSoHieuHoSo") or ""
            don_vi_gui  = (item.get("strDonViGui")  or "").strip()
            don_vi_xuly = (item.get("strDonViXuLy") or "").strip()
            if not ma:
                continue
            if don_vi_xuly == "Chuyên viên thẩm định":
                if don_vi_gui in ("Tổ trưởng chuyên gia", "Trưởng phòng"):
                    buoc_rows[ma] = "bi_tra_lai"
                    cnt_bi_tra += 1
                elif don_vi_gui == "Chuyên gia":
                    buoc_rows[ma] = "cho_tong_hop"
                    cnt_cho_th += 1
        _sync_log.info(
            f"[tt48_cv_buoc] (b) dang_xu_ly {len(items_b)} records → "
            f"bi_tra_lai={cnt_bi_tra}, cho_tong_hop={cnt_cho_th}"
        )

        # ----- (c) Đạt, chờ kết thúc -----
        body_c = {**_common, "formId": 4, "formCase": 5}
        items_c = _fetch_all_paged(client, api_url, body_c, referer=referer)
        for item in items_c:
            ma = item.get("maHoSo") or item.get("strSoHieuHoSo") or ""
            if ma:
                buoc_rows[ma] = "cho_ket_thuc"
        _sync_log.info(f"[tt48_cv_buoc] (c) cho_ket_thuc: {len(items_c)} records")

        # ----- Ghi DB -----
        t_insert = _time.monotonic()
        synced_at = datetime.now(timezone.utc)
        db.execute(text('TRUNCATE TABLE "tt48_cv_buoc" RESTART IDENTITY'))
        if buoc_rows:
            db.execute(
                Tt48CvBuoc.__table__.insert(),
                [{"ma_ho_so": k, "buoc": v} for k, v in buoc_rows.items()],
            )
        fetch_sec = t_insert - t0
        _upsert_sync_meta(
            db, "tt48_cv_buoc", synced_at, len(buoc_rows),
            fetch_sec=fetch_sec, insert_sec=_time.monotonic() - t_insert,
        )
        _refresh_stats_materialized_views(db, "workflow_cases")
        db.commit()
        _sync_log.info(
            f"[tt48_cv_buoc] Tổng: {len(buoc_rows)} records → DB | "
            f"fetch={fetch_sec:.1f}s"
        )
        return {
            "ok": True,
            "dataset": "tt48_cv_buoc",
            "inserted": len(buoc_rows),
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


@app.post("/sync/tt48-cv-buoc")
def sync_tt48_cv_buoc():
    return _sync_tt48_cv_buoc_inner()


# ---------------------------------------------------------------------------
# _run_sync_all_job — hàm core: chạy 7 dataset, log từng bước
# Dùng chung cho cả scheduler (tự động) và endpoint /sync/all (thủ công)
#
# triggered_by : "scheduler" | "manual" — hiển thị trong log để phân biệt
# Trả về dict {"ok", "results", "errors", "run_id"}
# ---------------------------------------------------------------------------
def _run_sync_all_job(triggered_by: str = "scheduler") -> dict:
    # Ngăn nhiều phiên sync chạy đồng thời — tránh tốn RAM nhân đôi
    if not _sync_lock.acquire(blocking=False):
        _sync_log.warning(
            f"[SKIP] Sync đang chạy — bỏ qua lần kích hoạt này "
            f"(triggered_by={triggered_by})"
        )
        return {"ok": False, "skipped": True, "reason": "Sync đang chạy, bỏ qua"}

    try:
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
                "tt48_cv_buoc",
                sync_tt48_cv_buoc,
                f"{base_url}/api/services/app/xuLyHoSoGridView48/GetListHoSoPaging"
                " [formCase 2/3/5]",
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

    finally:
        _sync_lock.release()


# ---------------------------------------------------------------------------
# 11. POST /sync/all — gọi thủ công đồng bộ (blocking, giữ nguyên để compat)
# ---------------------------------------------------------------------------
@app.post("/sync/all")
def sync_all():
    return _run_sync_all_job(triggered_by="manual")


# ---------------------------------------------------------------------------
# 11b. POST /internal/sync/all/async — kích hoạt sync ngay trong background, trả về ngay
# Dùng APScheduler để trigger 1 lần tức thì → không block HTTP request
# ---------------------------------------------------------------------------
@app.post("/internal/sync/all/async")
def sync_all_async():
    # Kiểm tra sớm để trả ngay về nếu sync đang bận (lock đang bị hold)
    already_running = not _sync_lock.acquire(blocking=False)
    if not already_running:
        _sync_lock.release()  # release ngay — lock thực sự sẽ được giữ bởi job
    if already_running:
        _sync_log.warning("SYNC/ALL ASYNC bị từ chối — sync đang chạy")
        return {
            "ok": False,
            "running": True,
            "message": "Sync đang chạy. Vui lòng đợi kết thúc rồi thử lại.",
        }
    _scheduler.add_job(
        _run_sync_all_job,
        trigger="date",
        run_date=datetime.now(timezone.utc),
        id="manual_sync_now",
        replace_existing=True,
        kwargs={"triggered_by": "manual"},
        misfire_grace_time=60,
    )
    _sync_log.info("SYNC/ALL ASYNC được kích hoạt thủ công — chạy trong background")
    return {
        "ok": True,
        "message": "Sync đã bắt đầu chạy trong background. Xem log để theo dõi tiến trình.",
    }


# ---------------------------------------------------------------------------
# GET /internal/logs/sync — xem N dòng cuối của file log sync (mặc định 100)
# Query param: lines=200 để xem nhiều hơn
# ---------------------------------------------------------------------------
@app.get("/internal/logs/sync")
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
# GET /internal/logs/db-stats — thống kê kích thước log file + DB log table
# ---------------------------------------------------------------------------
@app.get("/internal/logs/db-stats")
def logs_db_stats():
    """
    Trả về:
      - Kích thước từng file log trên disk (sync.log + các bản backup)
      - Số dòng trong bảng remote_fetch_logs (+ oldest/newest record)
      - Giới hạn giữ lại hiện tại (_PRUNE_KEEP_ROWS)
    """
    # --- File log stats ---
    file_stats = []
    for path in sorted(_LOG_DIR.glob("sync.log*")):
        size_bytes = path.stat().st_size
        file_stats.append({
            "file": path.name,
            "size_bytes": size_bytes,
            "size_kb": round(size_bytes / 1024, 1),
        })

    # --- DB log stats ---
    db = SessionLocal()
    try:
        db_count = db.query(RemoteFetchLog).count()
        oldest = (
            db.query(RemoteFetchLog.created_at)
            .order_by(RemoteFetchLog.created_at.asc())
            .limit(1)
            .scalar()
        )
        newest = (
            db.query(RemoteFetchLog.created_at)
            .order_by(RemoteFetchLog.created_at.desc())
            .limit(1)
            .scalar()
        )
    finally:
        db.close()

    return {
        "ok": True,
        "log_files": file_stats,
        "log_files_total_kb": round(sum(f["size_bytes"] for f in file_stats) / 1024, 1),
        "db_remote_fetch_logs": {
            "row_count": db_count,
            "keep_limit": _PRUNE_KEEP_ROWS,
            "over_limit": max(0, db_count - _PRUNE_KEEP_ROWS),
            "oldest_record": oldest.isoformat() if oldest else None,
            "newest_record": newest.isoformat() if newest else None,
        },
        "note": (
            "Log file: RotatingFileHandler 5×10 MB = tối đa 50 MB. "
            f"DB table: prune tự động mỗi 24h, giữ tối đa {_PRUNE_KEEP_ROWS} dòng."
        ),
    }


# ---------------------------------------------------------------------------
# POST /internal/logs/prune — xoá thủ công log DB (keep_rows tùy chọn)
# ---------------------------------------------------------------------------
@app.post("/internal/logs/prune")
def internal_logs_prune(
    keep_rows: int = Query(default=_PRUNE_KEEP_ROWS, ge=100, le=100_000),
    token: str = Query(default=""),
):
    """
    Xoá thủ công các bản ghi cũ trong remote_fetch_logs.
    Yêu cầu token = ADMIN_EXPORT_TOKEN (query param hoặc header X-Admin-Token).
    """
    import os
    expected = os.environ.get("ADMIN_EXPORT_TOKEN", "")
    if not expected or token != expected:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Token không hợp lệ")

    result = _prune_remote_fetch_logs(keep_rows=keep_rows)
    return {"ok": True, **result}


# ---------------------------------------------------------------------------
# GET /internal/scheduler — trả về interval hiện tại
# POST /internal/scheduler — thay đổi interval (body JSON: {"hours": N})
# Chỉ dùng nội bộ phía sau api-server sau khi xác thực token
# ---------------------------------------------------------------------------
@app.get("/internal/scheduler")
def internal_scheduler_get():
    global _sync_interval_hours
    job = _scheduler.get_job("sync_all_3h")
    next_run = None
    if job and job.next_run_time:
        next_run = job.next_run_time.isoformat()
    return {
        "ok": True,
        "interval_hours": _sync_interval_hours,
        "next_run": next_run,
    }


@app.post("/internal/scheduler")
def internal_scheduler_set(payload: dict):
    global _sync_interval_hours
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

    _sync_interval_hours = hours
    _scheduler.reschedule_job(
        "sync_all_3h",
        trigger="interval",
        hours=hours,
    )
    job = _scheduler.get_job("sync_all_3h")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    _sync_log.info(f"SCHEDULER cập nhật: interval={hours}h, next_run={next_run}")
    return {
        "ok": True,
        "interval_hours": hours,
        "next_run": next_run,
    }


# ---------------------------------------------------------------------------
# Chạy trực tiếp: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

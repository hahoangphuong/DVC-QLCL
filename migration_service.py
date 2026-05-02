from sqlalchemy import text

from country_classification import (
    HT2_ALPHA2_CODES,
    build_country_name_to_alpha2_case,
    build_nuoc_so_tai_expr,
)
from stats_views import STATS_MATERIALIZED_VIEWS
from sync_utils import extract_tra_cuu_chung_facility_fields


DATA_TABLES = [
    "tra_cuu_chung",
    "dang_xu_ly",
    "da_xu_ly",
]


def _backfill_tra_cuu_chung_facilities(conn):
    result = conn.execute(text("SELECT id, data FROM tra_cuu_chung"))
    updates = []
    for row in result.mappings():
        data = row.get("data")
        if not isinstance(data, dict):
            continue
        updates.append({
            "id": row["id"],
            **extract_tra_cuu_chung_facility_fields(data),
        })
        if len(updates) >= 1000:
            conn.execute(
                text(
                    "UPDATE tra_cuu_chung "
                    "SET co_so_dang_ky = :co_so_dang_ky, "
                    "co_so_san_xuat = :co_so_san_xuat "
                    "WHERE id = :id"
                ),
                updates,
            )
            updates.clear()

    if updates:
        conn.execute(
            text(
                "UPDATE tra_cuu_chung "
                "SET co_so_dang_ky = :co_so_dang_ky, "
                "co_so_san_xuat = :co_so_san_xuat "
                "WHERE id = :id"
            ),
            updates,
        )


def migrate_schema(engine):
    with engine.begin() as conn:
        for table_name in DATA_TABLES:
            conn.execute(text(
                f'ALTER TABLE IF EXISTS "{table_name}" DROP COLUMN IF EXISTS synced_at'
            ))

        conn.execute(text(
            "ALTER TABLE IF EXISTS sync_meta "
            "ADD COLUMN IF NOT EXISTS fetch_sec FLOAT"
        ))
        conn.execute(text(
            "ALTER TABLE IF EXISTS sync_meta "
            "ADD COLUMN IF NOT EXISTS insert_sec FLOAT"
        ))
        conn.execute(text(
            "ALTER TABLE IF EXISTS tra_cuu_chung "
            "ADD COLUMN IF NOT EXISTS co_so_dang_ky TEXT"
        ))
        conn.execute(text(
            "ALTER TABLE IF EXISTS tra_cuu_chung "
            "ADD COLUMN IF NOT EXISTS co_so_san_xuat TEXT"
        ))
        _backfill_tra_cuu_chung_facilities(conn)

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
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tcc_co_so_dang_ky "
            "ON tra_cuu_chung (co_so_dang_ky)"
        ))

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_ngay_tra "
            "ON da_xu_ly ((data->>'ngayTraKetQua'))"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_dxl_trang_thai "
            "ON da_xu_ly ((data->>'trangThaiHoSo'))"
        ))
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
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tt48_buoc "
            "ON tt48_cv_buoc (buoc)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tt47_46_dxly_status_thu_tuc "
            "ON tt47_46_dang_xu_ly_status (thu_tuc)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tt47_46_dxly_status_trang_thai "
            "ON tt47_46_dang_xu_ly_status (thu_tuc, trang_thai_xu_ly)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tt47_46_cho_tham_dinh_thu_tuc "
            "ON tt47_46_cho_tham_dinh (thu_tuc)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_tt47_46_cho_tham_dinh_cv "
            "ON tt47_46_cho_tham_dinh (thu_tuc, chuyen_vien_thu_ly)"
        ))


def migrate_stats_schema(engine):
    with engine.begin() as conn:
        for view_name in (
            STATS_MATERIALIZED_VIEWS["resolved_lookup"],
            STATS_MATERIALIZED_VIEWS["pending_lookup"],
            STATS_MATERIALIZED_VIEWS["tt48_treo_by_loai"],
            STATS_MATERIALIZED_VIEWS["treo_by_cv"],
            STATS_MATERIALIZED_VIEWS["workflow_cases"],
            STATS_MATERIALIZED_VIEWS["case_facts"],
            STATS_MATERIALIZED_VIEWS["inflight"],
            STATS_MATERIALIZED_VIEWS["resolved_facts"],
            STATS_MATERIALIZED_VIEWS["resolved"],
            STATS_MATERIALIZED_VIEWS["received_bounds"],
            STATS_MATERIALIZED_VIEWS["tt48_received_by_loai"],
            STATS_MATERIALIZED_VIEWS["received"],
        ):
            conn.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {view_name} CASCADE"))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["received"]} AS
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
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["tt48_received_by_loai"]} AS
            SELECT
                EXTRACT(YEAR  FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
                EXTRACT(MONTH FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
                data->>'loaiHoSo' AS loai_ho_so,
                COUNT(*)::bigint AS cnt
            FROM tra_cuu_chung
            WHERE NULLIF(data->>'thuTucId', '')::int = 48
              AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
              AND data->>'loaiHoSo' IN ('A', 'B', 'C', 'D')
            GROUP BY 1, 2, 3
        """))
        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["received_bounds"]} AS
            SELECT
                (data->>'thuTucId')::int AS thu_tuc,
                MIN((data->>'ngayTiepNhan')::timestamptz) AS earliest_ngay_nhan
            FROM tra_cuu_chung
            WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
              AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
            GROUP BY 1
        """))
        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["resolved"]} AS
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
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["resolved_facts"]} AS
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
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["inflight"]} AS
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
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['received']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['received']} (thu_tuc, yr, mo)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['tt48_received_by_loai']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['tt48_received_by_loai']} (yr, mo, loai_ho_so)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['received_bounds']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['received_bounds']} (thu_tuc)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['resolved']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['resolved']} (thu_tuc, yr, mo)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['resolved_facts']}_ngay_tra "
            f"ON {STATS_MATERIALIZED_VIEWS['resolved_facts']} (thu_tuc, ngay_tra)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['resolved_facts']}_ma_ho_so "
            f"ON {STATS_MATERIALIZED_VIEWS['resolved_facts']} (thu_tuc, ma_ho_so, ngay_nhan)"
        ))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['inflight']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['inflight']} (thu_tuc, yr, mo)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["case_facts"]} AS
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
                NULLIF(TRIM(t.data->>'chuyenGiaName'), '') AS chuyen_gia_name,
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
                COALESCE(ctry.country_alpha2_id, ctry.country_alpha2_name) AS country_alpha2,
                CASE
                    WHEN COALESCE(ctry.country_alpha2_id, ctry.country_alpha2_name) IN ({", ".join(f"'{code}'" for code in HT2_ALPHA2_CODES)})
                    THEN 2
                    ELSE 1
                END AS hinh_thuc_danh_gia,
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
            LEFT JOIN LATERAL (
                SELECT
                    {build_country_name_to_alpha2_case(build_nuoc_so_tai_expr("t.data"))} AS country_alpha2_name,
                    NULLIF(
                        UPPER(
                            SUBSTRING(
                                REGEXP_REPLACE(COALESCE(t.data->>'idCongTy', ''), '<[^>]+>', '', 'g')
                                FROM '([A-Z]{{2}})-\\d{{3}}'
                            )
                        ),
                        ''
                    ) AS country_alpha2_id
            ) ctry ON TRUE
            WHERE NULLIF(t.data->>'thuTucId', '') IS NOT NULL
        """))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, tcc_id)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_ngay_nhan "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, ngay_nhan)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_ngay_tra "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, ngay_tra)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_cv "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, cv_name_raw)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_chuyen_gia "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, chuyen_gia_name)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_loai_submit "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, loai_ho_so, submission_kind)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_hinh_thuc "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, hinh_thuc_danh_gia, loai_ho_so, submission_kind)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['case_facts']}_active "
            f"ON {STATS_MATERIALIZED_VIEWS['case_facts']} (thu_tuc, is_active, ngay_nhan)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["workflow_cases"]} AS
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
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['workflow_cases']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, ma_ho_so, don_vi, cv_name)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['workflow_cases']}_cv "
            f"ON {STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, cv_name)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['workflow_cases']}_don_vi "
            f"ON {STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, don_vi)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['workflow_cases']}_qua_han "
            f"ON {STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, qua_han_ngay)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['workflow_cases']}_nguoi_xu_ly "
            f"ON {STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, nguoi_xu_ly)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['workflow_cases']}_buoc "
            f"ON {STATS_MATERIALIZED_VIEWS['workflow_cases']} (thu_tuc, buoc)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["pending_lookup"]} AS
            WITH latest_case_facts AS (
                SELECT DISTINCT ON (thu_tuc, ma_ho_so)
                    thu_tuc,
                    ma_ho_so,
                    loai_ho_so,
                    submission_kind,
                    ngay_nhan,
                    nhan_hen_tra,
                    chuyen_gia_name
                FROM {STATS_MATERIALIZED_VIEWS["case_facts"]}
                ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC NULLS LAST
            ),
            latest_workflow_experts AS (
                SELECT DISTINCT ON (thu_tuc, ma_ho_so)
                    thu_tuc,
                    ma_ho_so,
                    REGEXP_REPLACE(TRIM(nguoi_xu_ly), '^CG\\s*:\\s*', '', 'i') AS chuyen_gia_name
                FROM {STATS_MATERIALIZED_VIEWS["workflow_cases"]}
                WHERE don_vi = 'Chuyên gia thẩm định'
                  AND NULLIF(TRIM(nguoi_xu_ly), '') IS NOT NULL
                ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC NULLS LAST
            ),
            latest_tcc_roles AS (
                SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'maHoSo')
                    (data->>'thuTucId')::int AS thu_tuc,
                    data->>'maHoSo' AS ma_ho_so,
                    CASE
                        WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz
                        ELSE NULL
                    END AS ngay_tiep_nhan,
                    NULLIF(TRIM(data->>'trangThaiHoSo'), '') AS trang_thai_ho_so,
                    NULLIF(TRIM(data->>'chuyenVienThuLyName'), '') AS cv_thu_ly_name,
                    NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name
                FROM tra_cuu_chung
                WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
                ORDER BY
                    (data->>'thuTucId')::int,
                    data->>'maHoSo',
                    CASE WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz END DESC NULLS LAST,
                    NULLIF(TRIM(data->>'id'), '') DESC NULLS LAST
            ),
            workflow_rows AS (
                SELECT
                    w.thu_tuc,
                    w.ma_ho_so,
                    w.ngay_nhan AS ngay_tiep_nhan,
                    cf.nhan_hen_tra AS ngay_hen_tra,
                    cf.loai_ho_so,
                    cf.submission_kind,
                    CASE
                        WHEN w.cv_name = '__CHUA_PHAN__' THEN 'cho_phan_cong'
                        WHEN w.thu_tuc IN (46, 47)
                          AND w.don_vi = 'Chuyên viên phối hợp thẩm định'
                        THEN CASE
                          WHEN dxs.trang_thai_xu_ly = 30 THEN 'cho_ke_hoach'
                          WHEN dxs.trang_thai_xu_ly = 40 THEN 'cho_bao_cao'
                          ELSE 'dang_xu_ly'
                        END
                        WHEN w.thu_tuc IN (46, 47)
                          AND w.don_vi = 'Chuyên viên'
                          AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
                        THEN CASE
                          WHEN ctd.ma_ho_so IS NOT NULL THEN 'cho_tham_dinh'
                          ELSE 'cho_quyet_dinh'
                        END
                        WHEN w.thu_tuc = 48 AND w.buoc = 'chua_xu_ly' THEN 'chua_xu_ly'
                        WHEN w.thu_tuc = 48 AND w.buoc = 'bi_tra_lai' THEN 'bi_tra_lai'
                        WHEN w.thu_tuc = 48 AND w.buoc = 'cho_tong_hop' THEN 'cho_tong_hop'
                        WHEN w.don_vi = 'Chuyên gia thẩm định' THEN 'cho_chuyen_gia'
                        WHEN w.don_vi = 'Tổ trưởng chuyên gia' THEN 'cho_to_truong'
                        WHEN w.don_vi = 'Trưởng phòng' THEN 'cho_truong_phong'
                        WHEN w.don_vi LIKE 'Văn thư%' THEN 'cho_van_thu'
                        WHEN w.buoc = 'cho_ket_thuc' OR w.don_vi = 'Phó Cục trưởng' THEN 'cho_cong_bo'
                        WHEN w.buoc IN ('chua_xu_ly', 'bi_tra_lai', 'cho_tong_hop') OR w.don_vi IN ('Chuyên viên')
                        THEN 'cho_chuyen_vien'
                        ELSE 'cho_chuyen_vien'
                    END AS tinh_trang,
                    CASE
                        WHEN w.cv_name = '__CHUA_PHAN__' THEN NULL
                        WHEN w.thu_tuc IN (46, 47)
                          AND w.don_vi = 'Chuyên viên phối hợp thẩm định'
                        THEN COALESCE(
                            NULLIF(TRIM(w.nguoi_xu_ly), ''),
                            CASE
                                WHEN NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL THEN NULL
                                ELSE REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(phối hợp|thụ lý)\\s*:\\s*', '', 'i')
                            END,
                            NULLIF(TRIM(w.cv_name), '')
                        )
                        WHEN w.thu_tuc IN (46, 47)
                          AND w.don_vi = 'Chuyên viên'
                          AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
                        THEN COALESCE(
                            CASE
                                WHEN NULLIF(TRIM(roles.cv_thu_ly_name), '') IS NULL THEN NULL
                                ELSE REGEXP_REPLACE(TRIM(roles.cv_thu_ly_name), '^CV\\s*(phối hợp|thụ lý)\\s*:\\s*', '', 'i')
                            END,
                            NULLIF(TRIM(w.cv_name), '')
                        )
                        WHEN NULLIF(TRIM(w.cv_name), '') IS NULL OR w.cv_name = '__CHUA_PHAN__' THEN NULL
                        ELSE TRIM(w.cv_name)
                    END AS chuyen_vien,
                    CASE
                        WHEN w.cv_name = '__CHUA_PHAN__' THEN NULL
                        WHEN NULLIF(TRIM(cf.chuyen_gia_name), '') IS NOT NULL THEN REGEXP_REPLACE(TRIM(cf.chuyen_gia_name), '^CG\\s*:\\s*', '', 'i')
                        WHEN NULLIF(TRIM(we.chuyen_gia_name), '') IS NOT NULL THEN we.chuyen_gia_name
                        ELSE NULL
                    END AS chuyen_gia,
                    COALESCE(w.qua_han_ngay, 0) AS qua_han_ngay,
                    COALESCE(
                        CASE
                            WHEN COALESCE(w.qua_han_ngay, 0) > 0 THEN w.qua_han_ngay
                            ELSE GREATEST(
                                0,
                                CURRENT_DATE - ((w.ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
                            )::int
                        END,
                        0
                    ) AS thoi_gian_cho_ngay
                FROM {STATS_MATERIALIZED_VIEWS["workflow_cases"]} w
                LEFT JOIN latest_case_facts cf
                  ON cf.thu_tuc = w.thu_tuc
                 AND cf.ma_ho_so = w.ma_ho_so
                LEFT JOIN latest_tcc_roles roles
                  ON roles.thu_tuc = w.thu_tuc
                 AND roles.ma_ho_so = w.ma_ho_so
                LEFT JOIN latest_workflow_experts we
                  ON we.thu_tuc = w.thu_tuc
                 AND we.ma_ho_so = w.ma_ho_so
                LEFT JOIN tt47_46_dang_xu_ly_status dxs
                  ON dxs.thu_tuc = w.thu_tuc
                 AND dxs.ma_ho_so = w.ma_ho_so
                LEFT JOIN tt47_46_cho_tham_dinh ctd
                  ON ctd.thu_tuc = w.thu_tuc
                 AND ctd.ma_ho_so = w.ma_ho_so
            ),
            capa_base AS (
                SELECT
                    roles.thu_tuc,
                    roles.ma_ho_so,
                    COALESCE(cf.ngay_nhan, roles.ngay_tiep_nhan) AS ngay_tiep_nhan,
                    cf.nhan_hen_tra AS ngay_hen_tra,
                    cf.loai_ho_so,
                    cf.submission_kind,
                    CASE
                        WHEN roles.trang_thai_ho_so = '210' THEN 'cho_nop_capa'
                        WHEN roles.trang_thai_ho_so = '220' THEN 'cho_danh_gia_capa'
                        ELSE 'cho_chuyen_vien'
                    END AS tinh_trang,
                    REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(phối hợp|thụ lý)\\s*:\\s*', '', 'i') AS chuyen_vien,
                    NULL::text AS chuyen_gia,
                    CASE
                        WHEN cf.nhan_hen_tra IS NOT NULL THEN (CURRENT_DATE - ((cf.nhan_hen_tra AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::int
                        ELSE 0
                    END AS qua_han_ngay,
                    CASE
                        WHEN cf.nhan_hen_tra IS NOT NULL THEN (CURRENT_DATE - ((cf.nhan_hen_tra AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::int
                        WHEN COALESCE(cf.ngay_nhan, roles.ngay_tiep_nhan) IS NOT NULL THEN GREATEST(
                            0,
                            CURRENT_DATE - ((COALESCE(cf.ngay_nhan, roles.ngay_tiep_nhan) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
                        )::int
                        ELSE 0
                    END AS thoi_gian_cho_ngay
                FROM latest_tcc_roles roles
                LEFT JOIN latest_case_facts cf
                  ON cf.thu_tuc = roles.thu_tuc
                 AND cf.ma_ho_so = roles.ma_ho_so
                WHERE roles.thu_tuc IN (46, 47)
                  AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NOT NULL
                  AND roles.trang_thai_ho_so IN ('210', '220')
            )
            SELECT *
            FROM workflow_rows
            WHERE NOT (
                thu_tuc IN (46, 47)
                AND ma_ho_so IN (SELECT ma_ho_so FROM capa_base WHERE thu_tuc = workflow_rows.thu_tuc)
            )
            UNION ALL
            SELECT *
            FROM capa_base
        """))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['pending_lookup']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['pending_lookup']} (thu_tuc, ma_ho_so)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['pending_lookup']}_filters "
            f"ON {STATS_MATERIALIZED_VIEWS['pending_lookup']} (thu_tuc, tinh_trang, chuyen_vien, chuyen_gia)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['pending_lookup']}_ma_ho_so "
            f"ON {STATS_MATERIALIZED_VIEWS['pending_lookup']} (thu_tuc, ma_ho_so)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["resolved_lookup"]} AS
            WITH latest_case_facts AS (
                SELECT DISTINCT ON (thu_tuc, luot_xu_ly_id)
                    thu_tuc,
                    COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) AS luot_xu_ly_id,
                    ma_ho_so,
                    tcc_id,
                    ngay_nhan AS ngay_tiep_nhan,
                    ngay_tra AS ngay_hen_tra,
                    loai_ho_so,
                    submission_kind,
                    CASE
                        WHEN trang_thai = '4' THEN 'can_bo_sung'
                        WHEN trang_thai = '7' THEN 'khong_dat'
                        WHEN trang_thai = '6' THEN 'da_hoan_thanh'
                        ELSE NULL
                    END AS tinh_trang,
                    cv_name_raw,
                    chuyen_gia_name,
                    GREATEST(
                        0,
                        ((COALESCE(ngay_tra, ngay_nhan) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
                    )::int AS thoi_gian_cho_ngay
                FROM {STATS_MATERIALIZED_VIEWS["case_facts"]}
                WHERE trang_thai IN ('4', '6', '7')
                  AND COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) IS NOT NULL
                ORDER BY thu_tuc, luot_xu_ly_id, ngay_tra DESC NULLS LAST, ngay_nhan DESC NULLS LAST
            ),
            latest_tcc_roles AS (
                SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'maHoSo')
                    (data->>'thuTucId')::int AS thu_tuc,
                    data->>'maHoSo' AS ma_ho_so,
                    NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name
                FROM tra_cuu_chung
                WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
                ORDER BY
                    (data->>'thuTucId')::int,
                    data->>'maHoSo',
                    CASE WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz END DESC NULLS LAST,
                    NULLIF(TRIM(data->>'id'), '') DESC NULLS LAST
            ),
            latest_da_xu_ly AS (
                SELECT DISTINCT ON (thu_tuc, NULLIF(TRIM(data->>'id'), ''))
                    thu_tuc,
                    NULLIF(TRIM(data->>'id'), '') AS luot_xu_ly_id,
                    NULLIF(TRIM(data->>'nguoiXuLy'), '') AS nguoi_xu_ly,
                    NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name,
                    NULLIF(TRIM(data->>'chuyenVienXuLyName'), '') AS cv_xu_ly_name
                FROM da_xu_ly
                WHERE NULLIF(TRIM(data->>'id'), '') IS NOT NULL
                ORDER BY
                    thu_tuc,
                    NULLIF(TRIM(data->>'id'), ''),
                    CASE WHEN NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL THEN (data->>'ngayTraKetQua')::timestamptz END DESC NULLS LAST,
                    CASE WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz END DESC NULLS LAST
            )
            SELECT
                l.luot_xu_ly_id AS lookup_id,
                l.thu_tuc,
                l.ma_ho_so,
                l.ngay_tiep_nhan,
                l.ngay_hen_tra,
                l.loai_ho_so,
                l.submission_kind,
                l.tinh_trang,
                CASE
                    WHEN l.thu_tuc IN (46, 47) THEN COALESCE(
                        CASE
                            WHEN NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL THEN NULL
                            ELSE REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(phối hợp|thụ lý)\\s*:\\s*', '', 'i')
                        END,
                        d.nguoi_xu_ly,
                        d.cv_phoi_hop_name,
                        d.cv_xu_ly_name
                    )
                    WHEN NULLIF(TRIM(l.cv_name_raw), '') IS NULL OR l.cv_name_raw = '__CHUA_PHAN__' THEN NULL
                    ELSE TRIM(l.cv_name_raw)
                END AS chuyen_vien,
                CASE
                    WHEN NULLIF(TRIM(l.chuyen_gia_name), '') IS NULL THEN NULL
                    ELSE REGEXP_REPLACE(TRIM(l.chuyen_gia_name), '^CG\\s*:\\s*', '', 'i')
                END AS chuyen_gia,
                l.thoi_gian_cho_ngay
            FROM latest_case_facts l
            LEFT JOIN latest_tcc_roles roles
              ON roles.thu_tuc = l.thu_tuc
             AND roles.ma_ho_so = l.ma_ho_so
            LEFT JOIN latest_da_xu_ly d
              ON d.thu_tuc = l.thu_tuc
             AND d.luot_xu_ly_id = l.luot_xu_ly_id
        """))
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['resolved_lookup']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['resolved_lookup']} (thu_tuc, lookup_id)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['resolved_lookup']}_filters "
            f"ON {STATS_MATERIALIZED_VIEWS['resolved_lookup']} (thu_tuc, tinh_trang, chuyen_vien, chuyen_gia)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['resolved_lookup']}_ma_ho_so "
            f"ON {STATS_MATERIALIZED_VIEWS['resolved_lookup']} (thu_tuc, ma_ho_so)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["treo_by_cv"]} AS
            WITH
            latest_dxl_treo AS (
                SELECT DISTINCT ON (thu_tuc, ma_ho_so)
                    thu_tuc,
                    ma_ho_so,
                    trang_thai,
                    ngay_nhan AS ngay_nhan_dxl
                FROM {STATS_MATERIALIZED_VIEWS["resolved_facts"]}
                WHERE ngay_nhan IS NOT NULL
                ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC
            ),
            latest_tcc_treo AS (
                SELECT DISTINCT ON (thu_tuc, ma_ho_so)
                    thu_tuc,
                    ma_ho_so,
                    cv_name_raw AS cv_name,
                    ngay_nhan AS ngay_nhan_tcc
                FROM {STATS_MATERIALIZED_VIEWS["case_facts"]}
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
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['treo_by_cv']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['treo_by_cv']} (thu_tuc, cv_name)"
        ))

        conn.execute(text(f"""
            CREATE MATERIALIZED VIEW IF NOT EXISTS {STATS_MATERIALIZED_VIEWS["tt48_treo_by_loai"]} AS
            WITH
            latest_dxl_treo AS (
                SELECT DISTINCT ON (ma_ho_so)
                    ma_ho_so,
                    trang_thai,
                    ngay_nhan AS ngay_nhan_dxl
                FROM {STATS_MATERIALIZED_VIEWS["resolved_facts"]}
                WHERE thu_tuc = 48
                  AND ngay_nhan IS NOT NULL
                ORDER BY ma_ho_so, ngay_nhan DESC
            ),
            latest_tcc_treo AS (
                SELECT DISTINCT ON (ma_ho_so)
                    ma_ho_so,
                    loai_ho_so,
                    ngay_nhan AS ngay_nhan_tcc
                FROM {STATS_MATERIALIZED_VIEWS["case_facts"]}
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
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{STATS_MATERIALIZED_VIEWS['tt48_treo_by_loai']}_key "
            f"ON {STATS_MATERIALIZED_VIEWS['tt48_treo_by_loai']} (loai_ho_so)"
        ))

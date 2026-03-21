from db import SessionLocal
from sqlalchemy import text
db = SessionLocal()

# ── Thử các định nghĩa khác nhau, đếm cho Hà Hoàng Phương ─────────────────
# A: DISTINCT maHoSo, record mới nhất (id DESC) trong TCC → DXL của record đó ts=4
r_a = db.execute(text("""
    WITH latest_tcc AS (
        SELECT DISTINCT ON (data->>'maHoSo')
            data->>'maHoSo' AS ma_ho_so,
            data->>'id'     AS abp_id,
            TRIM(data->>'chuyenVienThuLyName') AS cv
        FROM tra_cuu_chung
        WHERE (data->>'thuTucId')::int = 48
          AND TRIM(data->>'chuyenVienThuLyName') LIKE '%Hoàng Phương%'
        ORDER BY data->>'maHoSo', (data->>'id')::int DESC
    )
    SELECT COUNT(*) AS cnt
    FROM latest_tcc lt
    JOIN da_xu_ly d ON d.data->>'id' = lt.abp_id AND d.thu_tuc = 48
    WHERE d.data->>'trangThaiHoSo' = '4'
""")).fetchone()
print(f"A (latest TCC id → DXL ts=4):         {r_a[0]}")

# B: Unique maHoSo có ít nhất 1 record TCC với DXL ts=4, VÀ
# không có record TCC nào mới hơn (id lớn hơn) mà DXL ts != 4
r_b = db.execute(text("""
    WITH tcc_dxl AS (
        SELECT
            t.data->>'maHoSo'  AS ma_ho_so,
            (t.data->>'id')::int AS abp_id,
            d.data->>'trangThaiHoSo' AS dxl_ts
        FROM tra_cuu_chung t
        JOIN da_xu_ly d ON d.data->>'id' = t.data->>'id' AND d.thu_tuc = 48
        WHERE (t.data->>'thuTucId')::int = 48
          AND TRIM(t.data->>'chuyenVienThuLyName') LIKE '%Hoàng Phương%'
    ),
    latest_per_hoSo AS (
        SELECT DISTINCT ON (ma_ho_so)
            ma_ho_so, abp_id, dxl_ts
        FROM tcc_dxl
        ORDER BY ma_ho_so, abp_id DESC
    )
    SELECT COUNT(*) AS cnt
    FROM latest_per_hoSo
    WHERE dxl_ts = '4'
""")).fetchone()
print(f"B (unique maHoSo, latest DXL=4):       {r_b[0]}")

# C: Unique maHoSo có TCC với ts=4 (dùng TCC.trangThaiHoSo không dùng DXL)
r_c = db.execute(text("""
    WITH latest_tcc AS (
        SELECT DISTINCT ON (data->>'maHoSo')
            data->>'maHoSo' AS ma_ho_so,
            data->>'trangThaiHoSo' AS ts
        FROM tra_cuu_chung
        WHERE (data->>'thuTucId')::int = 48
          AND TRIM(data->>'chuyenVienThuLyName') LIKE '%Hoàng Phương%'
        ORDER BY data->>'maHoSo', (data->>'id')::int DESC
    )
    SELECT COUNT(*) FROM latest_tcc WHERE ts = '4'
""")).fetchone()
print(f"C (id DESC in TCC, ts=4):              {r_c[0]}")

# D: Tồn sau (chưa resolved) VÀ có bất kỳ DXL nào ts=4 cho maHoSo đó
r_d = db.execute(text("""
    WITH ton_sau_ho_so AS (
        -- Tìm unique maHoSo chưa có kết quả (no DXL or latest DXL ngayTraKetQua > today)
        SELECT DISTINCT ON (t.data->>'maHoSo')
            t.data->>'maHoSo'  AS ma_ho_so,
            (t.data->>'id')::int AS abp_id
        FROM tra_cuu_chung t
        LEFT JOIN da_xu_ly d ON d.data->>'id' = t.data->>'id' AND d.thu_tuc = 48
        WHERE (t.data->>'thuTucId')::int = 48
          AND TRIM(t.data->>'chuyenVienThuLyName') LIKE '%Hoàng Phương%'
          AND (d.id IS NULL OR NULLIF(d.data->>'ngayTraKetQua','') IS NULL)
        ORDER BY t.data->>'maHoSo', (t.data->>'id')::int DESC
    ),
    with_any_cbs AS (
        SELECT ts.ma_ho_so
        FROM ton_sau_ho_so ts
        WHERE EXISTS (
            SELECT 1 FROM da_xu_ly dx
            JOIN tra_cuu_chung tc ON tc.data->>'id' = dx.data->>'id'
            WHERE tc.data->>'maHoSo' = ts.ma_ho_so
              AND dx.thu_tuc = 48
              AND dx.data->>'trangThaiHoSo' = '4'
        )
    )
    SELECT COUNT(*) FROM with_any_cbs
""")).fetchone()
print(f"D (tồn sau + có bất kỳ DXL ts=4):     {r_d[0]}")

# E: Unique maHoSo của Phương, latest DXL ts=4 (dùng ngayTraKetQua DESC)
r_e = db.execute(text("""
    WITH latest_dxl_per_ma AS (
        SELECT DISTINCT ON (t.data->>'maHoSo')
            t.data->>'maHoSo' AS ma_ho_so,
            d.data->>'trangThaiHoSo' AS dxl_ts
        FROM tra_cuu_chung t
        JOIN da_xu_ly d ON d.data->>'id' = t.data->>'id' AND d.thu_tuc = 48
        WHERE (t.data->>'thuTucId')::int = 48
          AND TRIM(t.data->>'chuyenVienThuLyName') LIKE '%Hoàng Phương%'
          AND NULLIF(d.data->>'ngayTraKetQua','') IS NOT NULL
        ORDER BY t.data->>'maHoSo', (d.data->>'ngayTraKetQua')::timestamptz DESC
    )
    SELECT COUNT(*) FROM latest_dxl_per_ma WHERE dxl_ts = '4'
""")).fetchone()
print(f"E (latest DXL ngayTraKetQua DESC, ts=4): {r_e[0]}")

db.close()
print("\nUser says correct value is ~37")

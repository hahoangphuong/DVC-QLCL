export function buildCaseFactsCte(thuTucParam: string): string {
  return `case_facts AS (
    WITH
    dxl_active AS (
      SELECT DISTINCT data->>'maHoSo' AS ma_ho_so
      FROM dang_xu_ly
      WHERE thu_tuc = ${thuTucParam}
    ),
    dxl_cho_pc AS (
      SELECT DISTINCT data->>'maHoSo' AS ma_ho_so
      FROM dang_xu_ly
      WHERE thu_tuc = ${thuTucParam}
        AND data->>'tenDonViXuLy' = 'Phòng ban phân công'
    )
    SELECT
      t.data AS tcc,
      t.data->>'maHoSo' AS ma_ho_so,
      COALESCE(NULLIF(TRIM(t.data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name_raw,
      (t.data->>'ngayTiepNhan')::timestamptz AS ngay_nhan,
      CASE WHEN NULLIF(t.data->>'ngayHenTra', '') IS NOT NULL
           THEN (t.data->>'ngayHenTra')::timestamptz ELSE NULL END AS nhan_hen_tra,
      NULLIF(d.data->>'id', '') AS da_xu_ly_id,
      CASE WHEN NULLIF(d.data->>'ngayTraKetQua', '') IS NOT NULL
           THEN (d.data->>'ngayTraKetQua')::timestamptz ELSE NULL END AS ngay_tra,
      CASE WHEN NULLIF(d.data->>'ngayHenTra', '') IS NOT NULL
           THEN (d.data->>'ngayHenTra')::timestamptz ELSE NULL END AS kq_hen_tra,
      d.data->>'trangThaiHoSo' AS trang_thai,
      (da.ma_ho_so IS NOT NULL) AS is_active,
      (dcp.ma_ho_so IS NOT NULL) AS is_cho_phan_cong
    FROM tra_cuu_chung t
    LEFT JOIN da_xu_ly d
      ON t.data->>'id' = d.data->>'id'
     AND d.thu_tuc = ${thuTucParam}
    LEFT JOIN dxl_active da
      ON t.data->>'maHoSo' = da.ma_ho_so
    LEFT JOIN dxl_cho_pc dcp
      ON t.data->>'maHoSo' = dcp.ma_ho_so
    WHERE (t.data->>'thuTucId')::int = ${thuTucParam}
  )`;
}

export function buildLatestCvFromTccCte(thuTucParam: string): string {
  return `cv_from_tcc AS (
    SELECT DISTINCT ON (data->>'maHoSo')
      data->>'maHoSo' AS ma_ho_so,
      COALESCE(NULLIF(TRIM(data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name
    FROM tra_cuu_chung
    WHERE (data->>'thuTucId')::int = ${thuTucParam}
      AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
    ORDER BY data->>'maHoSo', (data->>'ngayTiepNhan')::timestamptz DESC
  )`;
}

export function buildMonthlyAggregateSql(viewName: string): string {
  return `SELECT yr, mo, cnt
    FROM ${viewName}
    WHERE thu_tuc = $1
    ORDER BY yr, mo`;
}

export function buildCaseFactsCte(thuTucParam: string): string {
  return `case_facts AS (
    SELECT
      ma_ho_so,
      cv_name_raw,
      ngay_nhan,
      nhan_hen_tra,
      da_xu_ly_id,
      ngay_tra,
      kq_hen_tra,
      trang_thai,
      is_active,
      is_cho_phan_cong
    FROM mv_stats_case_facts
    WHERE thu_tuc = ${thuTucParam}
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

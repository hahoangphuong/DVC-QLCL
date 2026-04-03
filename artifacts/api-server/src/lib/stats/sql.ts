export function buildCaseFactsCte(thuTucParam: string): string {
  return `case_facts AS (
    SELECT
      ma_ho_so,
      loai_ho_so,
      submission_kind,
      country_alpha2,
      hinh_thuc_danh_gia,
      cv_name_raw,
      chuyen_gia_name,
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

export function buildMonthlyAggregateSql(viewName: string): string {
  return `SELECT yr, mo, cnt
    FROM ${viewName}
    WHERE thu_tuc = $1
    ORDER BY yr, mo`;
}

export function buildWorkflowCasesCte(thuTucParam: string): string {
  return `workflow_cases AS (
    SELECT
      cv_name,
      don_vi,
      ma_ho_so,
      qua_han_ngay,
      ngay_nhan,
      nguoi_xu_ly,
      buoc
    FROM mv_stats_workflow_cases
    WHERE thu_tuc = ${thuTucParam}
  )`;
}

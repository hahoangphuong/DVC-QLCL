import { query } from "../db";
import { CV_BARE_NAMES, CV_BARE_SET, sortByPriority } from "./cv-order";
import { buildCaseFactsCte, buildMonthlyAggregateSql, buildWorkflowCasesCte } from "./sql";

type CountLike = string | number | null | undefined;

function toCount(value: CountLike): number {
  return Number(value ?? 0);
}

function toDateRange(fromDate: string, toDate: string): { fromDt: string; toDt: string } {
  return {
    fromDt: `${fromDate}T00:00:00+07:00`,
    toDt: `${toDate}T23:59:59+07:00`,
  };
}

function mapMonthlyOpenRows(rows: { yr: string; mo: string; cnt: string }[]) {
  return rows.map((row) => ({
    label: `T${row.mo}-${row.yr}`,
    year: Number(row.yr),
    month: Number(row.mo),
    cnt: toCount(row.cnt),
  }));
}

function normalizeLookupText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getChuyenVienStats(thuTuc: number, fromDate: string, toDate: string) {
  const { fromDt, toDt } = toDateRange(fromDate, toDate);
  const rows = await query<{
    cv_name: string;
    ton_truoc: string;
    da_nhan: string;
    gq_tong: string;
    can_bo_sung: string;
    khong_dat: string;
    hoan_thanh: string;
    dung_han: string;
    qua_han: string;
    tg_tb: string | null;
    ton_sau_tong: string;
    ton_sau_con_han: string;
    ton_sau_qua_han: string;
    treo: string;
  }>(
    `WITH
     ${buildCaseFactsCte("$1")},
     cv_case_facts AS (
       SELECT
         CASE
           WHEN is_cho_phan_cong AND da_xu_ly_id IS NULL THEN '__CHUA_PHAN__'
           ELSE cv_name_raw
         END AS cv_name,
         ngay_nhan,
         nhan_hen_tra,
         ngay_tra,
         kq_hen_tra,
         trang_thai,
         is_active
       FROM case_facts
       WHERE is_active OR da_xu_ly_id IS NOT NULL
     ),
     stats AS (
       SELECT
         cv_name,
         COUNT(*) FILTER (WHERE ngay_nhan < $2 AND (ngay_tra IS NULL OR ngay_tra >= $2)) AS ton_truoc,
         COUNT(*) FILTER (WHERE ngay_nhan >= $2 AND ngay_nhan <= $3) AS da_nhan,
         COUNT(*) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3) AS gq_tong,
         COUNT(*) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3 AND trang_thai = '4') AS can_bo_sung,
         COUNT(*) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3 AND trang_thai = '7') AS khong_dat,
         COUNT(*) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3 AND trang_thai = '6') AS hoan_thanh,
         COUNT(*) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3 AND kq_hen_tra IS NOT NULL AND ngay_tra <= kq_hen_tra) AS dung_han,
         COUNT(*) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3 AND (kq_hen_tra IS NULL OR ngay_tra > kq_hen_tra)) AS qua_han,
         ROUND(AVG(EXTRACT(EPOCH FROM (ngay_tra - ngay_nhan)) / 86400.0) FILTER (WHERE ngay_tra >= $2 AND ngay_tra <= $3))::int AS tg_tb,
         COUNT(*) FILTER (WHERE ngay_nhan <= $3 AND (ngay_tra IS NULL OR ngay_tra > $3) AND is_active) AS ton_sau_tong,
         COUNT(*) FILTER (WHERE ngay_nhan <= $3 AND (ngay_tra IS NULL OR ngay_tra > $3) AND is_active AND nhan_hen_tra IS NOT NULL AND nhan_hen_tra > $3) AS ton_sau_con_han,
         COUNT(*) FILTER (WHERE ngay_nhan <= $3 AND (ngay_tra IS NULL OR ngay_tra > $3) AND is_active AND (nhan_hen_tra IS NULL OR nhan_hen_tra <= $3)) AS ton_sau_qua_han
       FROM cv_case_facts
       GROUP BY cv_name
     ),
     treo_by_cv AS (
       SELECT cv_name, treo
       FROM mv_stats_treo_by_cv
       WHERE thu_tuc = $1
     )
     SELECT s.*, COALESCE(t.treo, 0) AS treo
     FROM stats s
     LEFT JOIN treo_by_cv t ON s.cv_name = t.cv_name`,
    [thuTuc, fromDt, toDt]
  );

  const mappedRows = rows.map((row) => {
    const gqTong = toCount(row.gq_tong);
    const tonTruoc = toCount(row.ton_truoc);
    const daNhan = toCount(row.da_nhan);
    const dungHan = toCount(row.dung_han);
    return {
      ten_cv: row.cv_name,
      ton_truoc: tonTruoc,
      da_nhan: daNhan,
      gq_tong: gqTong,
      can_bo_sung: toCount(row.can_bo_sung),
      khong_dat: toCount(row.khong_dat),
      hoan_thanh: toCount(row.hoan_thanh),
      dung_han: dungHan,
      qua_han: toCount(row.qua_han),
      tg_tb: row.tg_tb != null ? toCount(row.tg_tb) : null,
      pct_gq_dung_han: gqTong > 0 ? Math.round((dungHan / gqTong) * 100) : 0,
      pct_da_gq: tonTruoc + daNhan > 0 ? Math.round((gqTong / (tonTruoc + daNhan)) * 100) : 0,
      ton_sau_tong: toCount(row.ton_sau_tong),
      ton_sau_con_han: toCount(row.ton_sau_con_han),
      ton_sau_qua_han: toCount(row.ton_sau_qua_han),
      treo: toCount(row.treo),
    };
  });

  const choPhanCong = mappedRows.find((row) => row.ten_cv === "__CHUA_PHAN__") ?? null;
  const sortedRows = sortByPriority(
    mappedRows.filter((row) => row.ten_cv !== "__CHUA_PHAN__"),
    (row) => row.ten_cv
  );

  return {
    thu_tuc: thuTuc,
    from_date: fromDate,
    to_date: toDate,
    cho_phan_cong: choPhanCong,
    rows: sortedRows,
  };
}

export async function getDangXuLyStats(thuTuc: number) {
  const monthRows = await query<{ yr: string; mo: string; cnt: string }>(
    buildMonthlyAggregateSql("mv_stats_inflight_monthly"),
    [thuTuc]
  );

  if (thuTuc === 48) {
    const rows48 = await query<{
      cv_name: string;
      tong: string;
      chua_xu_ly: string;
      bi_tra_lai: string;
      cho_cg: string;
      cho_tong_hop: string;
      cho_to_truong: string;
      cho_trp: string;
      cho_cong_bo: string;
      cho_pct: string;
      cho_van_thu: string;
      con_han: string;
      qua_han: string;
      chua_xu_ly_con: string;
      chua_xu_ly_qua: string;
      bi_tra_lai_con: string;
      bi_tra_lai_qua: string;
      cho_cg_con: string;
      cho_cg_qua: string;
      cho_tong_hop_con: string;
      cho_tong_hop_qua: string;
      cho_to_truong_con: string;
      cho_to_truong_qua: string;
      cho_trp_con: string;
      cho_trp_qua: string;
      cho_cong_bo_con: string;
      cho_cong_bo_qua: string;
      cho_pct_con: string;
      cho_pct_qua: string;
      cho_van_thu_con: string;
      cho_van_thu_qua: string;
      cham_so_ngay: string;
      cham_ma: string | null;
      cham_ngay: string | null;
    }>(
      `WITH
       ${buildWorkflowCasesCte("48")},
       base AS (
         SELECT
           cv_name,
           don_vi,
           ma_ho_so,
           qua_han_ngay,
           ngay_nhan,
           buoc
         FROM workflow_cases
       ),
       stats AS (
         SELECT
           cv_name,
           COUNT(*) AS tong,
           COUNT(*) FILTER (WHERE buoc = 'chua_xu_ly') AS chua_xu_ly,
           COUNT(*) FILTER (WHERE buoc = 'bi_tra_lai') AS bi_tra_lai,
           COUNT(*) FILTER (WHERE don_vi = 'Chuyên gia thẩm định') AS cho_cg,
           COUNT(*) FILTER (WHERE buoc = 'cho_tong_hop') AS cho_tong_hop,
           COUNT(*) FILTER (WHERE don_vi = 'Tổ trưởng chuyên gia') AS cho_to_truong,
           COUNT(*) FILTER (WHERE don_vi = 'Trưởng phòng') AS cho_trp,
           COUNT(*) FILTER (WHERE buoc = 'cho_ket_thuc') AS cho_cong_bo,
           COUNT(*) FILTER (WHERE don_vi = 'Phó Cục trưởng') AS cho_pct,
           COUNT(*) FILTER (WHERE don_vi LIKE 'Văn thư%') AS cho_van_thu,
           COUNT(*) FILTER (WHERE qua_han_ngay <= 0) AS con_han,
           COUNT(*) FILTER (WHERE qua_han_ngay > 0) AS qua_han,
           COUNT(*) FILTER (WHERE buoc = 'chua_xu_ly' AND qua_han_ngay <= 0) AS chua_xu_ly_con,
           COUNT(*) FILTER (WHERE buoc = 'chua_xu_ly' AND qua_han_ngay > 0) AS chua_xu_ly_qua,
           COUNT(*) FILTER (WHERE buoc = 'bi_tra_lai' AND qua_han_ngay <= 0) AS bi_tra_lai_con,
           COUNT(*) FILTER (WHERE buoc = 'bi_tra_lai' AND qua_han_ngay > 0) AS bi_tra_lai_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Chuyên gia thẩm định' AND qua_han_ngay <= 0) AS cho_cg_con,
           COUNT(*) FILTER (WHERE don_vi = 'Chuyên gia thẩm định' AND qua_han_ngay > 0) AS cho_cg_qua,
           COUNT(*) FILTER (WHERE buoc = 'cho_tong_hop' AND qua_han_ngay <= 0) AS cho_tong_hop_con,
           COUNT(*) FILTER (WHERE buoc = 'cho_tong_hop' AND qua_han_ngay > 0) AS cho_tong_hop_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Tổ trưởng chuyên gia' AND qua_han_ngay <= 0) AS cho_to_truong_con,
           COUNT(*) FILTER (WHERE don_vi = 'Tổ trưởng chuyên gia' AND qua_han_ngay > 0) AS cho_to_truong_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Trưởng phòng' AND qua_han_ngay <= 0) AS cho_trp_con,
           COUNT(*) FILTER (WHERE don_vi = 'Trưởng phòng' AND qua_han_ngay > 0) AS cho_trp_qua,
           COUNT(*) FILTER (WHERE buoc = 'cho_ket_thuc' AND qua_han_ngay <= 0) AS cho_cong_bo_con,
           COUNT(*) FILTER (WHERE buoc = 'cho_ket_thuc' AND qua_han_ngay > 0) AS cho_cong_bo_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Phó Cục trưởng' AND qua_han_ngay <= 0) AS cho_pct_con,
           COUNT(*) FILTER (WHERE don_vi = 'Phó Cục trưởng' AND qua_han_ngay > 0) AS cho_pct_qua,
           COUNT(*) FILTER (WHERE don_vi LIKE 'Văn thư%' AND qua_han_ngay <= 0) AS cho_van_thu_con,
           COUNT(*) FILTER (WHERE don_vi LIKE 'Văn thư%' AND qua_han_ngay > 0) AS cho_van_thu_qua
         FROM base
         GROUP BY cv_name
       ),
       cham_nhat AS (
         SELECT DISTINCT ON (cv_name)
           cv_name,
           qua_han_ngay AS cham_so_ngay,
           ma_ho_so AS cham_ma,
           ngay_nhan AS cham_ngay
         FROM base
         ORDER BY cv_name, qua_han_ngay DESC
       )
       SELECT s.*, cn.cham_so_ngay, cn.cham_ma, cn.cham_ngay
       FROM stats s
       LEFT JOIN cham_nhat cn ON cn.cv_name = s.cv_name
       ORDER BY s.tong DESC`
    );

    const mappedRows48 = rows48.map((row) => ({
      cv_name: row.cv_name,
      tong: toCount(row.tong),
      cho_cv: toCount(row.chua_xu_ly),
      chua_xu_ly: toCount(row.chua_xu_ly),
      bi_tra_lai: toCount(row.bi_tra_lai),
      cho_cg: toCount(row.cho_cg),
      cho_tong_hop: toCount(row.cho_tong_hop),
      cho_to_truong: toCount(row.cho_to_truong),
      cho_trp: toCount(row.cho_trp),
      cho_cong_bo: toCount(row.cho_cong_bo),
      cho_pct: toCount(row.cho_pct),
      cho_van_thu: toCount(row.cho_van_thu),
      con_han: toCount(row.con_han),
      qua_han: toCount(row.qua_han),
      chua_xu_ly_con: toCount(row.chua_xu_ly_con),
      chua_xu_ly_qua: toCount(row.chua_xu_ly_qua),
      bi_tra_lai_con: toCount(row.bi_tra_lai_con),
      bi_tra_lai_qua: toCount(row.bi_tra_lai_qua),
      cho_cg_con: toCount(row.cho_cg_con),
      cho_cg_qua: toCount(row.cho_cg_qua),
      cho_tong_hop_con: toCount(row.cho_tong_hop_con),
      cho_tong_hop_qua: toCount(row.cho_tong_hop_qua),
      cho_to_truong_con: toCount(row.cho_to_truong_con),
      cho_to_truong_qua: toCount(row.cho_to_truong_qua),
      cho_trp_con: toCount(row.cho_trp_con),
      cho_trp_qua: toCount(row.cho_trp_qua),
      cho_cong_bo_con: toCount(row.cho_cong_bo_con),
      cho_cong_bo_qua: toCount(row.cho_cong_bo_qua),
      cho_pct_con: toCount(row.cho_pct_con),
      cho_pct_qua: toCount(row.cho_pct_qua),
      cho_van_thu_con: toCount(row.cho_van_thu_con),
      cho_van_thu_qua: toCount(row.cho_van_thu_qua),
      cham_so_ngay: toCount(row.cham_so_ngay),
      cham_ma: row.cham_ma ?? null,
      cham_ngay: row.cham_ngay ?? null,
    }));

    const choPhanCong48 = mappedRows48.find((row) => row.cv_name === "__CHUA_PHAN__") ?? null;
    const sortedRows48 = sortByPriority(
      mappedRows48.filter((row) => row.cv_name !== "__CHUA_PHAN__"),
      (row) => row.cv_name
    );

    return {
      thu_tuc: 48,
      cho_phan_cong: choPhanCong48,
      rows: sortedRows48,
      months: mapMonthlyOpenRows(monthRows),
    };
  }

  const rows = await query<{
    cv_name: string;
    tong: string;
    cho_cv: string;
    cho_cg: string;
    cho_to_truong: string;
    cho_trp: string;
    cho_pct: string;
    cho_van_thu: string;
    con_han: string;
    qua_han: string;
    cham_so_ngay: string;
    cham_ma: string | null;
    cham_ngay: string | null;
    }>(
      `WITH
     ${buildWorkflowCasesCte("$1")},
     base AS (
       SELECT
         cv_name,
         don_vi,
         ma_ho_so,
         qua_han_ngay,
         ngay_nhan
       FROM workflow_cases
     ),
     stats AS (
       SELECT
         cv_name,
         COUNT(*) AS tong,
         COUNT(*) FILTER (WHERE don_vi = 'Chuyên viên') AS cho_cv,
         COUNT(*) FILTER (WHERE don_vi = 'Chuyên gia thẩm định') AS cho_cg,
         COUNT(*) FILTER (WHERE don_vi = 'Tổ trưởng chuyên gia') AS cho_to_truong,
         COUNT(*) FILTER (WHERE don_vi = 'Trưởng phòng') AS cho_trp,
         COUNT(*) FILTER (WHERE don_vi = 'Phó Cục trưởng') AS cho_pct,
         COUNT(*) FILTER (WHERE don_vi LIKE 'Văn thư%') AS cho_van_thu,
         COUNT(*) FILTER (WHERE qua_han_ngay <= 0) AS con_han,
         COUNT(*) FILTER (WHERE qua_han_ngay > 0) AS qua_han
       FROM base
       GROUP BY cv_name
     ),
     cham_nhat AS (
       SELECT DISTINCT ON (cv_name)
         cv_name,
         qua_han_ngay AS cham_so_ngay,
         ma_ho_so AS cham_ma,
         ngay_nhan AS cham_ngay
       FROM base
       ORDER BY cv_name, qua_han_ngay DESC
     )
     SELECT s.*, cn.cham_so_ngay, cn.cham_ma, cn.cham_ngay
     FROM stats s
     LEFT JOIN cham_nhat cn ON cn.cv_name = s.cv_name
     ORDER BY s.tong DESC`,
    [thuTuc]
  );

  const mappedRows = rows.map((row) => ({
    cv_name: row.cv_name,
    tong: toCount(row.tong),
    cho_cv: toCount(row.cho_cv),
    cho_cg: toCount(row.cho_cg),
    cho_to_truong: toCount(row.cho_to_truong),
    cho_trp: toCount(row.cho_trp),
    cho_pct: toCount(row.cho_pct),
    cho_van_thu: toCount(row.cho_van_thu),
    con_han: toCount(row.con_han),
    qua_han: toCount(row.qua_han),
    cham_so_ngay: toCount(row.cham_so_ngay),
    cham_ma: row.cham_ma ?? null,
    cham_ngay: row.cham_ngay ?? null,
  }));

  const choPhanCong = mappedRows.find((row) => row.cv_name === "__CHUA_PHAN__") ?? null;
  const sortedRows = sortByPriority(
    mappedRows.filter((row) => row.cv_name !== "__CHUA_PHAN__"),
    (row) => row.cv_name
  );

  return {
    thu_tuc: thuTuc,
    cho_phan_cong: choPhanCong,
    rows: sortedRows,
    months: mapMonthlyOpenRows(monthRows),
  };
}

export async function getChuyenGiaStats(thuTuc: number) {
  const rows = await query<{
    nguoi_xu_ly: string;
    tong: string;
    con_han: string;
    qua_han: string;
    cham_so_ngay: string;
    cham_ma: string | null;
    cham_ngay: string | null;
    cham_cv: string | null;
    }>(
      `WITH
     ${buildWorkflowCasesCte("$1")},
     cg_base AS (
       SELECT
         nguoi_xu_ly,
         qua_han_ngay,
         ngay_nhan,
         ma_ho_so,
         COALESCE(NULLIF(TRIM(cv_name), ''), '') AS cv_thu_ly
       FROM workflow_cases
       WHERE don_vi = 'Chuyên gia thẩm định'
         AND NULLIF(nguoi_xu_ly, '') IS NOT NULL
     ),
     stats AS (
       SELECT
         nguoi_xu_ly,
         COUNT(*) AS tong,
         COUNT(*) FILTER (WHERE qua_han_ngay <= 0) AS con_han,
         COUNT(*) FILTER (WHERE qua_han_ngay > 0) AS qua_han
       FROM cg_base
       GROUP BY nguoi_xu_ly
     ),
     cham_nhat AS (
       SELECT DISTINCT ON (nguoi_xu_ly)
         nguoi_xu_ly,
         qua_han_ngay AS cham_so_ngay,
         ma_ho_so AS cham_ma,
         ngay_nhan AS cham_ngay,
         cv_thu_ly AS cham_cv
       FROM cg_base
       ORDER BY nguoi_xu_ly, qua_han_ngay DESC
     )
     SELECT s.*, cn.cham_so_ngay, cn.cham_ma, cn.cham_ngay, cn.cham_cv
     FROM stats s
     JOIN cham_nhat cn ON cn.nguoi_xu_ly = s.nguoi_xu_ly`,
    [thuTuc]
  );

  const mappedRows = rows.map((row) => ({
    ten: row.nguoi_xu_ly,
    tong: toCount(row.tong),
    con_han: toCount(row.con_han),
    qua_han: toCount(row.qua_han),
    cham_so_ngay: toCount(row.cham_so_ngay),
    cham_ma: row.cham_ma ?? null,
    cham_ngay: row.cham_ngay ?? null,
    cham_cv: row.cham_cv ?? null,
  }));

  const resultMap = new Map(mappedRows.map((row) => [row.ten, row]));
  const chuyenGia = mappedRows
    .filter((row) => !CV_BARE_SET.has(row.ten))
    .sort((left, right) => left.ten.localeCompare(right.ten, "vi"));

  const chuyenVienCg = CV_BARE_NAMES.map((name) => (
    resultMap.get(name) ?? {
      ten: name,
      tong: 0,
      con_han: 0,
      qua_han: 0,
      cham_so_ngay: 0,
      cham_ma: null,
      cham_ngay: null,
      cham_cv: null,
    }
  ));

  return {
    thu_tuc: thuTuc,
    chuyen_gia: chuyenGia,
    chuyen_vien_cg: chuyenVienCg,
  };
}

type PendingLookupFilters = {
  thuTuc: number | null;
  chuyenVien: string | null;
  chuyenGia: string | null;
  tinhTrang: string | null;
  maHoSo: string | null;
};

type PendingLookupOptionRow = {
  chuyen_vien: string | null;
  chuyen_gia: string | null;
};

type PendingLookupRow = {
  thu_tuc: number;
  ma_ho_so: string;
  ngay_tiep_nhan: string | null;
  ngay_hen_tra: string | null;
  loai_ho_so: string | null;
  submission_kind: string | null;
  tinh_trang: string;
  chuyen_vien: string | null;
  chuyen_gia: string | null;
  thoi_gian_cho_ngay: string | number;
};

const PENDING_LOOKUP_BASE_CTE = `WITH latest_case_facts AS (
  SELECT DISTINCT ON (thu_tuc, ma_ho_so)
    thu_tuc,
    ma_ho_so,
    loai_ho_so,
    submission_kind,
    nhan_hen_tra
  FROM mv_stats_case_facts
  WHERE ($1::int IS NULL OR thu_tuc = $1)
  ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC NULLS LAST
),
workflow_base AS (
  SELECT
    w.thu_tuc,
    w.ma_ho_so,
    w.ngay_nhan AS ngay_tiep_nhan,
    cf.nhan_hen_tra AS ngay_hen_tra,
    cf.loai_ho_so,
    cf.submission_kind,
    CASE
      WHEN w.thu_tuc = 48 AND (w.buoc = 'chua_xu_ly' OR w.don_vi = 'Ph\u00f2ng ban ph\u00e2n c\u00f4ng') THEN 'chua_xu_ly'
      WHEN w.thu_tuc = 48 AND w.buoc = 'bi_tra_lai' THEN 'bi_tra_lai'
      WHEN w.thu_tuc = 48 AND w.buoc = 'cho_tong_hop' THEN 'cho_tong_hop'
      WHEN w.don_vi = 'Chuy\u00ean gia th\u1ea9m \u0111\u1ecbnh' THEN 'cho_chuyen_gia'
      WHEN w.don_vi = 'T\u1ed5 tr\u01b0\u1edfng chuy\u00ean gia' THEN 'cho_to_truong'
      WHEN w.don_vi = 'Tr\u01b0\u1edfng ph\u00f2ng' THEN 'cho_truong_phong'
      WHEN w.buoc = 'cho_ket_thuc' OR w.don_vi IN ('Ph\u00f3 C\u1ee5c tr\u01b0\u1edfng', 'V\u0103n th\u01b0') THEN 'cho_cong_bo'
      WHEN w.buoc IN ('chua_xu_ly', 'bi_tra_lai', 'cho_tong_hop')
        OR w.don_vi IN ('Chuy\u00ean vi\u00ean', 'Ph\u00f2ng ban ph\u00e2n c\u00f4ng')
      THEN 'cho_chuyen_vien'
      ELSE 'cho_chuyen_vien'
    END AS tinh_trang,
    CASE
      WHEN NULLIF(TRIM(w.cv_name), '') IS NULL OR w.cv_name = '__CHUA_PHAN__' THEN NULL
      ELSE TRIM(w.cv_name)
    END AS chuyen_vien,
    CASE
      WHEN w.don_vi = 'Chuy\u00ean gia th\u1ea9m \u0111\u1ecbnh' AND NULLIF(TRIM(w.nguoi_xu_ly), '') IS NOT NULL
      THEN TRIM(w.nguoi_xu_ly)
      ELSE NULL
    END AS chuyen_gia,
    COALESCE(
      GREATEST(
        0,
        CURRENT_DATE - ((w.ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
      )::int,
      0
    ) AS thoi_gian_cho_ngay
  FROM mv_stats_workflow_cases w
  LEFT JOIN latest_case_facts cf
    ON cf.thu_tuc = w.thu_tuc
   AND cf.ma_ho_so = w.ma_ho_so
  WHERE ($1::int IS NULL OR w.thu_tuc = $1)
)`;

export async function getDangXuLyLookup(filters: PendingLookupFilters) {
  const thuTuc = filters.thuTuc ?? null;
  const chuyenVien = normalizeLookupText(filters.chuyenVien);
  const chuyenGia = normalizeLookupText(filters.chuyenGia);
  const tinhTrang = normalizeLookupText(filters.tinhTrang);
  const maHoSo = normalizeLookupText(filters.maHoSo);

  const [optionRows, rows] = await Promise.all([
    query<PendingLookupOptionRow>(
      `WITH option_rows AS (
         SELECT
           CASE
             WHEN NULLIF(TRIM(cv_name), '') IS NULL OR cv_name = '__CHUA_PHAN__' THEN NULL
             ELSE TRIM(cv_name)
           END AS chuyen_vien,
           CASE
             WHEN NULLIF(TRIM(nguoi_xu_ly), '') IS NOT NULL THEN TRIM(nguoi_xu_ly)
             ELSE NULL
           END AS chuyen_gia
         FROM mv_stats_workflow_cases
         WHERE ($1::int IS NULL OR thu_tuc = $1)
       )
       SELECT DISTINCT chuyen_vien, chuyen_gia
       FROM option_rows
       ORDER BY chuyen_vien NULLS LAST, chuyen_gia NULLS LAST`,
      [thuTuc]
    ),
    query<PendingLookupRow>(
      `${PENDING_LOOKUP_BASE_CTE}
       SELECT
         thu_tuc,
         ma_ho_so,
         ngay_tiep_nhan,
         ngay_hen_tra,
         loai_ho_so,
         submission_kind,
         tinh_trang,
         chuyen_vien,
         chuyen_gia,
         thoi_gian_cho_ngay
       FROM workflow_base
       WHERE ($2::text IS NULL OR chuyen_vien = $2)
         AND ($3::text IS NULL OR chuyen_gia = $3)
         AND (
               $4::text IS NULL
            OR ($4::text = 'cho_chuyen_vien' AND tinh_trang IN ('cho_chuyen_vien', 'chua_xu_ly', 'bi_tra_lai', 'cho_tong_hop'))
            OR tinh_trang = $4
         )
         AND ($5::text IS NULL OR LOWER(ma_ho_so) LIKE '%' || LOWER($5) || '%')
       ORDER BY thu_tuc DESC, thoi_gian_cho_ngay DESC, ma_ho_so ASC`,
      [thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo]
    ),
  ]);

  const chuyenVienOptions = Array.from(new Set(
    optionRows
      .map((row) => row.chuyen_vien)
      .filter((value): value is string => Boolean(value))
  )).sort((left, right) => left.localeCompare(right, "vi"));

  const chuyenGiaOptions = Array.from(new Set(
    optionRows
      .map((row) => row.chuyen_gia)
      .filter((value): value is string => Boolean(value))
  )).sort((left, right) => left.localeCompare(right, "vi"));

  return {
    filters: {
      thu_tuc: thuTuc,
      chuyen_vien: chuyenVien,
      chuyen_gia: chuyenGia,
      tinh_trang: tinhTrang,
      ma_ho_so: maHoSo,
    },
    options: {
      chuyen_vien: chuyenVienOptions,
      chuyen_gia: chuyenGiaOptions,
    },
    rows: rows.map((row) => ({
      thu_tuc: row.thu_tuc,
      ma_ho_so: row.ma_ho_so,
      ngay_tiep_nhan: row.ngay_tiep_nhan,
      ngay_hen_tra: row.ngay_hen_tra,
      loai_ho_so: row.loai_ho_so,
      submission_kind: row.submission_kind,
      tinh_trang: row.tinh_trang,
      chuyen_vien: row.chuyen_vien,
      chuyen_gia: row.chuyen_gia,
      thoi_gian_cho_ngay: toCount(row.thoi_gian_cho_ngay),
    })),
  };
}





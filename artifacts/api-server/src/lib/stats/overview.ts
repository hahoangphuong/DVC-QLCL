import { query, queryOne } from "../db";
import { buildCaseFactsCte, buildMonthlyAggregateSql } from "./sql";

type CountRow = Record<string, string | null>;

function toDateRange(fromDate: string, toDate: string): { fromDt: string; toDt: string } {
  return {
    fromDt: `${fromDate}T00:00:00+07:00`,
    toDt: `${toDate}T23:59:59+07:00`,
  };
}

function toCount(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function toPercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export async function getEarliestDate(thuTuc: number): Promise<string | null> {
  if (thuTuc === 46 || thuTuc === 47) {
    const row = await queryOne<{ min: Date | null }>(
      `SELECT MIN((data->>'ngayTiepNhan')::timestamptz) AS min
       FROM tra_cuu_chung
       WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
         AND (data->>'thuTucId')::int = $1
         AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL`,
      [thuTuc]
    );

    if (!row?.min) return null;
    const d = new Date(row.min);
    const vn = new Date(d.getTime() + 7 * 3600 * 1000);
    return vn.toISOString().slice(0, 10);
  }

  const row = await queryOne<{ min: Date | null }>(
    `SELECT earliest_ngay_nhan AS min
     FROM mv_stats_received_bounds
     WHERE thu_tuc = $1`,
    [thuTuc]
  );

  if (!row?.min) return null;
  const d = new Date(row.min);
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 10);
}

export async function getSummaryStats(thuTuc: number, fromDate: string, toDate: string) {
  const { fromDt, toDt } = toDateRange(fromDate, toDate);
  const row = await queryOne<CountRow>(
    `WITH
     ${buildCaseFactsCte("$1")},
     filtered_case_facts AS (
       SELECT *
       FROM case_facts
       WHERE is_active OR da_xu_ly_id IS NOT NULL
     ),
     gq AS (
       SELECT COUNT(*) AS cnt
       FROM mv_stats_resolved_facts
       WHERE thu_tuc = $1
         AND ngay_tra IS NOT NULL
         AND ngay_tra >= $2
         AND ngay_tra <= $3
     )
     SELECT
       COUNT(*) FILTER (
         WHERE ngay_nhan < $2::timestamptz
           AND (ngay_tra IS NULL OR ngay_tra >= $2::timestamptz)
       ) AS ton_truoc,
       COUNT(*) FILTER (
         WHERE ngay_nhan >= $2::timestamptz
           AND ngay_nhan <= $3::timestamptz
       ) AS da_nhan,
       COUNT(*) FILTER (
         WHERE ngay_nhan <= $3::timestamptz
           AND (ngay_tra IS NULL OR ngay_tra > $3::timestamptz)
       ) AS ton_sau,
       (SELECT cnt FROM gq) AS da_giai_quyet
     FROM filtered_case_facts`,
    [thuTuc, fromDt, toDt]
  );

  return {
    thu_tuc: thuTuc,
    from_date: fromDate,
    to_date: toDate,
    ton_truoc: toCount(row?.["ton_truoc"]),
    da_nhan: toCount(row?.["da_nhan"]),
    da_giai_quyet: toCount(row?.["da_giai_quyet"]),
    ton_sau: toCount(row?.["ton_sau"]),
  };
}

export async function getGiaiQuyetStats(thuTuc: number, fromDate: string, toDate: string) {
  const { fromDt, toDt } = toDateRange(fromDate, toDate);
  const row = await queryOne<CountRow>(
    `SELECT
       COUNT(*) FILTER (
         WHERE ngay_tra IS NOT NULL
           AND ngay_tra >= $2
           AND ngay_tra <= $3
           AND kq_hen_tra IS NOT NULL
           AND ngay_tra <= kq_hen_tra
       ) AS dung_han,
       COUNT(*) FILTER (
         WHERE ngay_tra IS NOT NULL
           AND ngay_tra >= $2
           AND ngay_tra <= $3
           AND (
                 kq_hen_tra IS NULL
              OR ngay_tra > kq_hen_tra
           )
       ) AS qua_han
     FROM mv_stats_resolved_facts
     WHERE thu_tuc = $1`,
    [thuTuc, fromDt, toDt]
  );

  const dungHan = toCount(row?.["dung_han"]);
  const quaHan = toCount(row?.["qua_han"]);
  const total = dungHan + quaHan;
  return {
    thu_tuc: thuTuc,
    from_date: fromDate,
    to_date: toDate,
    dung_han: dungHan,
    qua_han: quaHan,
    total,
    pct_dung_han: toPercent(dungHan, total),
    pct_qua_han: toPercent(quaHan, total),
  };
}

export async function getTonSauStats(thuTuc: number, toDate: string) {
  const toDt = `${toDate}T23:59:59+07:00`;
  const row = await queryOne<CountRow>(
    `WITH
     ${buildCaseFactsCte("$1")},
     filtered_case_facts AS (
       SELECT *
       FROM case_facts
       WHERE is_active OR da_xu_ly_id IS NOT NULL
     )
     SELECT
       COUNT(*) FILTER (
         WHERE ngay_nhan <= $2::timestamptz
           AND (ngay_tra IS NULL OR ngay_tra > $2::timestamptz)
           AND nhan_hen_tra IS NOT NULL
           AND nhan_hen_tra > $2::timestamptz
       ) AS con_han,
       COUNT(*) FILTER (
         WHERE ngay_nhan <= $2::timestamptz
           AND (ngay_tra IS NULL OR ngay_tra > $2::timestamptz)
           AND (
                 nhan_hen_tra IS NULL
              OR nhan_hen_tra <= $2::timestamptz
           )
       ) AS qua_han
     FROM filtered_case_facts`,
    [thuTuc, toDt]
  );

  const conHan = toCount(row?.["con_han"]);
  const quaHan = toCount(row?.["qua_han"]);
  const total = conHan + quaHan;
  return {
    thu_tuc: thuTuc,
    to_date: toDate,
    con_han: conHan,
    qua_han: quaHan,
    total,
    pct_con_han: toPercent(conHan, total),
    pct_qua_han: toPercent(quaHan, total),
  };
}

export async function getMonthlyStats(thuTuc: number) {
  const [nhanRows, gqRows, tonRows] = await Promise.all([
    query<{ yr: string; mo: string; cnt: string }>(
      buildMonthlyAggregateSql("mv_stats_received_monthly"),
      [thuTuc]
    ),
    query<{ yr: string; mo: string; cnt: string }>(
      buildMonthlyAggregateSql("mv_stats_resolved_monthly"),
      [thuTuc]
    ),
    query<{ yr: string; mo: string; cnt: string }>(
      buildMonthlyAggregateSql("mv_stats_inflight_monthly"),
      [thuTuc]
    ),
  ]);

  const nhanMap = new Map(nhanRows.map((row) => [`${row.yr}-${row.mo}`, toCount(row.cnt)]));
  const gqMap = new Map(gqRows.map((row) => [`${row.yr}-${row.mo}`, toCount(row.cnt)]));
  const tonMap = new Map(tonRows.map((row) => [`${row.yr}-${row.mo}`, toCount(row.cnt)]));
  const allKeys = [...new Set([...nhanMap.keys(), ...gqMap.keys(), ...tonMap.keys()])].sort((left, right) => {
    const [leftYear, leftMonth] = left.split("-").map(Number);
    const [rightYear, rightMonth] = right.split("-").map(Number);
    return leftYear !== rightYear ? leftYear - rightYear : leftMonth - rightMonth;
  });

  const months = allKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const daNhan = nhanMap.get(key) ?? 0;
    const daGiaiQuyet = gqMap.get(key) ?? 0;
    return {
      label: `T${month}-${year}`,
      year,
      month,
      da_nhan: daNhan,
      da_giai_quyet: daGiaiQuyet,
      ton_sau: tonMap.get(key) ?? 0,
    };
  });

  return { thu_tuc: thuTuc, months };
}

export async function getTt48ReceivedMonthlyByLoaiStats() {
  const rows = await query<{ yr: string; mo: string; loai_ho_so: string; cnt: string }>(
    `SELECT yr, mo, loai_ho_so, cnt
     FROM mv_stats_tt48_received_by_loai_monthly
     ORDER BY yr, mo, loai_ho_so`
  );

  const monthMap = new Map<number, {
    year: number;
    month: number;
    label: string;
    total: number;
    A: number;
    B: number;
    C: number;
    D: number;
  }>();

  for (const row of rows) {
    const year = Number(row.yr);
    const month = Number(row.mo);
    const key = year * 100 + month;
    const cnt = toCount(row.cnt);
    const bucket = monthMap.get(key) ?? {
      year,
      month,
      label: `T${month}-${year}`,
      total: 0,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    };

    const loai = row.loai_ho_so as "A" | "B" | "C" | "D";
    if (["A", "B", "C", "D"].includes(loai)) bucket[loai] = cnt;
    bucket.total += cnt;
    monthMap.set(key, bucket);
  }

  return {
    thu_tuc: 48 as const,
    months: Array.from(monthMap.values()).sort((left, right) =>
      left.year !== right.year ? left.year - right.year : left.month - right.month
    ),
  };
}

export async function getTt48LoaiHoSoStats(fromDate: string, toDate: string) {
  const { fromDt, toDt } = toDateRange(fromDate, toDate);
  const rows = await query<{
    loai_ho_so: string;
      ton_truoc_total: string;
      ton_truoc_first: string;
      ton_truoc_supplement: string;
      ton_truoc_first_hinh_thuc_1: string;
      ton_truoc_first_hinh_thuc_2: string;
      ton_truoc_supplement_hinh_thuc_1: string;
      ton_truoc_supplement_hinh_thuc_2: string;
      ton_truoc_hinh_thuc_1: string;
      ton_truoc_hinh_thuc_2: string;
      da_nhan_total: string;
      da_nhan_first: string;
      da_nhan_supplement: string;
      da_nhan_first_hinh_thuc_1: string;
      da_nhan_first_hinh_thuc_2: string;
      da_nhan_supplement_hinh_thuc_1: string;
      da_nhan_supplement_hinh_thuc_2: string;
      da_nhan_hinh_thuc_1: string;
      da_nhan_hinh_thuc_2: string;
      giai_quyet_total: string;
      giai_quyet_first: string;
      giai_quyet_supplement: string;
      giai_quyet_first_hinh_thuc_1: string;
      giai_quyet_first_hinh_thuc_2: string;
      giai_quyet_supplement_hinh_thuc_1: string;
      giai_quyet_supplement_hinh_thuc_2: string;
      giai_quyet_hinh_thuc_1: string;
      giai_quyet_hinh_thuc_2: string;
      ton_total: string;
      ton_first: string;
      ton_supplement: string;
      ton_first_hinh_thuc_1: string;
      ton_first_hinh_thuc_2: string;
      ton_supplement_hinh_thuc_1: string;
      ton_supplement_hinh_thuc_2: string;
      ton_hinh_thuc_1: string;
      ton_hinh_thuc_2: string;
      treo: string;
  }>(
    `WITH
     ${buildCaseFactsCte("48")},
     base AS (
       SELECT
         loai_ho_so,
         hinh_thuc_danh_gia,
         submission_kind,
         ((ngay_nhan < $1 AND (ngay_tra IS NULL OR ngay_tra >= $1))::int) AS ton_truoc_hit,
         ((ngay_nhan >= $1 AND ngay_nhan <= $2)::int) AS da_nhan_hit,
         ((ngay_tra >= $1 AND ngay_tra <= $2)::int) AS giai_quyet_hit,
         ((ngay_nhan <= $2 AND (ngay_tra IS NULL OR ngay_tra > $2) AND is_active)::int) AS ton_hit
       FROM case_facts
       WHERE loai_ho_so IN ('A', 'B', 'C', 'D')
         AND (is_active OR da_xu_ly_id IS NOT NULL)
     ),
     grouped AS (
       SELECT
         loai_ho_so,
         submission_kind,
         hinh_thuc_danh_gia,
         SUM(ton_truoc_hit) AS ton_truoc_total,
         SUM(da_nhan_hit) AS da_nhan_total,
         SUM(giai_quyet_hit) AS giai_quyet_total,
         SUM(ton_hit) AS ton_total
       FROM base
       GROUP BY loai_ho_so, submission_kind, hinh_thuc_danh_gia
     ),
     stats AS (
       SELECT
         loai_ho_so,
         COALESCE(SUM(ton_truoc_total), 0) AS ton_truoc_total,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE submission_kind = 'first'), 0) AS ton_truoc_first,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE submission_kind = 'supplement'), 0) AS ton_truoc_supplement,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 1), 0) AS ton_truoc_first_hinh_thuc_1,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 2), 0) AS ton_truoc_first_hinh_thuc_2,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 1), 0) AS ton_truoc_supplement_hinh_thuc_1,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 2), 0) AS ton_truoc_supplement_hinh_thuc_2,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE hinh_thuc_danh_gia = 1), 0) AS ton_truoc_hinh_thuc_1,
         COALESCE(SUM(ton_truoc_total) FILTER (WHERE hinh_thuc_danh_gia = 2), 0) AS ton_truoc_hinh_thuc_2,
         COALESCE(SUM(da_nhan_total), 0) AS da_nhan_total,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE submission_kind = 'first'), 0) AS da_nhan_first,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE submission_kind = 'supplement'), 0) AS da_nhan_supplement,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 1), 0) AS da_nhan_first_hinh_thuc_1,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 2), 0) AS da_nhan_first_hinh_thuc_2,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 1), 0) AS da_nhan_supplement_hinh_thuc_1,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 2), 0) AS da_nhan_supplement_hinh_thuc_2,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE hinh_thuc_danh_gia = 1), 0) AS da_nhan_hinh_thuc_1,
         COALESCE(SUM(da_nhan_total) FILTER (WHERE hinh_thuc_danh_gia = 2), 0) AS da_nhan_hinh_thuc_2,
         COALESCE(SUM(giai_quyet_total), 0) AS giai_quyet_total,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE submission_kind = 'first'), 0) AS giai_quyet_first,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE submission_kind = 'supplement'), 0) AS giai_quyet_supplement,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 1), 0) AS giai_quyet_first_hinh_thuc_1,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 2), 0) AS giai_quyet_first_hinh_thuc_2,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 1), 0) AS giai_quyet_supplement_hinh_thuc_1,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 2), 0) AS giai_quyet_supplement_hinh_thuc_2,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE hinh_thuc_danh_gia = 1), 0) AS giai_quyet_hinh_thuc_1,
         COALESCE(SUM(giai_quyet_total) FILTER (WHERE hinh_thuc_danh_gia = 2), 0) AS giai_quyet_hinh_thuc_2,
         COALESCE(SUM(ton_total), 0) AS ton_total,
         COALESCE(SUM(ton_total) FILTER (WHERE submission_kind = 'first'), 0) AS ton_first,
         COALESCE(SUM(ton_total) FILTER (WHERE submission_kind = 'supplement'), 0) AS ton_supplement,
         COALESCE(SUM(ton_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 1), 0) AS ton_first_hinh_thuc_1,
         COALESCE(SUM(ton_total) FILTER (WHERE submission_kind = 'first' AND hinh_thuc_danh_gia = 2), 0) AS ton_first_hinh_thuc_2,
         COALESCE(SUM(ton_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 1), 0) AS ton_supplement_hinh_thuc_1,
         COALESCE(SUM(ton_total) FILTER (WHERE submission_kind = 'supplement' AND hinh_thuc_danh_gia = 2), 0) AS ton_supplement_hinh_thuc_2,
         COALESCE(SUM(ton_total) FILTER (WHERE hinh_thuc_danh_gia = 1), 0) AS ton_hinh_thuc_1,
         COALESCE(SUM(ton_total) FILTER (WHERE hinh_thuc_danh_gia = 2), 0) AS ton_hinh_thuc_2
       FROM grouped
       GROUP BY loai_ho_so
     ),
     treo AS (
       SELECT loai_ho_so, treo
       FROM mv_stats_tt48_treo_by_loai
     )
     SELECT s.*, COALESCE(t.treo, 0) AS treo
     FROM stats s
     LEFT JOIN treo t ON t.loai_ho_so = s.loai_ho_so
     ORDER BY s.loai_ho_so`,
    [fromDt, toDt]
  );

  return {
    thu_tuc: 48,
    from_date: fromDate,
    to_date: toDate,
    rows: rows.map((row) => ({
      loai_ho_so: row.loai_ho_so,
        ton_truoc_total: toCount(row.ton_truoc_total),
        ton_truoc_first: toCount(row.ton_truoc_first),
        ton_truoc_supplement: toCount(row.ton_truoc_supplement),
        ton_truoc_first_hinh_thuc_1: toCount(row.ton_truoc_first_hinh_thuc_1),
        ton_truoc_first_hinh_thuc_2: toCount(row.ton_truoc_first_hinh_thuc_2),
        ton_truoc_supplement_hinh_thuc_1: toCount(row.ton_truoc_supplement_hinh_thuc_1),
        ton_truoc_supplement_hinh_thuc_2: toCount(row.ton_truoc_supplement_hinh_thuc_2),
        ton_truoc_hinh_thuc_1: toCount(row.ton_truoc_hinh_thuc_1),
        ton_truoc_hinh_thuc_2: toCount(row.ton_truoc_hinh_thuc_2),
        da_nhan_total: toCount(row.da_nhan_total),
        da_nhan_first: toCount(row.da_nhan_first),
        da_nhan_supplement: toCount(row.da_nhan_supplement),
        da_nhan_first_hinh_thuc_1: toCount(row.da_nhan_first_hinh_thuc_1),
        da_nhan_first_hinh_thuc_2: toCount(row.da_nhan_first_hinh_thuc_2),
        da_nhan_supplement_hinh_thuc_1: toCount(row.da_nhan_supplement_hinh_thuc_1),
        da_nhan_supplement_hinh_thuc_2: toCount(row.da_nhan_supplement_hinh_thuc_2),
        da_nhan_hinh_thuc_1: toCount(row.da_nhan_hinh_thuc_1),
        da_nhan_hinh_thuc_2: toCount(row.da_nhan_hinh_thuc_2),
        giai_quyet_total: toCount(row.giai_quyet_total),
        giai_quyet_first: toCount(row.giai_quyet_first),
        giai_quyet_supplement: toCount(row.giai_quyet_supplement),
        giai_quyet_first_hinh_thuc_1: toCount(row.giai_quyet_first_hinh_thuc_1),
        giai_quyet_first_hinh_thuc_2: toCount(row.giai_quyet_first_hinh_thuc_2),
        giai_quyet_supplement_hinh_thuc_1: toCount(row.giai_quyet_supplement_hinh_thuc_1),
        giai_quyet_supplement_hinh_thuc_2: toCount(row.giai_quyet_supplement_hinh_thuc_2),
        giai_quyet_hinh_thuc_1: toCount(row.giai_quyet_hinh_thuc_1),
        giai_quyet_hinh_thuc_2: toCount(row.giai_quyet_hinh_thuc_2),
        ton_total: toCount(row.ton_total),
        ton_first: toCount(row.ton_first),
        ton_supplement: toCount(row.ton_supplement),
        ton_first_hinh_thuc_1: toCount(row.ton_first_hinh_thuc_1),
        ton_first_hinh_thuc_2: toCount(row.ton_first_hinh_thuc_2),
        ton_supplement_hinh_thuc_1: toCount(row.ton_supplement_hinh_thuc_1),
        ton_supplement_hinh_thuc_2: toCount(row.ton_supplement_hinh_thuc_2),
        ton_hinh_thuc_1: toCount(row.ton_hinh_thuc_1),
        ton_hinh_thuc_2: toCount(row.ton_hinh_thuc_2),
        treo: toCount(row.treo),
    })),
  };
}

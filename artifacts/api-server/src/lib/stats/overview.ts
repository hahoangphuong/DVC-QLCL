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
  const [nhanRows, gqRows] = await Promise.all([
    query<{ yr: string; mo: string; cnt: string }>(
      buildMonthlyAggregateSql("mv_stats_received_monthly"),
      [thuTuc]
    ),
    query<{ yr: string; mo: string; cnt: string }>(
      buildMonthlyAggregateSql("mv_stats_resolved_monthly"),
      [thuTuc]
    ),
  ]);

  const nhanMap = new Map(nhanRows.map((row) => [`${row.yr}-${row.mo}`, toCount(row.cnt)]));
  const gqMap = new Map(gqRows.map((row) => [`${row.yr}-${row.mo}`, toCount(row.cnt)]));
  const allKeys = [...new Set([...nhanMap.keys(), ...gqMap.keys()])].sort((left, right) => {
    const [leftYear, leftMonth] = left.split("-").map(Number);
    const [rightYear, rightMonth] = right.split("-").map(Number);
    return leftYear !== rightYear ? leftYear - rightYear : leftMonth - rightMonth;
  });

  let cumNhan = 0;
  let cumGq = 0;
  const months = allKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const daNhan = nhanMap.get(key) ?? 0;
    const daGiaiQuyet = gqMap.get(key) ?? 0;
    cumNhan += daNhan;
    cumGq += daGiaiQuyet;
    return {
      label: `T${month}-${year}`,
      year,
      month,
      da_nhan: daNhan,
      da_giai_quyet: daGiaiQuyet,
      ton_sau: cumNhan - cumGq,
    };
  });

  return { thu_tuc: thuTuc, months };
}

export async function getTt48LoaiHoSoStats(fromDate: string, toDate: string) {
  const { fromDt, toDt } = toDateRange(fromDate, toDate);
  const rows = await query<{
    loai_ho_so: string;
    ton_truoc_total: string;
    ton_truoc_first: string;
    ton_truoc_supplement: string;
    da_nhan_total: string;
    da_nhan_first: string;
    da_nhan_supplement: string;
    giai_quyet_total: string;
    giai_quyet_first: string;
    giai_quyet_supplement: string;
    ton_total: string;
    ton_first: string;
    ton_supplement: string;
    treo: string;
  }>(
    `WITH
     ${buildCaseFactsCte("48")},
     base AS (
       SELECT
         loai_ho_so,
         submission_kind,
         ngay_nhan,
         nhan_hen_tra,
         da_xu_ly_id,
         ngay_tra,
         kq_hen_tra,
         trang_thai,
         is_active
       FROM case_facts
       WHERE loai_ho_so IN ('A', 'B', 'C', 'D')
         AND (is_active OR da_xu_ly_id IS NOT NULL)
     ),
     stats AS (
       SELECT
         loai_ho_so,
         COUNT(*) FILTER (WHERE ngay_nhan < $1 AND (ngay_tra IS NULL OR ngay_tra >= $1)) AS ton_truoc_total,
         COUNT(*) FILTER (WHERE submission_kind = 'first' AND ngay_nhan < $1 AND (ngay_tra IS NULL OR ngay_tra >= $1)) AS ton_truoc_first,
         COUNT(*) FILTER (WHERE submission_kind = 'supplement' AND ngay_nhan < $1 AND (ngay_tra IS NULL OR ngay_tra >= $1)) AS ton_truoc_supplement,
         COUNT(*) FILTER (WHERE ngay_nhan >= $1 AND ngay_nhan <= $2) AS da_nhan_total,
         COUNT(*) FILTER (WHERE submission_kind = 'first' AND ngay_nhan >= $1 AND ngay_nhan <= $2) AS da_nhan_first,
         COUNT(*) FILTER (WHERE submission_kind = 'supplement' AND ngay_nhan >= $1 AND ngay_nhan <= $2) AS da_nhan_supplement,
         COUNT(*) FILTER (WHERE ngay_tra >= $1 AND ngay_tra <= $2) AS giai_quyet_total,
         COUNT(*) FILTER (WHERE submission_kind = 'first' AND ngay_tra >= $1 AND ngay_tra <= $2) AS giai_quyet_first,
         COUNT(*) FILTER (WHERE submission_kind = 'supplement' AND ngay_tra >= $1 AND ngay_tra <= $2) AS giai_quyet_supplement,
         COUNT(*) FILTER (WHERE ngay_nhan <= $2 AND (ngay_tra IS NULL OR ngay_tra > $2) AND is_active) AS ton_total,
         COUNT(*) FILTER (WHERE submission_kind = 'first' AND ngay_nhan <= $2 AND (ngay_tra IS NULL OR ngay_tra > $2) AND is_active) AS ton_first,
         COUNT(*) FILTER (WHERE submission_kind = 'supplement' AND ngay_nhan <= $2 AND (ngay_tra IS NULL OR ngay_tra > $2) AND is_active) AS ton_supplement
       FROM base
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
      da_nhan_total: toCount(row.da_nhan_total),
      da_nhan_first: toCount(row.da_nhan_first),
      da_nhan_supplement: toCount(row.da_nhan_supplement),
      giai_quyet_total: toCount(row.giai_quyet_total),
      giai_quyet_first: toCount(row.giai_quyet_first),
      giai_quyet_supplement: toCount(row.giai_quyet_supplement),
      ton_total: toCount(row.ton_total),
      ton_first: toCount(row.ton_first),
      ton_supplement: toCount(row.ton_supplement),
      treo: toCount(row.treo),
    })),
  };
}

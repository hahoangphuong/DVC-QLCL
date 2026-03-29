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
    `SELECT MIN((data->>'ngayTiepNhan')::timestamptz) AS min
     FROM tra_cuu_chung
     WHERE (data->>'thuTucId')::int = $1
       AND data->>'ngayTiepNhan' IS NOT NULL`,
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
     gq AS (
       SELECT COUNT(*) AS cnt
       FROM da_xu_ly
       WHERE thu_tuc = $1
         AND NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
         AND (data->>'ngayTraKetQua')::timestamptz >= $2
         AND (data->>'ngayTraKetQua')::timestamptz <= $3
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
     FROM case_facts`,
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
         WHERE NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
           AND (data->>'ngayTraKetQua')::timestamptz >= $2
           AND (data->>'ngayTraKetQua')::timestamptz <= $3
           AND NULLIF(data->>'ngayHenTra', '') IS NOT NULL
           AND (data->>'ngayTraKetQua')::timestamptz <= (data->>'ngayHenTra')::timestamptz
       ) AS dung_han,
       COUNT(*) FILTER (
         WHERE NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL
           AND (data->>'ngayTraKetQua')::timestamptz >= $2
           AND (data->>'ngayTraKetQua')::timestamptz <= $3
           AND (
                 NULLIF(data->>'ngayHenTra', '') IS NULL
              OR (data->>'ngayTraKetQua')::timestamptz > (data->>'ngayHenTra')::timestamptz
           )
       ) AS qua_han
     FROM da_xu_ly
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
    `WITH ${buildCaseFactsCte("$1")}
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
     FROM case_facts`,
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

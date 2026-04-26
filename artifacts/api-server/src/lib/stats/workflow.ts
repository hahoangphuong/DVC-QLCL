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

function normalizeLookupExpertText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^CG\s*:\s*/i, "").trim() || null;
}

export async function getChuyenVienStats(thuTuc: number, fromDate: string, toDate: string) {
  const { fromDt, toDt } = toDateRange(fromDate, toDate);
  if (thuTuc === 46 || thuTuc === 47) {
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
       ${buildWorkflowCasesCte("$1")},
       latest_dang_xu_ly AS (
         SELECT DISTINCT ON (thu_tuc, ma_ho_so)
           thu_tuc,
           ma_ho_so,
           don_vi,
           NULLIF(TRIM(nguoi_xu_ly), '') AS nguoi_xu_ly
         FROM mv_stats_workflow_cases
         WHERE thu_tuc = $1
         ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC NULLS LAST
       ),
       latest_tcc_roles AS (
         SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'maHoSo')
           (data->>'thuTucId')::int AS thu_tuc,
           data->>'maHoSo' AS ma_ho_so,
           NULLIF(TRIM(data->>'id'), '') AS tcc_id,
           NULLIF(TRIM(data->>'hoSoXuLyId_Active'), '') AS ho_so_xu_ly_id,
           NULLIF(TRIM(data->>'trangThaiHoSo'), '') AS trang_thai_ho_so,
           NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name,
           NULLIF(TRIM(data->>'chuyenVienThuLyName'), '') AS cv_thu_ly_name,
           CASE
             WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz
             ELSE NULL
           END AS ngay_tiep_nhan,
           CASE
             WHEN NULLIF(data->>'ngayHenTra', '') IS NOT NULL THEN (data->>'ngayHenTra')::timestamptz
             ELSE NULL
           END AS ngay_hen_tra,
           CASE
             WHEN NULLIF(data->>'ngayTraKetQua', '') IS NOT NULL THEN (data->>'ngayTraKetQua')::timestamptz
             ELSE NULL
           END AS ngay_tra_ket_qua
         FROM tra_cuu_chung
         WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
           AND (data->>'thuTucId')::int = $1
         ORDER BY
           (data->>'thuTucId')::int,
           data->>'maHoSo',
           CASE WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz END DESC NULLS LAST,
           NULLIF(TRIM(data->>'id'), '') DESC NULLS LAST
       ),
       latest_case_facts AS (
         SELECT DISTINCT ON (ma_ho_so)
           ma_ho_so,
           nhan_hen_tra,
           ngay_nhan
         FROM case_facts
         ORDER BY ma_ho_so, ngay_nhan DESC NULLS LAST
       ),
       tt47_46_case_facts_raw AS (
         SELECT
           cf.ma_ho_so,
           CASE
             WHEN NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL THEN NULL
             ELSE REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i')
           END AS cv_name,
           cf.ngay_nhan,
           cf.nhan_hen_tra,
           cf.ngay_tra,
           cf.kq_hen_tra,
           cf.trang_thai,
           cf.is_active,
           roles.trang_thai_ho_so
         FROM case_facts cf
         LEFT JOIN da_xu_ly d
           ON d.thu_tuc = $1
          AND cf.da_xu_ly_id IS NOT NULL
          AND d.data->>'id' = cf.da_xu_ly_id
         LEFT JOIN latest_dang_xu_ly dx
           ON dx.thu_tuc = $1
          AND dx.ma_ho_so = cf.ma_ho_so
         LEFT JOIN latest_tcc_roles roles
           ON roles.thu_tuc = $1
          AND (roles.tcc_id = cf.tcc_id OR roles.ma_ho_so = cf.ma_ho_so)
         WHERE is_active OR da_xu_ly_id IS NOT NULL
       ),
       tt47_46_case_facts AS (
         SELECT
           ma_ho_so,
           MAX(cv_name) AS cv_name,
           MIN(ngay_nhan) AS ngay_nhan,
           MAX(nhan_hen_tra) AS nhan_hen_tra,
           MAX(ngay_tra) AS ngay_tra,
           MAX(kq_hen_tra) AS kq_hen_tra,
           MAX(CASE WHEN trang_thai = '4' OR trang_thai_ho_so = '4' THEN 1 ELSE 0 END) AS has_can_bo_sung,
           MAX(CASE WHEN trang_thai = '7' OR trang_thai_ho_so = '7' THEN 1 ELSE 0 END) AS has_khong_dat,
           MAX(CASE WHEN trang_thai = '6' OR trang_thai_ho_so = '6' THEN 1 ELSE 0 END) AS has_hoan_thanh,
           MAX(CASE WHEN is_active THEN 1 ELSE 0 END) AS is_active,
           MAX(
             CASE
               WHEN trang_thai_ho_so IN (
                 '210',
                 '220',
                 'H\u1ed3 s\u01a1 c\u1ea7n n\u1ed9p b\u00e1o c\u00e1o thu h\u1ed3i',
                 'H\u1ed3 s\u01a1 \u0111\u00e3 n\u1ed9p b\u00e1o c\u00e1o kh\u1eafc ph\u1ee5c'
               ) THEN 1
               ELSE 0
             END
           ) AS is_cho_capa
         FROM tt47_46_case_facts_raw
         WHERE cv_name IS NOT NULL
         GROUP BY ma_ho_so
       ),
       workflow_base AS (
         SELECT
           CASE
             WHEN don_vi = 'Ph\u00f2ng ban ph\u00e2n c\u00f4ng' THEN '__CHUA_PHAN__'
             WHEN don_vi = 'Chuy\u00ean vi\u00ean ph\u1ed1i h\u1ee3p th\u1ea9m \u0111\u1ecbnh' THEN CASE
               WHEN NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL THEN NULL
               ELSE REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i')
             END
             WHEN don_vi = 'Chuy\u00ean vi\u00ean'
               AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
             THEN COALESCE(
               CASE
                 WHEN NULLIF(TRIM(roles.cv_thu_ly_name), '') IS NULL THEN NULL
                 ELSE REGEXP_REPLACE(TRIM(roles.cv_thu_ly_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i')
               END,
               NULLIF(TRIM(cv_name), '')
             )
             ELSE cv_name
           END AS cv_name,
           workflow_cases.ma_ho_so,
           qua_han_ngay,
           ngay_nhan,
           roles.trang_thai_ho_so,
           NULLIF(TRIM(roles.cv_phoi_hop_name), '') AS cv_phoi_hop_name_raw,
           CASE
             WHEN don_vi = 'Ph\u00f2ng ban ph\u00e2n c\u00f4ng' THEN 'cho_phan_cong'
             WHEN don_vi = 'Chuy\u00ean vi\u00ean ph\u1ed1i h\u1ee3p th\u1ea9m \u0111\u1ecbnh' THEN 'dang_xu_ly'
             WHEN don_vi = 'Chuy\u00ean vi\u00ean'
               AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
             THEN 'dang_tham_dinh'
             ELSE NULL
           END AS buoc_tt47_46
         FROM workflow_cases
         LEFT JOIN latest_tcc_roles roles
           ON roles.thu_tuc = $1
          AND roles.ma_ho_so = workflow_cases.ma_ho_so
         WHERE don_vi IN ('Ph\u00f2ng ban ph\u00e2n c\u00f4ng', 'Chuy\u00ean vi\u00ean', 'Chuy\u00ean vi\u00ean ph\u1ed1i h\u1ee3p th\u1ea9m \u0111\u1ecbnh')
       ),
       capa_base AS (
         SELECT
           REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i') AS cv_name,
           roles.ma_ho_so,
           CASE
             WHEN cf.nhan_hen_tra IS NOT NULL THEN (CURRENT_DATE - ((cf.nhan_hen_tra AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::int
             ELSE 0
           END AS qua_han_ngay,
           COALESCE(cf.ngay_nhan, roles.ngay_tiep_nhan) AS ngay_nhan,
           CASE
             WHEN roles.trang_thai_ho_so = '210' THEN 'cho_nop_capa'
             WHEN roles.trang_thai_ho_so = '220' THEN 'cho_danh_gia_capa'
             ELSE NULL
           END AS buoc_tt47_46
         FROM latest_tcc_roles roles
         LEFT JOIN latest_case_facts cf
           ON cf.ma_ho_so = roles.ma_ho_so
         WHERE NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NOT NULL
           AND roles.trang_thai_ho_so IN ('220', '210')
       ),
       pending_base AS (
         SELECT cv_name, ma_ho_so, qua_han_ngay, ngay_nhan, buoc_tt47_46
         FROM workflow_base
         WHERE NOT (
           cv_phoi_hop_name_raw IS NOT NULL
           AND trang_thai_ho_so IN ('220', '210')
         )
         UNION ALL
         SELECT cv_name, ma_ho_so, qua_han_ngay, ngay_nhan, buoc_tt47_46
         FROM capa_base
       ),
       pending_stats AS (
         SELECT
           cv_name,
           COUNT(*) FILTER (WHERE buoc_tt47_46 IN ('dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa')) AS ton_sau_tong,
           COUNT(*) FILTER (WHERE buoc_tt47_46 IN ('dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa') AND qua_han_ngay <= 0) AS ton_sau_con_han,
           COUNT(*) FILTER (WHERE buoc_tt47_46 IN ('dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa') AND qua_han_ngay > 0) AS ton_sau_qua_han
         FROM pending_base
         WHERE buoc_tt47_46 IS NOT NULL
           AND cv_name IS NOT NULL
           AND cv_name <> '__CHUA_PHAN__'
         GROUP BY cv_name
       ),
       resolved_lookup_stats AS (
         SELECT
           REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i') AS cv_name,
           COUNT(*) FILTER (WHERE resolved_at >= $2 AND resolved_at <= $3) AS gq_tong,
           COUNT(*) FILTER (WHERE resolved_at >= $2 AND resolved_at <= $3 AND trang_thai_ho_so = '4') AS can_bo_sung,
           COUNT(*) FILTER (WHERE resolved_at >= $2 AND resolved_at <= $3 AND trang_thai_ho_so = '7') AS khong_dat,
           COUNT(*) FILTER (WHERE resolved_at >= $2 AND resolved_at <= $3 AND trang_thai_ho_so = '6') AS hoan_thanh,
           COUNT(*) FILTER (WHERE resolved_at >= $2 AND resolved_at <= $3 AND ngay_hen_tra IS NOT NULL AND resolved_at <= ngay_hen_tra) AS dung_han,
           COUNT(*) FILTER (WHERE resolved_at >= $2 AND resolved_at <= $3 AND (ngay_hen_tra IS NULL OR resolved_at > ngay_hen_tra)) AS qua_han,
           ROUND(
             AVG(EXTRACT(EPOCH FROM (resolved_at - ngay_tiep_nhan)) / 86400.0) FILTER (
               WHERE resolved_at >= $2 AND resolved_at <= $3
             )
           )::int AS tg_tb
         FROM (
           SELECT
             cv_phoi_hop_name,
             trang_thai_ho_so,
             ngay_tiep_nhan,
             ngay_hen_tra,
             COALESCE(ngay_tra_ket_qua, ngay_hen_tra, ngay_tiep_nhan) AS resolved_at
           FROM latest_tcc_roles
           WHERE NULLIF(TRIM(cv_phoi_hop_name), '') IS NOT NULL
             AND trang_thai_ho_so IN ('4', '6', '7')
         ) roles
         GROUP BY REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i')
       ),
       pending_dossiers AS (
         SELECT DISTINCT ON (ma_ho_so)
           ma_ho_so,
           cv_name,
           ngay_nhan
         FROM pending_base
         WHERE buoc_tt47_46 IN ('dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa')
           AND cv_name IS NOT NULL
           AND cv_name <> '__CHUA_PHAN__'
         ORDER BY ma_ho_so, ngay_nhan DESC NULLS LAST
       ),
       lookup_resolved_dossiers AS (
         SELECT
           roles.ma_ho_so,
           REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i') AS cv_name,
           roles.ngay_tiep_nhan AS ngay_nhan,
           COALESCE(roles.ngay_tra_ket_qua, roles.ngay_hen_tra, roles.ngay_tiep_nhan) AS resolved_at,
           roles.ngay_hen_tra AS kq_hen_tra,
           CASE WHEN roles.trang_thai_ho_so = '4' THEN 1 ELSE 0 END AS has_can_bo_sung,
           CASE WHEN roles.trang_thai_ho_so = '7' THEN 1 ELSE 0 END AS has_khong_dat,
           CASE WHEN roles.trang_thai_ho_so = '6' THEN 1 ELSE 0 END AS has_hoan_thanh,
           0 AS source_priority
         FROM latest_tcc_roles roles
         WHERE roles.trang_thai_ho_so IN ('4', '6', '7')
           AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NOT NULL
       ),
       base_dossiers_raw AS (
         SELECT
           cv_name,
           ma_ho_so,
           ngay_nhan,
           ngay_tra,
           CASE
             WHEN ngay_tra IS NOT NULL THEN ngay_tra
             WHEN COALESCE(has_can_bo_sung, 0) = 1
               OR COALESCE(has_khong_dat, 0) = 1
               OR COALESCE(has_hoan_thanh, 0) = 1
             THEN COALESCE(kq_hen_tra, nhan_hen_tra, ngay_nhan)
             ELSE NULL
           END AS resolved_at,
           kq_hen_tra,
           has_can_bo_sung,
           has_khong_dat,
           has_hoan_thanh,
           1 AS source_priority
         FROM tt47_46_case_facts
         UNION ALL
         SELECT
           cv_name,
           ma_ho_so,
           ngay_nhan,
           NULL::timestamptz AS ngay_tra,
           resolved_at,
           kq_hen_tra,
           has_can_bo_sung,
           has_khong_dat,
           has_hoan_thanh,
           source_priority
         FROM lookup_resolved_dossiers
       ),
       base_dossiers AS (
         SELECT DISTINCT ON (ma_ho_so)
           cv_name,
           ma_ho_so,
           ngay_nhan,
           ngay_tra,
           resolved_at,
           kq_hen_tra,
           has_can_bo_sung,
           has_khong_dat,
           has_hoan_thanh
         FROM base_dossiers_raw
         ORDER BY
           ma_ho_so,
           source_priority ASC,
           resolved_at DESC NULLS LAST,
           ngay_nhan DESC NULLS LAST
       ),
       dossier_index AS (
         SELECT
           COALESCE(p.cv_name, b.cv_name) AS cv_name,
           COALESCE(b.ma_ho_so, p.ma_ho_so) AS ma_ho_so,
           COALESCE(b.ngay_nhan, p.ngay_nhan) AS ngay_nhan,
           b.ngay_tra,
           b.resolved_at,
           b.kq_hen_tra,
           b.has_can_bo_sung,
           b.has_khong_dat,
           b.has_hoan_thanh,
           CASE WHEN p.ma_ho_so IS NOT NULL THEN 1 ELSE 0 END AS is_pending
         FROM base_dossiers b
         FULL OUTER JOIN pending_dossiers p
           ON b.ma_ho_so = p.ma_ho_so
       ),
       stats AS (
         SELECT
           cv_name,
           COUNT(*) FILTER (
             WHERE ngay_nhan < $2
                AND (
                  (ngay_tra IS NULL OR ngay_tra >= $2)
                  OR is_pending = 1
                )
           ) AS ton_truoc,
           COUNT(*) FILTER (WHERE ngay_nhan >= $2 AND ngay_nhan <= $3) AS da_nhan,
           COUNT(*) FILTER (
             WHERE resolved_at >= $2 AND resolved_at <= $3
               AND is_pending = 0
           ) AS gq_tong,
           COUNT(*) FILTER (
             WHERE resolved_at >= $2 AND resolved_at <= $3
               AND is_pending = 0
               AND has_can_bo_sung = 1
           ) AS can_bo_sung,
           COUNT(*) FILTER (
             WHERE (resolved_at >= $2 AND resolved_at <= $3)
               AND is_pending = 0
               AND has_khong_dat = 1
           ) AS khong_dat,
           COUNT(*) FILTER (
             WHERE (resolved_at >= $2 AND resolved_at <= $3)
               AND is_pending = 0
               AND has_hoan_thanh = 1
           ) AS hoan_thanh,
           COUNT(*) FILTER (
             WHERE resolved_at >= $2 AND resolved_at <= $3
               AND is_pending = 0
               AND kq_hen_tra IS NOT NULL
               AND resolved_at <= kq_hen_tra
           ) AS dung_han,
           COUNT(*) FILTER (
             WHERE resolved_at >= $2 AND resolved_at <= $3
               AND is_pending = 0
               AND (kq_hen_tra IS NULL OR resolved_at > kq_hen_tra)
           ) AS qua_han,
           ROUND(
             AVG(EXTRACT(EPOCH FROM (resolved_at - ngay_nhan)) / 86400.0) FILTER (
               WHERE resolved_at >= $2 AND resolved_at <= $3
                 AND is_pending = 0
             )
           )::int AS tg_tb
         FROM dossier_index
         GROUP BY cv_name
       ),
       treo_by_cv AS (
         SELECT cv_name, treo
         FROM mv_stats_treo_by_cv
         WHERE thu_tuc = $1
       ),
       all_cv_names AS (
         SELECT cv_name FROM stats
         UNION
         SELECT cv_name FROM pending_stats
         UNION
         SELECT cv_name FROM resolved_lookup_stats
       )
       SELECT
         n.cv_name,
         COALESCE(s.ton_truoc, 0) AS ton_truoc,
         COALESCE(s.da_nhan, 0) AS da_nhan,
         COALESCE(r.gq_tong, s.gq_tong, 0) AS gq_tong,
         COALESCE(r.can_bo_sung, s.can_bo_sung, 0) AS can_bo_sung,
         COALESCE(r.khong_dat, s.khong_dat, 0) AS khong_dat,
         COALESCE(r.hoan_thanh, s.hoan_thanh, 0) AS hoan_thanh,
         COALESCE(r.dung_han, s.dung_han, 0) AS dung_han,
         COALESCE(r.qua_han, s.qua_han, 0) AS qua_han,
         COALESCE(r.tg_tb, s.tg_tb) AS tg_tb,
         COALESCE(p.ton_sau_tong, 0) AS ton_sau_tong,
         COALESCE(p.ton_sau_con_han, 0) AS ton_sau_con_han,
         COALESCE(p.ton_sau_qua_han, 0) AS ton_sau_qua_han,
         COALESCE(t.treo, 0) AS treo
       FROM all_cv_names n
       LEFT JOIN stats s
         ON n.cv_name = s.cv_name
       LEFT JOIN pending_stats p
         ON n.cv_name = p.cv_name
       LEFT JOIN resolved_lookup_stats r
         ON n.cv_name = r.cv_name
       LEFT JOIN treo_by_cv t
         ON n.cv_name = t.cv_name`,
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

    return {
      thu_tuc: thuTuc,
      from_date: fromDate,
      to_date: toDate,
      cho_phan_cong: null,
      rows: sortByPriority(mappedRows, (row) => row.ten_cv),
    };
  }

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
         COUNT(*) FILTER (WHERE ngay_nhan <= $3 AND (ngay_tra IS NULL OR ngay_tra > $3)) AS ton_sau_tong,
         COUNT(*) FILTER (WHERE ngay_nhan <= $3 AND (ngay_tra IS NULL OR ngay_tra > $3) AND nhan_hen_tra IS NOT NULL AND nhan_hen_tra > $3) AS ton_sau_con_han,
         COUNT(*) FILTER (WHERE ngay_nhan <= $3 AND (ngay_tra IS NULL OR ngay_tra > $3) AND (nhan_hen_tra IS NULL OR nhan_hen_tra <= $3)) AS ton_sau_qua_han
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
           COUNT(*) FILTER (WHERE don_vi = 'Chuy\u00ean gia th\u1ea9m \u0111\u1ecbnh') AS cho_cg,
           COUNT(*) FILTER (WHERE buoc = 'cho_tong_hop') AS cho_tong_hop,
           COUNT(*) FILTER (WHERE don_vi = 'T\u1ed5 tr\u01b0\u1edfng chuy\u00ean gia') AS cho_to_truong,
           COUNT(*) FILTER (WHERE don_vi = 'Tr\u01b0\u1edfng ph\u00f2ng') AS cho_trp,
           COUNT(*) FILTER (WHERE buoc = 'cho_ket_thuc') AS cho_cong_bo,
           COUNT(*) FILTER (WHERE don_vi = 'Ph\u00f3 C\u1ee5c tr\u01b0\u1edfng') AS cho_pct,
           COUNT(*) FILTER (WHERE don_vi LIKE 'V\u0103n th\u01b0%') AS cho_van_thu,
           COUNT(*) FILTER (WHERE qua_han_ngay <= 0) AS con_han,
           COUNT(*) FILTER (WHERE qua_han_ngay > 0) AS qua_han,
           COUNT(*) FILTER (WHERE buoc = 'chua_xu_ly' AND qua_han_ngay <= 0) AS chua_xu_ly_con,
           COUNT(*) FILTER (WHERE buoc = 'chua_xu_ly' AND qua_han_ngay > 0) AS chua_xu_ly_qua,
           COUNT(*) FILTER (WHERE buoc = 'bi_tra_lai' AND qua_han_ngay <= 0) AS bi_tra_lai_con,
           COUNT(*) FILTER (WHERE buoc = 'bi_tra_lai' AND qua_han_ngay > 0) AS bi_tra_lai_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Chuy\u00ean gia th\u1ea9m \u0111\u1ecbnh' AND qua_han_ngay <= 0) AS cho_cg_con,
           COUNT(*) FILTER (WHERE don_vi = 'Chuy\u00ean gia th\u1ea9m \u0111\u1ecbnh' AND qua_han_ngay > 0) AS cho_cg_qua,
           COUNT(*) FILTER (WHERE buoc = 'cho_tong_hop' AND qua_han_ngay <= 0) AS cho_tong_hop_con,
           COUNT(*) FILTER (WHERE buoc = 'cho_tong_hop' AND qua_han_ngay > 0) AS cho_tong_hop_qua,
           COUNT(*) FILTER (WHERE don_vi = 'T\u1ed5 tr\u01b0\u1edfng chuy\u00ean gia' AND qua_han_ngay <= 0) AS cho_to_truong_con,
           COUNT(*) FILTER (WHERE don_vi = 'T\u1ed5 tr\u01b0\u1edfng chuy\u00ean gia' AND qua_han_ngay > 0) AS cho_to_truong_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Tr\u01b0\u1edfng ph\u00f2ng' AND qua_han_ngay <= 0) AS cho_trp_con,
           COUNT(*) FILTER (WHERE don_vi = 'Tr\u01b0\u1edfng ph\u00f2ng' AND qua_han_ngay > 0) AS cho_trp_qua,
           COUNT(*) FILTER (WHERE buoc = 'cho_ket_thuc' AND qua_han_ngay <= 0) AS cho_cong_bo_con,
           COUNT(*) FILTER (WHERE buoc = 'cho_ket_thuc' AND qua_han_ngay > 0) AS cho_cong_bo_qua,
           COUNT(*) FILTER (WHERE don_vi = 'Ph\u00f3 C\u1ee5c tr\u01b0\u1edfng' AND qua_han_ngay <= 0) AS cho_pct_con,
           COUNT(*) FILTER (WHERE don_vi = 'Ph\u00f3 C\u1ee5c tr\u01b0\u1edfng' AND qua_han_ngay > 0) AS cho_pct_qua,
           COUNT(*) FILTER (WHERE don_vi LIKE 'V\u0103n th\u01b0%' AND qua_han_ngay <= 0) AS cho_van_thu_con,
           COUNT(*) FILTER (WHERE don_vi LIKE 'V\u0103n th\u01b0%' AND qua_han_ngay > 0) AS cho_van_thu_qua
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
    cho_nop_capa: string;
    cho_danh_gia_capa: string;
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
     ${buildCaseFactsCte("$1")},
     latest_case_facts AS (
       SELECT DISTINCT ON (ma_ho_so)
         ma_ho_so,
         ngay_nhan,
         nhan_hen_tra
       FROM case_facts
       ORDER BY ma_ho_so, ngay_nhan DESC NULLS LAST
     ),
     latest_tcc_roles AS (
       SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'maHoSo')
         (data->>'thuTucId')::int AS thu_tuc,
         data->>'maHoSo' AS ma_ho_so,
         NULLIF(TRIM(data->>'chuyenVienThuLyName'), '') AS cv_thu_ly_name,
         NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name,
         NULLIF(TRIM(data->>'trangThaiHoSo'), '') AS trang_thai_ho_so,
         CASE WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz END AS ngay_tiep_nhan
       FROM tra_cuu_chung
       WHERE NULLIF(data->>'thuTucId', '') IS NOT NULL
         AND (data->>'thuTucId')::int = $1
       ORDER BY
         (data->>'thuTucId')::int,
         data->>'maHoSo',
         CASE WHEN NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL THEN (data->>'ngayTiepNhan')::timestamptz END DESC NULLS LAST,
         NULLIF(TRIM(data->>'id'), '') DESC NULLS LAST
     ),
      workflow_base AS (
        SELECT
          CASE
            WHEN don_vi = 'Ph\u00f2ng ban ph\u00e2n c\u00f4ng' THEN '__CHUA_PHAN__'
            WHEN don_vi = 'Chuy\u00ean vi\u00ean ph\u1ed1i h\u1ee3p th\u1ea9m \u0111\u1ecbnh' THEN COALESCE(
              NULLIF(TRIM(nguoi_xu_ly), ''),
              CASE
                WHEN NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL THEN NULL
               ELSE REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i')
             END,
             NULLIF(TRIM(cv_name), '')
           )
           WHEN don_vi = 'Chuy\u00ean vi\u00ean'
             AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
           THEN COALESCE(
             CASE
               WHEN NULLIF(TRIM(roles.cv_thu_ly_name), '') IS NULL THEN NULL
               ELSE REGEXP_REPLACE(TRIM(roles.cv_thu_ly_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i')
             END,
             NULLIF(TRIM(cv_name), '')
           )
           ELSE cv_name
         END AS cv_name,
          workflow_cases.ma_ho_so,
          qua_han_ngay,
          ngay_nhan,
          roles.trang_thai_ho_so,
          NULLIF(TRIM(roles.cv_phoi_hop_name), '') AS cv_phoi_hop_name_raw,
          CASE
            WHEN don_vi = 'Ph\u00f2ng ban ph\u00e2n c\u00f4ng' THEN 'cho_phan_cong'
            WHEN don_vi = 'Chuy\u00ean vi\u00ean ph\u1ed1i h\u1ee3p th\u1ea9m \u0111\u1ecbnh' THEN 'dang_xu_ly'
            WHEN don_vi = 'Chuy\u00ean vi\u00ean'
              AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
            THEN 'dang_tham_dinh'
            ELSE NULL
          END AS buoc_tt47_46
        FROM workflow_cases
        LEFT JOIN latest_tcc_roles roles
          ON roles.thu_tuc = $1
         AND roles.ma_ho_so = workflow_cases.ma_ho_so
        WHERE don_vi IN ('Ph\u00f2ng ban ph\u00e2n c\u00f4ng', 'Chuy\u00ean vi\u00ean', 'Chuy\u00ean vi\u00ean ph\u1ed1i h\u1ee3p th\u1ea9m \u0111\u1ecbnh')
      ),
      capa_base AS (
        SELECT
          REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(ph\u1ed1i h\u1ee3p|th\u1ee5 l\u00fd)\\s*:\\s*', '', 'i') AS cv_name,
          roles.ma_ho_so,
          CASE
            WHEN cf.nhan_hen_tra IS NOT NULL THEN (CURRENT_DATE - ((cf.nhan_hen_tra AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::int
            ELSE 0
          END AS qua_han_ngay,
          COALESCE(cf.ngay_nhan, roles.ngay_tiep_nhan) AS ngay_nhan,
          CASE
            WHEN roles.trang_thai_ho_so = '210' THEN 'cho_nop_capa'
            WHEN roles.trang_thai_ho_so = '220' THEN 'cho_danh_gia_capa'
            ELSE NULL
          END AS buoc_tt47_46
        FROM latest_tcc_roles roles
        LEFT JOIN latest_case_facts cf
          ON cf.ma_ho_so = roles.ma_ho_so
        WHERE NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NOT NULL
          AND roles.trang_thai_ho_so IN ('220', '210')
      ),
      base AS (
        SELECT cv_name, ma_ho_so, qua_han_ngay, ngay_nhan, buoc_tt47_46
        FROM workflow_base
        WHERE NOT (
          cv_phoi_hop_name_raw IS NOT NULL
          AND trang_thai_ho_so IN ('220', '210')
        )
        UNION ALL
        SELECT cv_name, ma_ho_so, qua_han_ngay, ngay_nhan, buoc_tt47_46
        FROM capa_base
      ),
       stats AS (
         SELECT
           cv_name,
           COUNT(*) FILTER (WHERE buoc_tt47_46 IN ('dang_tham_dinh', 'dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa')) AS tong,
           COUNT(*) FILTER (WHERE buoc_tt47_46 = 'dang_tham_dinh') AS cho_cv,
           COUNT(*) FILTER (WHERE buoc_tt47_46 = 'dang_xu_ly') AS cho_cg,
           COUNT(*) FILTER (WHERE buoc_tt47_46 = 'cho_nop_capa') AS cho_nop_capa,
           COUNT(*) FILTER (WHERE buoc_tt47_46 = 'cho_danh_gia_capa') AS cho_danh_gia_capa,
           0::bigint AS cho_to_truong,
           0::bigint AS cho_trp,
           0::bigint AS cho_pct,
           0::bigint AS cho_van_thu,
           COUNT(*) FILTER (WHERE buoc_tt47_46 IN ('dang_tham_dinh', 'dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa') AND qua_han_ngay <= 0) AS con_han,
           COUNT(*) FILTER (WHERE buoc_tt47_46 IN ('dang_tham_dinh', 'dang_xu_ly', 'cho_nop_capa', 'cho_danh_gia_capa') AND qua_han_ngay > 0) AS qua_han
         FROM base
         WHERE buoc_tt47_46 IS NOT NULL
         GROUP BY cv_name
     ),
     cham_nhat AS (
       SELECT DISTINCT ON (cv_name)
         cv_name,
         qua_han_ngay AS cham_so_ngay,
         ma_ho_so AS cham_ma,
         ngay_nhan AS cham_ngay
       FROM base
       WHERE buoc_tt47_46 IS NOT NULL
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
    cho_nop_capa: toCount(row.cho_nop_capa),
    cho_danh_gia_capa: toCount(row.cho_danh_gia_capa),
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
    ten_chuyen_gia: string;
    da_giai_quyet: string;
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
     ${buildCaseFactsCte("$1")},
     latest_case_facts AS (
       SELECT DISTINCT ON (ma_ho_so)
         ma_ho_so,
         REGEXP_REPLACE(TRIM(chuyen_gia_name), '^CG\\s*:\\s*', '', 'i') AS chuyen_gia_name
       FROM case_facts
       WHERE NULLIF(TRIM(chuyen_gia_name), '') IS NOT NULL
       ORDER BY ma_ho_so, ngay_nhan DESC NULLS LAST
     ),
     all_expert_names AS (
       SELECT DISTINCT REGEXP_REPLACE(TRIM(chuyen_gia_name), '^CG\\s*:\\s*', '', 'i') AS ten_chuyen_gia
       FROM case_facts
       WHERE NULLIF(TRIM(chuyen_gia_name), '') IS NOT NULL
     ),
     resolved_case_facts AS (
       SELECT DISTINCT
         COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) AS luot_xu_ly_id,
         REGEXP_REPLACE(TRIM(chuyen_gia_name), '^CG\\s*:\\s*', '', 'i') AS ten_chuyen_gia
       FROM case_facts
       WHERE NULLIF(TRIM(chuyen_gia_name), '') IS NOT NULL
         AND (da_xu_ly_id IS NOT NULL OR trang_thai IN ('4', '6', '7'))
         AND COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) IS NOT NULL
     ),
     resolved_stats AS (
       SELECT
         ten_chuyen_gia,
         COUNT(*) AS da_giai_quyet
       FROM resolved_case_facts
       GROUP BY ten_chuyen_gia
     ),
     cg_base AS (
       SELECT
         COALESCE(
           NULLIF(TRIM(cf.chuyen_gia_name), ''),
           REGEXP_REPLACE(TRIM(nguoi_xu_ly), '^CG\\s*:\\s*', '', 'i')
         ) AS ten_chuyen_gia,
         workflow_cases.qua_han_ngay,
         workflow_cases.ngay_nhan,
         workflow_cases.ma_ho_so,
         COALESCE(NULLIF(TRIM(cv_name), ''), '') AS cv_thu_ly
       FROM workflow_cases
       LEFT JOIN latest_case_facts cf ON cf.ma_ho_so = workflow_cases.ma_ho_so
       WHERE don_vi = 'Chuy\u00ean gia th\u1ea9m \u0111\u1ecbnh'
         AND COALESCE(
           NULLIF(TRIM(cf.chuyen_gia_name), ''),
           NULLIF(TRIM(nguoi_xu_ly), '')
         ) IS NOT NULL
     ),
     stats AS (
       SELECT
         ten_chuyen_gia,
         COUNT(*) AS tong,
         COUNT(*) FILTER (WHERE qua_han_ngay <= 0) AS con_han,
         COUNT(*) FILTER (WHERE qua_han_ngay > 0) AS qua_han
       FROM cg_base
       GROUP BY ten_chuyen_gia
     ),
     cham_nhat AS (
       SELECT DISTINCT ON (ten_chuyen_gia)
         ten_chuyen_gia,
         qua_han_ngay AS cham_so_ngay,
         ma_ho_so AS cham_ma,
         ngay_nhan AS cham_ngay,
         cv_thu_ly AS cham_cv
       FROM cg_base
       ORDER BY ten_chuyen_gia, qua_han_ngay DESC
     )
     SELECT
       names.ten_chuyen_gia,
       COALESCE(rs.da_giai_quyet, 0) AS da_giai_quyet,
       COALESCE(s.tong, 0) AS tong,
       COALESCE(s.con_han, 0) AS con_han,
       COALESCE(s.qua_han, 0) AS qua_han,
       COALESCE(cn.cham_so_ngay, 0) AS cham_so_ngay,
       cn.cham_ma,
       cn.cham_ngay,
       cn.cham_cv
     FROM all_expert_names names
     LEFT JOIN resolved_stats rs ON rs.ten_chuyen_gia = names.ten_chuyen_gia
     LEFT JOIN stats s ON s.ten_chuyen_gia = names.ten_chuyen_gia
     LEFT JOIN cham_nhat cn ON cn.ten_chuyen_gia = names.ten_chuyen_gia`,
    [thuTuc]
  );

  const mappedRows = rows.map((row) => ({
    ten: row.ten_chuyen_gia,
    da_giai_quyet: toCount(row.da_giai_quyet),
    tong: toCount(row.tong),
    con_han: toCount(row.con_han),
    qua_han: toCount(row.qua_han),
    cham_so_ngay: toCount(row.cham_so_ngay),
    cham_ma: row.cham_ma ?? null,
    cham_ngay: row.cham_ngay ?? null,
    cham_cv: row.cham_cv ?? null,
  }));

  const resultMap = new Map(mappedRows.map((row) => [row.ten, row]));
  const expertNamesFromDb = Array.from(new Set(
    mappedRows
      .map((row) => row.ten)
      .filter((name) => !CV_BARE_SET.has(name))
  )).sort((left, right) => left.localeCompare(right, "vi"));

  const cvCgNamesFromDb = Array.from(new Set(
    mappedRows
      .map((row) => row.ten)
      .filter((name) => CV_BARE_SET.has(name))
  ));

  const zeroRow = (name: string) => (
    resultMap.get(name) ?? {
      ten: name,
      da_giai_quyet: 0,
      tong: 0,
      con_han: 0,
      qua_han: 0,
      cham_so_ngay: 0,
      cham_ma: null,
      cham_ngay: null,
      cham_cv: null,
    }
  );

  const chuyenGia = expertNamesFromDb.map((name) => zeroRow(name));
  const chuyenVienCg = sortByPriority(cvCgNamesFromDb, (name) => `CV thÃƒÂ¡Ã‚Â»Ã‚Â¥ lÃƒÆ’Ã‚Â½ : ${name}`).map((name) => zeroRow(name));

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
    ngay_nhan,
    nhan_hen_tra,
    chuyen_gia_name
  FROM mv_stats_case_facts
  WHERE ($1::int IS NULL OR thu_tuc = $1)
  ORDER BY thu_tuc, ma_ho_so, ngay_nhan DESC NULLS LAST
),
latest_workflow_experts AS (
  SELECT DISTINCT ON (thu_tuc, ma_ho_so)
    thu_tuc,
    ma_ho_so,
    REGEXP_REPLACE(TRIM(nguoi_xu_ly), '^CG\\s*:\\s*', '', 'i') AS chuyen_gia_name
  FROM mv_stats_workflow_cases
  WHERE ($1::int IS NULL OR thu_tuc = $1)
    AND don_vi = 'Chuyên gia thẩm định'
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
  WHERE ($1::int IS NULL OR (data->>'thuTucId')::int = $1)
    AND NULLIF(data->>'thuTucId', '') IS NOT NULL
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
      WHEN w.don_vi = 'Phòng ban phân công' THEN 'cho_phan_cong'
      WHEN w.thu_tuc IN (46, 47)
        AND w.don_vi = 'Chuyên viên phối hợp thẩm định'
      THEN 'dang_xu_ly'
      WHEN w.thu_tuc IN (46, 47)
        AND w.don_vi = 'Chuyên viên'
        AND NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL
      THEN 'dang_tham_dinh'
      WHEN w.thu_tuc = 48 AND w.buoc = 'chua_xu_ly' THEN 'chua_xu_ly'
      WHEN w.thu_tuc = 48 AND w.buoc = 'bi_tra_lai' THEN 'bi_tra_lai'
      WHEN w.thu_tuc = 48 AND w.buoc = 'cho_tong_hop' THEN 'cho_tong_hop'
      WHEN w.don_vi = 'Chuyên gia thẩm định' THEN 'cho_chuyen_gia'
      WHEN w.don_vi = 'Tổ trưởng chuyên gia' THEN 'cho_to_truong'
      WHEN w.don_vi = 'Trưởng phòng' THEN 'cho_truong_phong'
      WHEN w.don_vi LIKE 'Văn thư%' THEN 'cho_van_thu'
      WHEN w.buoc = 'cho_ket_thuc' OR w.don_vi = 'Phó Cục trưởng' THEN 'cho_cong_bo'
      WHEN w.buoc IN ('chua_xu_ly', 'bi_tra_lai', 'cho_tong_hop')
        OR w.don_vi IN ('Chuyên viên')
      THEN 'cho_chuyen_vien'
      ELSE 'cho_chuyen_vien'
    END AS tinh_trang,
    CASE
      WHEN w.don_vi = 'Phòng ban phân công' THEN NULL
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
      WHEN w.don_vi = 'Phòng ban phân công' THEN NULL
      WHEN NULLIF(TRIM(cf.chuyen_gia_name), '') IS NOT NULL THEN REGEXP_REPLACE(TRIM(cf.chuyen_gia_name), '^CG\\s*:\\s*', '', 'i')
      WHEN NULLIF(TRIM(we.chuyen_gia_name), '') IS NOT NULL THEN we.chuyen_gia_name
      ELSE NULL
    END AS chuyen_gia,
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
  FROM mv_stats_workflow_cases w
  LEFT JOIN latest_case_facts cf
    ON cf.thu_tuc = w.thu_tuc
   AND cf.ma_ho_so = w.ma_ho_so
  LEFT JOIN latest_tcc_roles roles
    ON roles.thu_tuc = w.thu_tuc
   AND roles.ma_ho_so = w.ma_ho_so
  LEFT JOIN latest_workflow_experts we
    ON we.thu_tuc = w.thu_tuc
   AND we.ma_ho_so = w.ma_ho_so
  WHERE ($1::int IS NULL OR w.thu_tuc = $1)
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
),
workflow_base AS (
  SELECT *
  FROM workflow_rows
  WHERE NOT (
    thu_tuc IN (46, 47)
    AND ma_ho_so IN (SELECT ma_ho_so FROM capa_base)
  )
  UNION ALL
  SELECT *
  FROM capa_base
)`;

export async function getDangXuLyLookup(filters: PendingLookupFilters) {
  const thuTuc = filters.thuTuc ?? null;
  const chuyenVien = normalizeLookupText(filters.chuyenVien);
  const chuyenGia = normalizeLookupExpertText(filters.chuyenGia);
  const tinhTrang = normalizeLookupText(filters.tinhTrang);
  const maHoSo = normalizeLookupText(filters.maHoSo);

  const [optionRows, rows] = await Promise.all([
    query<PendingLookupOptionRow>(
      `${PENDING_LOOKUP_BASE_CTE}
       SELECT DISTINCT chuyen_vien, chuyen_gia
       FROM workflow_base
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

export async function getDaXuLyLookup(filters: PendingLookupFilters) {
  const thuTuc = filters.thuTuc ?? null;
  const chuyenVien = normalizeLookupText(filters.chuyenVien);
  const chuyenGia = normalizeLookupExpertText(filters.chuyenGia);
  const tinhTrang = normalizeLookupText(filters.tinhTrang);
  const maHoSo = normalizeLookupText(filters.maHoSo);

  const [optionRows, rows] = await Promise.all([
    query<PendingLookupOptionRow>(
      `WITH latest_case_facts AS (
         SELECT DISTINCT ON (thu_tuc, luot_xu_ly_id)
           thu_tuc,
           COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) AS luot_xu_ly_id,
           ma_ho_so,
           tcc_id,
           cv_name_raw,
           chuyen_gia_name
         FROM mv_stats_case_facts
         WHERE ($1::int IS NULL OR thu_tuc = $1)
           AND trang_thai IN ('4', '6', '7')
           AND COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) IS NOT NULL
         ORDER BY thu_tuc, luot_xu_ly_id, ngay_tra DESC NULLS LAST, ngay_nhan DESC NULLS LAST
       ),
       latest_tcc_roles AS (
         SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'id')
           (data->>'thuTucId')::int AS thu_tuc,
           NULLIF(TRIM(data->>'id'), '') AS tcc_id,
           data->>'maHoSo' AS ma_ho_so,
           NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name
         FROM tra_cuu_chung
         WHERE ($1::int IS NULL OR (data->>'thuTucId')::int = $1)
           AND NULLIF(data->>'thuTucId', '') IS NOT NULL
       ),
       resolved_enriched AS (
         SELECT
           CASE
             WHEN l.thu_tuc IN (46, 47) THEN COALESCE(
               CASE
                 WHEN NULLIF(TRIM(roles.cv_phoi_hop_name), '') IS NULL THEN NULL
                 ELSE REGEXP_REPLACE(TRIM(roles.cv_phoi_hop_name), '^CV\\s*(phối hợp|thụ lý)\\s*:\\s*', '', 'i')
               END,
               NULLIF(TRIM(d.data->>'nguoiXuLy'), ''),
               NULLIF(TRIM(d.data->>'chuyenVienPhoiHopName'), ''),
               NULLIF(TRIM(d.data->>'chuyenVienXuLyName'), '')
             )
             WHEN NULLIF(TRIM(l.cv_name_raw), '') IS NULL OR l.cv_name_raw = '__CHUA_PHAN__' THEN NULL
             ELSE TRIM(l.cv_name_raw)
           END AS chuyen_vien,
           CASE
             WHEN NULLIF(TRIM(l.chuyen_gia_name), '') IS NULL THEN NULL
             ELSE REGEXP_REPLACE(TRIM(l.chuyen_gia_name), '^CG\\s*:\\s*', '', 'i')
           END AS chuyen_gia
         FROM latest_case_facts l
         LEFT JOIN latest_tcc_roles roles
           ON roles.thu_tuc = l.thu_tuc
          AND (roles.tcc_id = l.tcc_id OR roles.ma_ho_so = l.ma_ho_so)
         LEFT JOIN da_xu_ly d
           ON d.thu_tuc = l.thu_tuc
          AND d.data->>'id' = l.luot_xu_ly_id
       )
       SELECT DISTINCT chuyen_vien, chuyen_gia
       FROM resolved_enriched
       ORDER BY chuyen_vien NULLS LAST, chuyen_gia NULLS LAST`,
      [thuTuc]
    ),
    query<PendingLookupRow>(
      `WITH latest_case_facts AS (
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
         FROM mv_stats_case_facts
         WHERE ($1::int IS NULL OR thu_tuc = $1)
           AND trang_thai IN ('4', '6', '7')
           AND COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id) IS NOT NULL
         ORDER BY thu_tuc, luot_xu_ly_id, ngay_tra DESC NULLS LAST, ngay_nhan DESC NULLS LAST
       ),
       latest_tcc_roles AS (
         SELECT DISTINCT ON ((data->>'thuTucId')::int, data->>'id')
           (data->>'thuTucId')::int AS thu_tuc,
           NULLIF(TRIM(data->>'id'), '') AS tcc_id,
           data->>'maHoSo' AS ma_ho_so,
           NULLIF(TRIM(data->>'chuyenVienPhoiHopName'), '') AS cv_phoi_hop_name
         FROM tra_cuu_chung
         WHERE ($1::int IS NULL OR (data->>'thuTucId')::int = $1)
           AND NULLIF(data->>'thuTucId', '') IS NOT NULL
       ),
       resolved_enriched AS (
         SELECT
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
               NULLIF(TRIM(d.data->>'nguoiXuLy'), ''),
               NULLIF(TRIM(d.data->>'chuyenVienPhoiHopName'), ''),
               NULLIF(TRIM(d.data->>'chuyenVienXuLyName'), '')
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
          AND (roles.tcc_id = l.tcc_id OR roles.ma_ho_so = l.ma_ho_so)
         LEFT JOIN da_xu_ly d
           ON d.thu_tuc = l.thu_tuc
          AND d.data->>'id' = l.luot_xu_ly_id
       )
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
       FROM resolved_enriched
       WHERE ($2::text IS NULL OR chuyen_vien = $2)
         AND ($3::text IS NULL OR chuyen_gia = $3)
         AND ($4::text IS NULL OR tinh_trang = $4)
         AND ($5::text IS NULL OR LOWER(ma_ho_so) LIKE '%' || LOWER($5) || '%')
       ORDER BY thu_tuc DESC, ngay_hen_tra DESC NULLS LAST, ma_ho_so ASC`,
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



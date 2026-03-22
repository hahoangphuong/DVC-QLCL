import { Router, type IRouter } from "express";
import { query, queryOne } from "../lib/db";

const router: IRouter = Router();

const PRIORITY = [
  "CV thụ lý : Lê Thị Cẩm Hương",
  "CV thụ lý : Vũ Đức Cảnh",
  "CV thụ lý : Hà Hoàng Phương",
  "CV thụ lý : Nguyễn Vũ Hùng",
  "CV thụ lý : Nguyễn Trung Hiếu",
  "CV thụ lý : Nguyễn Thị Lan Hương",
  "CV thụ lý : Hà Thị Minh Châu",
  "CV thụ lý : Nguyễn Thị Huyền",
  "CV thụ lý : Đỗ Thị Ngọc Lan",
  "CV thụ lý : Lê Thị Quỳnh Nga",
  "CV thụ lý : Lương Hoàng Việt",
  "CV thụ lý : Nguyễn Đức Toàn",
  "CV thụ lý : Trần Thị Phương Thanh",
];
const KNOWN_SET = new Set(PRIORITY);

function validateThuTuc(val: unknown): number | null {
  const n = Number(val);
  return [46, 47, 48].includes(n) ? n : null;
}

// GET /stats/earliest-date
router.get("/stats/earliest-date", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    const row = await queryOne<{ min: Date | null }>(
      `SELECT MIN((data->>'ngayTiepNhan')::timestamptz) AS min
       FROM tra_cuu_chung
       WHERE (data->>'thuTucId')::int = $1
         AND data->>'ngayTiepNhan' IS NOT NULL`,
      [thuTuc]
    );
    if (!row?.min) return void res.status(404).json({ detail: "Không có dữ liệu" });
    const d = new Date(row.min);
    const vn = new Date(d.getTime() + 7 * 3600 * 1000);
    const dateStr = vn.toISOString().slice(0, 10);
    res.json({ thu_tuc: thuTuc, earliest_date: dateStr });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/summary
router.get("/stats/summary", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date và to_date là bắt buộc" });
  try {
    const fromDt = `${fromDate}T00:00:00+07:00`;
    const toDt = `${toDate}T23:59:59+07:00`;

    const row = await queryOne<{
      ton_truoc: string; da_nhan: string; ton_sau: string;
    }>(
      `WITH joined AS (
          SELECT
            t.data AS tcc,
            NULLIF(d.data->>'ngayTraKetQua', '') AS kq
          FROM tra_cuu_chung t
          LEFT JOIN da_xu_ly d
            ON t.data->>'id' = d.data->>'id'
           AND d.thu_tuc = $1
          WHERE (t.data->>'thuTucId')::int = $1
       ),
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
           WHERE (tcc->>'ngayTiepNhan')::timestamptz < $2::timestamptz
             AND (kq IS NULL OR kq::timestamptz >= $2::timestamptz)
         ) AS ton_truoc,
         COUNT(*) FILTER (
           WHERE (tcc->>'ngayTiepNhan')::timestamptz >= $2::timestamptz
             AND (tcc->>'ngayTiepNhan')::timestamptz <= $3::timestamptz
         ) AS da_nhan,
         COUNT(*) FILTER (
           WHERE (tcc->>'ngayTiepNhan')::timestamptz <= $3::timestamptz
             AND (kq IS NULL OR kq::timestamptz > $3::timestamptz)
         ) AS ton_sau,
         (SELECT cnt FROM gq) AS da_giai_quyet
       FROM joined`,
      [thuTuc, fromDt, toDt]
    );

    res.json({
      thu_tuc: thuTuc, from_date: fromDate, to_date: toDate,
      ton_truoc: Number(row?.ton_truoc ?? 0),
      da_nhan: Number(row?.da_nhan ?? 0),
      da_giai_quyet: Number((row as Record<string, unknown>)?.["da_giai_quyet"] ?? 0),
      ton_sau: Number(row?.ton_sau ?? 0),
    });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/giai-quyet
router.get("/stats/giai-quyet", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date và to_date là bắt buộc" });
  try {
    const fromDt = `${fromDate}T00:00:00+07:00`;
    const toDt = `${toDate}T23:59:59+07:00`;
    const row = await queryOne<{ dung_han: string; qua_han: string }>(
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
    const dungHan = Number(row?.dung_han ?? 0);
    const quaHan = Number(row?.qua_han ?? 0);
    const total = dungHan + quaHan;
    res.json({
      thu_tuc: thuTuc, from_date: fromDate, to_date: toDate,
      dung_han: dungHan, qua_han: quaHan, total,
      pct_dung_han: total > 0 ? Math.round(dungHan / total * 1000) / 10 : 0,
      pct_qua_han: total > 0 ? Math.round(quaHan / total * 1000) / 10 : 0,
    });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/ton-sau
router.get("/stats/ton-sau", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  if (!toDate) return void res.status(400).json({ detail: "to_date là bắt buộc" });
  try {
    const toDt = `${toDate}T23:59:59+07:00`;
    const row = await queryOne<{ con_han: string; qua_han: string }>(
      `WITH joined AS (
          SELECT
            t.data AS tcc,
            NULLIF(d.data->>'ngayTraKetQua', '') AS kq
          FROM tra_cuu_chung t
          LEFT JOIN da_xu_ly d
            ON t.data->>'id' = d.data->>'id'
           AND d.thu_tuc = $1
          WHERE (t.data->>'thuTucId')::int = $1
       )
       SELECT
         COUNT(*) FILTER (
           WHERE (tcc->>'ngayTiepNhan')::timestamptz <= $2
             AND (kq IS NULL OR kq::timestamptz > $2)
             AND tcc->>'ngayHenTra' IS NOT NULL
             AND (tcc->>'ngayHenTra')::timestamptz > $2
         ) AS con_han,
         COUNT(*) FILTER (
           WHERE (tcc->>'ngayTiepNhan')::timestamptz <= $2
             AND (kq IS NULL OR kq::timestamptz > $2)
             AND (
                   tcc->>'ngayHenTra' IS NULL
                OR (tcc->>'ngayHenTra')::timestamptz <= $2
                 )
         ) AS qua_han
       FROM joined`,
      [thuTuc, toDt]
    );
    const conHan = Number(row?.con_han ?? 0);
    const quaHan = Number(row?.qua_han ?? 0);
    const total = conHan + quaHan;
    res.json({
      thu_tuc: thuTuc, to_date: toDate,
      con_han: conHan, qua_han: quaHan, total,
      pct_con_han: total > 0 ? Math.round(conHan / total * 1000) / 10 : 0,
      pct_qua_han: total > 0 ? Math.round(quaHan / total * 1000) / 10 : 0,
    });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/chuyen-vien
router.get("/stats/chuyen-vien", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date và to_date là bắt buộc" });
  try {
    const fromDt = `${fromDate}T00:00:00+07:00`;
    const toDt = `${toDate}T23:59:59+07:00`;

    const rows = await query<{
      cv_name: string;
      ton_truoc: string; da_nhan: string; gq_tong: string;
      can_bo_sung: string; khong_dat: string; hoan_thanh: string;
      dung_han: string; qua_han: string; tg_tb: string | null;
      ton_sau_tong: string; ton_sau_con_han: string; ton_sau_qua_han: string;
      treo: string;
    }>(
      `WITH base AS (
          SELECT
            COALESCE(NULLIF(TRIM(t.data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name,
            (t.data->>'ngayTiepNhan')::timestamptz AS ngay_nhan,
            (t.data->>'ngayHenTra')::timestamptz   AS nhan_hen_tra,
            CASE WHEN NULLIF(d.data->>'ngayTraKetQua','') IS NOT NULL
                 THEN (d.data->>'ngayTraKetQua')::timestamptz ELSE NULL END AS ngay_tra,
            CASE WHEN NULLIF(d.data->>'ngayHenTra','') IS NOT NULL
                 THEN (d.data->>'ngayHenTra')::timestamptz ELSE NULL END    AS kq_hen_tra,
            d.data->>'trangThaiHoSo' AS trang_thai
          FROM tra_cuu_chung t
          LEFT JOIN da_xu_ly d
            ON t.data->>'id' = d.data->>'id'
           AND d.thu_tuc = $1
          WHERE (t.data->>'thuTucId')::int = $1
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
         FROM base
         GROUP BY cv_name
       ),
       -- TREO: da_xu_ly mới nhất (ngayTiepNhan DESC) per maHoSo có trangThaiHoSo=4,
       -- VÀ tra_cuu_chung mới nhất của maHoSo đó có ngayTiepNhan <= DXL
       -- (doanh nghiệp chưa nộp bổ sung lại). Tên CV tra qua tra_cuu_chung.
       latest_dxl_treo AS (
         SELECT DISTINCT ON (data->>'maHoSo')
           data->>'maHoSo'                     AS ma_ho_so,
           data->>'trangThaiHoSo'               AS trang_thai,
           (data->>'ngayTiepNhan')::timestamptz AS ngay_nhan_dxl
         FROM da_xu_ly
         WHERE thu_tuc = $1
           AND NULLIF(data->>'ngayTiepNhan','') IS NOT NULL
         ORDER BY data->>'maHoSo', (data->>'ngayTiepNhan')::timestamptz DESC
       ),
       latest_tcc_treo AS (
         SELECT DISTINCT ON (data->>'maHoSo')
           data->>'maHoSo'                     AS ma_ho_so,
           TRIM(data->>'chuyenVienThuLyName')   AS cv_name,
           (data->>'ngayTiepNhan')::timestamptz AS ngay_nhan_tcc
         FROM tra_cuu_chung
         WHERE (data->>'thuTucId')::int = $1
           AND NULLIF(data->>'ngayTiepNhan','') IS NOT NULL
         ORDER BY data->>'maHoSo', (data->>'ngayTiepNhan')::timestamptz DESC
       ),
       treo_by_cv AS (
         SELECT
           COALESCE(NULLIF(lt.cv_name, ''), '__CHUA_PHAN__') AS cv_name,
           COUNT(*) AS treo
         FROM latest_dxl_treo ld
         JOIN latest_tcc_treo lt ON lt.ma_ho_so = ld.ma_ho_so
         WHERE ld.trang_thai = '4'
           AND lt.ngay_nhan_tcc <= ld.ngay_nhan_dxl
         GROUP BY cv_name
       )
       SELECT s.*, COALESCE(t.treo, 0) AS treo
       FROM stats s
       LEFT JOIN treo_by_cv t ON s.cv_name = t.cv_name`,
      [thuTuc, fromDt, toDt]
    );

    const resultMap: Record<string, object> = {};
    let choPhanCong: object | null = null;

    for (const r of rows) {
      const gq = Number(r.gq_tong);
      const tt = Number(r.ton_truoc);
      const dn = Number(r.da_nhan);
      const dh = Number(r.dung_han);
      const rec = {
        ten_cv: r.cv_name,
        ton_truoc: tt,
        da_nhan: dn,
        gq_tong: gq,
        can_bo_sung: Number(r.can_bo_sung),
        khong_dat: Number(r.khong_dat),
        hoan_thanh: Number(r.hoan_thanh),
        dung_han: dh,
        qua_han: Number(r.qua_han),
        tg_tb: r.tg_tb != null ? Number(r.tg_tb) : null,
        pct_gq_dung_han: gq > 0 ? Math.round(dh / gq * 100) : 0,
        pct_da_gq: (tt + dn) > 0 ? Math.round(gq / (tt + dn) * 100) : 0,
        ton_sau_tong: Number(r.ton_sau_tong),
        ton_sau_con_han: Number(r.ton_sau_con_han),
        ton_sau_qua_han: Number(r.ton_sau_qua_han),
        treo: Number(r.treo),
      };
      if (r.cv_name === "__CHUA_PHAN__") {
        choPhanCong = rec;
      } else {
        resultMap[r.cv_name] = rec;
      }
    }

    const data: object[] = [];
    const extras: object[] = [];
    for (const name of PRIORITY) {
      if (resultMap[name]) data.push(resultMap[name]);
    }
    for (const [name, rec] of Object.entries(resultMap)) {
      if (!KNOWN_SET.has(name)) extras.push(rec);
    }
    extras.sort((a, b) => ((a as { ten_cv: string }).ten_cv).localeCompare((b as { ten_cv: string }).ten_cv));
    data.push(...extras);

    res.json({ thu_tuc: thuTuc, from_date: fromDate, to_date: toDate, cho_phan_cong: choPhanCong, rows: data });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/monthly
router.get("/stats/monthly", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    const nhanRows = await query<{ yr: string; mo: string; cnt: string }>(
      `SELECT
         EXTRACT(YEAR  FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
         EXTRACT(MONTH FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
         COUNT(*) AS cnt
       FROM tra_cuu_chung
       WHERE (data->>'thuTucId')::int = $1
         AND data->>'ngayTiepNhan' IS NOT NULL
       GROUP BY 1, 2 ORDER BY 1, 2`,
      [thuTuc]
    );

    const gqRows = await query<{ yr: string; mo: string; cnt: string }>(
      `SELECT
         EXTRACT(YEAR  FROM (data->>'ngayTraKetQua')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
         EXTRACT(MONTH FROM (data->>'ngayTraKetQua')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
         COUNT(*) AS cnt
       FROM da_xu_ly
       WHERE thu_tuc = $1
         AND data->>'ngayTraKetQua' IS NOT NULL
       GROUP BY 1, 2 ORDER BY 1, 2`,
      [thuTuc]
    );

    const nhanMap = new Map(nhanRows.map(r => [`${r.yr}-${r.mo}`, Number(r.cnt)]));
    const gqMap = new Map(gqRows.map(r => [`${r.yr}-${r.mo}`, Number(r.cnt)]));
    const allKeys = [...new Set([...nhanMap.keys(), ...gqMap.keys()])].sort((a, b) => {
      const [aYr, aMo] = a.split("-").map(Number);
      const [bYr, bMo] = b.split("-").map(Number);
      return aYr !== bYr ? aYr - bYr : aMo - bMo;
    });

    let cumNhan = 0, cumGq = 0;
    const months = allKeys.map(key => {
      const [yr, mo] = key.split("-").map(Number);
      const dn = nhanMap.get(key) ?? 0;
      const gq = gqMap.get(key) ?? 0;
      cumNhan += dn;
      cumGq += gq;
      return { label: `T${mo}-${yr}`, year: yr, month: mo, da_nhan: dn, da_giai_quyet: gq, ton_sau: cumNhan - cumGq };
    });

    res.json({ thu_tuc: thuTuc, months });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/dang-xu-ly
// Hồ sơ đang xử lý: nhóm theo CV, phân loại theo tenDonViXuLy, tìm hồ sơ chậm nhất
router.get("/stats/dang-xu-ly", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    const rows = await query<{
      cv_name: string;
      tong: string;
      cho_cv: string;
      cho_cg: string;
      cho_trp: string;
      cho_van_thu: string;
      con_han: string;
      qua_han: string;
      cham_so_ngay: string;
      cham_ma: string;
      cham_ngay: string;
    }>(
      `WITH cv_from_tcc AS (
         SELECT DISTINCT ON (data->>'maHoSo')
           data->>'maHoSo'                                                          AS ma_ho_so,
           COALESCE(NULLIF(TRIM(data->>'chuyenVienThuLyName'), ''), '__CHUA_PHAN__') AS cv_name
         FROM tra_cuu_chung
         WHERE (data->>'thuTucId')::int = $1
           AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
         ORDER BY data->>'maHoSo', (data->>'ngayTiepNhan')::timestamptz DESC
       ),
       base AS (
         SELECT
           COALESCE(c.cv_name, '__CHUA_PHAN__')                          AS cv_name,
           d.data->>'tenDonViXuLy'                                        AS don_vi,
           d.data->>'maHoSo'                                              AS ma_ho_so,
           COALESCE(NULLIF(d.data->>'soNgayQuaHan', ''), '0')::int        AS qua_han_ngay,
           d.data->>'ngayTiepNhan'                                        AS ngay_nhan
         FROM dang_xu_ly d
         LEFT JOIN cv_from_tcc c ON c.ma_ho_so = d.data->>'maHoSo'
         WHERE d.thu_tuc = $1
       ),
       stats AS (
         SELECT
           cv_name,
           COUNT(*)                                                            AS tong,
           COUNT(*) FILTER (WHERE don_vi = 'Chuyên viên')                     AS cho_cv,
           COUNT(*) FILTER (WHERE don_vi IN ('Chuyên gia thẩm định',
                                              'Tổ trưởng chuyên gia'))         AS cho_cg,
           COUNT(*) FILTER (WHERE don_vi = 'Trưởng phòng')                    AS cho_trp,
           COUNT(*) FILTER (WHERE don_vi = 'Phòng ban phân công')              AS cho_van_thu,
           COUNT(*) FILTER (WHERE qua_han_ngay <= 0)                          AS con_han,
           COUNT(*) FILTER (WHERE qua_han_ngay > 0)                           AS qua_han
         FROM base
         GROUP BY cv_name
       ),
       cham_nhat AS (
         SELECT DISTINCT ON (cv_name)
           cv_name,
           qua_han_ngay AS cham_so_ngay,
           ma_ho_so     AS cham_ma,
           ngay_nhan    AS cham_ngay
         FROM base
         ORDER BY cv_name, qua_han_ngay DESC
       )
       SELECT s.*, cn.cham_so_ngay, cn.cham_ma, cn.cham_ngay
       FROM stats s
       LEFT JOIN cham_nhat cn ON cn.cv_name = s.cv_name
       ORDER BY s.tong DESC`,
      [thuTuc]
    );

    const monthRows = await query<{ yr: string; mo: string; cnt: string }>(
      `SELECT
         EXTRACT(YEAR  FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS yr,
         EXTRACT(MONTH FROM (data->>'ngayTiepNhan')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS mo,
         COUNT(*) AS cnt
       FROM dang_xu_ly
       WHERE thu_tuc = $1
         AND NULLIF(data->>'ngayTiepNhan', '') IS NOT NULL
       GROUP BY 1, 2 ORDER BY 1, 2`,
      [thuTuc]
    );

    const toN = (v: unknown) => Number(v) || 0;
    const fmt = (r: (typeof rows)[0]) => ({
      cv_name:       r.cv_name,
      tong:          toN(r.tong),
      cho_cv:        toN(r.cho_cv),
      cho_cg:        toN(r.cho_cg),
      cho_trp:       toN(r.cho_trp),
      cho_van_thu:   toN(r.cho_van_thu),
      con_han:       toN(r.con_han),
      qua_han:       toN(r.qua_han),
      cham_so_ngay:  toN(r.cham_so_ngay),
      cham_ma:       r.cham_ma  ?? null,
      cham_ngay:     r.cham_ngay ?? null,
    });

    const choPhanCong = rows.find(r => r.cv_name === "__CHUA_PHAN__");
    const cvRows      = rows.filter(r => r.cv_name !== "__CHUA_PHAN__");

    // Sắp xếp theo PRIORITY (giống Thống kê TT48), extras sort alpha
    const resultMap = Object.fromEntries(cvRows.map(r => [r.cv_name, r]));
    const sortedCv: typeof cvRows = [];
    for (const name of PRIORITY) {
      if (resultMap[name]) sortedCv.push(resultMap[name]);
    }
    const extras = cvRows.filter(r => !KNOWN_SET.has(r.cv_name));
    extras.sort((a, b) => a.cv_name.localeCompare(b.cv_name));
    sortedCv.push(...extras);

    const months = monthRows.map(r => ({
      label: `T${r.mo}-${r.yr}`,
      year:  Number(r.yr),
      month: Number(r.mo),
      cnt:   Number(r.cnt),
    }));

    res.json({
      thu_tuc:        thuTuc,
      cho_phan_cong:  choPhanCong ? fmt(choPhanCong) : null,
      rows:           sortedCv.map(fmt),
      months,
    });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /sync-status — thời gian sync gần nhất + tổng dung lượng data
// ---------------------------------------------------------------------------
router.get("/sync-status", async (_req, res) => {
  try {
    const timeRow = await queryOne<{ last_synced_at: string | null }>(`
      SELECT GREATEST(
        (SELECT MAX(synced_at) FROM tra_cuu_chung),
        (SELECT MAX(synced_at) FROM dang_xu_ly),
        (SELECT MAX(synced_at) FROM da_xu_ly)
      ) AS last_synced_at
    `);

    const sizeRow = await queryOne<{ total_bytes: string }>(`
      SELECT SUM(pg_total_relation_size(relid))::bigint AS total_bytes
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
    `);

    const lastSyncedAt = timeRow?.last_synced_at ?? null;
    const totalBytes   = parseInt(sizeRow?.total_bytes ?? "0", 10);
    const totalSizeMB  = totalBytes / (1024 * 1024);

    res.json({ lastSyncedAt, totalSizeMB: parseFloat(totalSizeMB.toFixed(2)) });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

export default router;


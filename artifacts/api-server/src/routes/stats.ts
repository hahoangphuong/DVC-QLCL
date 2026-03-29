import { Router, type IRouter } from "express";
import { queryOne } from "../lib/db";
import {
  getEarliestDate,
  getGiaiQuyetStats,
  getMonthlyStats,
  getSummaryStats,
  getTt48LoaiHoSoStats,
  getTonSauStats,
} from "../lib/stats/overview";
import {
  getChuyenGiaStats,
  getChuyenVienStats,
  getDangXuLyStats,
} from "../lib/stats/workflow";

const router: IRouter = Router();

function validateThuTuc(val: unknown): number | null {
  const n = Number(val);
  return [46, 47, 48].includes(n) ? n : null;
}

// GET /stats/earliest-date
router.get("/stats/earliest-date", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    const earliestDate = await getEarliestDate(thuTuc);
    if (!earliestDate) return void res.status(404).json({ detail: "Không có dữ liệu" });
    res.json({ thu_tuc: thuTuc, earliest_date: earliestDate });
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
    res.json(await getSummaryStats(thuTuc, fromDate, toDate));
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
    res.json(await getGiaiQuyetStats(thuTuc, fromDate, toDate));
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
    res.json(await getTonSauStats(thuTuc, toDate));
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
    res.json(await getChuyenVienStats(thuTuc, fromDate, toDate));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/monthly
router.get("/stats/monthly", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    res.json(await getMonthlyStats(thuTuc));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/tt48-phan-loai
router.get("/stats/tt48-phan-loai", async (req, res) => {
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date và to_date là bắt buộc" });
  try {
    res.json(await getTt48LoaiHoSoStats(fromDate, toDate));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// GET /stats/dang-xu-ly
// Hồ sơ đang xử lý: nhóm theo CV, phân loại theo tenDonViXuLy, tìm hồ sơ chậm nhất
// Với TT48: JOIN thêm tt48_cv_buoc để phân loại 4 sub-bước của Chuyên viên
router.get("/stats/dang-xu-ly", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    res.json(await getDangXuLyStats(thuTuc));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /stats/chuyen-gia
// Thống kê hồ sơ đang ở bước "Chuyên gia thẩm định", nhóm theo nguoiXuLy
// ---------------------------------------------------------------------------
router.get("/stats/chuyen-gia", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phải là 46, 47, hoặc 48" });
  try {
    res.json(await getChuyenGiaStats(thuTuc));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// ---------------------------------------------------------------------------
// GET /sync-status — thời gian sync gần nhất + tổng dung lượng data
// ---------------------------------------------------------------------------
router.get("/sync-status", async (_req, res) => {
  try {
    // Đọc từ bảng sync_meta thay vì MAX(synced_at) trên hàng triệu row
    const timeRow = await queryOne<{ last_synced_at: string | null }>(`
      SELECT MAX(synced_at) AS last_synced_at
      FROM sync_meta
      WHERE table_name IN ('tra_cuu_chung', 'dang_xu_ly', 'da_xu_ly')
    `);

    const sizeRow = await queryOne<{ total_bytes: string }>(`
      SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'm')
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


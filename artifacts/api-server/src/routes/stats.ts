import { Router, type IRouter } from "express";
import { queryOne } from "../lib/db";
import { getOrSetCached } from "../lib/stats/cache";
import {
  getEarliestDate,
  getGiaiQuyetStats,
  getMonthlyStats,
  getSummaryStats,
  getTt48ReceivedMonthlyByLoaiStats,
  getTt48LoaiHoSoStats,
  getTonSauStats,
} from "../lib/stats/overview";
import {
  getChuyenGiaStats,
  getChuyenVienStats,
  getDangXuLyStats,
  getDangXuLyLookup,
} from "../lib/stats/workflow";

const router: IRouter = Router();
const STATS_TTL_MS = 5 * 60 * 1000;
const FAST_TTL_MS = 30 * 1000;
const PYTHON_API = (process.env["PYTHON_API_BASE_URL"] ?? "http://localhost:8000").replace(/\/+$/, "");

function validateThuTuc(val: unknown): number | null {
  const n = Number(val);
  return [46, 47, 48].includes(n) ? n : null;
}

function parseOptionalThuTuc(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  const raw = String(val).trim();
  if (!raw || raw.toLowerCase() === "all") return null;
  return validateThuTuc(raw);
}

async function cachedJson<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  return getOrSetCached(key, ttlMs, loader);
}

router.get("/stats/earliest-date", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });

  try {
    const earliestDate = await cachedJson(
      `stats:earliest-date:${thuTuc}`,
      STATS_TTL_MS,
      () => getEarliestDate(thuTuc)
    );
    if (!earliestDate) return void res.status(404).json({ detail: "Khong co du lieu" });
    res.json({ thu_tuc: thuTuc, earliest_date: earliestDate });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/summary", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date va to_date la bat buoc" });

  try {
    res.json(await cachedJson(
      `stats:summary:${thuTuc}:${fromDate}:${toDate}`,
      STATS_TTL_MS,
      () => getSummaryStats(thuTuc, fromDate, toDate)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/giai-quyet", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date va to_date la bat buoc" });

  try {
    res.json(await cachedJson(
      `stats:giai-quyet:${thuTuc}:${fromDate}:${toDate}`,
      STATS_TTL_MS,
      () => getGiaiQuyetStats(thuTuc, fromDate, toDate)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/ton-sau", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });
  if (!toDate) return void res.status(400).json({ detail: "to_date la bat buoc" });

  try {
    res.json(await cachedJson(
      `stats:ton-sau:${thuTuc}:${toDate}`,
      STATS_TTL_MS,
      () => getTonSauStats(thuTuc, toDate)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/chuyen-vien", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date va to_date la bat buoc" });

  try {
    res.json(await cachedJson(
      `stats:chuyen-vien:${thuTuc}:${fromDate}:${toDate}`,
      STATS_TTL_MS,
      () => getChuyenVienStats(thuTuc, fromDate, toDate)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/monthly", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });

  try {
    res.json(await cachedJson(
      `stats:monthly:${thuTuc}`,
      STATS_TTL_MS,
      () => getMonthlyStats(thuTuc)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/tt48-phan-loai", async (req, res) => {
  const fromDate = String(req.query["from_date"] ?? "");
  const toDate = String(req.query["to_date"] ?? "");
  if (!fromDate || !toDate) return void res.status(400).json({ detail: "from_date va to_date la bat buoc" });

  try {
    res.json(await cachedJson(
      `stats:tt48-phan-loai:${fromDate}:${toDate}`,
      STATS_TTL_MS,
      () => getTt48LoaiHoSoStats(fromDate, toDate)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/tt48-monthly-received", async (_req, res) => {
  try {
    res.json(await cachedJson(
      "stats:tt48-monthly-received",
      STATS_TTL_MS,
      () => getTt48ReceivedMonthlyByLoaiStats()
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/dang-xu-ly", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });

  try {
    res.json(await cachedJson(
      `stats:dang-xu-ly:${thuTuc}`,
      STATS_TTL_MS,
      () => getDangXuLyStats(thuTuc)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/chuyen-gia", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });

  try {
    res.json(await cachedJson(
      `stats:chuyen-gia:${thuTuc}`,
      STATS_TTL_MS,
      () => getChuyenGiaStats(thuTuc)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/tra-cuu-dang-xu-ly", async (req, res) => {
  const thuTuc = parseOptionalThuTuc(req.query["thu_tuc"]);
  if (req.query["thu_tuc"] !== undefined && req.query["thu_tuc"] !== null) {
    const raw = String(req.query["thu_tuc"]).trim().toLowerCase();
    if (raw && raw !== "all" && !thuTuc) {
      return void res.status(400).json({ detail: "thu_tuc phai la 46, 47, 48 hoac de trong" });
    }
  }

  try {
    const chuyenVien = typeof req.query["chuyen_vien"] === "string" ? req.query["chuyen_vien"] : null;
    const chuyenGia = typeof req.query["chuyen_gia"] === "string" ? req.query["chuyen_gia"] : null;
    const tinhTrang = typeof req.query["tinh_trang"] === "string" ? req.query["tinh_trang"] : null;
    const maHoSo = typeof req.query["ma_ho_so"] === "string" ? req.query["ma_ho_so"] : null;

    res.json(await cachedJson(
      `stats:tra-cuu-dang-xu-ly:${thuTuc ?? "all"}:${chuyenVien ?? ""}:${chuyenGia ?? ""}:${tinhTrang ?? ""}:${maHoSo ?? ""}`,
      FAST_TTL_MS,
      () => getDangXuLyLookup({ thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo })
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/dav/tt48/ho-so/:hoSoId", async (req, res) => {
  const hoSoId = Number(req.params["hoSoId"]);
  if (!Number.isInteger(hoSoId) || hoSoId <= 0) {
    return void res.status(400).json({ detail: "hoSoId phai la so nguyen duong" });
  }

  try {
    const pyRes = await fetch(`${PYTHON_API}/internal/dav/tt48/ho-so/${hoSoId}`);
    const data = await pyRes.json();
    res.status(pyRes.ok ? 200 : (pyRes.status === 400 ? 400 : pyRes.status === 401 ? 401 : 502)).json(data);
  } catch (e: unknown) {
    res.status(502).json({ detail: `Khong the ket noi Python backend: ${String(e)}` });
  }
});

router.get("/sync-status", async (_req, res) => {
  try {
    res.json(await cachedJson("stats:sync-status", FAST_TTL_MS, async () => {
      const [timeRow, sizeRow] = await Promise.all([
        queryOne<{ last_synced_at: string | null }>(`
          SELECT MAX(synced_at) AS last_synced_at
          FROM sync_meta
          WHERE table_name IN ('tra_cuu_chung', 'dang_xu_ly', 'da_xu_ly')
        `),
        queryOne<{ total_bytes: string }>(`
          SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS total_bytes
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'm')
        `),
      ]);

      const lastSyncedAt = timeRow?.last_synced_at ?? null;
      const totalBytes = parseInt(sizeRow?.total_bytes ?? "0", 10);
      const totalSizeMB = totalBytes / (1024 * 1024);
      return { lastSyncedAt, totalSizeMB: parseFloat(totalSizeMB.toFixed(2)) };
    }));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

export default router;

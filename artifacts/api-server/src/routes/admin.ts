import { Router, type IRouter } from "express";
import { query } from "../lib/db";
import ExcelJS from "exceljs";

const router: IRouter = Router();

const ADMIN_TOKEN = process.env["ADMIN_EXPORT_TOKEN"] ?? "";
const PYTHON_API  = "http://localhost:8000";

function checkToken(req: import("express").Request, res: import("express").Response): boolean {
  const provided = String(req.query["token"] ?? req.headers["x-admin-token"] ?? "");
  if (!ADMIN_TOKEN) {
    res.status(503).json({ detail: "ADMIN_EXPORT_TOKEN chưa được cấu hình trên server." });
    return false;
  }
  if (provided !== ADMIN_TOKEN) {
    res.status(401).json({ detail: "Token không hợp lệ." });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /admin/db-stats — số bản ghi trong 3 bảng chính
// ---------------------------------------------------------------------------
router.get("/admin/db-stats", async (req, res) => {
  if (!checkToken(req, res)) return;
  try {
    const [tcc, dxl, dxly] = await Promise.all([
      query<{ cnt: string; last_sync: string | null }>(
        `SELECT COUNT(*) AS cnt, MAX(synced_at) AS last_sync FROM tra_cuu_chung`
      ),
      query<{ cnt: string; last_sync: string | null; cnt_48: string; cnt_47: string; cnt_46: string }>(
        `SELECT
           COUNT(*)                                                AS cnt,
           MAX(synced_at)                                         AS last_sync,
           COUNT(*) FILTER (WHERE thu_tuc = 48)                   AS cnt_48,
           COUNT(*) FILTER (WHERE thu_tuc = 47)                   AS cnt_47,
           COUNT(*) FILTER (WHERE thu_tuc = 46)                   AS cnt_46
         FROM dang_xu_ly`
      ),
      query<{ cnt: string; last_sync: string | null; cnt_48: string; cnt_47: string; cnt_46: string }>(
        `SELECT
           COUNT(*)                                                AS cnt,
           MAX(synced_at)                                         AS last_sync,
           COUNT(*) FILTER (WHERE thu_tuc = 48)                   AS cnt_48,
           COUNT(*) FILTER (WHERE thu_tuc = 47)                   AS cnt_47,
           COUNT(*) FILTER (WHERE thu_tuc = 46)                   AS cnt_46
         FROM da_xu_ly`
      ),
    ]);
    res.json({
      ok: true,
      tables: {
        tra_cuu_chung: {
          total: parseInt(tcc[0]?.cnt ?? "0"),
          last_sync: tcc[0]?.last_sync ?? null,
        },
        dang_xu_ly: {
          total: parseInt(dxl[0]?.cnt ?? "0"),
          by_thu_tuc: {
            48: parseInt(dxl[0]?.cnt_48 ?? "0"),
            47: parseInt(dxl[0]?.cnt_47 ?? "0"),
            46: parseInt(dxl[0]?.cnt_46 ?? "0"),
          },
          last_sync: dxl[0]?.last_sync ?? null,
        },
        da_xu_ly: {
          total: parseInt(dxly[0]?.cnt ?? "0"),
          by_thu_tuc: {
            48: parseInt(dxly[0]?.cnt_48 ?? "0"),
            47: parseInt(dxly[0]?.cnt_47 ?? "0"),
            46: parseInt(dxly[0]?.cnt_46 ?? "0"),
          },
          last_sync: dxly[0]?.last_sync ?? null,
        },
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/force-sync — kích hoạt sync ngay lập tức (chạy background, trả về ngay)
// ---------------------------------------------------------------------------
router.post("/admin/force-sync", async (req, res) => {
  if (!checkToken(req, res)) return;
  try {
    const pyRes = await fetch(`${PYTHON_API}/sync/all/async`, { method: "POST" });
    const data = await pyRes.json();
    res.status(pyRes.ok ? 200 : 502).json(data);
  } catch (e: unknown) {
    res.status(502).json({ detail: `Không thể kết nối Python backend: ${String(e)}` });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/scheduler — lấy interval hiện tại
// POST /admin/scheduler — cập nhật interval (body: {hours: N})
// ---------------------------------------------------------------------------
router.get("/admin/scheduler", async (req, res) => {
  if (!checkToken(req, res)) return;
  try {
    const pyRes = await fetch(`${PYTHON_API}/admin/scheduler`);
    const data = await pyRes.json();
    res.status(pyRes.ok ? 200 : 502).json(data);
  } catch (e: unknown) {
    res.status(502).json({ detail: `Không thể kết nối Python backend: ${String(e)}` });
  }
});

router.post("/admin/scheduler", async (req, res) => {
  if (!checkToken(req, res)) return;
  try {
    const body = req.body as { hours?: unknown };
    const pyRes = await fetch(`${PYTHON_API}/admin/scheduler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: body.hours }),
    });
    const data = await pyRes.json();
    res.status(pyRes.ok ? 200 : (pyRes.status === 400 ? 400 : 502)).json(data);
  } catch (e: unknown) {
    res.status(502).json({ detail: `Không thể kết nối Python backend: ${String(e)}` });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/logs?lines=N — đọc sync log từ Python backend
// ---------------------------------------------------------------------------
router.get("/admin/logs", async (req, res) => {
  if (!checkToken(req, res)) return;
  try {
    const lines = Math.min(parseInt(String(req.query["lines"] ?? "200"), 10) || 200, 2000);
    const pyRes = await fetch(`${PYTHON_API}/logs/sync?lines=${lines}`);
    const data = await pyRes.json();
    res.status(pyRes.ok ? 200 : 502).json(data);
  } catch (e: unknown) {
    res.status(502).json({ detail: `Không thể kết nối Python backend: ${String(e)}` });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/export/:table — xuất Excel (giữ nguyên)
// ---------------------------------------------------------------------------
const ALLOWED_TABLES = ["tra_cuu_chung", "dang_xu_ly", "da_xu_ly"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

const TABLE_LABELS: Record<AllowedTable, string> = {
  tra_cuu_chung: "Tra_cuu_chung",
  dang_xu_ly:    "Dang_xu_ly",
  da_xu_ly:      "Da_xu_ly",
};

const MAX_CELL = 32767;
function cellVal(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) : s;
}

router.get("/admin/export/:table", async (req, res) => {
  if (!checkToken(req, res)) return;

  const table = req.params["table"] as AllowedTable;
  if (!ALLOWED_TABLES.includes(table)) {
    return void res.status(400).json({ detail: `Bảng không hợp lệ. Cho phép: ${ALLOWED_TABLES.join(", ")}` });
  }

  try {
    const keysResult = await query<{ key: string }>(
      `SELECT DISTINCT jsonb_object_keys(data) AS key FROM "${table}" ORDER BY key`
    );
    const dataKeys = keysResult.map(r => r.key);

    const filename = `${TABLE_LABELS[table]}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Transfer-Encoding", "chunked");

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: false,
      useSharedStrings: false,
    });
    const ws = workbook.addWorksheet(TABLE_LABELS[table]);

    ws.addRow(["id", "synced_at", ...dataKeys]).commit();

    const CHUNK = 300;
    let offset = 0;
    while (true) {
      const rows = await query<{ id: number; synced_at: string; data: Record<string, unknown> }>(
        `SELECT id, synced_at, data FROM "${table}" ORDER BY id LIMIT ${CHUNK} OFFSET ${offset}`
      );
      if (rows.length === 0) break;

      for (const r of rows) {
        ws.addRow([
          r.id,
          r.synced_at,
          ...dataKeys.map(k => cellVal(r.data?.[k])),
        ]).commit();
      }

      offset += rows.length;
      if (rows.length < CHUNK) break;
    }

    await workbook.commit();
  } catch (e: unknown) {
    if (!res.headersSent) {
      res.status(500).json({ detail: String(e) });
    } else {
      res.end();
    }
  }
});

export default router;

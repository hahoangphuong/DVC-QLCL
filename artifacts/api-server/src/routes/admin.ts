import { Router, type IRouter } from "express";
import { query } from "../lib/db";
import ExcelJS from "exceljs";

const router: IRouter = Router();

const ADMIN_TOKEN = process.env["ADMIN_EXPORT_TOKEN"] ?? "";
const PYTHON_API = (process.env["PYTHON_API_BASE_URL"] ?? "http://localhost:8000").replace(/\/+$/, "");

function checkToken(req: import("express").Request, res: import("express").Response): boolean {
  const provided = String(req.headers["x-admin-token"] ?? "");
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
    // Đọc record counts + phân tách per-thu_tuc song song với last_sync từ sync_meta
    const [counts, syncMeta] = await Promise.all([
      query<{ table_name: string; cnt: string; cnt_48: string; cnt_47: string; cnt_46: string }>(`
        SELECT 'tra_cuu_chung' AS table_name, COUNT(*)::text AS cnt,
               '0' AS cnt_48, '0' AS cnt_47, '0' AS cnt_46
        FROM tra_cuu_chung
        UNION ALL
        SELECT 'dang_xu_ly', COUNT(*)::text,
               COUNT(*) FILTER (WHERE thu_tuc = 48)::text,
               COUNT(*) FILTER (WHERE thu_tuc = 47)::text,
               COUNT(*) FILTER (WHERE thu_tuc = 46)::text
        FROM dang_xu_ly
        UNION ALL
        SELECT 'da_xu_ly', COUNT(*)::text,
               COUNT(*) FILTER (WHERE thu_tuc = 48)::text,
               COUNT(*) FILTER (WHERE thu_tuc = 47)::text,
               COUNT(*) FILTER (WHERE thu_tuc = 46)::text
        FROM da_xu_ly
      `),
      query<{ table_name: string; synced_at: string | null; fetch_sec: number | null; insert_sec: number | null }>(`
        SELECT table_name, synced_at, fetch_sec, insert_sec
        FROM sync_meta
        WHERE table_name IN ('tra_cuu_chung', 'dang_xu_ly', 'da_xu_ly')
      `),
    ]);

    const countMap = Object.fromEntries(counts.map(r => [r.table_name, r]));
    const metaMap  = Object.fromEntries(syncMeta.map(r => [r.table_name, r]));

    const meta = (k: string) => ({
      last_sync:  metaMap[k]?.synced_at  ?? null,
      fetch_sec:  metaMap[k]?.fetch_sec  ?? null,
      insert_sec: metaMap[k]?.insert_sec ?? null,
    });

    res.json({
      ok: true,
      tables: {
        tra_cuu_chung: {
          total: parseInt(countMap["tra_cuu_chung"]?.cnt ?? "0"),
          ...meta("tra_cuu_chung"),
        },
        dang_xu_ly: {
          total: parseInt(countMap["dang_xu_ly"]?.cnt ?? "0"),
          by_thu_tuc: {
            48: parseInt(countMap["dang_xu_ly"]?.cnt_48 ?? "0"),
            47: parseInt(countMap["dang_xu_ly"]?.cnt_47 ?? "0"),
            46: parseInt(countMap["dang_xu_ly"]?.cnt_46 ?? "0"),
          },
          ...meta("dang_xu_ly"),
        },
        da_xu_ly: {
          total: parseInt(countMap["da_xu_ly"]?.cnt ?? "0"),
          by_thu_tuc: {
            48: parseInt(countMap["da_xu_ly"]?.cnt_48 ?? "0"),
            47: parseInt(countMap["da_xu_ly"]?.cnt_47 ?? "0"),
            46: parseInt(countMap["da_xu_ly"]?.cnt_46 ?? "0"),
          },
          ...meta("da_xu_ly"),
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
    const pyRes = await fetch(`${PYTHON_API}/internal/sync/all/async`, { method: "POST" });
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
    const pyRes = await fetch(`${PYTHON_API}/internal/scheduler`);
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
    const pyRes = await fetch(`${PYTHON_API}/internal/scheduler`, {
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
    const pyRes = await fetch(`${PYTHON_API}/internal/logs/sync?lines=${lines}`);
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

    ws.addRow(["id", ...dataKeys]).commit();

    const CHUNK = 300;
    let offset = 0;
    while (true) {
      const rows = await query<{ id: number; data: Record<string, unknown> }>(
        `SELECT id, data FROM "${table}" ORDER BY id LIMIT ${CHUNK} OFFSET ${offset}`
      );
      if (rows.length === 0) break;

      for (const r of rows) {
        ws.addRow([
          r.id,
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

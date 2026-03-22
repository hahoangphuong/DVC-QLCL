import { Router, type IRouter } from "express";
import { query } from "../lib/db";
import ExcelJS from "exceljs";

const router: IRouter = Router();

const ADMIN_TOKEN = process.env["ADMIN_EXPORT_TOKEN"] ?? "";

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

const ALLOWED_TABLES = ["tra_cuu_chung", "dang_xu_ly", "da_xu_ly"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

const TABLE_LABELS: Record<AllowedTable, string> = {
  tra_cuu_chung: "Tra_cuu_chung",
  dang_xu_ly:    "Dang_xu_ly",
  da_xu_ly:      "Da_xu_ly",
};

// Excel cell limit = 32767 chars
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
    // Bước 1: Lấy tất cả keys từ JSONB data (nhẹ, không load data thực)
    const keysResult = await query<{ key: string }>(
      `SELECT DISTINCT jsonb_object_keys(data) AS key FROM "${table}" ORDER BY key`
    );
    const dataKeys = keysResult.map(r => r.key);

    // Bước 2: Set headers để browser nhận file ngay khi stream bắt đầu
    const filename = `${TABLE_LABELS[table]}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Transfer-Encoding", "chunked");

    // Bước 3: Tạo ExcelJS streaming workbook — ghi thẳng ra response, không buffer RAM
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: false,
      useSharedStrings: false,
    });
    const ws = workbook.addWorksheet(TABLE_LABELS[table]);

    // Bước 4: Ghi header row
    ws.addRow(["id", "synced_at", ...dataKeys]).commit();

    // Bước 5: Stream dữ liệu theo từng chunk 300 dòng — peak memory thấp
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

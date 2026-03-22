import { Router, type IRouter } from "express";
import { query } from "../lib/db";
import * as XLSX from "xlsx";

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

router.get("/admin/export/:table", async (req, res) => {
  if (!checkToken(req, res)) return;

  const table = req.params["table"] as AllowedTable;
  if (!ALLOWED_TABLES.includes(table)) {
    return void res.status(400).json({ detail: `Bảng không hợp lệ. Cho phép: ${ALLOWED_TABLES.join(", ")}` });
  }

  try {
    const rows = await query<{ id: number; synced_at: string; data: Record<string, unknown> }>(
      `SELECT id, synced_at, data FROM "${table}" ORDER BY id`
    );

    // Thu thập tất cả keys từ data để làm header
    const keySet = new Set<string>();
    for (const r of rows) {
      if (r.data && typeof r.data === "object") {
        for (const k of Object.keys(r.data)) keySet.add(k);
      }
    }
    const dataKeys = [...keySet].sort();
    const headers = ["id", "synced_at", ...dataKeys];

    // Tạo worksheet
    const wsData: unknown[][] = [headers];
    for (const r of rows) {
      const row: unknown[] = [
        r.id,
        r.synced_at,
        ...dataKeys.map(k => {
          const v = r.data?.[k];
          return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
        }),
      ];
      wsData.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, TABLE_LABELS[table]);

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `${TABLE_LABELS[table]}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

export default router;

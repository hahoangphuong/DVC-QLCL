import { Readable } from "node:stream";
import { Router, type IRouter, type Response } from "express";
import ExcelJS from "exceljs";
import { requireAdminSession, requireViewerSession } from "../lib/auth";
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
  getDaXuLyLookup,
  getDangXuLyStats,
  getDangXuLyLookup,
} from "../lib/stats/workflow";

const router: IRouter = Router();
const STATS_TTL_MS = 5 * 60 * 1000;
const FAST_TTL_MS = 30 * 1000;
const STATS_STALE_MS = 6 * 60 * 60 * 1000;
const FAST_STALE_MS = 5 * 60 * 1000;
const PYTHON_API = (process.env["PYTHON_API_BASE_URL"] ?? "http://localhost:8000").replace(/\/+$/, "");
type LookupExportSortKey =
  | "stt"
  | "ma_ho_so"
  | "ngay_tiep_nhan"
  | "ngay_hen_tra"
  | "loai_ho_so"
  | "submission_kind"
  | "tinh_trang"
  | "chuyen_vien"
  | "chuyen_gia"
  | "thoi_gian_cho_ngay";

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

function displayLookupCv(raw: string | null): string {
  if (!raw) return "";
  if (raw === "__CHUA_PHAN__") return "Chờ phân công";
  return raw.replace(/^CV thụ lý\s*:\s*/i, "").trim();
}

function displayLookupCg(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/^CG\s*:\s*/i, "").trim();
}

function displayLookupTinhTrang(value: string): string {
  switch (value) {
    case "cho_phan_cong": return "Chờ phân công";
    case "cho_chuyen_vien": return "Chờ chuyên viên";
    case "chua_xu_ly": return "Chưa xử lý";
    case "bi_tra_lai": return "Bị trả lại";
    case "cho_tong_hop": return "Chờ tổng hợp";
    case "cho_chuyen_gia": return "Chờ chuyên gia";
    case "cho_to_truong": return "Chờ Tổ trưởng";
    case "cho_truong_phong": return "Chờ Trưởng phòng";
    case "cho_cong_bo": return "Chờ công bố";
    default: return value;
  }
}

function displaySubmissionKind(value: string | null): string {
  if (value === "first") return "Lần đầu";
  if (value === "supplement") return "Lần bổ sung";
  return "";
}

function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const raw = iso.split("T")[0] ?? "";
  const [y, m, d] = raw.split("-");
  return y && m && d ? `${d}/${m}/${y}` : raw;
}

async function sendXlsx(
  res: Response,
  filename: string,
  sheetName: string,
  rows: Array<Array<string | number>>,
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  rows.forEach((row) => {
    worksheet.addRow(row);
  });
  const written = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(written) ? written : Buffer.from(written);
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
}

const LOOKUP_STATUS_SORT_ORDER: Record<string, number> = {
  cho_phan_cong: 1,
  cho_chuyen_vien: 2,
  chua_xu_ly: 3,
  bi_tra_lai: 4,
  cho_tong_hop: 5,
  cho_chuyen_gia: 6,
  cho_to_truong: 7,
  cho_truong_phong: 8,
  cho_cong_bo: 9,
};

function sortLookupRows(
  rows: Awaited<ReturnType<typeof getDangXuLyLookup>>["rows"],
  sortBy: LookupExportSortKey,
  sortDir: "asc" | "desc",
) {
  const copy = [...rows];
  if (sortBy === "stt") {
    return sortDir === "asc" ? copy : copy.reverse();
  }

  const getValue = (row: typeof copy[number]) => {
    switch (sortBy) {
      case "ma_ho_so": return row.ma_ho_so;
      case "ngay_tiep_nhan": return row.ngay_tiep_nhan ?? "";
      case "ngay_hen_tra": return row.ngay_hen_tra ?? "";
      case "loai_ho_so": return row.loai_ho_so ?? "";
      case "submission_kind": return row.submission_kind === "first" ? "0" : row.submission_kind === "supplement" ? "1" : "2";
      case "tinh_trang": return LOOKUP_STATUS_SORT_ORDER[row.tinh_trang] ?? Number.MAX_SAFE_INTEGER;
      case "chuyen_vien": return displayLookupCv(row.chuyen_vien);
      case "chuyen_gia": return displayLookupCg(row.chuyen_gia);
      case "thoi_gian_cho_ngay": return row.thoi_gian_cho_ngay;
      case "stt": return 0;
    }
  };

  copy.sort((left, right) => {
    const a = getValue(left);
    const b = getValue(right);
    let result = 0;
    if (typeof a === "number" && typeof b === "number") {
      result = a - b;
    } else {
      result = String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
    }
    if (result === 0) {
      result = left.ma_ho_so.localeCompare(right.ma_ho_so, "vi", { numeric: true, sensitivity: "base" });
    }
    return sortDir === "asc" ? result : -result;
  });

  return copy;
}

async function cachedJson<T>(key: string, ttlMs: number, staleMs: number, loader: () => Promise<T>): Promise<T> {
  return getOrSetCached(key, ttlMs, loader, staleMs);
}

router.use(requireViewerSession);

router.get("/stats/earliest-date", async (req, res) => {
  const thuTuc = validateThuTuc(req.query["thu_tuc"]);
  if (!thuTuc) return void res.status(400).json({ detail: "thu_tuc phai la 46, 47 hoac 48" });

  try {
    const earliestDate = await cachedJson(
      `stats:earliest-date:${thuTuc}`,
      STATS_TTL_MS,
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
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
      STATS_STALE_MS,
      () => getChuyenGiaStats(thuTuc)
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.use("/stats/tra-cuu-dang-xu-ly", requireAdminSession);
router.use("/stats/tra-cuu-da-xu-ly", requireAdminSession);
router.use("/dav", requireAdminSession);

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
      FAST_STALE_MS,
      () => getDangXuLyLookup({ thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo })
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/tra-cuu-dang-xu-ly/export", async (req, res) => {
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
    const sortByRaw = typeof req.query["sort_by"] === "string" ? req.query["sort_by"] : "stt";
    const sortDirRaw = typeof req.query["sort_dir"] === "string" ? req.query["sort_dir"] : "asc";
    const sortBy = ([
      "stt", "ma_ho_so", "ngay_tiep_nhan", "ngay_hen_tra", "loai_ho_so",
      "submission_kind", "tinh_trang", "chuyen_vien", "chuyen_gia", "thoi_gian_cho_ngay",
    ] as const).includes(sortByRaw as LookupExportSortKey) ? sortByRaw as LookupExportSortKey : "stt";
    const sortDir = sortDirRaw === "desc" ? "desc" : "asc";

    const data = await getDangXuLyLookup({ thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo });
    const rows = sortLookupRows(data.rows, sortBy, sortDir);

    const filename = `Tra_cuu_dang_xu_ly_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const exportRows: Array<Array<string | number>> = [[
      "STT",
      "Mã hồ sơ",
      "Ngày tiếp nhận",
      "Ngày hẹn trả",
      "Lần nộp",
      "Loại hồ sơ",
      "Chuyên viên",
      "Chuyên gia",
      "Thời gian chờ",
      "Tình trạng",
    ]];

    rows.forEach((row, index) => {
      exportRows.push([
        index + 1,
        row.ma_ho_so,
        isoToDisplay(row.ngay_tiep_nhan),
        isoToDisplay(row.ngay_hen_tra),
        displaySubmissionKind(row.submission_kind),
        row.loai_ho_so ?? "",
        displayLookupCv(row.chuyen_vien),
        displayLookupCg(row.chuyen_gia),
        row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ngày` : "",
        displayLookupTinhTrang(row.tinh_trang),
      ]);
    });

    await sendXlsx(res, filename, "Tra_cuu_dang_xu_ly", exportRows);
  } catch (e: unknown) {
    if (!res.headersSent) {
      res.status(500).json({ detail: String(e) });
    } else {
      res.end();
    }
  }
});

router.get("/stats/tra-cuu-da-xu-ly", async (req, res) => {
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
      `stats:tra-cuu-da-xu-ly:${thuTuc ?? "all"}:${chuyenVien ?? ""}:${chuyenGia ?? ""}:${tinhTrang ?? ""}:${maHoSo ?? ""}`,
      FAST_TTL_MS,
      FAST_STALE_MS,
      () => getDaXuLyLookup({ thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo })
    ));
  } catch (e: unknown) {
    res.status(500).json({ detail: String(e) });
  }
});

router.get("/stats/tra-cuu-da-xu-ly/export", async (req, res) => {
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
    const sortByRaw = typeof req.query["sort_by"] === "string" ? req.query["sort_by"] : "stt";
    const sortDirRaw = typeof req.query["sort_dir"] === "string" ? req.query["sort_dir"] : "asc";
    const sortBy = ([
      "stt", "ma_ho_so", "ngay_tiep_nhan", "ngay_hen_tra", "loai_ho_so",
      "submission_kind", "tinh_trang", "chuyen_vien", "chuyen_gia", "thoi_gian_cho_ngay",
    ] as const).includes(sortByRaw as LookupExportSortKey) ? sortByRaw as LookupExportSortKey : "stt";
    const sortDir = sortDirRaw === "desc" ? "desc" : "asc";

    const data = await getDaXuLyLookup({ thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo });
    const rows = sortLookupRows(data.rows, sortBy, sortDir);

    const filename = `Tra_cuu_da_xu_ly_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const exportRows: Array<Array<string | number>> = [[
      "STT",
      "Mã hồ sơ",
      "Ngày tiếp nhận",
      "Ngày trả KQ",
      "Lần nộp",
      "Loại hồ sơ",
      "Chuyên viên",
      "Chuyên gia",
      "Thời gian xử lý",
      "Tình trạng",
    ]];

    rows.forEach((row, index) => {
      exportRows.push([
        index + 1,
        row.ma_ho_so,
        isoToDisplay(row.ngay_tiep_nhan),
        isoToDisplay(row.ngay_hen_tra),
        displaySubmissionKind(row.submission_kind),
        row.loai_ho_so ?? "",
        displayLookupCv(row.chuyen_vien),
        displayLookupCg(row.chuyen_gia),
        row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ngày` : "",
        displayLookupTinhTrang(row.tinh_trang),
      ]);
    });

    await sendXlsx(res, filename, "Tra_cuu_da_xu_ly", exportRows);
  } catch (e: unknown) {
    if (!res.headersSent) {
      res.status(500).json({ detail: String(e) });
    } else {
      res.end();
    }
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

router.get("/dav/file", async (req, res) => {
  const path = typeof req.query["path"] === "string" ? req.query["path"] : "";
  if (!path.trim()) {
    return void res.status(400).json({ detail: "Thieu duong dan tai lieu" });
  }

  try {
    const query = new URLSearchParams({ path });
    const pyRes = await fetch(`${PYTHON_API}/internal/dav/file?${query.toString()}`);
    if (!pyRes.ok) {
      const contentType = pyRes.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await pyRes.json();
        return void res.status(pyRes.status === 401 ? 401 : pyRes.status === 400 ? 400 : 502).json(data);
      }
      const text = await pyRes.text();
      return void res.status(pyRes.status === 401 ? 401 : pyRes.status === 400 ? 400 : 502).json({ detail: text || "Khong mo duoc tai lieu DAV" });
    }

    const contentType = pyRes.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);
    const contentDisposition = pyRes.headers.get("content-disposition");
    if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);
    const cacheControl = pyRes.headers.get("cache-control");
    if (cacheControl) res.setHeader("Cache-Control", cacheControl);
    const contentLength = pyRes.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (!pyRes.body) {
      return void res.status(502).json({ detail: "Python backend khong tra ve stream tai lieu" });
    }

    res.status(200);
    Readable.fromWeb(pyRes.body as globalThis.ReadableStream<Uint8Array>).pipe(res);
  } catch (e: unknown) {
    res.status(502).json({ detail: `Khong the tai tai lieu tu Python backend: ${String(e)}` });
  }
});

router.get("/sync-status", async (_req, res) => {
  try {
    res.json(await cachedJson("stats:sync-status", FAST_TTL_MS, FAST_STALE_MS, async () => {
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

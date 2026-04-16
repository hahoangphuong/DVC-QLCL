export const EXPORT_TABLES = [
  { id: "tra_cuu_chung", label: "Tra cứu chung", desc: "Danh sách hồ sơ tiếp nhận" },
  { id: "dang_xu_ly", label: "Đang xử lý", desc: "Hồ sơ đang trong quá trình xử lý" },
  { id: "da_xu_ly", label: "Đã xử lý", desc: "Hồ sơ đã hoàn tất xử lý" },
] as const;

export function authHeaders(token: string): HeadersInit {
  return { "x-admin-token": token };
}

export type TableMeta = {
  last_sync: string | null;
  fetch_sec: number | null;
  insert_sec: number | null;
};

export type DbStats = {
  tables: {
    tra_cuu_chung: { total: number } & TableMeta;
    dang_xu_ly: { total: number; by_thu_tuc: Record<string, number> } & TableMeta;
    da_xu_ly: { total: number; by_thu_tuc: Record<string, number> } & TableMeta;
  };
};

export type SchedulerInfo = {
  interval_hours: number;
  next_run: string | null;
};

export type SyncLog = {
  lines: string[];
  total_lines: number;
  showing_last: number;
};

export function fmtSyncAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

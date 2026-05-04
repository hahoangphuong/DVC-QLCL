import { getPreset, toDMY } from "../../shared/dateUtils";

const API = "/api";

export const COLORS = {
  ton_truoc: { bar: "#f472b6", label: "T\u1ed2N TR\u01af\u1edaC", text: "#be185d" },
  da_nhan: { bar: "#3b82f6", label: "\u0110\u00c3 NH\u1eacN", text: "#1d4ed8" },
  da_giai_quyet: { bar: "#22c55e", label: "\u0110\u00c3 GI\u1ea2I QUY\u1ebeT", text: "#15803d" },
  ton_sau: { bar: "#f59e0b", label: "T\u1ed2N SAU", text: "#b45309" },
} as const;

export const QUICK_FILTERS = [
  { key: "nam_nay", label: "N\u0103m nay" },
  { key: "12_thang", label: "12 th\u00e1ng g\u1ea7n nh\u1ea5t" },
  { key: "6_thang", label: "6 th\u00e1ng g\u1ea7n nh\u1ea5t" },
  { key: "3_thang", label: "3 th\u00e1ng g\u1ea7n nh\u1ea5t" },
  { key: "thang_nay", label: "Th\u00e1ng n\u00e0y" },
] as const;

export type SupportedThuTuc = 48 | 47 | 46;

export interface TabFilter {
  fromDate: string;
  toDate: string;
  fromInput: string;
  toInput: string;
  activePreset: string;
  loadingAll: boolean;
}

export function makeTabFilter(preset = "nam_nay"): TabFilter {
  const p = getPreset(preset);
  return {
    fromDate: p.from,
    toDate: p.to,
    fromInput: toDMY(p.from),
    toInput: toDMY(p.to),
    activePreset: preset,
    loadingAll: false,
  };
}

export { getPreset };

export interface SummaryData {
  ton_truoc: number;
  da_nhan: number;
  da_giai_quyet: number;
  ton_sau: number;
  from_date: string;
  to_date: string;
}

export interface SyncStatus {
  lastSyncedAt: string | null;
  totalSizeMB: number;
}

export interface GiaiQuyetData {
  dung_han: number;
  qua_han: number;
  total: number;
  pct_dung_han: number;
  pct_qua_han: number;
}

export interface TonSauData {
  con_han: number;
  qua_han: number;
  total: number;
  pct_con_han: number;
  pct_qua_han: number;
}

export interface ChuyenVienRow {
  ten_cv: string;
  ton_truoc: number;
  da_nhan: number;
  gq_tong: number;
  can_bo_sung: number;
  khong_dat: number;
  hoan_thanh: number;
  dung_han: number;
  qua_han: number;
  tg_tb: number | null;
  pct_gq_dung_han: number;
  pct_da_gq: number;
  ton_sau_tong: number;
  ton_sau_con_han: number;
  ton_sau_qua_han: number;
  treo: number;
}

export interface ChuyenVienData {
  thu_tuc: number;
  from_date: string;
  to_date: string;
  cho_phan_cong: ChuyenVienRow | null;
  rows: ChuyenVienRow[];
}

export interface Tt48LoaiHoSoRow {
  loai_ho_so: string;
  ton_truoc_total: number;
  ton_truoc_first: number;
  ton_truoc_supplement: number;
  ton_truoc_first_hinh_thuc_1: number;
  ton_truoc_first_hinh_thuc_2: number;
  ton_truoc_supplement_hinh_thuc_1: number;
  ton_truoc_supplement_hinh_thuc_2: number;
  ton_truoc_hinh_thuc_1: number;
  ton_truoc_hinh_thuc_2: number;
  da_nhan_total: number;
  da_nhan_first: number;
  da_nhan_supplement: number;
  da_nhan_first_hinh_thuc_1: number;
  da_nhan_first_hinh_thuc_2: number;
  da_nhan_supplement_hinh_thuc_1: number;
  da_nhan_supplement_hinh_thuc_2: number;
  da_nhan_hinh_thuc_1: number;
  da_nhan_hinh_thuc_2: number;
  giai_quyet_total: number;
  giai_quyet_first: number;
  giai_quyet_supplement: number;
  giai_quyet_first_hinh_thuc_1: number;
  giai_quyet_first_hinh_thuc_2: number;
  giai_quyet_supplement_hinh_thuc_1: number;
  giai_quyet_supplement_hinh_thuc_2: number;
  giai_quyet_hinh_thuc_1: number;
  giai_quyet_hinh_thuc_2: number;
  ton_total: number;
  ton_first: number;
  ton_supplement: number;
  ton_first_hinh_thuc_1: number;
  ton_first_hinh_thuc_2: number;
  ton_supplement_hinh_thuc_1: number;
  ton_supplement_hinh_thuc_2: number;
  ton_hinh_thuc_1: number;
  ton_hinh_thuc_2: number;
  treo: number;
}

export interface Tt48LoaiHoSoData {
  thu_tuc: 48;
  from_date: string;
  to_date: string;
  rows: Tt48LoaiHoSoRow[];
}

export interface MonthData {
  label: string;
  year: number;
  month: number;
  da_nhan: number;
  da_giai_quyet: number;
  ton_sau: number;
}

export interface MonthlyData {
  thu_tuc: number;
  months: MonthData[];
}

export type Tt48MonthlyReceivedGroupBy = "loai_ho_so" | "hinh_thuc" | "submission_kind";

export interface Tt48MonthlyReceivedCategory {
  key: string;
  label: string;
  color: string;
}

export interface Tt48ReceivedMonthlyRow {
  label: string;
  year: number;
  month: number;
  total: number;
  [key: string]: string | number;
}

export interface Tt48ReceivedMonthlyData {
  thu_tuc: 48;
  group_by: Tt48MonthlyReceivedGroupBy;
  categories: Tt48MonthlyReceivedCategory[];
  months: Tt48ReceivedMonthlyRow[];
}

export interface NuocSoTaiRow {
  ten_nuoc: string;
  ton_truoc: number;
  da_nhan: number;
  gq_tong: number;
  can_bo_sung: number;
  khong_dat: number;
  hoan_thanh: number;
  dung_han: number;
  qua_han: number;
  tg_tb: number | null;
  pct_gq_dung_han: number;
  pct_da_gq: number;
  ton_sau_tong: number;
  ton_sau_con_han: number;
  ton_sau_qua_han: number;
  treo: number;
}

export interface NuocSoTaiData {
  thu_tuc: 48;
  from_date: string;
  to_date: string;
  rows: NuocSoTaiRow[];
}

export const TT48_LOAI_LABELS: Record<string, string> = {
  A: "A - H\u1ed3 s\u01a1 m\u1edbi",
  B: "B - H\u1ed3 s\u01a1 c\u1eadp nh\u1eadt/duy tr\u00ec",
  C: "C - H\u1ed3 s\u01a1 \u0111i\u1ec1u ch\u1ec9nh",
  D: "D - H\u1ed3 s\u01a1 \u0111\u00ednh ch\u00ednh",
};

export async function fetchSummary(thuTuc: number, fromDate: string, toDate: string): Promise<SummaryData> {
  const url = `${API}/stats/summary?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API}/sync-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchEarliestDate(thuTuc: number): Promise<string> {
  const url = `${API}/stats/earliest-date?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.earliest_date as string;
}

export async function fetchGiaiQuyet(thuTuc: number, fromDate: string, toDate: string): Promise<GiaiQuyetData> {
  const url = `${API}/stats/giai-quyet?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTonSau(thuTuc: number, toDate: string): Promise<TonSauData> {
  const url = `${API}/stats/ton-sau?thu_tuc=${thuTuc}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchChuyenVien(thuTuc: number, fromDate: string, toDate: string): Promise<ChuyenVienData> {
  const url = `${API}/stats/chuyen-vien?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTt48LoaiHoSo(fromDate: string, toDate: string): Promise<Tt48LoaiHoSoData> {
  const url = `${API}/stats/tt48-phan-loai?from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchMonthly(thuTuc: number): Promise<MonthlyData> {
  const url = `${API}/stats/monthly?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTt48ReceivedMonthlyBreakdown(
  groupBy: Tt48MonthlyReceivedGroupBy,
): Promise<Tt48ReceivedMonthlyData> {
  const res = await fetch(`${API}/stats/tt48-monthly-received?group_by=${groupBy}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchNuocSoTai(fromDate: string, toDate: string): Promise<NuocSoTaiData> {
  const url = `${API}/stats/tt48-nuoc-so-tai?from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

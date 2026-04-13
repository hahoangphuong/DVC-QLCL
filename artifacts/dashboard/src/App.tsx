import { Fragment, useState, useCallback, useEffect, useRef, createContext, useContext, useMemo, useDeferredValue, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend,
  ComposedChart, Line,
  AreaChart, Area,
} from "recharts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { DOSSIER_DETAIL_TEXT, LOOKUP_TEXT } from "./uiText";
import { DashboardAuthGate } from "./features/auth/DashboardAuthGate";
import { useDashboardAuth } from "./features/auth/useDashboardAuth";
import { AdminPanelMount } from "./features/admin/AdminPanelMount";
import { useAdminPanelShell } from "./features/admin/useAdminPanelShell";
import { DashboardShellHeader } from "./features/layout/DashboardShellHeader";
import { useDashboardSyncStatus } from "./features/layout/useDashboardSyncStatus";
import { DashboardContentSwitch } from "./features/navigation/DashboardContentSwitch";
import { DashboardTabPanels } from "./features/navigation/DashboardTabPanels";
import { DASHBOARD_TABS, DEFAULT_DASHBOARD_TAB_ID, type DashboardTabId } from "./features/navigation/dashboardTabs";
import { useDashboardNavigation } from "./features/navigation/useDashboardNavigation";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 2,
    },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "/dashboard"
const API  = "/api"; // API base — tách biệt khỏi BASE để production routing hoạt động

function authHeaders(token: string): HeadersInit {
  return { "x-admin-token": token };
}


// Màu cho 4 chỉ số
const COLORS = {
  ton_truoc:     { bar: "#f472b6", label: "TỒN TRƯỚC",     text: "#be185d" },
  da_nhan:       { bar: "#3b82f6", label: "ĐÃ NHẬN",        text: "#1d4ed8" },
  da_giai_quyet: { bar: "#22c55e", label: "ĐÃ GIẢI QUYẾT", text: "#15803d" },
  ton_sau:       { bar: "#f59e0b", label: "TỒN SAU",        text: "#b45309" },
} as const;

// ---------------------------------------------------------------------------
// Helpers ngày tháng
// ---------------------------------------------------------------------------
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function toDMY(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function parseDMY(dmyStr: string): string {
  // Chuyển DD/MM/YYYY → YYYY-MM-DD
  const parts = dmyStr.replace(/\s/g, "").split("/");
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return "";
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function clampToToday(ymd: string): string {
  if (!ymd) return ymd;
  return minYmd(ymd, toYMD(new Date()));
}

// ---------------------------------------------------------------------------
// Quick filter presets
// ---------------------------------------------------------------------------
function getPreset(key: string): { from: string; to: string } {
  const now = new Date();
  const today = toYMD(now);
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  if (key === "thang_nay") {
    return { from: toYMD(new Date(y, m, 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  if (key === "nam_nay") {
    return { from: toYMD(new Date(y, 0, 1)), to: minYmd(toYMD(new Date(y, 11, 31)), today) };
  }
  if (key === "12_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 11);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  if (key === "6_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 5);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  if (key === "3_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 2);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: minYmd(toYMD(new Date(y, m + 1, 0)), today) };
  }
  return { from: toYMD(new Date(y, 0, 1)), to: today };
}

// Thứ tự nút lọc khớp với thiết kế Excel (Cộng dồn xử lý riêng vì cần API)
const QUICK_FILTERS = [
  { key: "nam_nay",   label: "Năm nay" },
  { key: "12_thang",  label: "12 tháng gần nhất" },
  { key: "6_thang",   label: "6 tháng gần nhất" },
  { key: "3_thang",   label: "3 tháng gần nhất" },
  { key: "thang_nay", label: "Tháng này" },
];

// ---------------------------------------------------------------------------
// Shared Filter Context (giữ nguyên bộ lọc khi chuyển tab)
// ---------------------------------------------------------------------------
// Mỗi tab Thống kê có bộ lọc riêng, được lưu theo thuTuc
interface TabFilter {
  fromDate:     string;
  toDate:       string;
  fromInput:    string;
  toInput:      string;
  activePreset: string;
  loadingAll:   boolean;
}
interface FiltersCtxType {
  filters:      Record<number, TabFilter>;
  updateFilter: (thuTuc: number, patch: Partial<TabFilter>) => void;
}
const FiltersCtx = createContext<FiltersCtxType | null>(null);
function useTabFilter(thuTuc: number): TabFilter & { update: (p: Partial<TabFilter>) => void } {
  const ctx = useContext(FiltersCtx);
  if (!ctx) throw new Error("useTabFilter must be inside FiltersCtx.Provider");
  return { ...ctx.filters[thuTuc], update: (p) => ctx.updateFilter(thuTuc, p) };
}
function makeTabFilter(preset = "nam_nay"): TabFilter {
  const p = getPreset(preset);
  return { fromDate: p.from, toDate: p.to, fromInput: toDMY(p.from), toInput: toDMY(p.to), activePreset: preset, loadingAll: false };
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------
interface SummaryData {
  ton_truoc:     number;
  da_nhan:       number;
  da_giai_quyet: number;
  ton_sau:       number;
  from_date:     string;
  to_date:       string;
}

async function fetchSummary(thuTuc: number, fromDate: string, toDate: string): Promise<SummaryData> {
  const url = `${API}/stats/summary?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchEarliestDate(thuTuc: number): Promise<string> {
  const url = `${API}/stats/earliest-date?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.earliest_date as string;
}

interface GiaiQuyetData {
  dung_han: number;
  qua_han:  number;
  total:    number;
  pct_dung_han: number;
  pct_qua_han:  number;
}

async function fetchGiaiQuyet(thuTuc: number, fromDate: string, toDate: string): Promise<GiaiQuyetData> {
  const url = `${API}/stats/giai-quyet?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface TonSauData {
  con_han:     number;
  qua_han:     number;
  total:       number;
  pct_con_han: number;
  pct_qua_han: number;
}

async function fetchTonSau(thuTuc: number, toDate: string): Promise<TonSauData> {
  const url = `${API}/stats/ton-sau?thu_tuc=${thuTuc}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface ChuyenVienRow {
  ten_cv:          string;
  ton_truoc:       number;
  da_nhan:         number;
  gq_tong:         number;
  can_bo_sung:     number;
  khong_dat:       number;
  hoan_thanh:      number;
  dung_han:        number;
  qua_han:         number;
  tg_tb:           number | null;
  pct_gq_dung_han: number;
  pct_da_gq:       number;
  ton_sau_tong:    number;
  ton_sau_con_han: number;
  ton_sau_qua_han: number;
  treo:            number;
}

interface ChuyenVienData {
  thu_tuc:         number;
  from_date:       string;
  to_date:         string;
  cho_phan_cong:   ChuyenVienRow | null;
  rows:            ChuyenVienRow[];
}

async function fetchChuyenVien(thuTuc: number, fromDate: string, toDate: string): Promise<ChuyenVienData> {
  const url = `${API}/stats/chuyen-vien?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Tt48LoaiHoSoRow {
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

interface Tt48LoaiHoSoData {
  thu_tuc: 48;
  from_date: string;
  to_date: string;
  rows: Tt48LoaiHoSoRow[];
}

async function fetchTt48LoaiHoSo(fromDate: string, toDate: string): Promise<Tt48LoaiHoSoData> {
  const url = `${API}/stats/tt48-phan-loai?from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface MonthData {
  label:          string;
  year:           number;
  month:          number;
  da_nhan:        number;
  da_giai_quyet:  number;
  ton_sau:        number;
}

interface MonthlyData {
  thu_tuc: number;
  months:  MonthData[];
}

async function fetchMonthly(thuTuc: number): Promise<MonthlyData> {
  const url = `${API}/stats/monthly?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Tt48ReceivedMonthlyLoaiRow {
  label: string;
  year: number;
  month: number;
  total: number;
  A: number;
  B: number;
  C: number;
  D: number;
}

interface Tt48ReceivedMonthlyLoaiData {
  thu_tuc: 48;
  months: Tt48ReceivedMonthlyLoaiRow[];
}

async function fetchTt48ReceivedMonthlyLoai(): Promise<Tt48ReceivedMonthlyLoaiData> {
  const res = await fetch(`${API}/stats/tt48-monthly-received`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface DangXuLyRow {
  cv_name:       string;
  tong:          number;
  cho_cv:        number;  // TT47/46: "Chờ CV"; TT48: alias cho chua_xu_ly
  cho_cg:        number;
  cho_to_truong: number;
  cho_trp:       number;
  cho_pct:       number;
  cho_van_thu:   number;
  con_han:       number;
  qua_han:       number;
  cham_so_ngay:  number;
  cham_ma:       string | null;
  cham_ngay:     string | null;
  // TT48 only: 4 sub-bước Chuyên viên
  chua_xu_ly?:   number;
  bi_tra_lai?:   number;
  cho_tong_hop?: number;
  cho_cong_bo?:  number;
  // TT48 only: per-step con_han / qua_han (để tính hàng CÒN HẠN / QUÁ HẠN)
  chua_xu_ly_con?: number; chua_xu_ly_qua?: number;
  bi_tra_lai_con?: number; bi_tra_lai_qua?: number;
  cho_cg_con?: number;     cho_cg_qua?: number;
  cho_tong_hop_con?: number; cho_tong_hop_qua?: number;
  cho_to_truong_con?: number; cho_to_truong_qua?: number;
  cho_trp_con?: number;    cho_trp_qua?: number;
  cho_cong_bo_con?: number; cho_cong_bo_qua?: number;
  cho_pct_con?: number;    cho_pct_qua?: number;
  cho_van_thu_con?: number; cho_van_thu_qua?: number;
}
interface DangXuLyData {
  thu_tuc: number;
  cho_phan_cong: DangXuLyRow | null;
  rows: DangXuLyRow[];
  months: { label: string; year: number; month: number; cnt: number }[];
}

async function fetchDangXuLy(thuTuc: number): Promise<DangXuLyData> {
  const url = `${API}/stats/dang-xu-ly?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

type LookupThuTuc = 46 | 47 | 48;
type LookupTinhTrang =
  | "cho_phan_cong"
  | "cho_chuyen_vien"
  | "chua_xu_ly"
  | "bi_tra_lai"
  | "cho_tong_hop"
  | "cho_chuyen_gia"
  | "cho_to_truong"
  | "cho_truong_phong"
  | "cho_cong_bo"
  | "cho_van_thu"
  | "can_bo_sung"
  | "khong_dat"
  | "da_hoan_thanh";

interface TraCuuDangXuLyRow {
  thu_tuc: LookupThuTuc;
  ma_ho_so: string;
  ngay_tiep_nhan: string | null;
  ngay_hen_tra: string | null;
  loai_ho_so: string | null;
  submission_kind: string | null;
  tinh_trang: LookupTinhTrang;
  chuyen_vien: string | null;
  chuyen_gia: string | null;
  thoi_gian_cho_ngay: number;
}

type TraCuuSortKey =
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

type TraCuuFilterState = {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
};

const DEFAULT_TRA_CUU_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
};

const DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
};

interface TraCuuDangXuLyData {
  filters: {
    thu_tuc: LookupThuTuc | null;
    chuyen_vien: string | null;
    chuyen_gia: string | null;
    tinh_trang: LookupTinhTrang | null;
    ma_ho_so: string | null;
  };
  options: {
    chuyen_vien: string[];
    chuyen_gia: string[];
  };
  rows: TraCuuDangXuLyRow[];
}

interface TraCuuDaXuLyData extends TraCuuDangXuLyData {}

interface DavTt48FileItem {
  duongDanTep?: string | null;
  tenTep?: string | null;
  moTaTep?: string | null;
  code?: string | null;
}

interface DavTt48HoSoBundle {
  lanBoSung?: number | null;
  moTaTep?: string | null;
  danhSachTepDinhKem?: DavTt48FileItem[];
}

interface DavTt48HistoryItem {
  nguoiXuLy?: string | null;
  hanhDongXuLy?: string | null;
  ngayXuLy?: string | null;
  noiDungYKien?: string | null;
  soNgayXuLy?: number | null;
  soNgayQuaHan?: number | null;
}

interface DavTt48DetailData {
  ok: boolean;
  thu_tuc: 48;
  ho_so_id: number;
  view: {
    hoSo: Record<string, unknown>;
    trangThaiHoSo: number | null;
    urlGiayBaoThu: string | null;
    urlBanDangKy: string | null;
    listTepHoSo: DavTt48HoSoBundle[];
    listTepHoSoXuLy: Array<Record<string, unknown>>;
    parsedJsonDonHang: Record<string, unknown> | null;
    parsedJsonPhamViKinhDoanh: Array<Record<string, unknown>> | null;
  };
  history: {
    listYKien: DavTt48HistoryItem[];
  };
}

async function fetchTraCuuDangXuLy(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  signal?: AbortSignal;
}): Promise<TraCuuDangXuLyData> {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien) search.set("chuyen_vien", params.chuyenVien);
  if (params.chuyenGia) search.set("chuyen_gia", params.chuyenGia);
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());

  const qs = search.toString();
  const res = await fetch(`${API}/stats/tra-cuu-dang-xu-ly${qs ? `?${qs}` : ""}`, { signal: params.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchTraCuuDaXuLy(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  signal?: AbortSignal;
}): Promise<TraCuuDaXuLyData> {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien) search.set("chuyen_vien", params.chuyenVien);
  if (params.chuyenGia) search.set("chuyen_gia", params.chuyenGia);
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());

  const qs = search.toString();
  const res = await fetch(`${API}/stats/tra-cuu-da-xu-ly${qs ? `?${qs}` : ""}`, { signal: params.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchDavTt48HoSoDetail(hoSoId: number): Promise<DavTt48DetailData> {
  const res = await fetch(`${API}/dav/tt48/ho-so/${hoSoId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = iso.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function extractHoSoId(maHoSo: string): number | null {
  const matched = /^\s*(\d+)\s*\/\s*TT48\s*$/i.exec(maHoSo);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function buildDavViewFileUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  return `${API}/dav/file?path=${encodeURIComponent(pathOrUrl)}`;
}

// ---------------------------------------------------------------------------
// Chuyên gia data model
// ---------------------------------------------------------------------------
interface ChuyenGiaRow {
  ten:          string;
  da_giai_quyet:number;
  tong:         number;
  con_han:      number;
  qua_han:      number;
  cham_so_ngay: number;
  cham_ma:      string | null;
  cham_ngay:    string | null;
  cham_cv:      string | null;
}
interface ChuyenGiaData {
  thu_tuc:        number;
  chuyen_gia:     ChuyenGiaRow[];
  chuyen_vien_cg: ChuyenGiaRow[];
}
const CHART_ANIMATION_MS = 500;
async function fetchChuyenGia(thuTuc: number): Promise<ChuyenGiaData> {
  const url = `${API}/stats/chuyen-gia?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Bar chart component
// ---------------------------------------------------------------------------
interface BarData { name: string; value: number; color: string; }

function SummaryBarChart({ data }: { data: BarData[] }) {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-4 py-2 text-sm">
          <p className="font-semibold text-slate-700">{payload[0].payload.name}</p>
          <p className="text-slate-900 font-bold text-lg">{payload[0].value.toLocaleString("vi-VN")}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 32, right: 20, left: -10, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fontWeight: 600, fill: "#475569" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => v.toLocaleString("vi-VN")}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={80} animationDuration={CHART_ANIMATION_MS}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            formatter={(v: number) => v.toLocaleString("vi-VN")}
            style={{ fontSize: 13, fontWeight: 700, fill: "#1e293b" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function KpiCard({ label, value, color, bgColor }: {
  label: string; value: number; color: string; bgColor: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl p-4 text-center min-w-0 shadow-sm border border-slate-100"
      style={{ backgroundColor: bgColor }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color }}>
        {label}
      </div>
      <div className="text-3xl font-bold" style={{ color }}>
        {value.toLocaleString("vi-VN")}
      </div>
    </div>
  );
}

function LookupProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50">
      <div className="relative h-2 w-full overflow-hidden bg-blue-100">
        <div className="h-full w-full animate-pulse bg-blue-500" />
      </div>
      <div className="px-3 py-2 text-xs font-medium text-blue-700">
        Đang tải dữ liệu...
      </div>
    </div>
  );
}

function TraCuuDaXuLyTab(props?: {
  state: TraCuuFilterState;
  setState: React.Dispatch<React.SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  const [localState, setLocalState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
  const state = props?.state ?? localState;
  const setState = props?.setState ?? setLocalState;
  const isActive = props?.isActive ?? true;
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const [selectedDetail, setSelectedDetail] = useState<{ hoSoId: number; maHoSo: string } | null>(null);
  const setChuyenVien = (value: string) => setState((prev) => ({ ...prev, chuyenVien: value }));
  const setChuyenGia = (value: string) => setState((prev) => ({ ...prev, chuyenGia: value }));
  const setThuTuc = (value: LookupThuTuc | "all") => setState((prev) => ({ ...prev, thuTuc: value }));
  const setTinhTrang = (value: LookupTinhTrang | "all") => setState((prev) => ({ ...prev, tinhTrang: value }));
  const setMaHoSo = (value: string) => setState((prev) => ({ ...prev, maHoSo: value }));
  const deferredMaHoSo = useDeferredValue(maHoSo);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["tra-cuu-da-xu-ly", thuTuc, chuyenVien, chuyenGia, tinhTrang, deferredMaHoSo],
    queryFn: ({ signal }) => fetchTraCuuDaXuLy({
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo: deferredMaHoSo,
      signal,
    }),
    enabled: isActive,
    placeholderData: (previousData) => previousData,
    retry: 2,
  });

  useEffect(() => {
    if (!isActive) {
      void queryClient.cancelQueries({ queryKey: ["tra-cuu-da-xu-ly"] });
    }
  }, [isActive]);

  const chuyenVienOptions = data?.options.chuyen_vien ?? [];
  const chuyenGiaOptions = data?.options.chuyen_gia ?? [];

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    if (sortBy === "stt") return sortDir === "asc" ? rows : rows.reverse();

    const getValue = (row: TraCuuDangXuLyRow) => {
      switch (sortBy) {
        case "ma_ho_so": return row.ma_ho_so;
        case "ngay_tiep_nhan": return row.ngay_tiep_nhan ?? "";
        case "ngay_hen_tra": return row.ngay_hen_tra ?? "";
        case "loai_ho_so": return row.loai_ho_so ?? "";
        case "submission_kind": return row.submission_kind === "first" ? "0" : row.submission_kind === "supplement" ? "1" : "2";
        case "tinh_trang": return LOOKUP_TINH_TRANG_SORT_ORDER[row.tinh_trang] ?? Number.MAX_SAFE_INTEGER;
        case "chuyen_vien": return displayLookupCv(row.chuyen_vien);
        case "chuyen_gia": return displayLookupCg(row.chuyen_gia);
        case "thoi_gian_cho_ngay": return row.thoi_gian_cho_ngay;
        case "stt": return 0;
      }
    };

    rows.sort((left, right) => {
      const a = getValue(left);
      const b = getValue(right);
      let result = 0;
      if (typeof a === "number" && typeof b === "number") result = a - b;
      else result = String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
      if (result === 0) result = left.ma_ho_so.localeCompare(right.ma_ho_so, "vi", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    });
    return rows;
  }, [data?.rows, sortBy, sortDir]);

  const toggleSort = (key: typeof sortBy) => {
    if (key === "stt") return;
    if (sortBy === key) {
      setState((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }));
      return;
    }
    setState((prev) => ({ ...prev, sortBy: key, sortDir: "desc" }));
  };

  const SortableHeader = ({ label, sortKey, center = false }: { label: string; sortKey: typeof sortBy; center?: boolean }) => {
    const active = sortBy === sortKey;
    const arrow = !active ? "↕" : sortDir === "asc" ? "↑" : "↓";
    return (
      <th className={`px-3 py-3 ${center ? "text-center" : "text-left"} font-semibold uppercase tracking-wide whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors ${active ? "text-blue-700" : "text-slate-600 hover:text-slate-800"}`}
        >
          <span>{label}</span>
          <span className={`text-[10px] ${active ? "text-blue-600" : "text-slate-400"}`}>{arrow}</span>
        </button>
      </th>
    );
  };

  const SelectField = ({
    label,
    value,
    onChange,
    children,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
      >
        {children}
      </select>
    </label>
  );

  const handleResetFilters = () => setState((prev) => ({
    ...DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
    sortBy: prev.sortBy,
    sortDir: prev.sortDir,
  }));

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadTraCuuDaXuLyExcel({
        thuTuc,
        chuyenVien,
        chuyenGia,
        tinhTrang,
        maHoSo,
        sortBy,
        sortDir,
      });
    } catch (e) {
      alert(`Lỗi xuất Excel: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <SelectField label="Chuyên viên" value={chuyenVien} onChange={setChuyenVien}>
            <option value="">Tất cả</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </SelectField>
          <SelectField label="Chuyên gia" value={chuyenGia} onChange={setChuyenGia}>
            <option value="">Tất cả</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectField>
          <SelectField label="Thủ tục" value={String(thuTuc)} onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}>
            <option value="all">Tất cả</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </SelectField>
          <SelectField label="Tình trạng" value={tinhTrang} onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}>
            {TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>
          <label className="flex min-w-[260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lọc mã hồ sơ</span>
            <input
              type="text"
              value={maHoSo}
              onChange={(e) => setMaHoSo(e.target.value)}
              placeholder="Nhập mã hồ sơ"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleResetFilters} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800" title="Đặt lại bộ lọc" aria-label="Đặt lại bộ lọc">↺</button>
            <button type="button" onClick={handleExportExcel} disabled={exporting || isFetching || !data} className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </button>
          </div>
          <div className="ml-auto text-xs text-slate-500 font-medium">
            {isFetching ? "Đang tải dữ liệu..." : `Tìm thấy ${data?.rows.length.toLocaleString("vi-VN") ?? 0} hồ sơ`}
          </div>
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">
            Không thể tải danh mục hồ sơ đã xử lý
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 1220, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 78 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="px-3 py-3 text-center font-semibold uppercase tracking-wide whitespace-nowrap">STT</th>
                  <SortableHeader label="Mã hồ sơ" sortKey="ma_ho_so" />
                  <SortableHeader label={LOOKUP_TEXT.dateReceived} sortKey="ngay_tiep_nhan" center />
                  <SortableHeader label={LOOKUP_TEXT.resultDateShort} sortKey="ngay_hen_tra" center />
                  <SortableHeader label="Lần nộp" sortKey="submission_kind" />
                  <SortableHeader label="Loại hồ sơ" sortKey="loai_ho_so" center />
                  <SortableHeader label="Chuyên viên" sortKey="chuyen_vien" />
                  <SortableHeader label="Chuyên gia" sortKey="chuyen_gia" />
                  <SortableHeader label="Thời gian xử lý" sortKey="thoi_gian_cho_ngay" center />
                  <SortableHeader label="Tình trạng" sortKey="tinh_trang" />
                  <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">Thông tin hồ sơ</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">Đang chuẩn bị dữ liệu tra cứu...</td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">Không có hồ sơ phù hợp với điều kiện lọc.</td>
                  </tr>
                ) : sortedRows.map((row, index) => (
                  <tr key={`${row.thu_tuc}-${row.ma_ho_so}-${index}`} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} group hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{row.ma_ho_so}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_tiep_nhan)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_hen_tra)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displaySubmissionKind(row.submission_kind)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{row.loai_ho_so || ""}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCv(row.chuyen_vien)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCg(row.chuyen_gia)}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">{row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ngày` : ""}</td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{displayLookupTinhTrang(row.tinh_trang)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const hoSoId = row.thu_tuc === 48 ? extractHoSoId(row.ma_ho_so) : null;
                          if (hoSoId) setSelectedDetail({ hoSoId, maHoSo: row.ma_ho_so });
                        }}
                        disabled={row.thu_tuc !== 48 || extractHoSoId(row.ma_ho_so) === null}
                        className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedDetail && (
        <LookupHoSoDetailModal hoSoId={selectedDetail.hoSoId} maHoSo={selectedDetail.maHoSo} onClose={() => setSelectedDetail(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic DonutChart — tái sử dụng cho mọi biểu đồ tròn
// ---------------------------------------------------------------------------
interface DonutSegment { name: string; value: number; color: string; }
interface DonutChartProps {
  title:        string;
  segments:     DonutSegment[];
  total:        number;
  isLoading:    boolean;
  isError:      boolean;
  emptyMessage?: string;
  spinnerColor?: string;
  startAngle?:  number;
  endAngle?:    number;
}

function DonutChart({
  title,
  segments,
  total,
  isLoading,
  isError,
  emptyMessage,
  spinnerColor = "#22c55e",
  startAngle = 270,
  endAngle = -90,
}: DonutChartProps) {
  // Renders center count (index=0 only) + % inside each slice
  const CombinedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }: any) => {
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const sx = cx + r * Math.cos(-midAngle * RADIAN);
    const sy = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = Math.round((percent ?? 0) * 100);
    return (
      <g>
        {index === 0 && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
            <tspan x={cx} dy="-0.4em" fontSize={26} fontWeight={700} fill="#1e293b">
              {total.toLocaleString("vi-VN")}
            </tspan>
            <tspan x={cx} dy="1.5em" fontSize={11} fill="#64748b" fontWeight={500}>
              hồ sơ
            </tspan>
          </text>
        )}
        {pct >= 5 && (
          <text x={sx} y={sy} fill="#fff" textAnchor="middle" dominantBaseline="central"
            fontSize={13} fontWeight={700}>{pct}%</text>
        )}
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const item = payload[0];
      const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: item.payload.color }} />
            <span className="font-semibold text-slate-700">{item.name}</span>
          </div>
          <div className="mt-1 font-bold text-slate-900">{item.value.toLocaleString("vi-VN")} hồ sơ</div>
          <div className="text-slate-500">{pct}%</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="relative flex items-center justify-center mb-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide text-center">{title}</h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium absolute right-0">Đang tải...</span>}
        {isError   && <span className="text-xs text-red-500 font-medium absolute right-0">Lỗi tải dữ liệu</span>}
      </div>

      {isLoading ? (
        <div className="h-52 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
               style={{ borderColor: `${spinnerColor} transparent transparent transparent` }} />
        </div>
      ) : total === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-slate-400 text-sm">
          <div className="text-3xl mb-2">—</div>
          <div>{emptyMessage ?? "Không có dữ liệu"}</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie
                data={segments}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                dataKey="value"
                startAngle={startAngle}
                endAngle={endAngle}
                labelLine={false}
                label={CombinedLabel}
                animationDuration={CHART_ANIMATION_MS}
              >
                {segments.map((s, i) => (
                  <Cell key={i} fill={s.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend — nằm bên dưới, căn giữa, cân xứng */}
          <div className="flex gap-8 justify-center flex-wrap pb-1">
            {segments.map((s) => (
              <div key={s.name} className="flex flex-col items-center gap-0.5">
                <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{s.name}</div>
                <div className="text-xl font-bold leading-tight" style={{ color: s.color }}>
                  {s.value.toLocaleString("vi-VN")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng chi tiết theo chuyên viên (đầy đủ cột theo thiết kế Excel)
// ---------------------------------------------------------------------------
const CV_PREFIX = "CV thụ lý : ";
function cleanCvName(raw: string): string {
  return raw.startsWith(CV_PREFIX) ? raw.slice(CV_PREFIX.length).trim() : raw.trim();
}

function Num({ v, color, bold }: { v: number | null | undefined; color?: string; bold?: boolean }) {
  if (v === null || v === undefined) return <span className="text-slate-300">—</span>;
  if (v === 0) return <span />;
  return (
    <span className={bold ? "font-bold" : "font-medium"} style={{ color: color ?? "#374151" }}>
      {v.toLocaleString("vi-VN")}
    </span>
  );
}

function Pct({ v, warnBelow }: { v: number; warnBelow?: number }) {
  const color = warnBelow !== undefined && v < warnBelow ? "#ef4444" : "#15803d";
  return <span className="font-bold text-xs" style={{ color }}>{v}%</span>;
}

function cvSum(rows: ChuyenVienRow[], key: keyof ChuyenVienRow): number {
  return rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
}

interface ChuyenVienTableProps {
  thuTuc:   48 | 47 | 46;
  fromDate: string;
  toDate:   string;
  onCvClick?: (tenCvRaw: string) => void;
}

function ChuyenVienTable({ thuTuc, fromDate, toDate, onCvClick }: ChuyenVienTableProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-vien", thuTuc, fromDate, toDate],
    queryFn:  () => fetchChuyenVien(thuTuc, fromDate, toDate),
    enabled:  !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const rows = data?.rows ?? [];
  const cpc  = data?.cho_phan_cong ?? null;

  const thC  = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL  = "px-2 py-2 text-left   text-xs font-bold uppercase tracking-wide";
  // Sub-header không uppercase (cho cột con — trừ TỔNG)
  const thS  = "px-2 py-2 text-center text-xs font-semibold";
  const tdC  = "px-2 py-2 text-center text-xs";
  const tdL  = "px-2 py-2 text-left   text-xs";
  const totRow = "bg-slate-200 font-bold border-t-2 border-slate-400";

  // Sticky column helpers — STT fixed at left:0, CV fixed at left:36px
  const STT_W = 36;  // pixel width của cột STT
  const stickySTT = { position: "sticky" as const, left: 0,       zIndex: 10 };
  const stickyCV  = { position: "sticky" as const, left: STT_W,   zIndex: 10,
                      boxShadow: "2px 0 4px -1px rgba(0,0,0,0.12)" };

  const totals: Record<string, number> = {
    ton_truoc:       cvSum(rows, "ton_truoc"),
    da_nhan:         cvSum(rows, "da_nhan") + (cpc?.da_nhan ?? 0),
    gq_tong:         cvSum(rows, "gq_tong"),
    can_bo_sung:     cvSum(rows, "can_bo_sung"),
    khong_dat:       cvSum(rows, "khong_dat"),
    hoan_thanh:      cvSum(rows, "hoan_thanh"),
    dung_han:        cvSum(rows, "dung_han"),
    qua_han:         cvSum(rows, "qua_han"),
    ton_sau_tong:    cvSum(rows, "ton_sau_tong")    + (cpc?.ton_sau_tong    ?? 0),
    ton_sau_con_han: cvSum(rows, "ton_sau_con_han") + (cpc?.ton_sau_con_han ?? 0),
    ton_sau_qua_han: cvSum(rows, "ton_sau_qua_han") + (cpc?.ton_sau_qua_han ?? 0),
    treo:            cvSum(rows, "treo"),
  };
  const tot_pct_dh = totals.gq_tong > 0 ? Math.round(totals.dung_han / totals.gq_tong * 100) : 0;
  const tot_pct_gq = (totals.ton_truoc + totals.da_nhan) > 0
    ? Math.round(totals.gq_tong / (totals.ton_truoc + totals.da_nhan) * 100) : 0;

  // Tính ngưỡng top 30% cho từng cột cần highlight
  function topThresh(vals: (number | null)[]): number {
    const sorted = vals
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => b - a);
    if (sorted.length === 0) return Infinity;
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.3) - 1)];
  }
  const hiThresh = {
    ton_truoc:    topThresh(rows.map(r => r.ton_truoc)),
    da_nhan:      topThresh(rows.map(r => r.da_nhan)),
    gq_tong:      topThresh(rows.map(r => r.gq_tong)),
    hoan_thanh:   topThresh(rows.map(r => r.hoan_thanh)),
    tg_tb:        topThresh(rows.map(r => r.tg_tb)),
    ton_sau_tong: topThresh(rows.map(r => r.ton_sau_tong)),
  };
  const isHi = (thresh: number, v: number | null | undefined) =>
    v != null && v > 0 && v >= thresh;
  // Trả về class td có thêm highlight nền vàng nhạt nếu đủ điều kiện
  const hiTd = (thresh: number, v: number | null | undefined, extra = "") =>
    `${tdC}${extra ? " " + extra : ""}${isHi(thresh, v) ? " bg-amber-100" : ""}`;

  function CvRow({ row, idx }: { row: ChuyenVienRow; idx: number }) {
    const bgCls  = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    const tonTruocBg = idx % 2 === 0 ? "bg-pink-50/70" : "bg-pink-50/40";
    const daNhanBg = idx % 2 === 0 ? "bg-blue-50/70" : "bg-blue-50/40";
    const giaiQuyetBg = idx % 2 === 0 ? "bg-green-50/80" : "bg-green-50/50";
    const tonSauBg = idx % 2 === 0 ? "bg-amber-50/80" : "bg-amber-50/50";
    const treoBg = idx % 2 === 0 ? "bg-orange-50/80" : "bg-orange-50/60";
    return (
      <tr className={`${bgCls} hover:bg-blue-50/40 transition-colors`}>
        <td className={`${tdC} text-slate-400`}
            style={{ ...stickySTT, backgroundColor: bgColor, width: STT_W, minWidth: STT_W }}>
          {idx + 1}
        </td>
        <td className={`${tdL} font-semibold text-slate-800 min-w-[160px]`}
            style={{ ...stickyCV, backgroundColor: bgColor }}>
          {onCvClick ? (
            <button
              type="button"
              onClick={() => onCvClick(row.ten_cv)}
              className="cursor-pointer text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              {cleanCvName(row.ten_cv)}
            </button>
          ) : (
            cleanCvName(row.ten_cv)
          )}
        </td>
        <td className={hiTd(hiThresh.ton_truoc,    row.ton_truoc, tonTruocBg)}><Num v={row.ton_truoc} color="#be185d" bold /></td>
        <td className={hiTd(hiThresh.da_nhan,       row.da_nhan, daNhanBg)}><Num v={row.da_nhan}   color="#1d4ed8" bold /></td>
        <td className={hiTd(hiThresh.gq_tong,       row.gq_tong, `${giaiQuyetBg} font-bold text-slate-700`)}><Num v={row.gq_tong} /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.can_bo_sung} color="#b45309" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.khong_dat}   color="#dc2626" /></td>
        <td className={hiTd(hiThresh.hoan_thanh,    row.hoan_thanh, giaiQuyetBg)}><Num v={row.hoan_thanh}  color="#15803d" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.dung_han}    color="#15803d" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.qua_han}     color="#dc2626" /></td>
        <td className={hiTd(hiThresh.tg_tb,          row.tg_tb, giaiQuyetBg)}><Num v={row.tg_tb} color="#6b7280" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Pct v={row.pct_gq_dung_han} warnBelow={30} /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Pct v={row.pct_da_gq} /></td>
        <td className={hiTd(hiThresh.ton_sau_tong,  row.ton_sau_tong, `${tonSauBg} font-bold text-slate-700`)}><Num v={row.ton_sau_tong} /></td>
        <td className={`${tdC} ${tonSauBg}`}><Num v={row.ton_sau_con_han} color="#2563eb" /></td>
        <td className={`${tdC} ${tonSauBg}`}><Num v={row.ton_sau_qua_han} color="#dc2626" /></td>
        <td className={`${tdC} ${treoBg}`}><Num v={row.treo} color="#ea580c" bold /></td>
      </tr>
    );
  }

  const colSpan = 17;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Chi tiết theo chuyên viên — TT{thuTuc}
        </h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium">Đang tải...</span>}
        {isError   && <span className="text-xs text-red-500 font-medium">Lỗi tải dữ liệu</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 1100, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col /><col /><col /><col /><col />
            <col /><col /><col /><col /><col />
            <col /><col /><col /><col /><col />
          </colgroup>
          <thead>
            {/* Hàng 1: nhóm cột */}
            <tr className="bg-slate-700 text-white">
              <th className={`${thC} bg-slate-700 text-white`} rowSpan={2}
                  style={{ ...stickySTT, backgroundColor: "#334155", width: STT_W, minWidth: STT_W }}>
                STT
              </th>
              <th className={`${thL} bg-slate-700 text-white min-w-[160px]`} rowSpan={2}
                  style={{ ...stickyCV, backgroundColor: "#334155" }}>
                Chuyên viên
              </th>
              <th className={`${thC} bg-pink-700 text-white`} rowSpan={2}>Tồn<br />trước</th>
              <th className={`${thC} bg-blue-700 text-white`} rowSpan={2}>Đã<br />nhận</th>
              <th className={`${thC} bg-green-700 text-white`} colSpan={9}>Đã giải quyết</th>
              <th className={`${thC} bg-amber-700 text-white`} colSpan={3}>Tồn sau</th>
              <th className={`${thC} bg-orange-600 text-white`} rowSpan={2}>TREO</th>
            </tr>
            <tr className="bg-slate-100">
              <th className={`${thC} bg-green-50`}>Tổng</th>
              <th className={`${thS} bg-amber-50`}>Cần bổ sung</th>
              <th className={`${thS} bg-red-50`}>Không đạt</th>
              <th className={`${thS} bg-green-50`}>Hoàn thành</th>
              <th className={`${thS} bg-green-50 text-green-700`}>Đúng hạn</th>
              <th className={`${thS} bg-red-50 text-red-700`}>Quá hạn</th>
              <th className={`${thS} bg-slate-50`}>Thời gian TB</th>
              <th className={`${thS} bg-green-50 text-green-700`}>% Đúng hạn</th>
              <th className={`${thS} bg-slate-50 text-slate-600`}>% Đã GQ</th>
              <th className={`${thC} bg-amber-50`}>Tổng</th>
              <th className={`${thS} bg-blue-50 text-blue-700`}>Còn hạn</th>
              <th className={`${thS} bg-red-50 text-red-700`}>Quá hạn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  <span>Đang tải...</span>
                </div>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">Không có dữ liệu</td></tr>
            ) : (
              <>
                {/* Hàng "Chờ phân công" nếu có */}
                {cpc && (cpc.ton_sau_tong > 0 || cpc.da_nhan > 0) && (
                  <tr className="bg-yellow-50 border-b-2 border-yellow-200">
                    <td className={`${tdC} text-slate-400`}
                        style={{ ...stickySTT, backgroundColor: "#fefce8", width: STT_W, minWidth: STT_W }}>
                      —
                    </td>
                    <td className={`${tdL} text-amber-700 font-semibold`}
                        style={{ ...stickyCV, backgroundColor: "#fefce8" }}>
                      Chờ phân công...
                    </td>
                    <td className={tdC}></td>
                    <td className={tdC}><Num v={cpc.da_nhan} color="#1d4ed8" bold /></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}><Num v={cpc.ton_sau_tong} color="#b45309" bold /></td>
                    <td className={tdC}><Num v={cpc.ton_sau_con_han} color="#2563eb" /></td>
                    <td className={tdC}><Num v={cpc.ton_sau_qua_han} color="#dc2626" /></td>
                    <td className={tdC}></td>
                  </tr>
                )}
                {rows.map((row, idx) => <CvRow key={row.ten_cv} row={row} idx={idx} />)}
              </>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={totRow}>
                <td className={tdC}
                    style={{ ...stickySTT, backgroundColor: "#e2e8f0", width: STT_W, minWidth: STT_W }} />
                <td className={`${tdL} text-slate-700 font-bold`}
                    style={{ ...stickyCV, backgroundColor: "#e2e8f0" }}>
                  TỔNG
                </td>
                <td className={tdC}><Num v={totals.ton_truoc}       color="#be185d" bold /></td>
                <td className={tdC}><Num v={totals.da_nhan}         color="#1d4ed8" bold /></td>
                <td className={tdC}><Num v={totals.gq_tong}         bold /></td>
                <td className={tdC}><Num v={totals.can_bo_sung}     color="#b45309" bold /></td>
                <td className={tdC}><Num v={totals.khong_dat}       color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.hoan_thanh}      color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.dung_han}        color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.qua_han}         color="#dc2626" bold /></td>
                <td className={tdC} />
                <td className={tdC}><Pct v={tot_pct_dh} warnBelow={30} /></td>
                <td className={tdC}><Pct v={tot_pct_gq} /></td>
                <td className={tdC}><Num v={totals.ton_sau_tong}    bold /></td>
                <td className={tdC}><Num v={totals.ton_sau_con_han} color="#2563eb" bold /></td>
                <td className={tdC}><Num v={totals.ton_sau_qua_han} color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.treo}            color="#ea580c" bold /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Biểu đồ xu hướng theo tháng (bar + line, giống thiết kế Excel)
// ---------------------------------------------------------------------------
function MonthlyTrendChart({ thuTuc, fromDate, toDate, hideTitle = false }: {
  thuTuc: 48 | 47 | 46;
  fromDate: string;
  toDate:   string;
  hideTitle?: boolean;
}) {
  const [showLabels, setShowLabels] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["monthly", thuTuc],
    queryFn:  () => fetchMonthly(thuTuc),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // Lọc các tháng nằm trong kỳ fromDate..toDate
  const allMonths = data?.months ?? [];
  const [fy, fm] = fromDate ? [+fromDate.slice(0,4), +fromDate.slice(5,7)] : [0, 0];
  const [ty, tm] = toDate   ? [+toDate.slice(0,4),   +toDate.slice(5,7)]   : [9999, 12];
  const months = allMonths.filter(m => {
    const after  = m.year > fy  || (m.year === fy  && m.month >= fm);
    const before = m.year < ty  || (m.year === ty  && m.month <= tm);
    return after && before;
  });

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="h-64 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );

  if (isError || months.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        {!hideTitle ? (
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            Xu hướng theo tháng — TT{thuTuc}
          </h3>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#60a5fa]" /> Tiếp nhận
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#34d399]" /> Giải quyết
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> Hồ sơ tồn
          </span>
          <label className="flex items-center gap-1 cursor-pointer select-none border-l border-slate-200 pl-4 ml-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-3 h-3 accent-blue-600 cursor-pointer"
            />
            <span>Hiện số liệu</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={months}
          margin={{ top: showLabels ? 10 : 20, right: 30, bottom: 5, left: 10 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            interval={months.length > 24 ? Math.floor(months.length / 24) : 0}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "#64748b" }} width={45} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} width={55} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                da_nhan:       "Tiếp nhận",
                da_giai_quyet: "Giải quyết",
                ton_sau:       "Hồ sơ tồn",
              };
              return [value.toLocaleString("vi-VN"), labels[name] ?? name];
            }}
          />
          <Bar yAxisId="left" dataKey="da_nhan" fill="#60a5fa" name="da_nhan" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
            {showLabels && (
              <LabelList
                dataKey="da_nhan"
                content={(props: any) => {
                  const { x, y, width, height, value } = props;
                  if (!value || height < 16) return null;
                  const cx = (x ?? 0) + (width ?? 0) / 2;
                  // Đặt center của text cách đỉnh cột một khoảng = nửa chiều dài text
                  // Tại fontSize 9, mỗi ký tự ≈ 6px; dự phòng 13px là đủ cho 3–4 chữ số
                  const cy = (y ?? 0) + 13;
                  return (
                    <text x={cx} y={cy}
                      transform={`rotate(-90, ${cx}, ${cy})`}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={9} fill="#1e40af" fontWeight={600}>
                      {value}
                    </text>
                  );
                }}
              />
            )}
          </Bar>
          <Bar yAxisId="left" dataKey="da_giai_quyet" fill="#34d399" name="da_giai_quyet" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
            {showLabels && (
              <LabelList
                dataKey="da_giai_quyet"
                content={(props: any) => {
                  const { x, y, width, height, value } = props;
                  if (!value || height < 16) return null;
                  const cx = (x ?? 0) + (width ?? 0) / 2;
                  const cy = (y ?? 0) + 13;
                  return (
                    <text x={cx} y={cy}
                      transform={`rotate(-90, ${cx}, ${cy})`}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={9} fill="#065f46" fontWeight={600}>
                      {value}
                    </text>
                  );
                }}
              />
            )}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ton_sau"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={months.length <= 24}
            name="ton_sau"
            animationDuration={CHART_ANIMATION_MS}
          >
            {showLabels && (
              <LabelList
                dataKey="ton_sau"
                position="top"
                style={{ fontSize: 9, fill: "#b45309", fontWeight: 600 }}
                formatter={(v: number) => v || ""}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tt48LoaiHoSoMonthlyChart({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [showLabels, setShowLabels] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tt48-monthly-received"],
    queryFn: () => fetchTt48ReceivedMonthlyLoai(),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const allMonths = data?.months ?? [];
  const [fy, fm] = fromDate ? [+fromDate.slice(0, 4), +fromDate.slice(5, 7)] : [0, 0];
  const [ty, tm] = toDate ? [+toDate.slice(0, 4), +toDate.slice(5, 7)] : [9999, 12];
  const months = allMonths.filter((m) => {
    const after = m.year > fy || (m.year === fy && m.month >= fm);
    const before = m.year < ty || (m.year === ty && m.month <= tm);
    return after && before;
  });

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="h-64 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );

  if (isError || months.length === 0) return null;

  const series = [
    { key: "A", label: "Loại A", color: "#ec4899" },
    { key: "B", label: "Loại B", color: "#3b82f6" },
    { key: "C", label: "Loại C", color: "#22c55e" },
    { key: "D", label: "Loại D", color: "#f59e0b" },
    { key: "total", label: "Tổng", color: "#7c3aed" },
  ] as const;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Hồ sơ tiếp nhận theo tháng - TT48
        </h3>
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          {series.map((item) => (
            <span key={item.key} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: item.color }} /> {item.label}
            </span>
          ))}
          <label className="flex items-center gap-1 cursor-pointer select-none border-l border-slate-200 pl-4 ml-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-3 h-3 accent-blue-600 cursor-pointer"
            />
            <span>Hiện số liệu</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={months}
          barGap={2}
          margin={{ top: showLabels ? 16 : 20, right: 30, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            interval={months.length > 24 ? Math.floor(months.length / 24) : 0}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={45} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                A: "Loại A",
                B: "Loại B",
                C: "Loại C",
                D: "Loại D",
                total: "Tổng",
              };
              return [value.toLocaleString("vi-VN"), labels[name] ?? name];
            }}
          />
          {series.filter((item) => item.key !== "total").map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="tt48-received"
              fill={item.color}
              name={item.key}
              radius={item.key === "D" ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            >
              {showLabels && (
                <LabelList
                  dataKey={item.key}
                  content={(props: any) => {
                    const { x, y, width, height, value } = props;
                    if (!value || height < 16) return null;
                    const cx = (x ?? 0) + (width ?? 0) / 2;
                    const cy = (y ?? 0) + 13;
                    return (
                      <text
                        x={cx}
                        y={cy}
                        transform={`rotate(-90, ${cx}, ${cy})`}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={9}
                        fill={item.color}
                        fontWeight={600}
                      >
                        {value}
                      </text>
                    );
                  }}
                />
              )}
            </Bar>
          ))}
          <Line
            type="monotone"
            dataKey="total"
            stroke="#7c3aed"
            strokeWidth={3}
            dot={months.length <= 24}
            activeDot={{ r: 5 }}
            name="total"
          >
            {showLabels && (
              <LabelList
                dataKey="total"
                position="top"
                style={{ fontSize: 9, fill: "#7c3aed", fontWeight: 600 }}
                formatter={(v: number) => v || ""}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function LookupHoSoDetailModal({
  hoSoId,
  maHoSo,
  onClose,
}: {
  hoSoId: number;
  maHoSo: string;
  onClose: () => void;
}) {
  const [infoTab, setInfoTab] = useState<"co_so" | "doanh_nghiep">("co_so");
  const [attachmentTab, setAttachmentTab] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dav-tt48-ho-so-detail", hoSoId],
    queryFn: () => fetchDavTt48HoSoDetail(hoSoId),
    retry: 1,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hoSo = data?.view.hoSo ?? {};
  const donHang = data?.view.parsedJsonDonHang ?? {};
  const attachmentBundles = useMemo(() => {
    const seenAcrossBundles = new Set<string>();
    return (data?.view.listTepHoSo ?? [])
      .map((bundle, index) => {
        const files = (bundle.danhSachTepDinhKem ?? [])
          .filter((file): file is Record<string, unknown> => !!file)
          .filter((file) => {
            const key = `${String(file.tenTep ?? "")}||${String(file.duongDanTep ?? "")}`;
            if (seenAcrossBundles.has(key)) return false;
            seenAcrossBundles.add(key);
            return true;
          });
        const label = typeof bundle.moTaTep === "string" && bundle.moTaTep.trim()
          ? bundle.moTaTep.trim()
          : typeof bundle.lanBoSung === "number" && bundle.lanBoSung > 0
            ? `L\u1ea7n b\u1ed5 sung ${bundle.lanBoSung}`
            : "L\u1ea7n \u0111\u1ea7u";
        return {
          key: `${bundle.lanBoSung ?? "null"}-${index}`,
          label,
          files,
        };
      })
      .filter((bundle) => bundle.files.length > 0);
  }, [data?.view.listTepHoSo]);
  const lichSu = data?.history.listYKien ?? [];
  const giayBaoThuUrl = buildDavViewFileUrl(data?.view.urlGiayBaoThu);
  const banDangKyUrl = buildDavViewFileUrl(data?.view.urlBanDangKy);
  const activeAttachmentBundle = attachmentBundles.find((bundle) => bundle.key === attachmentTab) ?? attachmentBundles[0] ?? null;

  useEffect(() => {
    setAttachmentTab((prev) =>
      attachmentBundles.some((bundle) => bundle.key === prev) ? prev : (attachmentBundles[0]?.key ?? ""),
    );
  }, [attachmentBundles]);

  useEffect(() => {
    setInfoTab("co_so");
  }, [hoSoId]);

  const renderValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "\u2014";
    return String(value);
  };

  const topCards: Array<[string, unknown]> = [
    ["M\u00e3 h\u1ed3 s\u01a1", hoSo["maHoSo"]],
    ["H\u00ecnh th\u1ee9c \u0111\u00e1nh gi\u00e1", donHang["hinhThucDanhGia"]],
    [
      "Ng\u00e0y n\u1ed9p",
      isoToDisplay(typeof hoSo["ngayDoanhNghiepNopHoSo"] === "string" ? hoSo["ngayDoanhNghiepNopHoSo"] : null),
    ],
    [
      "Ng\u00e0y ti\u1ebfp nh\u1eadn",
      isoToDisplay(typeof hoSo["ngayTiepNhan"] === "string" ? hoSo["ngayTiepNhan"] : null),
    ],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-white">{DOSSIER_DETAIL_TEXT.title}</h2>
            <p className="mt-1 text-sm text-slate-300">{maHoSo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xl font-bold leading-none text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            {"\u00d7"}
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-56 items-center justify-center gap-3 text-sm text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              {DOSSIER_DETAIL_TEXT.loading}
            </div>
          ) : isError || !data ? (
            <div className="flex h-56 items-center justify-center text-sm text-red-500">
              {DOSSIER_DETAIL_TEXT.loadError}
            </div>
          ) : (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {topCards.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-2 text-sm font-medium text-slate-800">{renderValue(value)}</div>
                  </div>
                ))}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
                  {[
                    { key: "co_so" as const, label: DOSSIER_DETAIL_TEXT.infoTabs.coSo },
                    { key: "doanh_nghiep" as const, label: DOSSIER_DETAIL_TEXT.infoTabs.doanhNghiep },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setInfoTab(tab.key)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                        infoTab === tab.key
                          ? "bg-blue-600 text-white"
                          : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {infoTab === "co_so" ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">IDCT</div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["idCongTy"])}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.country}</div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(donHang["nuocSoTai"])}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.facilityName}</div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(donHang["tenCoSoSanXuat"] ?? hoSo["tenCoSo"])}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.facilityAddress}</div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(donHang["diaChiCoSoSanXuat"] ?? hoSo["diaChiCoSo"])}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {banDangKyUrl && (
                        <a href={banDangKyUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                          {DOSSIER_DETAIL_TEXT.actions.registrationForm}
                        </a>
                      )}
                      {giayBaoThuUrl && (
                        <a href={giayBaoThuUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                          {DOSSIER_DETAIL_TEXT.actions.receipt}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.companyName}</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["tenDoanhNghiep"])}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.companyAddress}</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["diaChiCoSo"] ?? hoSo["diaChi"])}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">{DOSSIER_DETAIL_TEXT.fields.taxCode}</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["maSoThue"])}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Email</div>
                      <div className="mt-1 text-sm text-slate-700">{renderValue(hoSo["email"])}</div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{DOSSIER_DETAIL_TEXT.attachmentsTitle}</h3>
                {attachmentBundles.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">{DOSSIER_DETAIL_TEXT.noAttachments}</div>
                ) : (
                  <div className="mt-3 space-y-4">
                    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                      {attachmentBundles.map((bundle) => (
                        <button
                          key={bundle.key}
                          type="button"
                          onClick={() => setAttachmentTab(bundle.key)}
                          className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                            activeAttachmentBundle?.key === bundle.key
                              ? "bg-blue-600 text-white"
                              : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {bundle.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {(activeAttachmentBundle?.files ?? []).map((file, index) => {
                        const url = buildDavViewFileUrl(file.duongDanTep);
                        return (
                          <div
                            key={`${activeAttachmentBundle?.key ?? "bundle"}-${file.code ?? "tep"}-${index}`}
                            className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-800">{renderValue(file.moTaTep)}</div>
                              <div className="mt-1 break-all text-xs text-slate-500">{renderValue(file.tenTep)}</div>
                            </div>
                            <div className="shrink-0">
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
                                  {DOSSIER_DETAIL_TEXT.actions.open}
                                </a>
                              ) : (
                                <span className="text-sm text-slate-400">{"\u2014"}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{DOSSIER_DETAIL_TEXT.historyTitle}</h3>
                {lichSu.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-400">{DOSSIER_DETAIL_TEXT.noHistory}</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {lichSu.map((item, index) => (
                      <div key={`${item.ngayXuLy ?? index}-${index}`} className="rounded-xl border-l-4 border-blue-400 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-800">{renderValue(item.hanhDongXuLy)}</div>
                          <div className="text-xs font-medium text-slate-500">{isoToDisplay(item.ngayXuLy ?? null)}</div>
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{renderValue(item.nguoiXuLy)}</div>
                        {item.noiDungYKien && (
                          <div className="mt-2 text-sm text-slate-600">{item.noiDungYKien}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function ThongKeDateFilterPanel({
  thuTuc,
  fromDate,
  toDate,
  fromInput,
  toInput,
  activePreset,
  loadingAll,
  update,
}: {
  thuTuc: number;
  fromDate: string;
  toDate: string;
  fromInput: string;
  toInput: string;
  activePreset: string;
  loadingAll: boolean;
  update: (patch: Partial<TabFilter>) => void;
}) {
  const applyDates = useCallback((from: string, to: string, preset?: string) => {
    const clampedTo = clampToToday(to);
    update({ fromDate: from, toDate: clampedTo, fromInput: toDMY(from), toInput: toDMY(clampedTo), activePreset: preset ?? "" });
  }, [update]);

  const handleTatCa = useCallback(async () => {
    update({ loadingAll: true });
    try {
      const earliest = thuTuc === 0
        ? (await Promise.all([fetchEarliestDate(48), fetchEarliestDate(47), fetchEarliestDate(46)])).sort()[0]
        : await fetchEarliestDate(thuTuc);
      const today = toYMD(new Date());
      applyDates(earliest, today, "tat_ca");
    } finally {
      update({ loadingAll: false });
    }
  }, [applyDates, thuTuc, update]);

  const handleFromBlur = () => {
    const parsed = parseDMY(fromInput);
    if (parsed) update({ fromDate: parsed, activePreset: "" });
    else update({ fromInput: toDMY(fromDate) });
  };

  const handleToBlur = () => {
    const parsed = parseDMY(toInput);
    if (parsed) {
      const clamped = clampToToday(parsed);
      update({ toDate: clamped, toInput: toDMY(clamped), activePreset: "" });
    }
    else update({ toInput: toDMY(toDate) });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Từ</label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={fromInput}
              onChange={(e) => update({ fromInput: e.target.value })}
              onBlur={handleFromBlur}
              className="w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
          <div className="pb-2 text-slate-400 font-semibold">—</div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Đến</label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={toInput}
              onChange={(e) => update({ toInput: e.target.value })}
              onBlur={handleToBlur}
              className="w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTatCa}
            disabled={loadingAll}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold transition-all border",
              activePreset === "tat_ca"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700",
              loadingAll ? "opacity-60 cursor-wait" : "",
            ].join(" ")}
          >
            {loadingAll ? "..." : "Tất cả"}
          </button>
          {QUICK_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { const p = getPreset(key); applyDates(p.from, p.to, key); }}
              className={[
                "rounded-lg px-3 py-2 text-xs font-semibold transition-all border",
                activePreset === key
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-slate-500 font-medium hidden lg:block">
          Kỳ thống kê: <span className="text-slate-800 font-bold">{toDMY(fromDate)}</span>
          {" → "}
          <span className="text-slate-800 font-bold">{toDMY(toDate)}</span>
        </div>
      </div>
    </div>
  );
}

function ThongKeOverviewCharts({ thuTuc, fromDate, toDate }: {
  thuTuc: 48 | 47 | 46;
  fromDate: string;
  toDate: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["summary", thuTuc, fromDate, toDate],
    queryFn: () => fetchSummary(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const { data: gqData, isLoading: gqLoading, isError: gqError } = useQuery({
    queryKey: ["giai-quyet", thuTuc, fromDate, toDate],
    queryFn: () => fetchGiaiQuyet(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const { data: tsData, isLoading: tsLoading, isError: tsError } = useQuery({
    queryKey: ["ton-sau", thuTuc, toDate],
    queryFn: () => fetchTonSau(thuTuc, toDate),
    enabled: !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const barData: BarData[] = [
    { name: "TỒN TRƯỚC", value: data?.ton_truoc ?? 0, color: COLORS.ton_truoc.bar },
    { name: "ĐÃ NHẬN", value: data?.da_nhan ?? 0, color: COLORS.da_nhan.bar },
    { name: "ĐÃ GIẢI QUYẾT", value: data?.da_giai_quyet ?? 0, color: COLORS.da_giai_quyet.bar },
    { name: "TỒN SAU", value: data?.ton_sau ?? 0, color: COLORS.ton_sau.bar },
  ];
  const giaiQuyetRatioTotal = (data?.da_giai_quyet ?? 0) + (data?.ton_sau ?? 0);
  const ttLabel = `TT${thuTuc}`;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "3.7fr 2.1fr 2.1fr 2.1fr" }}>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="relative flex items-center justify-center mb-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide text-center">
            Tình trạng hồ sơ {ttLabel}
          </h3>
          {isLoading && (
            <span className="text-xs text-blue-500 animate-pulse font-medium absolute right-0">Đang tải...</span>
          )}
          {isError && (
            <span className="text-xs text-red-500 font-medium absolute right-0">Lỗi tải dữ liệu</span>
          )}
        </div>

        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <SummaryBarChart data={barData} />
        )}

        <div className="mt-3 flex flex-wrap gap-3 justify-center">
          {Object.values(COLORS).map(({ bar, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bar }} />
              <span className="text-xs text-slate-500 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <DonutChart
        title="TỶ LỆ GIẢI QUYẾT"
        total={giaiQuyetRatioTotal}
        segments={[
          { name: "Đã giải quyết", value: data?.da_giai_quyet ?? 0, color: "#22c55e" },
          { name: "Tồn trong kỳ", value: data?.ton_sau ?? 0, color: "#f59e0b" },
        ]}
        isLoading={isLoading}
        isError={isError}
        emptyMessage="Không có hồ sơ trong kỳ thống kê"
        spinnerColor="#22c55e"
        startAngle={270}
        endAngle={-90}
      />

      <DonutChart
        title="ĐÃ GIẢI QUYẾT / HẠN"
        total={gqData?.total ?? 0}
        segments={[
          { name: "Đúng hạn", value: gqData?.dung_han ?? 0, color: "#22c55e" },
          { name: "Quá hạn", value: gqData?.qua_han ?? 0, color: "#ef4444" },
        ]}
        isLoading={gqLoading}
        isError={gqError}
        emptyMessage="Không có hồ sơ đã giải quyết trong kỳ"
        spinnerColor="#22c55e"
      />

      <DonutChart
        title="TỒN SAU / HẠN"
        total={tsData?.total ?? 0}
        segments={[
          { name: "Còn hạn", value: tsData?.con_han ?? 0, color: "#60a5fa" },
          { name: "Quá hạn", value: tsData?.qua_han ?? 0, color: "#f97316" },
        ]}
        isLoading={tsLoading}
        isError={tsError}
        emptyMessage="Không có hồ sơ tồn sau trong kỳ"
        spinnerColor="#60a5fa"
      />
    </div>
  );
}

function TongQuanTab({
  onOpenThongKe,
  onOpenDangXuLy,
}: {
  onOpenThongKe: (thuTuc: 48 | 47 | 46, filter: TabFilter) => void;
  onOpenDangXuLy: (thuTuc: 48 | 47 | 46) => void;
}) {
  const { fromDate, toDate, fromInput, toInput, activePreset, loadingAll, update } = useTabFilter(0);
  const [expandedMonthly, setExpandedMonthly] = useState<Record<48 | 47 | 46, boolean>>({
    48: false,
    47: false,
    46: false,
  });
  const currentFilter: TabFilter = { fromDate, toDate, fromInput, toInput, activePreset, loadingAll };

  return (
    <div className="space-y-6">
      <ThongKeDateFilterPanel
        thuTuc={0}
        fromDate={fromDate}
        toDate={toDate}
        fromInput={fromInput}
        toInput={toInput}
        activePreset={activePreset}
        loadingAll={loadingAll}
        update={update}
      />

      {[48, 47, 46].map((thuTuc) => (
        <section key={thuTuc} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Tổng quan TT{thuTuc}</h2>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-slate-500 mr-2">
                Kỳ thống kê: <span className="text-slate-700">{toDMY(fromDate)}</span>
                {" → "}
                <span className="text-slate-700">{toDMY(toDate)}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenThongKe(thuTuc as 48 | 47 | 46, currentFilter)}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 hover:bg-blue-50"
              >
                Chi tiết thống kê
              </button>
              <button
                type="button"
                onClick={() => onOpenDangXuLy(thuTuc as 48 | 47 | 46)}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
              >
                Chi tiết đang xử lý
              </button>
            </div>
          </div>
          <ThongKeOverviewCharts thuTuc={thuTuc as 48 | 47 | 46} fromDate={fromDate} toDate={toDate} />
          <div className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedMonthly((prev) => ({ ...prev, [thuTuc]: !prev[thuTuc as 48 | 47 | 46] }))}
              className="flex w-full items-center gap-2 px-5 py-3 text-left"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
                {expandedMonthly[thuTuc as 48 | 47 | 46] ? "−" : "+"}
              </span>
              <span className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Xu hướng theo tháng — TT{thuTuc}
              </span>
            </button>
            {expandedMonthly[thuTuc as 48 | 47 | 46] && (
              <div className="px-4 pb-4">
                <MonthlyTrendChart thuTuc={thuTuc as 48 | 47 | 46} fromDate={fromDate} toDate={toDate} hideTitle />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: THỐNG KÊ (tab 1, 3, 5 — TT48 / TT47 / TT46)
// ---------------------------------------------------------------------------
function ThongKeTab({ thuTuc }: { thuTuc: 48 | 47 | 46 }) {
  const { fromDate, toDate, fromInput, toInput, activePreset, loadingAll, update } = useTabFilter(thuTuc);

  return (
    <div className="space-y-6">
      <ThongKeDateFilterPanel
        thuTuc={thuTuc}
        fromDate={fromDate}
        toDate={toDate}
        fromInput={fromInput}
        toInput={toInput}
        activePreset={activePreset}
        loadingAll={loadingAll}
        update={update}
      />

      <ThongKeOverviewCharts thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {/* Bảng chi tiết theo chuyên viên */}
      <ChuyenVienTable thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {/* Biểu đồ xu hướng theo tháng */}
      <MonthlyTrendChart thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {thuTuc === 48 && <Tt48LoaiHoSoTable fromDate={fromDate} toDate={toDate} />}
      {thuTuc === 48 && <Tt48LoaiHoSoMonthlyChart fromDate={fromDate} toDate={toDate} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TT48 — Bảng phân loại hồ sơ theo A/B/C/D và lần nộp
// ---------------------------------------------------------------------------

const TT48_LOAI_LABELS: Record<string, string> = {
  A: "A - Hồ sơ mới",
  B: "B - Hồ sơ cập nhật/duy trì",
  C: "C - Hồ sơ điều chỉnh",
  D: "D - Hồ sơ đính chính",
};

function Tt48LoaiHoSoTable({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tt48-phan-loai", fromDate, toDate],
    queryFn: () => fetchTt48LoaiHoSo(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({
    A: false,
    B: false,
    C: false,
    D: false,
    TOTAL: false,
  });

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-center h-24 text-slate-400 text-sm gap-2">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Đang tải bảng phân loại hồ sơ TT48...
      </div>
    </div>
  );

  if (isError || !data) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm text-red-500 text-center">
      Không thể tải bảng phân loại hồ sơ TT48
    </div>
  );

  const rows = ["A", "B", "C", "D"].map((key) => (
    data.rows.find((row) => row.loai_ho_so === key) ?? {
      loai_ho_so: key,
      ton_truoc_total: 0,
      ton_truoc_first: 0,
      ton_truoc_supplement: 0,
      ton_truoc_first_hinh_thuc_1: 0,
      ton_truoc_first_hinh_thuc_2: 0,
      ton_truoc_supplement_hinh_thuc_1: 0,
      ton_truoc_supplement_hinh_thuc_2: 0,
      ton_truoc_hinh_thuc_1: 0,
      ton_truoc_hinh_thuc_2: 0,
      da_nhan_total: 0,
      da_nhan_first: 0,
      da_nhan_supplement: 0,
      da_nhan_first_hinh_thuc_1: 0,
      da_nhan_first_hinh_thuc_2: 0,
      da_nhan_supplement_hinh_thuc_1: 0,
      da_nhan_supplement_hinh_thuc_2: 0,
      da_nhan_hinh_thuc_1: 0,
      da_nhan_hinh_thuc_2: 0,
      giai_quyet_total: 0,
      giai_quyet_first: 0,
      giai_quyet_supplement: 0,
      giai_quyet_first_hinh_thuc_1: 0,
      giai_quyet_first_hinh_thuc_2: 0,
      giai_quyet_supplement_hinh_thuc_1: 0,
      giai_quyet_supplement_hinh_thuc_2: 0,
      giai_quyet_hinh_thuc_1: 0,
      giai_quyet_hinh_thuc_2: 0,
      ton_total: 0,
      ton_first: 0,
      ton_supplement: 0,
      ton_first_hinh_thuc_1: 0,
      ton_first_hinh_thuc_2: 0,
      ton_supplement_hinh_thuc_1: 0,
      ton_supplement_hinh_thuc_2: 0,
      ton_hinh_thuc_1: 0,
      ton_hinh_thuc_2: 0,
      treo: 0,
    }
  ));

  const totals = rows.reduce((acc, row) => ({
    ton_truoc_total: acc.ton_truoc_total + row.ton_truoc_total,
    ton_truoc_first: acc.ton_truoc_first + row.ton_truoc_first,
    ton_truoc_supplement: acc.ton_truoc_supplement + row.ton_truoc_supplement,
    ton_truoc_first_hinh_thuc_1: acc.ton_truoc_first_hinh_thuc_1 + row.ton_truoc_first_hinh_thuc_1,
    ton_truoc_first_hinh_thuc_2: acc.ton_truoc_first_hinh_thuc_2 + row.ton_truoc_first_hinh_thuc_2,
    ton_truoc_supplement_hinh_thuc_1: acc.ton_truoc_supplement_hinh_thuc_1 + row.ton_truoc_supplement_hinh_thuc_1,
    ton_truoc_supplement_hinh_thuc_2: acc.ton_truoc_supplement_hinh_thuc_2 + row.ton_truoc_supplement_hinh_thuc_2,
    ton_truoc_hinh_thuc_1: acc.ton_truoc_hinh_thuc_1 + row.ton_truoc_hinh_thuc_1,
    ton_truoc_hinh_thuc_2: acc.ton_truoc_hinh_thuc_2 + row.ton_truoc_hinh_thuc_2,
    da_nhan_total: acc.da_nhan_total + row.da_nhan_total,
    da_nhan_first: acc.da_nhan_first + row.da_nhan_first,
    da_nhan_supplement: acc.da_nhan_supplement + row.da_nhan_supplement,
    da_nhan_first_hinh_thuc_1: acc.da_nhan_first_hinh_thuc_1 + row.da_nhan_first_hinh_thuc_1,
    da_nhan_first_hinh_thuc_2: acc.da_nhan_first_hinh_thuc_2 + row.da_nhan_first_hinh_thuc_2,
    da_nhan_supplement_hinh_thuc_1: acc.da_nhan_supplement_hinh_thuc_1 + row.da_nhan_supplement_hinh_thuc_1,
    da_nhan_supplement_hinh_thuc_2: acc.da_nhan_supplement_hinh_thuc_2 + row.da_nhan_supplement_hinh_thuc_2,
    da_nhan_hinh_thuc_1: acc.da_nhan_hinh_thuc_1 + row.da_nhan_hinh_thuc_1,
    da_nhan_hinh_thuc_2: acc.da_nhan_hinh_thuc_2 + row.da_nhan_hinh_thuc_2,
    giai_quyet_total: acc.giai_quyet_total + row.giai_quyet_total,
    giai_quyet_first: acc.giai_quyet_first + row.giai_quyet_first,
    giai_quyet_supplement: acc.giai_quyet_supplement + row.giai_quyet_supplement,
    giai_quyet_first_hinh_thuc_1: acc.giai_quyet_first_hinh_thuc_1 + row.giai_quyet_first_hinh_thuc_1,
    giai_quyet_first_hinh_thuc_2: acc.giai_quyet_first_hinh_thuc_2 + row.giai_quyet_first_hinh_thuc_2,
    giai_quyet_supplement_hinh_thuc_1: acc.giai_quyet_supplement_hinh_thuc_1 + row.giai_quyet_supplement_hinh_thuc_1,
    giai_quyet_supplement_hinh_thuc_2: acc.giai_quyet_supplement_hinh_thuc_2 + row.giai_quyet_supplement_hinh_thuc_2,
    giai_quyet_hinh_thuc_1: acc.giai_quyet_hinh_thuc_1 + row.giai_quyet_hinh_thuc_1,
    giai_quyet_hinh_thuc_2: acc.giai_quyet_hinh_thuc_2 + row.giai_quyet_hinh_thuc_2,
    ton_total: acc.ton_total + row.ton_total,
    ton_first: acc.ton_first + row.ton_first,
    ton_supplement: acc.ton_supplement + row.ton_supplement,
    ton_first_hinh_thuc_1: acc.ton_first_hinh_thuc_1 + row.ton_first_hinh_thuc_1,
    ton_first_hinh_thuc_2: acc.ton_first_hinh_thuc_2 + row.ton_first_hinh_thuc_2,
    ton_supplement_hinh_thuc_1: acc.ton_supplement_hinh_thuc_1 + row.ton_supplement_hinh_thuc_1,
    ton_supplement_hinh_thuc_2: acc.ton_supplement_hinh_thuc_2 + row.ton_supplement_hinh_thuc_2,
    ton_hinh_thuc_1: acc.ton_hinh_thuc_1 + row.ton_hinh_thuc_1,
    ton_hinh_thuc_2: acc.ton_hinh_thuc_2 + row.ton_hinh_thuc_2,
    treo: acc.treo + row.treo,
  }), {
    ton_truoc_total: 0,
    ton_truoc_first: 0,
    ton_truoc_supplement: 0,
    ton_truoc_first_hinh_thuc_1: 0,
    ton_truoc_first_hinh_thuc_2: 0,
    ton_truoc_supplement_hinh_thuc_1: 0,
    ton_truoc_supplement_hinh_thuc_2: 0,
    ton_truoc_hinh_thuc_1: 0,
    ton_truoc_hinh_thuc_2: 0,
    da_nhan_total: 0,
    da_nhan_first: 0,
    da_nhan_supplement: 0,
    da_nhan_first_hinh_thuc_1: 0,
    da_nhan_first_hinh_thuc_2: 0,
    da_nhan_supplement_hinh_thuc_1: 0,
    da_nhan_supplement_hinh_thuc_2: 0,
    da_nhan_hinh_thuc_1: 0,
    da_nhan_hinh_thuc_2: 0,
    giai_quyet_total: 0,
    giai_quyet_first: 0,
    giai_quyet_supplement: 0,
    giai_quyet_first_hinh_thuc_1: 0,
    giai_quyet_first_hinh_thuc_2: 0,
    giai_quyet_supplement_hinh_thuc_1: 0,
    giai_quyet_supplement_hinh_thuc_2: 0,
    giai_quyet_hinh_thuc_1: 0,
    giai_quyet_hinh_thuc_2: 0,
    ton_total: 0,
    ton_first: 0,
    ton_supplement: 0,
    ton_first_hinh_thuc_1: 0,
    ton_first_hinh_thuc_2: 0,
    ton_supplement_hinh_thuc_1: 0,
    ton_supplement_hinh_thuc_2: 0,
    ton_hinh_thuc_1: 0,
    ton_hinh_thuc_2: 0,
    treo: 0,
  });

  const pct = (value: number, total: number) => total > 0 ? `${Math.round(value / total * 100)}%` : "0%";
  const renderGroupTotal = (value: number, total: number, textColor: string) => (
    value ? (
      <div className="flex items-baseline justify-center gap-2">
        <span className={`font-bold ${textColor}`}>{value.toLocaleString("vi-VN")}</span>
        <span className="text-slate-600">({pct(value, total)})</span>
      </div>
    ) : null
  );
  const renderInlineValueWithPct = (value: number, total: number, cls = "") => (
    <td className={`px-2 py-2 text-center text-sm ${cls}`}>
      {value ? (
        <div className="flex items-baseline justify-center gap-2">
          <span>{value.toLocaleString("vi-VN")}</span>
          <span className="text-slate-500">({pct(value, total)})</span>
        </div>
      ) : ""}
    </td>
  );
  const num = (value: number, cls = "") => (
    <td className={`px-2 py-2 text-center text-sm ${cls}`}>{value ? value.toLocaleString("vi-VN") : ""}</td>
  );
  const thC = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide";
  const thS = "px-2 py-2 text-center text-xs font-semibold";
  const tdC = "px-2 py-2 text-center text-xs";
  const tdL = "px-3 py-2 text-left text-xs font-semibold text-slate-800";
  const totalRow = "bg-slate-200 font-bold border-t-2 border-slate-400";
  const ratioRow = "bg-slate-50 text-slate-600 border-t border-slate-200";
  const subgroupLabels = ["TỔNG", "H.thức 1", "H.thức 2"];
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const renderExpandCell = (key: string, label: string, isTotal = false) => (
    <td className={`${tdL} ${isTotal ? "text-slate-700 font-bold" : ""}`}>
      <button
        type="button"
        onClick={() => toggleRow(key)}
        className="inline-flex items-center gap-2 text-left"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
          {expandedRows[key] ? "−" : "+"}
        </span>
        <span>{label}</span>
      </button>
    </td>
  );
  const renderSubRow = (
    key: string,
    label: string,
    values: {
      ton_truoc: number;
      ton_truoc_hinh_thuc_1?: number;
      ton_truoc_hinh_thuc_2?: number;
      da_nhan: number;
      da_nhan_hinh_thuc_1?: number;
      da_nhan_hinh_thuc_2?: number;
      giai_quyet: number;
      giai_quyet_hinh_thuc_1?: number;
      giai_quyet_hinh_thuc_2?: number;
      ton: number;
      ton_hinh_thuc_1?: number;
      ton_hinh_thuc_2?: number;
    },
    isTotal = false,
  ) => (
    <tr key={key} className={`${isTotal ? "bg-slate-100" : "bg-slate-50/80"} border-t border-slate-200`}>
      <td className="px-3 py-2 text-left text-xs font-medium text-slate-600">
        <div className="flex items-center gap-2 pl-7">
          <span className="inline-block h-px w-3 bg-slate-300" />
          <span>{label}</span>
        </div>
      </td>
      {isTotal
        ? renderInlineValueWithPct(values.ton_truoc, totals.ton_truoc_total, `${tdC} bg-pink-50/50 text-slate-600`)
        : num(values.ton_truoc, `${tdC} bg-pink-50/50 text-slate-600`)}
      {num(values.ton_truoc_hinh_thuc_1 ?? 0, `${tdC} bg-pink-50/50 text-slate-600`)}
      {num(values.ton_truoc_hinh_thuc_2 ?? 0, `${tdC} bg-pink-50/50 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.da_nhan, totals.da_nhan_total, `${tdC} bg-blue-50/50 text-slate-600`)
        : num(values.da_nhan, `${tdC} bg-blue-50/50 text-slate-600`)}
      {num(values.da_nhan_hinh_thuc_1 ?? 0, `${tdC} bg-blue-50/50 text-slate-600`)}
      {num(values.da_nhan_hinh_thuc_2 ?? 0, `${tdC} bg-blue-50/50 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.giai_quyet, totals.giai_quyet_total, `${tdC} bg-green-50/60 text-slate-600`)
        : num(values.giai_quyet, `${tdC} bg-green-50/60 text-slate-600`)}
      {num(values.giai_quyet_hinh_thuc_1 ?? 0, `${tdC} bg-green-50/60 text-slate-600`)}
      {num(values.giai_quyet_hinh_thuc_2 ?? 0, `${tdC} bg-green-50/60 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.ton, totals.ton_total, `${tdC} bg-amber-50/60 text-slate-600`)
        : num(values.ton, `${tdC} bg-amber-50/60 text-slate-600`)}
      {num(values.ton_hinh_thuc_1 ?? 0, `${tdC} bg-amber-50/60 text-slate-600`)}
      {num(values.ton_hinh_thuc_2 ?? 0, `${tdC} bg-amber-50/60 text-slate-600`)}
      <td className={`${tdC} bg-orange-50/70`} />
    </tr>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Chi tiết theo loại hồ sơ & lần nộp - TT48
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 1280 }}>
          <colgroup>
            <col style={{ width: 260 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 92 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={`${thL} bg-slate-700 text-white`}>Phân loại hồ sơ</th>
              <th colSpan={3} className={`${thC} bg-pink-700 text-white`}>TỒN TRƯỚC</th>
              <th colSpan={3} className={`${thC} bg-blue-700 text-white`}>HỒ SƠ ĐÃ TIẾP NHẬN</th>
              <th colSpan={3} className={`${thC} bg-green-700 text-white`}>HỒ SƠ ĐÃ GIẢI QUYẾT</th>
              <th colSpan={3} className={`${thC} bg-amber-700 text-white`}>HỒ SƠ TỒN</th>
              <th rowSpan={2} className={`${thC} bg-orange-600 text-white`}>HỒ SƠ TREO</th>
            </tr>
            <tr>
              {[0, 1, 2, 3].flatMap((groupIndex) =>
                subgroupLabels.map((label, labelIndex) => (
                  <th
                    key={`${groupIndex}-${labelIndex}-${label}`}
                    className={`${thS} ${
                      groupIndex === 0 ? "bg-pink-50 text-pink-700" :
                      groupIndex === 1 ? "bg-blue-50 text-blue-700" :
                      groupIndex === 2 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {label}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <Fragment key={row.loai_ho_so}>
              <tr className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50/40 transition-colors`}>
                {renderExpandCell(row.loai_ho_so, TT48_LOAI_LABELS[row.loai_ho_so] ?? row.loai_ho_so)}
                <td className={`${tdC} bg-pink-50/70`}>{renderGroupTotal(row.ton_truoc_total, totals.ton_truoc_total, "text-pink-700")}</td>
                {num(row.ton_truoc_hinh_thuc_1, `${tdC} bg-pink-50/70 text-slate-700`)}
                {num(row.ton_truoc_hinh_thuc_2, `${tdC} bg-pink-50/70 text-slate-700`)}
                <td className={`${tdC} bg-blue-50/70`}>{renderGroupTotal(row.da_nhan_total, totals.da_nhan_total, "text-blue-700")}</td>
                {num(row.da_nhan_hinh_thuc_1, `${tdC} bg-blue-50/70 text-slate-700`)}
                {num(row.da_nhan_hinh_thuc_2, `${tdC} bg-blue-50/70 text-slate-700`)}
                <td className={`${tdC} bg-green-50/80`}>{renderGroupTotal(row.giai_quyet_total, totals.giai_quyet_total, "text-green-700")}</td>
                {num(row.giai_quyet_hinh_thuc_1, `${tdC} bg-green-50/80 text-slate-700`)}
                {num(row.giai_quyet_hinh_thuc_2, `${tdC} bg-green-50/80 text-slate-700`)}
                <td className={`${tdC} bg-amber-50/80`}>{renderGroupTotal(row.ton_total, totals.ton_total, "text-amber-700")}</td>
                {num(row.ton_hinh_thuc_1, `${tdC} bg-amber-50/80 text-slate-700`)}
                {num(row.ton_hinh_thuc_2, `${tdC} bg-amber-50/80 text-slate-700`)}
                {num(row.treo, `${tdC} bg-orange-50 font-bold text-orange-700`)}
              </tr>
              {expandedRows[row.loai_ho_so] && renderSubRow(
                `${row.loai_ho_so}-first`,
                "Lần đầu",
                {
                  ton_truoc: row.ton_truoc_first,
                  ton_truoc_hinh_thuc_1: row.ton_truoc_first_hinh_thuc_1,
                  ton_truoc_hinh_thuc_2: row.ton_truoc_first_hinh_thuc_2,
                  da_nhan: row.da_nhan_first,
                  da_nhan_hinh_thuc_1: row.da_nhan_first_hinh_thuc_1,
                  da_nhan_hinh_thuc_2: row.da_nhan_first_hinh_thuc_2,
                  giai_quyet: row.giai_quyet_first,
                  giai_quyet_hinh_thuc_1: row.giai_quyet_first_hinh_thuc_1,
                  giai_quyet_hinh_thuc_2: row.giai_quyet_first_hinh_thuc_2,
                  ton: row.ton_first,
                  ton_hinh_thuc_1: row.ton_first_hinh_thuc_1,
                  ton_hinh_thuc_2: row.ton_first_hinh_thuc_2,
                },
              )}
              {expandedRows[row.loai_ho_so] && renderSubRow(
                `${row.loai_ho_so}-supplement`,
                "Lần bổ sung",
                {
                  ton_truoc: row.ton_truoc_supplement,
                  ton_truoc_hinh_thuc_1: row.ton_truoc_supplement_hinh_thuc_1,
                  ton_truoc_hinh_thuc_2: row.ton_truoc_supplement_hinh_thuc_2,
                  da_nhan: row.da_nhan_supplement,
                  da_nhan_hinh_thuc_1: row.da_nhan_supplement_hinh_thuc_1,
                  da_nhan_hinh_thuc_2: row.da_nhan_supplement_hinh_thuc_2,
                  giai_quyet: row.giai_quyet_supplement,
                  giai_quyet_hinh_thuc_1: row.giai_quyet_supplement_hinh_thuc_1,
                  giai_quyet_hinh_thuc_2: row.giai_quyet_supplement_hinh_thuc_2,
                  ton: row.ton_supplement,
                  ton_hinh_thuc_1: row.ton_supplement_hinh_thuc_1,
                  ton_hinh_thuc_2: row.ton_supplement_hinh_thuc_2,
                },
              )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className={totalRow}>
              {renderExpandCell("TOTAL", "TỔNG", true)}
              {num(totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_truoc_hinh_thuc_1, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_truoc_hinh_thuc_2, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {num(totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderInlineValueWithPct(totals.da_nhan_hinh_thuc_1, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderInlineValueWithPct(totals.da_nhan_hinh_thuc_2, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {num(totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderInlineValueWithPct(totals.giai_quyet_hinh_thuc_1, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderInlineValueWithPct(totals.giai_quyet_hinh_thuc_2, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {num(totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_hinh_thuc_1, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_hinh_thuc_2, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {num(totals.treo, `${tdC} text-orange-700 font-bold`)}
            </tr>
            {expandedRows.TOTAL && renderSubRow(
              "TOTAL-first",
              "Lần đầu",
              {
                ton_truoc: totals.ton_truoc_first,
                ton_truoc_hinh_thuc_1: totals.ton_truoc_first_hinh_thuc_1,
                ton_truoc_hinh_thuc_2: totals.ton_truoc_first_hinh_thuc_2,
                da_nhan: totals.da_nhan_first,
                da_nhan_hinh_thuc_1: totals.da_nhan_first_hinh_thuc_1,
                da_nhan_hinh_thuc_2: totals.da_nhan_first_hinh_thuc_2,
                giai_quyet: totals.giai_quyet_first,
                giai_quyet_hinh_thuc_1: totals.giai_quyet_first_hinh_thuc_1,
                giai_quyet_hinh_thuc_2: totals.giai_quyet_first_hinh_thuc_2,
                ton: totals.ton_first,
                ton_hinh_thuc_1: totals.ton_first_hinh_thuc_1,
                ton_hinh_thuc_2: totals.ton_first_hinh_thuc_2,
              },
              true,
            )}
            {expandedRows.TOTAL && renderSubRow(
              "TOTAL-supplement",
              "Lần bổ sung",
              {
                ton_truoc: totals.ton_truoc_supplement,
                ton_truoc_hinh_thuc_1: totals.ton_truoc_supplement_hinh_thuc_1,
                ton_truoc_hinh_thuc_2: totals.ton_truoc_supplement_hinh_thuc_2,
                da_nhan: totals.da_nhan_supplement,
                da_nhan_hinh_thuc_1: totals.da_nhan_supplement_hinh_thuc_1,
                da_nhan_hinh_thuc_2: totals.da_nhan_supplement_hinh_thuc_2,
                giai_quyet: totals.giai_quyet_supplement,
                giai_quyet_hinh_thuc_1: totals.giai_quyet_supplement_hinh_thuc_1,
                giai_quyet_hinh_thuc_2: totals.giai_quyet_supplement_hinh_thuc_2,
                ton: totals.ton_supplement,
                ton_hinh_thuc_1: totals.ton_supplement_hinh_thuc_1,
                ton_hinh_thuc_2: totals.ton_supplement_hinh_thuc_2,
              },
              true,
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: ĐANG XỬ LÝ (tab 2, 4, 6)
// ---------------------------------------------------------------------------

const CHO_COLORS = {
  cho_cv:        { fill: "#3b82f6", label: "Chờ CV",          text: "#1d4ed8" },
  cho_cg:        { fill: "#22c55e", label: "Chờ CG",          text: "#15803d" },
  cho_to_truong: { fill: "#fb923c", label: "Chờ Tổ trưởng",  text: "#c2410c" },
  cho_trp:       { fill: "#f97316", label: "Chờ TrP",         text: "#c2410c" },
  cho_pct:       { fill: "#a855f7", label: "Chờ PCT",         text: "#7e22ce" },
  cho_van_thu:   { fill: "#64748b", label: "Chờ Văn thư",    text: "#334155" },
} as const;

// Màu biểu đồ tròn riêng cho TT48 (7 bước)
const CHO_COLORS_48 = [
  { key: "chua_xu_ly",   fill: "#3b82f6", label: "Chưa xử lý"   },
  { key: "bi_tra_lai",   fill: "#ef4444", label: "Bị trả lại"   },
  { key: "cho_cg",       fill: "#22c55e", label: "Chờ chuyên gia" },
  { key: "cho_tong_hop", fill: "#06b6d4", label: "Chờ tổng hợp" },
  { key: "cho_to_truong",fill: "#fb923c", label: "Chờ Tổ trưởng"},
  { key: "cho_trp",      fill: "#f97316", label: "Chờ Trưởng phòng" },
  { key: "cho_cong_bo",  fill: "#10b981", label: "Chờ công bố"  },
  { key: "cho_pct",      fill: "#a855f7", label: "Chờ PCT"      },
  { key: "cho_van_thu",  fill: "#64748b", label: "Chờ Văn thư"  },
] as const;

function LoginScreen({
  password,
  setPassword,
  busy,
  error,
  onSubmit,
}: {
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-800 px-6 py-5">
          <p className="text-slate-300 text-xs font-bold uppercase tracking-[0.2em]">Dashboard DAV</p>
          <h1 className="text-white text-lg font-bold mt-1">Đăng nhập truy cập hệ thống</h1>
        </div>
        <form
          className="p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu viewer hoặc admin"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !password.trim()}
            className="w-full rounded-xl bg-blue-600 text-white font-bold text-sm px-4 py-3 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
          <p className="text-xs text-slate-500 leading-relaxed">
            Role viewer chỉ xem thống kê. Role admin được xem thêm Tra cứu và Admin panel.
          </p>
        </form>
      </div>
    </div>
  );
}

function DangXuLyTab({
  thuTuc,
  onCvLookup,
  onCgLookup,
  onTinhTrangLookup,
  hideEmptyExperts = false,
  setHideEmptyExperts,
}: {
  thuTuc: 48 | 47 | 46;
  onCvLookup?: (tenCvRaw: string, thuTuc: 48 | 47 | 46) => void;
  onCgLookup?: (tenCg: string) => void;
  onTinhTrangLookup?: (thuTuc: 48 | 47 | 46, tinhTrang: LookupTinhTrang) => void;
  hideEmptyExperts?: boolean;
  setHideEmptyExperts?: (value: boolean) => void;
}) {
  const [showTt48TotalBreakdown, setShowTt48TotalBreakdown] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dang-xu-ly", thuTuc],
    queryFn:  () => fetchDangXuLy(thuTuc),
    retry: 2,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      Đang tải dữ liệu...
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center h-48 text-red-400 text-sm">
      Không thể tải dữ liệu đang xử lý TT{thuTuc}
    </div>
  );

  const allRows   = data.rows;
  const cpc       = data.cho_phan_cong;
  const months    = data.months;
  const is48      = thuTuc === 48;

  // Ẩn cột nếu toàn bộ dữ liệu (kể cả hàng chờ phân công) đều bằng 0
  const showPct    = allRows.some(r => r.cho_pct    > 0) || (cpc?.cho_pct    ?? 0) > 0;
  const showVanThu = allRows.some(r => r.cho_van_thu > 0) || (cpc?.cho_van_thu ?? 0) > 0;

  // Aggregate totals for charts
  const totCon = allRows.reduce((s, r) => s + r.con_han, 0) + (cpc?.con_han ?? 0);
  const totQua = allRows.reduce((s, r) => s + r.qua_han, 0) + (cpc?.qua_han ?? 0);
  const grandTotal = totCon + totQua;

  // Aggregate cho TT47/46
  const totCv       = allRows.reduce((s, r) => s + r.cho_cv,        0);
  const totCg       = allRows.reduce((s, r) => s + r.cho_cg,        0);
  const totToTruong = allRows.reduce((s, r) => s + r.cho_to_truong, 0);
  const totTrp      = allRows.reduce((s, r) => s + r.cho_trp,       0);
  const totPct      = allRows.reduce((s, r) => s + r.cho_pct,       0);
  const totVanThu   = allRows.reduce((s, r) => s + r.cho_van_thu,   0);

  // Aggregate TT48 buoc
  const tot48 = (key: keyof DangXuLyRow) =>
    allRows.reduce((s, r) => s + ((r[key] as number) || 0), 0) + ((cpc?.[key] as number) || 0);

  const catData = is48
    ? CHO_COLORS_48.map(c => ({
        name:  c.label,
        value: tot48(c.key as keyof DangXuLyRow),
        fill:  c.fill,
      })).filter(d => d.value > 0)
    : [
        { name: "Chờ CV",         value: totCv,       fill: CHO_COLORS.cho_cv.fill        },
        { name: "Chờ CG",         value: totCg,       fill: CHO_COLORS.cho_cg.fill        },
        { name: "Chờ Tổ trưởng", value: totToTruong, fill: CHO_COLORS.cho_to_truong.fill },
        { name: "Chờ TrP",        value: totTrp,      fill: CHO_COLORS.cho_trp.fill       },
        { name: "Chờ PCT",        value: totPct,      fill: CHO_COLORS.cho_pct.fill       },
        { name: "Chờ Văn thư",   value: totVanThu,   fill: CHO_COLORS.cho_van_thu.fill   },
      ].filter(d => d.value > 0);

  const hanData = [
    { name: "Còn hạn", value: totCon, fill: "#3b82f6" },
    { name: "Quá hạn", value: totQua, fill: "#f97316" },
  ];

  const catTotal = catData.reduce((s, d) => s + d.value, 0);

  // Custom tooltip giống DonutChart
  const CatTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const pct = catTotal > 0 ? ((item.value / catTotal) * 100).toFixed(1) : "0.0";
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: item.payload.fill }} />
          <span className="font-semibold text-slate-700">{item.name}</span>
        </div>
        <div className="mt-1 font-bold text-slate-900">{item.value.toLocaleString("vi-VN")} hồ sơ</div>
        <div className="text-slate-500">{pct}%</div>
      </div>
    );
  };

  const HanTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const pct = grandTotal > 0 ? ((item.value / grandTotal) * 100).toFixed(1) : "0.0";
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: item.payload.fill }} />
          <span className="font-semibold text-slate-700">{item.name.replace(/ \(\d+%\)$/, "")}</span>
        </div>
        <div className="mt-1 font-bold text-slate-900">{item.value.toLocaleString("vi-VN")} hồ sơ</div>
        <div className="text-slate-500">{pct}%</div>
      </div>
    );
  };

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
    if (catTotal === 0) return null;
    const RADIAN = Math.PI / 180;
    // Đặt nhãn ở giữa vành khăn (midpoint giữa innerRadius và outerRadius)
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = Math.round(value / catTotal * 100);
    if (pct < 5) return null;
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{pct}%</text>;
  };

  const renderHanLabel = ({ cx, cy, midAngle, outerRadius, value }: any) => {
    const RADIAN = Math.PI / 180;
    const r = outerRadius * 0.62;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = grandTotal > 0 ? Math.round(value / grandTotal * 100) : 0;
    if (pct < 5) return null;
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700}>{pct}%</text>;
  };

  // Table cell helpers
  const numCell = (val: number, bg?: string, bold?: boolean) => (
    <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${bg ?? ""} ${bold ? "font-bold" : ""}`}>
      {val || ""}
    </td>
  );
  const pctCell = (qua: number, tot: number) => {
    const p = tot > 0 ? Math.round(qua / tot * 100) : 0;
    const color = p >= 95 ? "text-red-600" : p >= 85 ? "text-orange-600" : "text-slate-600";
    return (
      <td className={`px-2 py-1.5 text-center text-xs font-semibold whitespace-nowrap ${color}`}>
        {tot > 0 ? `${p}%` : ""}
      </td>
    );
  };

  const renderRow = (row: DangXuLyRow, idx: number | null) => {
    const isCpc = idx === null;
    const bgRow = isCpc ? "bg-amber-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const cvLabel = isCpc ? "Chờ phân công ..." : cleanCvName(row.cv_name);

    const chamSoNgay = row.cham_so_ngay;
    const tgDisplay = chamSoNgay > 0
      ? chamSoNgay
      : row.cham_ngay
        ? Math.floor((Date.now() - new Date(row.cham_ngay).getTime()) / 86400000)
        : 0;
    const isOverdue = chamSoNgay > 0;
    const tgColor = isOverdue && tgDisplay >= 300 ? "text-red-600 font-bold"
      : isOverdue && tgDisplay >= 100 ? "text-orange-600 font-semibold"
      : "text-slate-600";

    const stickyBase = (
      <>
        <td className={`sticky left-0 z-10 px-1 py-1.5 text-center text-xs text-slate-400 w-9 ${bgRow}`}>
          {idx !== null ? idx + 1 : ""}
        </td>
        <td className={`sticky left-9 z-10 px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[160px] max-w-[220px] ${bgRow}`}
            style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
          {isCpc ? (
            onTinhTrangLookup ? (
              <button
                type="button"
                onClick={() => onTinhTrangLookup(thuTuc, "cho_phan_cong")}
                className="cursor-pointer text-left font-semibold text-amber-700 hover:text-amber-800"
              >
                {cvLabel}
              </button>
            ) : (
              cvLabel
            )
          ) : !onCvLookup ? (
            cvLabel
          ) : (
            <button
              type="button"
              onClick={() => onCvLookup(row.cv_name, thuTuc)}
              className="cursor-pointer text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              {cvLabel}
            </button>
          )}
        </td>
      </>
    );

    const totCell = (
      <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap ${row.tong > 100 ? "text-pink-700 bg-pink-50" : "text-slate-700"}`}>
        {row.tong}
      </td>
    );
    const chamCells = (
      <>
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 ${tgColor}`}>
          {tgDisplay > 0 ? `${tgDisplay} ngày` : ""}
        </td>
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {isoToDisplay(row.cham_ngay)}
        </td>
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {row.cham_ma ?? ""}
        </td>
      </>
    );
    const hanCells = (
      <>
        {numCell(row.con_han, row.con_han > 0 ? "text-blue-600" : "text-slate-300")}
        <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap ${row.qua_han > 70 ? "bg-orange-100 text-orange-800" : row.qua_han > 0 ? "text-orange-700" : "text-slate-300"}`}>
          {row.qua_han || ""}
        </td>
        {pctCell(row.qua_han, row.tong)}
      </>
    );

    if (is48) {
      const v = (n?: number) => n || 0;
      return (
        <tr key={row.cv_name} className={`${bgRow} hover:bg-blue-50 transition-colors`}>
          {stickyBase}
          {totCell}
          {/* Chưa xử lý */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.chua_xu_ly) > 50 ? "bg-blue-100 text-blue-800 font-bold" : v(row.chua_xu_ly) > 0 ? "text-blue-700" : "text-slate-300"}`}>
            {v(row.chua_xu_ly) || ""}
          </td>
          {/* Bị trả lại */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.bi_tra_lai) > 0 ? "bg-red-50 text-red-700 font-semibold" : "text-slate-300"}`}>
            {v(row.bi_tra_lai) || ""}
          </td>
          {/* Chờ CG */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_cg > 30 ? "bg-green-100 text-green-800 font-bold" : row.cho_cg > 0 ? "text-green-700" : "text-slate-300"}`}>
            {row.cho_cg || ""}
          </td>
          {/* Chờ tổng hợp */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.cho_tong_hop) > 0 ? "text-cyan-700 font-semibold" : "text-slate-300"}`}>
            {v(row.cho_tong_hop) || ""}
          </td>
          {/* Chờ Tổ trưởng */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_to_truong > 0 ? "text-orange-500 font-semibold" : "text-slate-300"}`}>
            {row.cho_to_truong || ""}
          </td>
          {/* Chờ TrP */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_trp > 0 ? "text-orange-700" : "text-slate-300"}`}>
            {row.cho_trp || ""}
          </td>
          {/* Chờ công bố */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.cho_cong_bo) > 0 ? "text-emerald-700 font-semibold" : "text-slate-300"}`}>
            {v(row.cho_cong_bo) || ""}
          </td>
          {/* Chờ PCT — ẩn nếu không có */}
          {showPct && (
            <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_pct > 0 ? "text-purple-700 font-semibold" : "text-slate-300"}`}>
              {row.cho_pct || ""}
            </td>
          )}
          {/* Chờ Văn thư — ẩn nếu không có */}
          {showVanThu && (
            <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_van_thu > 0 ? "text-slate-600" : "text-slate-300"}`}>
              {row.cho_van_thu || ""}
            </td>
          )}
          {hanCells}
          {chamCells}
        </tr>
      );
    }

    // TT47/46
    return (
      <tr key={row.cv_name} className={`${bgRow} hover:bg-blue-50 transition-colors`}>
        {stickyBase}
        {totCell}
        {/* Chờ CV */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_cv > 50 ? "bg-blue-100 text-blue-800 font-bold" : row.cho_cv > 0 ? "text-blue-700" : "text-slate-300"}`}>
          {row.cho_cv || ""}
        </td>
        {/* Chờ CG */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_cg > 30 ? "bg-green-100 text-green-800 font-bold" : row.cho_cg > 0 ? "text-green-700" : "text-slate-300"}`}>
          {row.cho_cg || ""}
        </td>
        {/* Chờ Tổ trưởng */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_to_truong > 0 ? "text-orange-500 font-semibold" : "text-slate-300"}`}>
          {row.cho_to_truong || ""}
        </td>
        {/* Chờ TrP */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_trp > 0 ? "text-orange-700" : "text-slate-300"}`}>
          {row.cho_trp || ""}
        </td>
        {/* Chờ PCT — ẩn nếu không có */}
        {showPct && (
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_pct > 0 ? "text-purple-700 font-semibold" : "text-slate-300"}`}>
            {row.cho_pct || ""}
          </td>
        )}
        {/* Chờ Văn thư — ẩn nếu không có */}
        {showVanThu && (
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_van_thu > 0 ? "text-slate-600" : "text-slate-300"}`}>
            {row.cho_van_thu || ""}
          </td>
        )}
        {hanCells}
        {chamCells}
      </tr>
    );
  };

  // Summary totals row
  const totRow      = [...allRows, ...(cpc ? [cpc] : [])];
  const sumN = (key: keyof DangXuLyRow) => totRow.reduce((s, r) => s + ((r[key] as number) || 0), 0);
  const sumTong     = sumN("tong");
  const sumCv       = sumN("cho_cv");
  const sumCg       = sumN("cho_cg");
  const sumToTruong = sumN("cho_to_truong");
  const sumTrp      = sumN("cho_trp");
  const sumPct      = sumN("cho_pct");
  const sumVanThu   = sumN("cho_van_thu");
  const sumCon      = sumN("con_han");
  const sumQua      = sumN("qua_han");
  // TT48 buoc sums
  const sum48_cxl   = sumN("chua_xu_ly");
  const sum48_btl   = sumN("bi_tra_lai");
  const sum48_cth   = sumN("cho_tong_hop");
  const sum48_ccb   = sumN("cho_cong_bo");
  // TT48 per-step con/qua for CÒN HẠN / QUÁ HẠN rows
  const sh_c = (k: keyof DangXuLyRow) => totRow.reduce((s, r) => s + ((r[k] as number) || 0), 0);
  const renderTinhTrangHeader = (label: React.ReactNode, tinhTrang: LookupTinhTrang, className: string) => (
    <th className={className}>
      {onTinhTrangLookup ? (
        <button
          type="button"
          onClick={() => onTinhTrangLookup(thuTuc, tinhTrang)}
          className="cursor-pointer text-center hover:text-slate-100"
        >
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Title bar */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Hồ sơ đang giải quyết — TT{thuTuc}
        </h2>
        <span className="text-xs text-slate-400 italic">
          Tổng: <strong className="text-slate-600">{grandTotal}</strong> hồ sơ đang xử lý
        </span>
      </div>

      {/* Charts row */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        {/* Phân loại theo bước xử lý */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2 text-center">Phân loại theo bước xử lý</p>
          {is48 ? (
            /* TT48: list dạng thanh ngang — rõ hơn donut khi có nhiều bước */
            <div className="flex flex-col gap-1.5 px-1" style={{ height: 180, overflowY: "auto" }}>
              {catData.map(d => {
                const pct = catTotal > 0 ? (d.value / catTotal * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-2 min-w-0">
                    {/* nhãn */}
                    <span className="text-xs text-slate-600 whitespace-nowrap w-[124px] shrink-0 truncate"
                          title={d.name}>{d.name}</span>
                    {/* thanh + số — dùng positioning để số sát cạnh phải thanh */}
                    <div className="flex-1 relative h-4">
                      {/* track (overflow:hidden để bar clip đúng) */}
                      <div className="absolute inset-0 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full flex items-center justify-end pr-1.5"
                             style={{ width: `${Math.max(pct, 2)}%`, background: d.fill }}>
                          {pct >= 12 && (
                            <span className="text-[10px] font-bold text-white leading-none">{d.value}</span>
                          )}
                        </div>
                      </div>
                      {/* số ngoài — căn trái theo cạnh phải của thanh */}
                      {pct < 12 && (
                        <span className="absolute top-0 h-full flex items-center text-[11px] font-semibold leading-none pl-1"
                              style={{ left: `${Math.max(pct, 2)}%`, color: d.fill }}>
                          {d.value}
                        </span>
                      )}
                    </div>
                    {/* % */}
                    <span className="text-[10px] text-slate-400 shrink-0 w-[30px] text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
              {catData.length === 0 && (
                <div className="flex items-center justify-center h-full text-slate-300 text-xs">
                  Không có dữ liệu
                </div>
              )}
            </div>
          ) : (
            /* TT47/46: giữ nguyên donut */
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" labelLine={false} label={renderPieLabel} animationDuration={CHART_ANIMATION_MS}>
                  {catData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip content={<CatTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie: Tình trạng (Còn hạn / Quá hạn) */}
        <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ width: 220 }}>
          <p className="text-xs font-semibold text-slate-500 mb-1 text-center">Tình trạng</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={hanData} cx="50%" cy="50%" outerRadius={72}
                dataKey="value" labelLine={false} label={renderHanLabel} animationDuration={CHART_ANIMATION_MS}
                startAngle={270} endAngle={-90}>
                {hanData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip content={<HanTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Area: Phân bổ theo thời gian tiếp nhận */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-1 text-center">Phân bổ theo thời gian tiếp nhận</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: number) => [v.toLocaleString("vi-VN"), "Số hồ sơ"]} />
              <Area type="monotone" dataKey="cnt" stroke="#3b82f6" fill="#93c5fd" strokeWidth={2} animationDuration={CHART_ANIMATION_MS} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse"
                 style={{ minWidth: is48 ? 1400 : 1100, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 160 }} />
              {/* step columns — chia đều */}
              {is48
                ? <>{/* TT48: TỔNG + 7 bước cố định + PCT? + VT? + Còn hạn + Quá hạn + % */}
                    <col /><col /><col /><col /><col />
                    <col /><col /><col />
                    {showPct    && <col />}
                    {showVanThu && <col />}
                    <col /><col /><col />
                  </>
                : <>{/* TT47/46: TỔNG + 4 bước cố định + PCT? + VT? + Còn hạn + Quá hạn + % */}
                    <col /><col /><col /><col /><col />
                    {showPct    && <col />}
                    {showVanThu && <col />}
                    <col /><col />
                  </>
              }
              {/* 3 cột Hồ sơ chậm nhất */}
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="sticky left-0 z-20 bg-slate-700 px-1 py-2 text-center w-9 text-xs" rowSpan={2}>STT</th>
                <th className="sticky left-9 z-20 bg-slate-700 px-3 py-2 text-left text-xs min-w-[160px]"
                    rowSpan={2} style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.15)" }}>
                  Chuyên viên
                </th>
                <th className="px-2 py-2 text-center text-xs bg-blue-600"
                    colSpan={(is48 ? 13 : 10) - (showPct ? 0 : 1) - (showVanThu ? 0 : 1)}>
                  ĐANG GIẢI QUYẾT
                </th>
                <th className="px-2 py-2 text-center text-xs bg-rose-700" colSpan={3}>Hồ sơ chậm nhất</th>
              </tr>
              {is48
                ? (
                  <tr className="bg-slate-600 text-white">
                    <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">{"T\u1ed4NG"}</th>
                    {renderTinhTrangHeader(<>{ "Ch\u01b0a" }<br/>{ "x\u1eed l\u00fd" }</>, "chua_xu_ly", "px-2 py-1 text-center text-xs bg-blue-700")}
                    {renderTinhTrangHeader(<>{ "B\u1ecb" }<br/>{ "tr\u1ea3 l\u1ea1i" }</>, "bi_tra_lai", "px-2 py-1 text-center text-xs bg-red-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "chuy\u00ean gia" }</>, "cho_chuyen_gia", "px-2 py-1 text-center text-xs bg-green-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "t\u1ed5ng h\u1ee3p" }</>, "cho_tong_hop", "px-2 py-1 text-center text-xs bg-cyan-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd T\u1ed5" }<br/>{ "tr\u01b0\u1edfng" }</>, "cho_to_truong", "px-2 py-1 text-center text-xs bg-orange-400")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "Tr\u01b0\u1edfng ph\u00f2ng" }</>, "cho_truong_phong", "px-2 py-1 text-center text-xs bg-orange-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "c\u00f4ng b\u1ed1" }</>, "cho_cong_bo", "px-2 py-1 text-center text-xs bg-emerald-600")}
                    {showPct    && <th className="px-2 py-1 text-center text-xs bg-purple-600">Chờ PCT</th>}
                    {showVanThu && renderTinhTrangHeader(<>{ "Chờ" }<br/>{ "Văn thư" }</>, "cho_van_thu", "px-2 py-1 text-center text-xs bg-slate-500")}
                    <th className="px-2 py-1 text-center text-xs bg-green-700">Còn<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-700">% quá<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hồ sơ</th>
                  </tr>
                ) : (
                  <tr className="bg-slate-600 text-white">
                    <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">TỔNG</th>
                    <th className="px-2 py-1 text-center text-xs bg-blue-700">Chờ CV</th>
                    <th className="px-2 py-1 text-center text-xs bg-green-600">Chờ CG</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-400">Chờ Tổ<br/>trưởng</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-600">Chờ TrP</th>
                    {showPct    && <th className="px-2 py-1 text-center text-xs bg-purple-600">Chờ PCT</th>}
                    {showVanThu && <th className="px-2 py-1 text-center text-xs bg-slate-500">Chờ<br/>Văn thư</th>}
                    <th className="px-2 py-1 text-center text-xs bg-green-700">Còn<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-700">% quá<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hồ sơ</th>
                  </tr>
                )
              }
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cpc && renderRow(cpc, null)}
              {allRows.map((row, idx) => renderRow(row, idx))}
            </tbody>
            <tfoot>
              {/* Hàng TỔNG */}
              <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
                <td className="sticky left-0 z-10 bg-slate-100 px-1 py-2 text-center text-xs" />
                <td className="sticky left-9 z-10 bg-slate-100 px-3 py-2 text-xs font-bold"
                    style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                  {is48 ? (
                    <button
                      type="button"
                      onClick={() => setShowTt48TotalBreakdown((prev) => !prev)}
                      className="inline-flex items-center gap-2 text-left"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
                        {showTt48TotalBreakdown ? "−" : "+"}
                      </span>
                      <span>TỔNG</span>
                    </button>
                  ) : "TỔNG"}
                </td>
                <td className="px-2 py-2 text-center text-xs font-bold text-slate-700">{sumTong}</td>
                {is48 ? (
                  <>
                    <td className="px-2 py-2 text-center text-xs text-blue-700">{sum48_cxl || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-red-700">{sum48_btl || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-green-700">{sumCg || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-cyan-700">{sum48_cth || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-orange-500">{sumToTruong || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-orange-700">{sumTrp || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-emerald-700">{sum48_ccb || ""}</td>
                    {showPct    && <td className="px-2 py-2 text-center text-xs text-purple-700">{sumPct || ""}</td>}
                    {showVanThu && <td className="px-2 py-2 text-center text-xs text-slate-600">{sumVanThu || ""}</td>}
                  </>
                ) : (
                  <>
                    <td className="px-2 py-2 text-center text-xs text-blue-700">{sumCv || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-green-700">{sumCg || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-emerald-700">{sumToTruong || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-orange-700">{sumTrp || ""}</td>
                    {showPct    && <td className="px-2 py-2 text-center text-xs text-purple-700">{sumPct || ""}</td>}
                    {showVanThu && <td className="px-2 py-2 text-center text-xs text-slate-600">{sumVanThu || ""}</td>}
                  </>
                )}
                <td className="px-2 py-2 text-center text-xs text-blue-600">{sumCon}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700 font-bold">{sumQua}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700">
                  {sumTong > 0 ? `${Math.round(sumQua / sumTong * 100)}%` : ""}
                </td>
                <td className="px-2 py-2 bg-rose-50" />
                <td className="px-2 py-2 bg-rose-50" />
                <td className="px-2 py-2 bg-rose-50" />
              </tr>
              {/* TT48: hàng CÒN HẠN / QUÁ HẠN per step */}
              {is48 && showTt48TotalBreakdown && (
                <>
                  <tr className="bg-blue-50 text-blue-700 text-xs">
                    <td className="sticky left-0 z-10 bg-blue-50 px-1 py-1 text-center" />
                    <td className="sticky left-9 z-10 bg-blue-50 px-3 py-1 font-semibold"
                        style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>CÒN HẠN</td>
                    <td className="px-2 py-1 text-center">{sh_c("con_han") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("chua_xu_ly_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("bi_tra_lai_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cg_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_tong_hop_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_to_truong_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_trp_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cong_bo_con") || ""}</td>
                    {showPct    && <td className="px-2 py-1 text-center">{sh_c("cho_pct_con") || ""}</td>}
                    {showVanThu && <td className="px-2 py-1 text-center">{sh_c("cho_van_thu_con") || ""}</td>}
                    <td className="px-2 py-1 text-center font-bold">{sh_c("con_han") || ""}</td>
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                  </tr>
                  <tr className="bg-orange-50 text-orange-700 text-xs">
                    <td className="sticky left-0 z-10 bg-orange-50 px-1 py-1 text-center" />
                    <td className="sticky left-9 z-10 bg-orange-50 px-3 py-1 font-semibold"
                        style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>QUÁ HẠN</td>
                    <td className="px-2 py-1 text-center">{sh_c("qua_han") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("chua_xu_ly_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("bi_tra_lai_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cg_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_tong_hop_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_to_truong_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_trp_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cong_bo_qua") || ""}</td>
                    {showPct    && <td className="px-2 py-1 text-center">{sh_c("cho_pct_qua") || ""}</td>}
                    {showVanThu && <td className="px-2 py-1 text-center">{sh_c("cho_van_thu_qua") || ""}</td>}
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 text-center font-bold">{sh_c("qua_han") || ""}</td>
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </div>
        {thuTuc === 48 && (
          <ChuyenGiaTable
            thuTuc={thuTuc}
            onCgClick={onCgLookup}
            hideEmpty={hideEmptyExperts}
            setHideEmpty={setHideEmptyExperts ?? (() => undefined)}
          />
        )}
    </div>
  );
}

const LOOKUP_TINH_TRANG_LABELS: Record<LookupTinhTrang, string> = {
  cho_phan_cong: LOOKUP_TEXT.pendingAssignment,
  cho_chuyen_vien: LOOKUP_TEXT.pendingSpecialist,
  chua_xu_ly: LOOKUP_TEXT.notProcessed,
  bi_tra_lai: LOOKUP_TEXT.returned,
  cho_tong_hop: LOOKUP_TEXT.pendingSummary,
  cho_chuyen_gia: LOOKUP_TEXT.pendingExpert,
  cho_to_truong: LOOKUP_TEXT.pendingLeader,
  cho_truong_phong: LOOKUP_TEXT.pendingManager,
  cho_cong_bo: LOOKUP_TEXT.pendingPublish,
  cho_van_thu: LOOKUP_TEXT.pendingClerical,
  can_bo_sung: LOOKUP_TEXT.requiresSupplement,
  khong_dat: LOOKUP_TEXT.failed,
  da_hoan_thanh: LOOKUP_TEXT.completed,
};

const TRA_CUU_TINH_TRANG_OPTIONS: Array<{ value: "all" | LookupTinhTrang; label: string }> = [
  { value: "all", label: LOOKUP_TEXT.all },
  { value: "cho_phan_cong", label: LOOKUP_TEXT.pendingAssignment },
  { value: "cho_chuyen_vien", label: LOOKUP_TEXT.pendingSpecialist },
  { value: "chua_xu_ly", label: LOOKUP_TEXT.notProcessed },
  { value: "bi_tra_lai", label: LOOKUP_TEXT.returned },
  { value: "cho_tong_hop", label: LOOKUP_TEXT.pendingSummary },
  { value: "cho_chuyen_gia", label: LOOKUP_TEXT.pendingExpert },
  { value: "cho_to_truong", label: LOOKUP_TEXT.pendingLeader },
  { value: "cho_truong_phong", label: LOOKUP_TEXT.pendingManager },
  { value: "cho_cong_bo", label: LOOKUP_TEXT.pendingPublish },
  { value: "cho_van_thu", label: LOOKUP_TEXT.pendingClerical },
];
const TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS: Array<{ value: "all" | LookupTinhTrang; label: string }> = [
  { value: "all", label: LOOKUP_TEXT.all },
  { value: "can_bo_sung", label: LOOKUP_TEXT.requiresSupplement },
  { value: "khong_dat", label: LOOKUP_TEXT.failed },
  { value: "da_hoan_thanh", label: LOOKUP_TEXT.completed },
];
const LOOKUP_TINH_TRANG_SORT_ORDER: Record<LookupTinhTrang, number> = {
  cho_phan_cong: 1,
  cho_chuyen_vien: 2,
  chua_xu_ly: 3,
  bi_tra_lai: 4,
  cho_tong_hop: 5,
  cho_chuyen_gia: 6,
  cho_to_truong: 7,
  cho_truong_phong: 8,
  cho_cong_bo: 9,
  cho_van_thu: 10,
  can_bo_sung: 11,
  khong_dat: 12,
  da_hoan_thanh: 13,
};

function displayLookupTinhTrang(value: LookupTinhTrang): string {
  return LOOKUP_TINH_TRANG_LABELS[value] ?? value;
}
function displayLookupCv(raw: string | null): string {
  if (!raw) return "";
  if (raw === "__CHUA_PHAN__") return LOOKUP_TEXT.pendingAssignment;
  return cleanCvName(raw);
}

function displayLookupCg(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/^CG\s*:\s*/i, "").trim();
}

function displaySubmissionKind(value: string | null): string {
  if (value === "first") return "Lần đầu";
  if (value === "supplement") return "Lần bổ sung";
  return "";
}

async function downloadTraCuuDangXuLyExcel(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
}) {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien.trim()) search.set("chuyen_vien", params.chuyenVien.trim());
  if (params.chuyenGia.trim()) search.set("chuyen_gia", params.chuyenGia.trim());
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());
  search.set("sort_by", params.sortBy);
  search.set("sort_dir", params.sortDir);

  const res = await fetch(`${API}/stats/tra-cuu-dang-xu-ly/export?${search.toString()}`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {}
    throw new Error(detail);
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const matched = cd.match(/filename="?([^"]+)"?/);
  const filename = matched?.[1] ?? "Tra_cuu_dang_xu_ly.xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function downloadTraCuuDaXuLyExcel(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
}) {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien.trim()) search.set("chuyen_vien", params.chuyenVien.trim());
  if (params.chuyenGia.trim()) search.set("chuyen_gia", params.chuyenGia.trim());
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());
  search.set("sort_by", params.sortBy);
  search.set("sort_dir", params.sortDir);

  const res = await fetch(`${API}/stats/tra-cuu-da-xu-ly/export?${search.toString()}`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {}
    throw new Error(detail);
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const matched = cd.match(/filename="?([^"]+)"?/);
  const filename = matched?.[1] ?? "Tra_cuu_da_xu_ly.xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function TraCuuDangXuLyTab(props?: {
  state: TraCuuFilterState;
  setState: React.Dispatch<React.SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  const [localState, setLocalState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_FILTER_STATE);
  const state = props?.state ?? localState;
  const setState = props?.setState ?? setLocalState;
  const isActive = props?.isActive ?? true;
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const [selectedDetail, setSelectedDetail] = useState<{ hoSoId: number; maHoSo: string } | null>(null);
  const setChuyenVien = (value: string) => setState((prev) => ({ ...prev, chuyenVien: value }));
  const setChuyenGia = (value: string) => setState((prev) => ({ ...prev, chuyenGia: value }));
  const setThuTuc = (value: LookupThuTuc | "all") => setState((prev) => ({ ...prev, thuTuc: value }));
  const setTinhTrang = (value: LookupTinhTrang | "all") => setState((prev) => ({ ...prev, tinhTrang: value }));
  const setMaHoSo = (value: string) => setState((prev) => ({ ...prev, maHoSo: value }));
  const deferredMaHoSo = useDeferredValue(maHoSo);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["tra-cuu-dang-xu-ly", thuTuc, chuyenVien, chuyenGia, tinhTrang, deferredMaHoSo],
    queryFn: ({ signal }) => fetchTraCuuDangXuLy({
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo: deferredMaHoSo,
      signal,
    }),
    enabled: isActive,
    placeholderData: (previousData) => previousData,
    retry: 2,
  });

  useEffect(() => {
    if (!isActive) {
      void queryClient.cancelQueries({ queryKey: ["tra-cuu-dang-xu-ly"] });
    }
  }, [isActive]);

  const chuyenVienOptions = data?.options.chuyen_vien ?? [];
  const chuyenGiaOptions = data?.options.chuyen_gia ?? [];

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    if (sortBy === "stt") {
      return sortDir === "asc" ? rows : rows.reverse();
    }
    const getValue = (row: TraCuuDangXuLyRow) => {
      switch (sortBy) {
        case "ma_ho_so":
          return row.ma_ho_so;
        case "ngay_tiep_nhan":
          return row.ngay_tiep_nhan ?? "";
        case "ngay_hen_tra":
          return row.ngay_hen_tra ?? "";
        case "loai_ho_so":
          return row.loai_ho_so ?? "";
        case "submission_kind":
          return row.submission_kind === "first" ? "0" : row.submission_kind === "supplement" ? "1" : "2";
        case "tinh_trang":
          return LOOKUP_TINH_TRANG_SORT_ORDER[row.tinh_trang] ?? Number.MAX_SAFE_INTEGER;
        case "chuyen_vien":
          return displayLookupCv(row.chuyen_vien);
        case "chuyen_gia":
          return displayLookupCg(row.chuyen_gia);
        case "thoi_gian_cho_ngay":
          return row.thoi_gian_cho_ngay;
        case "stt":
          return 0;
      }
    };

    rows.sort((left, right) => {
      const a = getValue(left);
      const b = getValue(right);
      let result = 0;
      if (typeof a === "number" && typeof b === "number") {
        result = a - b;
      } else {
        result = String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
      }
      if (result === 0) result = left.ma_ho_so.localeCompare(right.ma_ho_so, "vi", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    });
    return rows;
  }, [data?.rows, sortBy, sortDir]);

  const toggleSort = (key: typeof sortBy) => {
    if (key === "stt") return;
    if (sortBy === key) {
      setState((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }));
      return;
    }
    setState((prev) => ({ ...prev, sortBy: key, sortDir: "desc" }));
  };

  const SortableHeader = ({ label, sortKey, center = false }: { label: string; sortKey: typeof sortBy; center?: boolean }) => {
    const active = sortBy === sortKey;
    const arrow = !active ? "↕" : sortDir === "asc" ? "↑" : "↓";
    return (
      <th className={`px-3 py-3 ${center ? "text-center" : "text-left"} font-semibold uppercase tracking-wide whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors ${active ? "text-blue-700" : "text-slate-600 hover:text-slate-800"}`}
        >
          <span>{label}</span>
          <span className={`text-[10px] ${active ? "text-blue-600" : "text-slate-400"}`}>{arrow}</span>
        </button>
      </th>
    );
  };

  const SelectField = ({
    label,
    value,
    onChange,
    children,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
      >
        {children}
      </select>
    </label>
  );

  const handleResetFilters = () => setState((prev) => ({
    ...DEFAULT_TRA_CUU_FILTER_STATE,
    sortBy: prev.sortBy,
    sortDir: prev.sortDir,
  }));

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadTraCuuDangXuLyExcel({
        thuTuc,
        chuyenVien,
        chuyenGia,
        tinhTrang,
        maHoSo,
        sortBy,
        sortDir,
      });
    } catch (e) {
      alert(`Lỗi xuất Excel: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <SelectField label="Chuyên viên" value={chuyenVien} onChange={setChuyenVien}>
            <option value="">Tất cả</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </SelectField>

          <SelectField label="Chuyên gia" value={chuyenGia} onChange={setChuyenGia}>
            <option value="">Tất cả</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectField>

          <SelectField label="Thủ tục" value={String(thuTuc)} onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}>
            <option value="all">Tất cả</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </SelectField>

          <SelectField label="Tình trạng" value={tinhTrang} onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}>
            {TRA_CUU_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>

          <label className="flex min-w-[260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lọc mã hồ sơ</span>
            <input
              type="text"
              value={maHoSo}
              onChange={(e) => setMaHoSo(e.target.value)}
              placeholder="Nhập mã hồ sơ"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800"
              title="Đặt lại bộ lọc"
              aria-label="Đặt lại bộ lọc"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || isFetching || !data}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </button>
          </div>

          <div className="ml-auto text-xs text-slate-500 font-medium">
            {isFetching ? "Đang tải dữ liệu..." : `Tìm thấy ${data?.rows.length.toLocaleString("vi-VN") ?? 0} hồ sơ`}
          </div>
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">
            Không thể tải danh mục hồ sơ đang xử lý
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 1220, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 78 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 110 }} />
                <col />
                            <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="px-3 py-3 text-center font-semibold uppercase tracking-wide whitespace-nowrap">STT</th>
                  <SortableHeader label="Mã hồ sơ" sortKey="ma_ho_so" />
                  <SortableHeader label={LOOKUP_TEXT.dateReceived} sortKey="ngay_tiep_nhan" center />
                  <SortableHeader label={LOOKUP_TEXT.dueDate} sortKey="ngay_hen_tra" center />
                  <SortableHeader label="Lần nộp" sortKey="submission_kind" />
                  <SortableHeader label="Loại hồ sơ" sortKey="loai_ho_so" center />
                  <SortableHeader label="Chuyên viên" sortKey="chuyen_vien" />
                  <SortableHeader label="Chuyên gia" sortKey="chuyen_gia" />
                  <SortableHeader label="Thời gian chờ" sortKey="thoi_gian_cho_ngay" center />
                  <SortableHeader label="Tình trạng" sortKey="tinh_trang" />
                  <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">Thông tin hồ sơ</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">
                      Đang chuẩn bị dữ liệu tra cứu...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">
                      Không có hồ sơ phù hợp với điều kiện lọc.
                    </td>
                  </tr>
                ) : sortedRows.map((row, index) => (
                  <tr key={`${row.thu_tuc}-${row.ma_ho_so}-${index}`} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} group hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{row.ma_ho_so}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_tiep_nhan)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_hen_tra)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displaySubmissionKind(row.submission_kind)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{row.loai_ho_so || ""}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCv(row.chuyen_vien)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCg(row.chuyen_gia)}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">
                      {row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ngày` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{displayLookupTinhTrang(row.tinh_trang)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const hoSoId = row.thu_tuc === 48 ? extractHoSoId(row.ma_ho_so) : null;
                          if (hoSoId) setSelectedDetail({ hoSoId, maHoSo: row.ma_ho_so });
                        }}
                        disabled={row.thu_tuc !== 48 || extractHoSoId(row.ma_ho_so) === null}
                        className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedDetail && (
        <LookupHoSoDetailModal
          hoSoId={selectedDetail.hoSoId}
          maHoSo={selectedDetail.maHoSo}
          onClose={() => setSelectedDetail(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChuyenGiaTable — bảng thống kê chuyên gia (chỉ dùng cho TT48)
// ---------------------------------------------------------------------------
function ChuyenGiaTable({
  thuTuc,
  onCgClick,
  hideEmpty,
  setHideEmpty,
}: {
  thuTuc: number;
  onCgClick?: (tenCg: string) => void;
  hideEmpty: boolean;
  setHideEmpty: (value: boolean) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-gia", thuTuc],
    queryFn:  () => fetchChuyenGia(thuTuc),
    retry: 2,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-20 text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      Đang tải thống kê chuyên gia...
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center h-20 text-red-400 text-sm">
      Không thể tải dữ liệu chuyên gia TT{thuTuc}
    </div>
  );

  const cleanCv = (name: string | null) =>
    name ? name.replace(/^CV thụ lý\s*:\s*/, "") : "";

  const tgDisplay = (row: ChuyenGiaRow) => {
    if (row.tong === 0) return { val: 0, label: "" };
    if (row.cham_so_ngay > 0) return { val: row.cham_so_ngay, label: `${row.cham_so_ngay} ngày` };
    if (row.cham_ngay) {
      const days = Math.floor((Date.now() - new Date(row.cham_ngay).getTime()) / 86400000);
      return { val: days, label: days > 0 ? `${days} ngày` : "" };
    }
    return { val: 0, label: "" };
  };

  const tgColor = (val: number, isOverdue: boolean) => {
    if (!isOverdue) return "text-slate-500";
    if (val >= 500) return "bg-red-100 text-red-700 font-bold";
    if (val >= 300) return "bg-yellow-100 text-orange-700 font-bold";
    return "text-orange-600 font-semibold";
  };

  const renderRow = (row: ChuyenGiaRow, idx: number, bgBase: string) => {
    const tg = tgDisplay(row);
    const isOverdue = row.cham_so_ngay > 0;
    const rowBg = row.tong === 0 ? bgBase : idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    return (
      <tr key={row.ten} className={`${rowBg} hover:bg-blue-50 transition-colors`}>
        <td className="px-2 py-1.5 text-center text-xs text-slate-400">{idx + 1}</td>
        <td className="px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[160px]">
          {onCgClick ? (
            <button
              type="button"
              onClick={() => onCgClick(row.ten.trim())}
              className="cursor-pointer text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              {row.ten}
            </button>
          ) : (
            row.ten
          )}
        </td>
        {/* TỔNG */}
        <td className={`px-2 py-1.5 text-center text-xs font-bold ${row.da_giai_quyet > 0 ? "text-emerald-700 bg-emerald-50" : "text-slate-300"}`}>
          {row.da_giai_quyet || ""}
        </td>
        <td className={`px-2 py-1.5 text-center text-xs font-bold ${row.tong > 15 ? "text-pink-700 bg-pink-50" : row.tong > 0 ? "text-slate-700" : "text-slate-300"}`}>
          {row.tong || ""}
        </td>
        {/* Còn hạn */}
        <td className={`px-2 py-1.5 text-center text-xs ${row.con_han > 0 ? "text-blue-600" : "text-slate-300"}`}>
          {row.con_han || ""}
        </td>
        {/* Quá hạn */}
        <td className={`px-2 py-1.5 text-center text-xs font-bold ${row.qua_han > 15 ? "bg-orange-100 text-orange-800" : row.qua_han > 0 ? "text-orange-600" : "text-slate-300"}`}>
          {row.qua_han || ""}
        </td>
        {/* Thời gian chờ */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 ${tgColor(tg.val, isOverdue)}`}>
          {tg.label}
        </td>
        {/* Nộp từ */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {isoToDisplay(row.cham_ngay)}
        </td>
        {/* Mã hồ sơ */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {row.cham_ma ?? ""}
        </td>
        {/* CV thụ lý */}
        <td className="px-2 py-1.5 text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {cleanCv(row.cham_cv)}
        </td>
      </tr>
    );
  };

  const visibleChuyenGia = hideEmpty ? data.chuyen_gia.filter((row) => row.tong > 0) : data.chuyen_gia;
  const visibleChuyenVienCg = hideEmpty ? data.chuyen_vien_cg.filter((row) => row.tong > 0) : data.chuyen_vien_cg;
  const allRows = [...visibleChuyenGia, ...visibleChuyenVienCg];
  const grandResolved = allRows.reduce((s, r) => s + r.da_giai_quyet, 0);
  const grandTong  = allRows.reduce((s, r) => s + r.tong,    0);
  const grandCon   = allRows.reduce((s, r) => s + r.con_han, 0);
  const grandQua   = allRows.reduce((s, r) => s + r.qua_han, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-green-700 text-white flex items-center justify-between gap-4">
        <div className="text-xs font-bold uppercase tracking-wide">
          Thống kê hồ sơ đang ở bước Chuyên gia thẩm định — TT{thuTuc}
        </div>
        <label className="flex items-center gap-2 text-[11px] font-semibold normal-case tracking-normal whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="rounded border-white/40 text-green-700 focus:ring-green-200"
          />
          Ẩn chuyên gia không có hồ sơ tồn
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 980, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-2 py-2 text-center text-xs w-9" rowSpan={2}>STT</th>
              <th className="px-3 py-2 text-left text-xs min-w-[220px]" rowSpan={2}>Chuyên gia</th>
              <th className="px-2 py-2 text-center text-xs bg-emerald-700" colSpan={1}>ĐÃ GIẢI QUYẾT</th>
              <th className="px-2 py-2 text-center text-xs bg-blue-600" colSpan={3}>ĐANG GIẢI QUYẾT</th>
              <th className="px-2 py-2 text-center text-xs bg-rose-700" colSpan={4}>Hồ sơ chậm nhất</th>
            </tr>
            <tr className="bg-slate-600 text-white">
              <th className="px-2 py-1 text-center text-xs bg-emerald-700 font-bold">TỔNG</th>
              <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">TỔNG</th>
              <th className="px-2 py-1 text-center text-xs bg-green-700">Còn hạn</th>
              <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá hạn</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hồ sơ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Chuyên viên thụ lý</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Section 1: Chuyên gia */}
            <tr className="bg-cyan-600 text-white">
              <td colSpan={10} className="px-3 py-1 text-xs font-bold uppercase tracking-wide">
                Chuyên gia
              </td>
            </tr>
            {visibleChuyenGia.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-2 text-xs text-slate-400 italic text-center">Không có hồ sơ đang ở bước chuyên gia</td></tr>
            ) : (
              visibleChuyenGia.map((row, idx) => renderRow(row, idx, "bg-green-50"))
            )}
            {/* Section 2: Chuyên viên đóng vai chuyên gia */}
            <tr className="bg-amber-500 text-white">
              <td colSpan={10} className="px-3 py-1 text-xs font-bold uppercase tracking-wide">
                Chuyên viên đóng vai chuyên gia
              </td>
            </tr>
            {visibleChuyenVienCg.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-2 text-xs text-slate-400 italic text-center">Không có chuyên viên đóng vai chuyên gia</td></tr>
            ) : (
              visibleChuyenVienCg.map((row, idx) => renderRow(row, idx, "bg-amber-50"))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
              <td />
              <td className="px-3 py-2 text-xs font-bold">TỔNG</td>
              <td className="px-2 py-2 text-center text-xs font-bold text-emerald-700">{grandResolved}</td>
              <td className="px-2 py-2 text-center text-xs font-bold">{grandTong}</td>
              <td className="px-2 py-2 text-center text-xs text-blue-700">{grandCon}</td>
              <td className="px-2 py-2 text-center text-xs text-orange-700 font-bold">{grandQua}</td>
              <td className="bg-rose-50" />
              <td className="bg-rose-50" />
              <td className="bg-rose-50" />
              <td className="bg-rose-50" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Admin Panel (chỉ hiển thị khi URL hash = #admin)
// ---------------------------------------------------------------------------
const EXPORT_TABLES = [
  { id: "tra_cuu_chung", label: "Tra Cứu Chung",  desc: "Danh sách hồ sơ tiếp nhận" },
  { id: "dang_xu_ly",    label: "Đang Xử Lý",     desc: "Hồ sơ đang trong quá trình xử lý" },
  { id: "da_xu_ly",      label: "Đã Xử Lý",       desc: "Hồ sơ đã hoàn tất xử lý" },
] as const;

type TableMeta = { last_sync: string | null; fetch_sec: number | null; insert_sec: number | null };
type DbStats = {
  tables: {
    tra_cuu_chung: { total: number } & TableMeta;
    dang_xu_ly:    { total: number; by_thu_tuc: Record<string,number> } & TableMeta;
    da_xu_ly:      { total: number; by_thu_tuc: Record<string,number> } & TableMeta;
  };
};

type SchedulerInfo = { interval_hours: number; next_run: string | null };
type SyncLog      = { lines: string[]; total_lines: number; showing_last: number };

function fmtSyncAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd  = String(d.getDate()).padStart(2,"0");
  const mm  = String(d.getMonth()+1).padStart(2,"0");
  const hh  = String(d.getHours()).padStart(2,"0");
  const min = String(d.getMinutes()).padStart(2,"0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

function AdminPanel({ onClose }: { onClose: () => void }) {
  const STORAGE_KEY = "dav_admin_token";
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- state các section ----
  const [dbStats,    setDbStats]    = useState<DbStats | null>(null);
  const [dbLoading,  setDbLoading]  = useState(false);

  const [syncBusy,   setSyncBusy]   = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  const [scheduler,       setScheduler]       = useState<SchedulerInfo | null>(null);
  const [schedulerHours,  setSchedulerHours]  = useState<string>("");
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [schedulerMsg,    setSchedulerMsg]    = useState<string | null>(null);

  const [syncLog,     setSyncLog]     = useState<SyncLog | null>(null);
  const [logLoading,  setLogLoading]  = useState(false);
  const [logLines,    setLogLines]    = useState<string>("200");
  const logBoxRef = useRef<HTMLDivElement>(null);

  const [exportStatus, setExportStatus] = useState<Record<string, "idle"|"loading"|"error">>({});

  useEffect(() => { inputRef.current?.focus(); }, []);

  const saveToken = (v: string) => {
    setToken(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  };

  const tk = () => encodeURIComponent(token.trim());
  const hasToken = token.trim().length > 0;

  // ---- Load DB stats ----
  const loadDbStats = async () => {
    if (!hasToken) return;
    setDbLoading(true);
    try {
      const r = await fetch(`${API}/admin/db-stats`, {
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setDbStats(d as DbStats);
    } catch (e) {
      alert(`Lỗi tải thống kê DB: ${String(e)}`);
    } finally {
      setDbLoading(false);
    }
  };

  // ---- Load scheduler info ----
  const loadScheduler = async () => {
    if (!hasToken) return;
    try {
      const r = await fetch(`${API}/admin/scheduler`, {
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setScheduler(d as SchedulerInfo);
      setSchedulerHours(String((d as SchedulerInfo).interval_hours));
    } catch { /* silent */ }
  };

  // ---- Force sync (async — trả về ngay, sync chạy background) ----
  const handleForceSync = async () => {
    if (!hasToken) { alert("Vui lòng nhập mã xác thực trước."); return; }
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const r = await fetch(`${API}/admin/force-sync`, {
        method: "POST",
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) {
        setSyncResult(`❌ Lỗi: ${d.detail ?? `HTTP ${r.status}`}`);
      } else {
        setSyncResult(`✅ ${d.message ?? "Sync đã được kích hoạt. Xem log để theo dõi."}`);
      }
    } catch (e) {
      setSyncResult(`❌ Lỗi kết nối: ${String(e)}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleMigrateStats = async () => {
    if (!hasToken) { alert("Vui lòng nhập mã xác thực trước."); return; }
    setMigrateBusy(true);
    setMigrateResult(null);
    try {
      const r = await fetch(`${API}/admin/migrate-stats`, {
        method: "POST",
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) {
        setMigrateResult(`❌ Lỗi: ${d.detail ?? `HTTP ${r.status}`}`);
      } else {
        const elapsed = typeof d.elapsed_sec === "number" ? ` (${d.elapsed_sec}s)` : "";
        setMigrateResult(`✅ Đã chạy stats migration${elapsed}`);
      }
    } catch (e) {
      setMigrateResult(`❌ Lỗi kết nối: ${String(e)}`);
    } finally {
      setMigrateBusy(false);
    }
  };

  // ---- Update scheduler interval ----
  const handleSchedulerSave = async () => {
    if (!hasToken) return;
    const h = parseFloat(schedulerHours);
    if (isNaN(h) || h <= 0) { setSchedulerMsg("⚠ Giá trị không hợp lệ"); return; }
    setSchedulerSaving(true);
    setSchedulerMsg(null);
    try {
      const r = await fetch(`${API}/admin/scheduler`, {
        method: "POST",
        headers: { ...authHeaders(tk()), "Content-Type": "application/json" },
        body: JSON.stringify({ hours: h }),
      });
      const d = await r.json();
      if (!r.ok) {
        setSchedulerMsg(`❌ ${d.detail ?? `HTTP ${r.status}`}`);
      } else {
        setScheduler(d as SchedulerInfo);
        setSchedulerMsg(`✅ Đã cập nhật: mỗi ${d.interval_hours}h`);
      }
    } catch (e) {
      setSchedulerMsg(`❌ Lỗi: ${String(e)}`);
    } finally {
      setSchedulerSaving(false);
    }
  };

  // ---- Load sync log ----
  const handleLoadLog = async () => {
    if (!hasToken) return;
    setLogLoading(true);
    try {
      const n = Math.min(parseInt(logLines)||200, 2000);
      const r = await fetch(`${API}/admin/logs?lines=${n}`, {
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setSyncLog(d as SyncLog);
      setTimeout(() => {
        logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    } catch (e) {
      alert(`Lỗi tải log: ${String(e)}`);
    } finally {
      setLogLoading(false);
    }
  };

  // ---- Download Excel ----
  const handleDownload = async (tableId: string) => {
    if (!hasToken) { alert("Vui lòng nhập mã xác thực trước."); return; }
    setExportStatus(s => ({ ...s, [tableId]: "loading" }));
    try {
      const url = `${API}/admin/export/${tableId}`;
      const res = await fetch(url, {
        headers: authHeaders(tk()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        alert(`Lỗi: ${err.detail ?? "Không thể tải file"}`);
        setExportStatus(s => ({ ...s, [tableId]: "error" }));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const nm = cd.match(/filename="?([^"]+)"?/);
      const filename = nm?.[1] ?? `${tableId}.xlsx`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      setExportStatus(s => ({ ...s, [tableId]: "idle" }));
    } catch (e) {
      alert(`Lỗi kết nối: ${String(e)}`);
      setExportStatus(s => ({ ...s, [tableId]: "error" }));
    }
  };

  // ---- Auto-load when token available ----
  useEffect(() => {
    if (hasToken) { loadDbStats(); loadScheduler(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">Quản trị hệ thống</h2>
            <p className="text-slate-400 text-xs mt-0.5">Chỉ dành cho quản trị viên</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl font-bold leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* 0 — Token */}
          <Section title="Mã xác thực">
            <input
              ref={inputRef}
              type="password"
              value={token}
              onChange={e => saveToken(e.target.value)}
              placeholder="Nhập ADMIN_EXPORT_TOKEN..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Mã được lưu tạm trong trình duyệt của bạn.</p>
          </Section>

          {/* 1 — DB Stats */}
          <Section title="Thống kê bản ghi trong database">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={loadDbStats}
                disabled={!hasToken || dbLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {dbLoading ? "Đang tải..." : "Làm mới"}
              </button>
            </div>
            {dbStats ? (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">Bảng</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">Tổng</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">TT48</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">TT47</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">TT46</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">Sync lần cuối</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "tra_cuu_chung", label: "tra_cuu_chung" },
                    { key: "dang_xu_ly",    label: "dang_xu_ly" },
                    { key: "da_xu_ly",      label: "da_xu_ly" },
                  ].map(({ key, label }) => {
                    const t = dbStats.tables[key as keyof DbStats["tables"]];
                    const by = "by_thu_tuc" in t ? t.by_thu_tuc : null;
                    return (
                      <tr key={key} className="hover:bg-slate-50">
                        <td className="px-3 py-2 border border-slate-200 font-mono text-slate-700">{label}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right font-bold text-slate-800">{t.total.toLocaleString()}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right text-slate-600">{by ? by[48]?.toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right text-slate-600">{by ? by[47]?.toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right text-slate-600">{by ? by[46]?.toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 border border-slate-200 text-slate-500">
                          {t.last_sync
                            ? <>
                                <span className="font-medium text-slate-700">{fmtSyncAt(t.last_sync)}</span>
                                {(t.fetch_sec != null || t.insert_sec != null) && (
                                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                    {t.fetch_sec  != null && <span>🌐 Kéo: <span className="font-mono text-slate-600">{t.fetch_sec.toFixed(2)}s</span></span>}
                                    {t.fetch_sec  != null && t.insert_sec != null && <span className="mx-1">·</span>}
                                    {t.insert_sec != null && <span>💾 Ghi: <span className="font-mono text-slate-600">{t.insert_sec.toFixed(2)}s</span></span>}
                                  </div>
                                )}
                              </>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-400">{dbLoading ? "Đang tải..." : hasToken ? "Nhấn 'Làm mới' để xem." : "Nhập token để xem."}</p>
            )}
          </Section>

          {/* 2 — Force sync */}
          <Section title="Đồng bộ dữ liệu ngay">
            <p className="text-xs text-slate-500 mb-3">Kích hoạt sync toàn bộ 7 dataset ngay lập tức (thay vì đợi scheduler). Lệnh trả về ngay, sync chạy nền trong 1–3 phút — xem Log bên dưới để theo dõi tiến trình.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleForceSync}
                disabled={!hasToken || syncBusy}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncBusy ? "⏳ Đang sync..." : "▶ Sync ngay"}
              </button>
              {syncResult && <span className="text-xs text-slate-700 font-medium">{syncResult}</span>}
            </div>
          </Section>

          <Section title="Stats Migration">
            <p className="text-xs text-slate-500 mb-3">Chạy thủ công phần recreate materialized views stats sau khi deploy thay đổi schema stats. Tác vụ này không còn chạy lúc startup.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleMigrateStats}
                disabled={!hasToken || migrateBusy}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {migrateBusy ? "⏳ Đang migrate..." : "▶ Chạy stats migration"}
              </button>
              {migrateResult && <span className="text-xs text-slate-700 font-medium">{migrateResult}</span>}
            </div>
          </Section>

          {/* 3 — Scheduler */}
          <Section title="Tần suất tự động sync">
            {scheduler && (
              <p className="text-xs text-slate-500 mb-2">
                Hiện tại: <span className="font-semibold text-slate-700">{scheduler.interval_hours}h</span> / lần
                {scheduler.next_run && (
                  <> · Lần sync tiếp theo: <span className="font-semibold text-slate-700">{fmtSyncAt(scheduler.next_run)}</span></>
                )}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={0.1}
                max={24}
                step={0.5}
                value={schedulerHours}
                onChange={e => setSchedulerHours(e.target.value)}
                className="w-24 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="giờ"
              />
              <span className="text-xs text-slate-500">giờ / lần</span>
              <button
                onClick={handleSchedulerSave}
                disabled={!hasToken || schedulerSaving}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {schedulerSaving ? "Đang lưu..." : "Lưu"}
              </button>
              {schedulerMsg && <span className="text-xs text-slate-700">{schedulerMsg}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Phạm vi: 0.1 – 24 giờ. Thay đổi có hiệu lực ngay, không cần khởi động lại.</p>
          </Section>

          {/* 4 — Sync log */}
          <Section title="Remote fetch log">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-slate-500">Hiển thị</span>
              <input
                type="number"
                min={10}
                max={2000}
                step={50}
                value={logLines}
                onChange={e => setLogLines(e.target.value)}
                className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <span className="text-xs text-slate-500">dòng cuối</span>
              <button
                onClick={handleLoadLog}
                disabled={!hasToken || logLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {logLoading ? "Đang tải..." : "Xem log"}
              </button>
              {syncLog && (
                <span className="text-xs text-slate-400">
                  Hiển thị {syncLog.showing_last}/{syncLog.total_lines} dòng
                </span>
              )}
            </div>
            {syncLog ? (
              <div
                ref={logBoxRef}
                className="bg-slate-900 rounded-lg p-3 overflow-y-auto max-h-64 font-mono text-xs text-green-300 space-y-px leading-relaxed"
              >
                {syncLog.lines.map((line, i) => (
                  <div key={i} className={line.includes("ERROR") ? "text-red-400" : line.includes("WARNING") || line.includes("WARN") ? "text-yellow-300" : undefined}>
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">{hasToken ? "Nhấn 'Xem log' để tải." : "Nhập token để xem."}</p>
            )}
          </Section>

          {/* 5 — Export Excel */}
          <Section title="Xuất dữ liệu Excel">
            <div className="space-y-2">
              {EXPORT_TABLES.map(t => {
                const st = exportStatus[t.id] ?? "idle";
                return (
                  <button
                    key={t.id}
                    onClick={() => handleDownload(t.id)}
                    disabled={st === "loading"}
                    className={[
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all",
                      st === "loading"  ? "border-blue-300 bg-blue-50 opacity-70 cursor-not-allowed"
                      : st === "error"  ? "border-red-300 bg-red-50 hover:bg-red-100"
                                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300",
                    ].join(" ")}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{t.label}</p>
                      <p className="text-xs text-slate-400">{t.desc}</p>
                    </div>
                    <span className="text-xs font-medium text-slate-500 ml-4 flex-shrink-0">
                      {st === "loading" ? "⏳ Đang tải..." : st === "error" ? "❌ Lỗi" : "⬇ .xlsx"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <p className="text-xs text-slate-400 text-center pt-1">
            Thoát: nhấn <kbd className="bg-slate-100 border border-slate-300 rounded px-1 text-xs">Esc</kbd> hoặc click × bên trên
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
function Dashboard() {
  const [activeTab, setActiveTab] = useState<string>(DEFAULT_DASHBOARD_TAB_ID);
  const [showAdmin, setShowAdmin] = useState(false);
  const [lookupState, setLookupState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_FILTER_STATE);
  const [lookupDoneState, setLookupDoneState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
  const [hideEmptyExperts, setHideEmptyExperts] = useState(true);
  const {
    authLoading,
    authRole,
    loginPassword,
    setLoginPassword,
    loginBusy,
    authError,
    handleLogin,
    handleLogout,
  } = useDashboardAuth({
    onAfterLogout: () => {
      setShowAdmin(false);
      if (window.location.hash === "#admin") {
        history.pushState("", document.title, window.location.pathname + window.location.search);
      }
      setLookupState(DEFAULT_TRA_CUU_FILTER_STATE);
      setLookupDoneState(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
      setActiveTab(DEFAULT_DASHBOARD_TAB_ID);
    },
  });
  const isAdmin = authRole === "admin";
  const visibleTabs = useMemo(
    () => (isAdmin ? DASHBOARD_TABS : DASHBOARD_TABS.filter((tab) => !tab.adminOnly)),
    [isAdmin]
  );
  const { openAdmin, closeAdmin } = useAdminPanelShell({
    isAdmin,
    showAdmin,
    setShowAdmin,
  });

  const { data: syncStatus } = useDashboardSyncStatus(authRole);

  // Filter state riêng cho từng tab Thống kê (48 / 47 / 46) — không bị reset khi chuyển tab
  const [filters, setFilters] = useState<Record<number, TabFilter>>({
    0: makeTabFilter("nam_nay"),
    48: makeTabFilter("nam_nay"),
    47: makeTabFilter("nam_nay"),
    46: makeTabFilter("nam_nay"),
  });

  const updateFilter = useCallback((thuTuc: number, patch: Partial<TabFilter>) => {
    setFilters(prev => ({ ...prev, [thuTuc]: { ...prev[thuTuc], ...patch } }));
  }, []);

  const filtersValue = useMemo<FiltersCtxType>(
    () => ({ filters, updateFilter }),
    [filters, updateFilter]
  );

  const {
    openLookupByChuyenVien,
    openLookupByChuyenGia,
    openLookupByTinhTrang,
    openThongKeFromTongQuan,
    openDangXuLyFromTongQuan,
  } = useDashboardNavigation({
    isAdmin,
    defaultLookupState: DEFAULT_TRA_CUU_FILTER_STATE,
    setLookupState,
    setActiveTab,
    updateFilter,
  });

  const renderTabContent = (tabId: DashboardTabId) => (
    <DashboardContentSwitch
      tabId={tabId}
      renderTongQuan={() => <TongQuanTab onOpenThongKe={openThongKeFromTongQuan} onOpenDangXuLy={openDangXuLyFromTongQuan} />}
      renderThongKe={(thuTuc) => <ThongKeTab thuTuc={thuTuc} />}
      renderDangXuLy={(thuTuc) =>
        thuTuc === 48 ? (
          <DangXuLyTab
            thuTuc={48}
            onCvLookup={openLookupByChuyenVien}
            onCgLookup={openLookupByChuyenGia}
            onTinhTrangLookup={openLookupByTinhTrang}
            hideEmptyExperts={hideEmptyExperts}
            setHideEmptyExperts={setHideEmptyExperts}
          />
        ) : (
          <DangXuLyTab thuTuc={thuTuc} onCvLookup={openLookupByChuyenVien} />
        )
      }
      renderLookupDangXuLy={() =>
        isAdmin ? <TraCuuDangXuLyTab state={lookupState} setState={setLookupState} isActive={activeTab === "tra_cuu_dang_xl"} /> : null
      }
      renderLookupDaXuLy={() =>
        isAdmin ? <TraCuuDaXuLyTab state={lookupDoneState} setState={setLookupDoneState} isActive={activeTab === "tra_cuu_da_xl"} /> : null
      }
    />
  );

  return (
    <DashboardAuthGate
      authLoading={authLoading}
      authRole={authRole}
      password={loginPassword}
      setPassword={setLoginPassword}
      busy={loginBusy}
      error={authError}
      onSubmit={handleLogin}
    >
      <FiltersCtx.Provider value={filtersValue}>
      <div className="min-h-screen bg-slate-50">
        <DashboardShellHeader
          authRole={authRole}
          isAdmin={isAdmin}
          syncStatus={syncStatus}
          visibleTabs={visibleTabs}
          activeTab={activeTab}
        onOpenAdmin={openAdmin}
          onLogout={handleLogout}
          onSelectTab={setActiveTab}
        />

        <DashboardTabPanels tabs={visibleTabs} activeTab={activeTab} renderTabContent={renderTabContent} />

        <AdminPanelMount isAdmin={isAdmin} showAdmin={showAdmin}>
          <AdminPanel onClose={closeAdmin} />
        </AdminPanelMount>
      </div>
      </FiltersCtx.Provider>
    </DashboardAuthGate>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={BASE}>
        <Dashboard />
      </WouterRouter>
    </QueryClientProvider>
  );
}








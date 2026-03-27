import { useState, useCallback, useEffect, useRef, createContext, useContext, useMemo } from "react";
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

const queryClient = new QueryClient();

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "/dashboard"
const API  = "/api"; // API base — tách biệt khỏi BASE để production routing hoạt động

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

// ---------------------------------------------------------------------------
// Quick filter presets
// ---------------------------------------------------------------------------
function getPreset(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  if (key === "thang_nay") {
    return { from: toYMD(new Date(y, m, 1)), to: toYMD(new Date(y, m + 1, 0)) };
  }
  if (key === "nam_nay") {
    return { from: toYMD(new Date(y, 0, 1)), to: toYMD(new Date(y, 11, 31)) };
  }
  if (key === "6_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 5);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: toYMD(new Date(y, m + 1, 0)) };
  }
  if (key === "3_thang") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 2);
    return { from: toYMD(new Date(d.getFullYear(), d.getMonth(), 1)), to: toYMD(new Date(y, m + 1, 0)) };
  }
  return { from: toYMD(new Date(y, 0, 1)), to: toYMD(now) };
}

// Thứ tự nút lọc khớp với thiết kế Excel (Cộng dồn xử lý riêng vì cần API)
const QUICK_FILTERS = [
  { key: "nam_nay",   label: "Năm nay" },
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

interface SyncStatus { lastSyncedAt: string | null; totalSizeMB: number; }
async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(`${API}/sync-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

interface DangXuLyRow {
  cv_name:       string;
  tong:          number;
  cho_cv:        number;
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

function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = iso.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

// ---------------------------------------------------------------------------
// Chuyên gia data model
// ---------------------------------------------------------------------------
interface ChuyenGiaRow {
  ten:          string;
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
      <BarChart data={data} margin={{ top: 32, right: 20, left: 10, bottom: 8 }}>
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
          tickFormatter={(v) => v.toLocaleString("vi-VN")}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={80}>
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
}

function DonutChart({ title, segments, total, isLoading, isError, emptyMessage, spinnerColor = "#22c55e" }: DonutChartProps) {
  const CenterLabel = ({ cx, cy }: any) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.4em" fontSize={26} fontWeight={700} fill="#1e293b">
        {total.toLocaleString("vi-VN")}
      </tspan>
      <tspan x={cx} dy="1.5em" fontSize={11} fill="#64748b" fontWeight={500}>
        hồ sơ
      </tspan>
    </text>
  );

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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium">Đang tải...</span>}
        {isError   && <span className="text-xs text-red-500 font-medium">Lỗi tải dữ liệu</span>}
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
        <div className="flex items-center justify-center gap-4">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie
                data={segments}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                labelLine={false}
                label={CenterLabel}
              >
                {segments.map((s, i) => (
                  <Cell key={i} fill={s.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-col gap-3 justify-center">
            {segments.map((s) => {
              const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0";
              return (
                <div key={s.name} className="flex items-start gap-2">
                  <div className="mt-1 w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.name}</div>
                    <div className="text-lg font-bold" style={{ color: s.color }}>
                      {s.value.toLocaleString("vi-VN")}
                    </div>
                    <div className="text-xs text-slate-400">{pct}%</div>
                  </div>
                </div>
              );
            })}
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
}

function ChuyenVienTable({ thuTuc, fromDate, toDate }: ChuyenVienTableProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-vien", thuTuc, fromDate, toDate],
    queryFn:  () => fetchChuyenVien(thuTuc, fromDate, toDate),
    enabled:  !!fromDate && !!toDate,
    retry: 2,
  });

  const rows = data?.rows ?? [];
  const cpc  = data?.cho_phan_cong ?? null;

  const thC  = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide border border-slate-300";
  const thL  = "px-2 py-2 text-left   text-xs font-bold uppercase tracking-wide border border-slate-300";
  const tdC  = "px-2 py-2 text-center text-xs border border-slate-200";
  const tdL  = "px-2 py-2 text-left   text-xs border border-slate-200";
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
    return (
      <tr className={`${bgCls} hover:bg-blue-50/40 transition-colors`}>
        <td className={`${tdC} text-slate-400`}
            style={{ ...stickySTT, backgroundColor: bgColor, width: STT_W, minWidth: STT_W }}>
          {idx + 1}
        </td>
        <td className={`${tdL} font-semibold text-slate-800 min-w-[160px]`}
            style={{ ...stickyCV, backgroundColor: bgColor }}>
          {cleanCvName(row.ten_cv)}
        </td>
        <td className={hiTd(hiThresh.ton_truoc,    row.ton_truoc)}><Num v={row.ton_truoc} color="#be185d" bold /></td>
        <td className={hiTd(hiThresh.da_nhan,       row.da_nhan)}><Num v={row.da_nhan}   color="#1d4ed8" bold /></td>
        <td className={hiTd(hiThresh.gq_tong,       row.gq_tong, "font-bold text-slate-700")}><Num v={row.gq_tong} /></td>
        <td className={tdC}><Num v={row.can_bo_sung} color="#b45309" /></td>
        <td className={tdC}><Num v={row.khong_dat}   color="#dc2626" /></td>
        <td className={hiTd(hiThresh.hoan_thanh,    row.hoan_thanh)}><Num v={row.hoan_thanh}  color="#15803d" /></td>
        <td className={tdC}><Num v={row.dung_han}    color="#15803d" /></td>
        <td className={tdC}><Num v={row.qua_han}     color="#dc2626" /></td>
        <td className={hiTd(hiThresh.tg_tb,          row.tg_tb)}><Num v={row.tg_tb} color="#6b7280" /></td>
        <td className={tdC}><Pct v={row.pct_gq_dung_han} warnBelow={30} /></td>
        <td className={tdC}><Pct v={row.pct_da_gq} /></td>
        <td className={hiTd(hiThresh.ton_sau_tong,  row.ton_sau_tong, "font-bold text-slate-700")}><Num v={row.ton_sau_tong} /></td>
        <td className={tdC}><Num v={row.ton_sau_con_han} color="#2563eb" /></td>
        <td className={tdC}><Num v={row.ton_sau_qua_han} color="#dc2626" /></td>
        <td className={tdC}><Num v={row.treo} color="#ea580c" bold /></td>
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
        <table className="w-full text-xs border-collapse" style={{ minWidth: 1100 }}>
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
              <th className={`${thC} bg-amber-50`}>Cần bổ sung</th>
              <th className={`${thC} bg-red-50`}>Không đạt</th>
              <th className={`${thC} bg-green-50`}>Hoàn thành</th>
              <th className={`${thC} bg-green-50 text-green-700`}>Đúng hạn</th>
              <th className={`${thC} bg-red-50 text-red-700`}>Quá hạn</th>
              <th className={`${thC} bg-slate-50`}>TG TB</th>
              <th className={`${thC} bg-green-50 text-green-700`}>%&nbsp;GQ<br />đúng hạn</th>
              <th className={`${thC} bg-slate-50 text-slate-600`}>%&nbsp;đã<br />GQ</th>
              <th className={`${thC} bg-amber-50`}>Tổng</th>
              <th className={`${thC} bg-blue-50 text-blue-700`}>Còn hạn</th>
              <th className={`${thC} bg-red-50 text-red-700`}>Quá hạn</th>
            </tr>
          </thead>
          <tbody>
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
function MonthlyTrendChart({ thuTuc }: { thuTuc: 48 | 47 | 46 }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["monthly", thuTuc],
    queryFn:  () => fetchMonthly(thuTuc),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const months = data?.months ?? [];

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
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Xu hướng theo tháng — TT{thuTuc}
        </h3>
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#60a5fa]" /> Tiếp nhận</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#34d399]" /> Giải quyết</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> Hồ sơ tồn</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={months} margin={{ top: 20, right: 30, bottom: 5, left: 10 }} barGap={2}>
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
          <Bar yAxisId="left" dataKey="da_nhan"       fill="#60a5fa" name="da_nhan"       radius={[2, 2, 0, 0]} />
          <Bar yAxisId="left" dataKey="da_giai_quyet" fill="#34d399" name="da_giai_quyet" radius={[2, 2, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ton_sau"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={months.length <= 24}
            name="ton_sau"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: THỐNG KÊ (tab 1, 3, 5 — TT48 / TT47 / TT46)
// ---------------------------------------------------------------------------
function ThongKeTab({ thuTuc }: { thuTuc: 48 | 47 | 46 }) {
  const { fromDate, toDate, fromInput, toInput, activePreset, loadingAll, update } = useTabFilter(thuTuc);

  const applyDates = useCallback((from: string, to: string, preset?: string) => {
    update({ fromDate: from, toDate: to, fromInput: toDMY(from), toInput: toDMY(to), activePreset: preset ?? "" });
  }, [update]);

  const handleTatCa = useCallback(async () => {
    update({ loadingAll: true });
    try {
      const earliest = await fetchEarliestDate(thuTuc);
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
    if (parsed) update({ toDate: parsed, activePreset: "" });
    else update({ toInput: toDMY(toDate) });
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["summary", thuTuc, fromDate, toDate],
    queryFn: () => fetchSummary(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    retry: 2,
  });

  const { data: gqData, isLoading: gqLoading, isError: gqError } = useQuery({
    queryKey: ["giai-quyet", thuTuc, fromDate, toDate],
    queryFn: () => fetchGiaiQuyet(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    retry: 2,
  });

  const { data: tsData, isLoading: tsLoading, isError: tsError } = useQuery({
    queryKey: ["ton-sau", thuTuc, toDate],
    queryFn: () => fetchTonSau(thuTuc, toDate),
    enabled: !!toDate,
    retry: 2,
  });

  const barData: BarData[] = [
    { name: "TỒN TRƯỚC",     value: data?.ton_truoc     ?? 0, color: COLORS.ton_truoc.bar     },
    { name: "ĐÃ NHẬN",        value: data?.da_nhan       ?? 0, color: COLORS.da_nhan.bar       },
    { name: "ĐÃ GIẢI QUYẾT", value: data?.da_giai_quyet ?? 0, color: COLORS.da_giai_quyet.bar },
    { name: "TỒN SAU",        value: data?.ton_sau       ?? 0, color: COLORS.ton_sau.bar       },
  ];

  const ttLabel = `TT${thuTuc}`;

  return (
    <div className="space-y-6">
      {/* Bộ lọc thời gian */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* Inputs Từ / Đến */}
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

          {/* Nút lọc nhanh — thứ tự: Cộng dồn | Năm nay | 6 tháng | 3 tháng | Tháng này */}
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

          {/* Kỳ thống kê hiển thị */}
          <div className="ml-auto text-xs text-slate-500 font-medium hidden lg:block">
            Kỳ thống kê: <span className="text-slate-800 font-bold">{toDMY(fromDate)}</span>
            {" → "}
            <span className="text-slate-800 font-bold">{toDMY(toDate)}</span>
          </div>
        </div>
      </div>

      {/* Biểu đồ + KPI */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Biểu đồ cột */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Tình trạng giải quyết hồ sơ {ttLabel}
            </h3>
            {isLoading && (
              <span className="text-xs text-blue-500 animate-pulse font-medium">Đang tải...</span>
            )}
            {isError && (
              <span className="text-xs text-red-500 font-medium">Lỗi tải dữ liệu</span>
            )}
          </div>

          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : (
            <SummaryBarChart data={barData} />
          )}

          {/* Ghi chú */}
          <div className="mt-3 flex flex-wrap gap-4 justify-center">
            {Object.values(COLORS).map(({ bar, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bar }} />
                <span className="text-xs text-slate-500 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-3 content-start">
          <KpiCard
            label="Tồn trước"
            value={data?.ton_truoc ?? 0}
            color={COLORS.ton_truoc.text}
            bgColor="#fdf2f8"
          />
          <KpiCard
            label="Đã nhận"
            value={data?.da_nhan ?? 0}
            color={COLORS.da_nhan.text}
            bgColor="#eff6ff"
          />
          <KpiCard
            label="Đã giải quyết"
            value={data?.da_giai_quyet ?? 0}
            color={COLORS.da_giai_quyet.text}
            bgColor="#f0fdf4"
          />
          <KpiCard
            label="Tồn sau"
            value={data?.ton_sau ?? 0}
            color={COLORS.ton_sau.text}
            bgColor="#fffbeb"
          />
        </div>
      </div>

      {/* Hàng biểu đồ tròn */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Biểu đồ 1: Đã giải quyết — Đúng hạn / Quá hạn */}
        <DonutChart
          title="Đã giải quyết — Đúng hạn / Quá hạn"
          total={gqData?.total ?? 0}
          segments={[
            { name: "Đúng hạn", value: gqData?.dung_han ?? 0, color: "#22c55e" },
            { name: "Quá hạn",  value: gqData?.qua_han  ?? 0, color: "#ef4444" },
          ]}
          isLoading={gqLoading}
          isError={gqError}
          emptyMessage="Không có hồ sơ đã giải quyết trong kỳ"
          spinnerColor="#22c55e"
        />

        {/* Biểu đồ 2: Tồn sau — Còn hạn / Quá hạn */}
        <DonutChart
          title="Tồn sau — Còn hạn / Quá hạn"
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

      {/* Bảng chi tiết theo chuyên viên */}
      <ChuyenVienTable thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {/* Biểu đồ xu hướng theo tháng */}
      <MonthlyTrendChart thuTuc={thuTuc} />
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

function DangXuLyTab({ thuTuc }: { thuTuc: 48 | 47 | 46 }) {
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

  // Aggregate totals for charts
  const totCv       = allRows.reduce((s, r) => s + r.cho_cv,        0);
  const totCg       = allRows.reduce((s, r) => s + r.cho_cg,        0);
  const totToTruong = allRows.reduce((s, r) => s + r.cho_to_truong, 0);
  const totTrp      = allRows.reduce((s, r) => s + r.cho_trp,       0);
  const totPct      = allRows.reduce((s, r) => s + r.cho_pct,       0);
  const totVanThu   = allRows.reduce((s, r) => s + r.cho_van_thu,   0);
  const totCon = allRows.reduce((s, r) => s + r.con_han, 0) + (cpc?.con_han ?? 0);
  const totQua = allRows.reduce((s, r) => s + r.qua_han, 0) + (cpc?.qua_han ?? 0);
  const grandTotal = totCon + totQua;
  const pctQua = grandTotal > 0 ? Math.round(totQua / grandTotal * 100) : 0;
  const pctCon = 100 - pctQua;

  const catData = [
    { name: "Chờ CV",         value: totCv,       fill: CHO_COLORS.cho_cv.fill        },
    { name: "Chờ CG",         value: totCg,       fill: CHO_COLORS.cho_cg.fill        },
    { name: "Chờ Tổ trưởng", value: totToTruong, fill: CHO_COLORS.cho_to_truong.fill },
    { name: "Chờ TrP",        value: totTrp,      fill: CHO_COLORS.cho_trp.fill       },
    { name: "Chờ PCT",        value: totPct,      fill: CHO_COLORS.cho_pct.fill       },
    { name: "Chờ Văn thư",   value: totVanThu,   fill: CHO_COLORS.cho_van_thu.fill   },
  ].filter(d => d.value > 0);

  const hanData = [
    { name: `Còn hạn (${pctCon}%)`, value: totCon, fill: "#3b82f6" },
    { name: `Quá hạn (${pctQua}%)`, value: totQua, fill: "#f97316" },
  ];

  const catTotal = catData.reduce((s, d) => s + d.value, 0);
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
    const pct = row.tong > 0 ? Math.round(row.qua_han / row.tong * 100) : 0;
    const isCpc = idx === null;
    const bgRow = isCpc ? "bg-amber-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const cvLabel = isCpc ? "Chờ phân công ..." : cleanCvName(row.cv_name);

    const chamSoNgay = row.cham_so_ngay;
    // Nếu quá hạn: dùng soNgayQuaHan; nếu còn hạn: dùng số ngày kể từ ngayTiepNhan
    const tgDisplay = chamSoNgay > 0
      ? chamSoNgay
      : row.cham_ngay
        ? Math.floor((Date.now() - new Date(row.cham_ngay).getTime()) / 86400000)
        : 0;
    const isOverdue = chamSoNgay > 0;
    const tgColor = isOverdue && tgDisplay >= 300 ? "text-red-600 font-bold"
      : isOverdue && tgDisplay >= 100 ? "text-orange-600 font-semibold"
      : "text-slate-600";

    return (
      <tr key={row.cv_name} className={`${bgRow} hover:bg-blue-50 transition-colors`}>
        {/* STT sticky */}
        <td className={`sticky left-0 z-10 px-1 py-1.5 text-center text-xs text-slate-400 w-9 ${bgRow}`}>
          {idx !== null ? idx + 1 : ""}
        </td>
        {/* CV name sticky */}
        <td className={`sticky left-9 z-10 px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[160px] max-w-[220px] ${bgRow}`}
            style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
          {cvLabel}
        </td>
        {/* TỔNG */}
        <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap ${row.tong > 100 ? "text-pink-700 bg-pink-50" : "text-slate-700"}`}>
          {row.tong}
        </td>
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
        {/* Chờ PCT */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_pct > 0 ? "text-purple-700 font-semibold" : "text-slate-300"}`}>
          {row.cho_pct || ""}
        </td>
        {/* Chờ Văn thư */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_van_thu > 0 ? "text-slate-600" : "text-slate-300"}`}>
          {row.cho_van_thu || ""}
        </td>
        {/* Còn hạn */}
        {numCell(row.con_han, row.con_han > 0 ? "text-blue-600" : "text-slate-300")}
        {/* Quá hạn */}
        <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap ${row.qua_han > 70 ? "bg-orange-100 text-orange-800" : row.qua_han > 0 ? "text-orange-700" : "text-slate-300"}`}>
          {row.qua_han || ""}
        </td>
        {/* % quá hạn */}
        {pctCell(row.qua_han, row.tong)}
        {/* Thời gian chờ */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 ${tgColor}`}>
          {tgDisplay > 0 ? `${tgDisplay} ngày` : ""}
        </td>
        {/* Nộp từ */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {isoToDisplay(row.cham_ngay)}
        </td>
        {/* Mã hs */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600 font-mono">
          {row.cham_ma ?? ""}
        </td>
      </tr>
    );
  };

  // Summary totals row
  const totRow      = [...allRows, ...(cpc ? [cpc] : [])];
  const sumTong     = totRow.reduce((s, r) => s + r.tong,          0);
  const sumCv       = totRow.reduce((s, r) => s + r.cho_cv,        0);
  const sumCg       = totRow.reduce((s, r) => s + r.cho_cg,        0);
  const sumToTruong = totRow.reduce((s, r) => s + r.cho_to_truong, 0);
  const sumTrp      = totRow.reduce((s, r) => s + r.cho_trp,       0);
  const sumPct      = totRow.reduce((s, r) => s + r.cho_pct,       0);
  const sumVanThu   = totRow.reduce((s, r) => s + r.cho_van_thu,   0);
  const sumCon      = totRow.reduce((s, r) => s + r.con_han,       0);
  const sumQua      = totRow.reduce((s, r) => s + r.qua_han,       0);

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
      <div className="grid grid-cols-3 gap-4">
        {/* Donut: Chờ CV / CG / TrP */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-1 text-center">Phân loại theo bước xử lý</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                dataKey="value" labelLine={false} label={renderPieLabel}>
                {catData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [v.toLocaleString("vi-VN"), ""]} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Pie: Còn hạn / Quá hạn */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-1 text-center">Còn hạn / Quá hạn</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={hanData} cx="50%" cy="50%" outerRadius={80}
                dataKey="value" labelLine={false} label={renderHanLabel}>
                {hanData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [v.toLocaleString("vi-VN"), ""]} />
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
              <Area type="monotone" dataKey="cnt" stroke="#3b82f6" fill="#93c5fd" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="sticky left-0 z-20 bg-slate-700 px-1 py-2 text-center w-9 text-xs" rowSpan={2}>STT</th>
                <th className="sticky left-9 z-20 bg-slate-700 px-3 py-2 text-left text-xs min-w-[160px]"
                    rowSpan={2} style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.15)" }}>
                  Chuyên viên
                </th>
                <th className="px-2 py-2 text-center text-xs bg-blue-600" colSpan={10}>ĐANG GIẢI QUYẾT</th>
                <th className="px-2 py-2 text-center text-xs bg-rose-700" colSpan={3}>Hồ sơ chậm nhất</th>
              </tr>
              <tr className="bg-slate-600 text-white">
                <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">TỔNG</th>
                <th className="px-2 py-1 text-center text-xs bg-blue-700">Chờ CV</th>
                <th className="px-2 py-1 text-center text-xs bg-green-600">Chờ CG</th>
                <th className="px-2 py-1 text-center text-xs bg-orange-400">Chờ Tổ<br/>trưởng</th>
                <th className="px-2 py-1 text-center text-xs bg-orange-600">Chờ TrP</th>
                <th className="px-2 py-1 text-center text-xs bg-purple-600">Chờ PCT</th>
                <th className="px-2 py-1 text-center text-xs bg-slate-500">Chờ<br/>Văn thư</th>
                <th className="px-2 py-1 text-center text-xs bg-green-700">Còn<br/>hạn</th>
                <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá<br/>hạn</th>
                <th className="px-2 py-1 text-center text-xs bg-orange-700">% quá<br/>hạn</th>
                <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
                <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
                <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Chờ phân công row */}
              {cpc && renderRow(cpc, null)}
              {/* CV rows */}
              {allRows.map((row, idx) => renderRow(row, idx))}
            </tbody>
            {/* Totals */}
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
                <td className="sticky left-0 z-10 bg-slate-100 px-1 py-2 text-center text-xs" />
                <td className="sticky left-9 z-10 bg-slate-100 px-3 py-2 text-xs font-bold"
                    style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>TỔNG</td>
                <td className="px-2 py-2 text-center text-xs font-bold text-slate-700">{sumTong}</td>
                <td className="px-2 py-2 text-center text-xs text-blue-700">{sumCv}</td>
                <td className="px-2 py-2 text-center text-xs text-green-700">{sumCg}</td>
                <td className="px-2 py-2 text-center text-xs text-emerald-700">{sumToTruong || ""}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700">{sumTrp}</td>
                <td className="px-2 py-2 text-center text-xs text-purple-700">{sumPct || ""}</td>
                <td className="px-2 py-2 text-center text-xs text-slate-600">{sumVanThu || ""}</td>
                <td className="px-2 py-2 text-center text-xs text-blue-600">{sumCon}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700 font-bold">{sumQua}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700">
                  {sumTong > 0 ? `${Math.round(sumQua / sumTong * 100)}%` : ""}
                </td>
                <td className="px-2 py-2 bg-rose-50" />
                <td className="px-2 py-2 bg-rose-50" />
                <td className="px-2 py-2 bg-rose-50" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {thuTuc === 48 && <ChuyenGiaTable thuTuc={thuTuc} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChuyenGiaTable — bảng thống kê chuyên gia (chỉ dùng cho TT48)
// ---------------------------------------------------------------------------
function ChuyenGiaTable({ thuTuc }: { thuTuc: number }) {
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
          {row.ten}
        </td>
        {/* TỔNG */}
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
        {/* Mã hs */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600 font-mono">
          {row.cham_ma ?? ""}
        </td>
        {/* CV thụ lý */}
        <td className="px-2 py-1.5 text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {cleanCv(row.cham_cv)}
        </td>
      </tr>
    );
  };

  const allRows = [...data.chuyen_gia, ...data.chuyen_vien_cg];
  const grandTong  = allRows.reduce((s, r) => s + r.tong,    0);
  const grandCon   = allRows.reduce((s, r) => s + r.con_han, 0);
  const grandQua   = allRows.reduce((s, r) => s + r.qua_han, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-green-700 text-white text-xs font-bold uppercase tracking-wide">
        Thống kê hồ sơ đang ở bước Chuyên gia thẩm định — TT{thuTuc}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-2 py-2 text-center text-xs w-9" rowSpan={2}>STT</th>
              <th className="px-3 py-2 text-left text-xs min-w-[160px]" rowSpan={2}>Chuyên gia</th>
              <th className="px-2 py-2 text-center text-xs bg-green-600" colSpan={3}>ĐANG GIẢI QUYẾT</th>
              <th className="px-2 py-2 text-center text-xs bg-rose-700" colSpan={4}>Hồ sơ chậm nhất</th>
            </tr>
            <tr className="bg-slate-600 text-white">
              <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">TỔNG</th>
              <th className="px-2 py-1 text-center text-xs bg-green-700">Còn hạn</th>
              <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá hạn</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hs</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Chuyên viên thụ lý</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Section 1: Chuyên gia */}
            <tr className="bg-green-600 text-white">
              <td colSpan={9} className="px-3 py-1 text-xs font-bold uppercase tracking-wide">
                Chuyên gia
              </td>
            </tr>
            {data.chuyen_gia.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-2 text-xs text-slate-400 italic text-center">Không có hồ sơ đang ở bước chuyên gia</td></tr>
            ) : (
              data.chuyen_gia.map((row, idx) => renderRow(row, idx, "bg-green-50"))
            )}
            {/* Section 2: Chuyên viên đóng vai chuyên gia */}
            <tr className="bg-amber-500 text-white">
              <td colSpan={9} className="px-3 py-1 text-xs font-bold uppercase tracking-wide">
                Chuyên viên đóng vai chuyên gia
              </td>
            </tr>
            {data.chuyen_vien_cg.map((row, idx) => renderRow(row, idx, "bg-amber-50"))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
              <td />
              <td className="px-3 py-2 text-xs font-bold">TỔNG</td>
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
const TABS = [
  { id: "tt48_thong_ke",  label: "THỐNG KÊ TT48",       content: () => <ThongKeTab thuTuc={48} /> },
  { id: "tt48_dang_xl",   label: "ĐANG XỬ LÝ TT48",     content: () => <DangXuLyTab thuTuc={48} /> },
  { id: "tt47_thong_ke",  label: "THỐNG KÊ TT47",        content: () => <ThongKeTab thuTuc={47} /> },
  { id: "tt47_dang_xl",   label: "ĐANG XỬ LÝ TT47",     content: () => <DangXuLyTab thuTuc={47} /> },
  { id: "tt46_thong_ke",  label: "THỐNG KÊ TT46",        content: () => <ThongKeTab thuTuc={46} /> },
  { id: "tt46_dang_xl",   label: "ĐANG XỬ LÝ TT46",     content: () => <DangXuLyTab thuTuc={46} /> },
] as const;

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
      const r = await fetch(`${API}/admin/db-stats?token=${tk()}`);
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
      const r = await fetch(`${API}/admin/scheduler?token=${tk()}`);
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
      const r = await fetch(`${API}/admin/force-sync?token=${tk()}`, { method: "POST" });
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

  // ---- Update scheduler interval ----
  const handleSchedulerSave = async () => {
    if (!hasToken) return;
    const h = parseFloat(schedulerHours);
    if (isNaN(h) || h <= 0) { setSchedulerMsg("⚠ Giá trị không hợp lệ"); return; }
    setSchedulerSaving(true);
    setSchedulerMsg(null);
    try {
      const r = await fetch(`${API}/admin/scheduler?token=${tk()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const r = await fetch(`${API}/admin/logs?token=${tk()}&lines=${n}`);
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
      const url = `${API}/admin/export/${tableId}?token=${tk()}`;
      const res = await fetch(url);
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
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const [showAdmin, setShowAdmin] = useState<boolean>(
    () => window.location.hash === "#admin"
  );

  // Trạng thái sync gần nhất — tự động refresh mỗi 5 phút
  const { data: syncStatus } = useQuery({
    queryKey: ["sync-status"],
    queryFn: fetchSyncStatus,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  // Filter state riêng cho từng tab Thống kê (48 / 47 / 46) — không bị reset khi chuyển tab
  const [filters, setFilters] = useState<Record<number, TabFilter>>({
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

  // Mở panel khi hash = #admin, đóng khi hash thay đổi
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#admin") setShowAdmin(true);
      else setShowAdmin(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Đóng panel bằng Esc
  useEffect(() => {
    if (!showAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAdmin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAdmin]);

  const closeAdmin = () => {
    setShowAdmin(false);
    if (window.location.hash === "#admin") {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  };

  return (
    <FiltersCtx.Provider value={filtersValue}>
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow flex-shrink-0">
            DAV
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800 leading-none">
              Dashboard Hồ Sơ PQLCL
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Cục Quản lý Dược</p>
          </div>
          {syncStatus && (() => {
            const iso = syncStatus.lastSyncedAt;
            if (!iso) return (
              <p className="text-xs text-slate-400 text-right leading-snug hidden sm:block">
                Dữ liệu cập nhật lần cuối<br />
                <span className="text-slate-400 italic">Chưa có dữ liệu sync</span>
                <span className="text-slate-400"> · {syncStatus.totalSizeMB.toFixed(2)} MB</span>
              </p>
            );
            const d   = new Date(iso);
            const dd  = String(d.getDate()).padStart(2, "0");
            const mm  = String(d.getMonth() + 1).padStart(2, "0");
            const hh  = String(d.getHours()).padStart(2, "0");
            const min = String(d.getMinutes()).padStart(2, "0");
            return (
              <p className="text-xs text-slate-400 text-right leading-snug hidden sm:block">
                Dữ liệu cập nhật lần cuối<br />
                <span className="font-medium text-slate-600">
                  {dd}-{mm}-{d.getFullYear()} lúc {hh}:{min}
                  {" "}({syncStatus.totalSizeMB.toFixed(2)} MB)
                </span>
              </p>
            );
          })()}
        </div>

        {/* Tab navigation */}
        <div className="max-w-screen-2xl mx-auto px-4 flex overflow-x-auto gap-0 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex-shrink-0 px-5 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700 bg-blue-50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <current.content />
      </main>

      {/* Admin Panel — chỉ hiển thị khi URL hash = #admin */}
      {showAdmin && <AdminPanel onClose={closeAdmin} />}
    </div>
    </FiltersCtx.Provider>
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

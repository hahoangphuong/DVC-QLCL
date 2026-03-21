import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend,
  ComposedChart, Line,
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
    da_nhan:         cvSum(rows, "da_nhan"),
    gq_tong:         cvSum(rows, "gq_tong"),
    can_bo_sung:     cvSum(rows, "can_bo_sung"),
    khong_dat:       cvSum(rows, "khong_dat"),
    hoan_thanh:      cvSum(rows, "hoan_thanh"),
    dung_han:        cvSum(rows, "dung_han"),
    qua_han:         cvSum(rows, "qua_han"),
    ton_sau_tong:    cvSum(rows, "ton_sau_tong"),
    ton_sau_con_han: cvSum(rows, "ton_sau_con_han"),
    ton_sau_qua_han: cvSum(rows, "ton_sau_qua_han"),
    treo:            cvSum(rows, "treo"),
  };
  const tot_pct_dh = totals.gq_tong > 0 ? Math.round(totals.dung_han / totals.gq_tong * 100) : 0;
  const tot_pct_gq = (totals.ton_truoc + totals.da_nhan) > 0
    ? Math.round(totals.gq_tong / (totals.ton_truoc + totals.da_nhan) * 100) : 0;

  function CvRow({ row, idx }: { row: ChuyenVienRow; idx: number }) {
    const bgCls  = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    const bg = bgCls;
    return (
      <tr className={`${bg} hover:bg-blue-50/40 transition-colors`}>
        <td className={`${tdC} text-slate-400`}
            style={{ ...stickySTT, backgroundColor: bgColor, width: STT_W, minWidth: STT_W }}>
          {idx + 1}
        </td>
        <td className={`${tdL} font-semibold text-slate-800 min-w-[160px]`}
            style={{ ...stickyCV, backgroundColor: bgColor }}>
          {cleanCvName(row.ten_cv)}
        </td>
        <td className={tdC}><Num v={row.ton_truoc} color="#be185d" bold /></td>
        <td className={tdC}><Num v={row.da_nhan}   color="#1d4ed8" bold /></td>
        <td className={`${tdC} font-bold text-slate-700`}><Num v={row.gq_tong} /></td>
        <td className={tdC}><Num v={row.can_bo_sung} color="#b45309" /></td>
        <td className={tdC}><Num v={row.khong_dat}   color="#dc2626" /></td>
        <td className={tdC}><Num v={row.hoan_thanh}  color="#15803d" /></td>
        <td className={tdC}><Num v={row.dung_han}    color="#15803d" /></td>
        <td className={tdC}><Num v={row.qua_han}     color="#dc2626" /></td>
        <td className={tdC}><Num v={row.tg_tb} color="#6b7280" /></td>
        <td className={tdC}><Pct v={row.pct_gq_dung_han} warnBelow={30} /></td>
        <td className={tdC}><Pct v={row.pct_da_gq} /></td>
        <td className={`${tdC} font-bold text-slate-700`}><Num v={row.ton_sau_tong} /></td>
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
              <th className={`${thC} bg-green-700 text-white`} colSpan={7}>Đã giải quyết</th>
              <th className={`${thC} bg-green-800 text-white`} rowSpan={2}>%&nbsp;GQ<br />đúng hạn</th>
              <th className={`${thC} bg-green-800 text-white`} rowSpan={2}>%&nbsp;đã<br />GQ</th>
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
                {cpc && cpc.ton_sau_tong > 0 && (
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
                    <td className={tdC}></td>
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
                    <td className={tdC}><Num v={cpc.treo} color="#ea580c" bold /></td>
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
  const init = getPreset("nam_nay");
  const [fromDate, setFromDate] = useState(init.from);
  const [toDate, setToDate]     = useState(init.to);
  const [fromInput, setFromInput] = useState(toDMY(init.from));
  const [toInput,   setToInput]   = useState(toDMY(init.to));
  const [activePreset, setActivePreset] = useState<string>("nam_nay");
  const [loadingAll, setLoadingAll]     = useState(false);

  const applyDates = useCallback((from: string, to: string, preset?: string) => {
    setFromDate(from);
    setToDate(to);
    setFromInput(toDMY(from));
    setToInput(toDMY(to));
    setActivePreset(preset ?? "");
  }, []);

  const handleTatCa = useCallback(async () => {
    setLoadingAll(true);
    try {
      const earliest = await fetchEarliestDate(48);
      const today = toYMD(new Date());
      applyDates(earliest, today, "tat_ca");
    } finally {
      setLoadingAll(false);
    }
  }, [applyDates]);

  const handleFromBlur = () => {
    const parsed = parseDMY(fromInput);
    if (parsed) { setFromDate(parsed); setActivePreset(""); }
    else setFromInput(toDMY(fromDate));
  };

  const handleToBlur = () => {
    const parsed = parseDMY(toInput);
    if (parsed) { setToDate(parsed); setActivePreset(""); }
    else setToInput(toDMY(toDate));
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
                onChange={(e) => setFromInput(e.target.value)}
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
                onChange={(e) => setToInput(e.target.value)}
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
// Tab: ĐANG XỬ LÝ (tab 2, 4, 6 — placeholder)
// ---------------------------------------------------------------------------
function DangXuLyTab({ thuTuc }: { thuTuc: 48 | 47 | 46 }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
      <div className="text-4xl mb-3">📋</div>
      <div className="font-medium">Dữ liệu hồ sơ đang xử lý TT{thuTuc}</div>
      <div className="text-xs mt-1">Sẽ được triển khai tiếp theo</div>
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
// Main Dashboard
// ---------------------------------------------------------------------------
function Dashboard() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow">
            DAV
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-none">
              Dashboard Hồ Sơ PQLCL
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Cục Quản lý Chất lượng Dược phẩm</p>
          </div>
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
    </div>
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

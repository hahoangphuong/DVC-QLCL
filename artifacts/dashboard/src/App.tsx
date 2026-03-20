import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend,
} from "recharts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";

const queryClient = new QueryClient();

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "/dashboard"

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
  if (key === "thang_truoc") {
    return { from: toYMD(new Date(y, m - 1, 1)), to: toYMD(new Date(y, m, 0)) };
  }
  if (key === "quy_nay") {
    const q = Math.floor(m / 3);
    return { from: toYMD(new Date(y, q * 3, 1)), to: toYMD(new Date(y, q * 3 + 3, 0)) };
  }
  if (key === "quy_truoc") {
    const q = Math.floor(m / 3) - 1;
    const qy = q < 0 ? y - 1 : y;
    const qn = q < 0 ? 3 : q;
    return { from: toYMD(new Date(qy, qn * 3, 1)), to: toYMD(new Date(qy, qn * 3 + 3, 0)) };
  }
  if (key === "nam_nay") {
    return { from: toYMD(new Date(y, 0, 1)), to: toYMD(new Date(y, 11, 31)) };
  }
  return { from: toYMD(new Date(y, 0, 1)), to: toYMD(now) };
}

const QUICK_FILTERS = [
  { key: "thang_nay",   label: "Tháng này" },
  { key: "thang_truoc", label: "Tháng trước" },
  { key: "quy_nay",     label: "Quý này" },
  { key: "quy_truoc",   label: "Quý trước" },
  { key: "nam_nay",     label: "Năm nay" },
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
  const url = `${BASE}/api/stats/summary?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchEarliestDate(thuTuc: number): Promise<string> {
  const url = `${BASE}/api/stats/earliest-date?thu_tuc=${thuTuc}`;
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
  const url = `${BASE}/api/stats/giai-quyet?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
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
  const url = `${BASE}/api/stats/ton-sau?thu_tuc=${thuTuc}&to_date=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface ChuyenVienRow {
  ten_cv:    string;
  ton_truoc: number;
  da_nhan:   number;
}

interface ChuyenVienData {
  thu_tuc:   number;
  from_date: string;
  to_date:   string;
  rows:      ChuyenVienRow[];
}

async function fetchChuyenVien(thuTuc: number, fromDate: string, toDate: string): Promise<ChuyenVienData> {
  const url = `${BASE}/api/stats/chuyen-vien?thu_tuc=${thuTuc}&from_date=${fromDate}&to_date=${toDate}`;
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
// Bảng chi tiết theo chuyên viên
// ---------------------------------------------------------------------------
const CV_PREFIX = "CV thụ lý : ";

function cleanCvName(raw: string): string {
  return raw.startsWith(CV_PREFIX) ? raw.slice(CV_PREFIX.length).trim() : raw.trim();
}

interface ChuyenVienTableProps {
  thuTuc:    48 | 47 | 46;
  fromDate:  string;
  toDate:    string;
}

function ChuyenVienTable({ thuTuc, fromDate, toDate }: ChuyenVienTableProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-vien", thuTuc, fromDate, toDate],
    queryFn:  () => fetchChuyenVien(thuTuc, fromDate, toDate),
    enabled:  !!fromDate && !!toDate,
    retry: 2,
  });

  const rows = data?.rows ?? [];
  const totTonTruoc = rows.reduce((s, r) => s + r.ton_truoc, 0);
  const totDaNhan   = rows.reduce((s, r) => s + r.da_nhan,   0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Chi tiết theo chuyên viên — TT{thuTuc}
        </h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium">Đang tải...</span>}
        {isError   && <span className="text-xs text-red-500 font-medium">Lỗi tải dữ liệu</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide w-10">STT</th>
              <th className="px-4 py-3 text-left   text-xs font-bold text-slate-500 uppercase tracking-wide">Tên chuyên viên</th>
              <th className="px-4 py-3 text-center  text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.ton_truoc.text }}>Tồn trước</th>
              <th className="px-4 py-3 text-center  text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.da_nhan.text }}>Đã nhận</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <span>Đang tải...</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={row.ten_cv}
                  className={[
                    "border-b border-slate-100 transition-colors",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                    "hover:bg-blue-50/40",
                  ].join(" ")}
                >
                  <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{cleanCvName(row.ten_cv)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold" style={{ color: row.ton_truoc > 0 ? COLORS.ton_truoc.text : "#94a3b8" }}>
                      {row.ton_truoc.toLocaleString("vi-VN")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold" style={{ color: row.da_nhan > 0 ? COLORS.da_nhan.text : "#94a3b8" }}>
                      {row.da_nhan.toLocaleString("vi-VN")}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">Tổng cộng</td>
                <td className="px-4 py-3 text-center text-sm font-bold" style={{ color: COLORS.ton_truoc.text }}>
                  {totTonTruoc.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-3 text-center text-sm font-bold" style={{ color: COLORS.da_nhan.text }}>
                  {totDaNhan.toLocaleString("vi-VN")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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
      const earliest = await fetchEarliestDate(thuTuc);
      const today = toYMD(new Date());
      applyDates(earliest, today, "tat_ca");
    } finally {
      setLoadingAll(false);
    }
  }, [thuTuc, applyDates]);

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

          {/* Nút lọc nhanh */}
          <div className="flex flex-wrap gap-2">
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

import { Fragment, useState, useCallback, useEffect, useMemo, useDeferredValue } from "react";
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
import { CHART_ANIMATION_MS } from "./shared/chartConfig";
import { clampToToday, parseDMY, toDMY, toYMD } from "./shared/dateUtils";
import { isoToDisplay } from "./shared/displayFormatters";
import { DashboardAuthGate } from "./features/auth/DashboardAuthGate";
import { useDashboardAuth } from "./features/auth/useDashboardAuth";
import { AdminPanel } from "./features/admin/AdminPanel";
import { AdminPanelMount } from "./features/admin/AdminPanelMount";
import { useAdminPanelShell } from "./features/admin/useAdminPanelShell";
import { DashboardShellHeader } from "./features/layout/DashboardShellHeader";
import { useDashboardSyncStatus } from "./features/layout/useDashboardSyncStatus";
import { useDashboardLookupState } from "./features/lookup/useDashboardLookupState";
import { LookupDoneTab } from "./features/lookup/LookupDoneTab";
import { LookupPendingTab } from "./features/lookup/LookupPendingTab";
import {
  DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
  DEFAULT_TRA_CUU_FILTER_STATE,
  type TraCuuFilterState,
} from "./features/lookup/lookupShared";
import { DashboardContentSwitch } from "./features/navigation/DashboardContentSwitch";
import { DashboardTabPanels } from "./features/navigation/DashboardTabPanels";
import { DEFAULT_DASHBOARD_TAB_ID, type DashboardTabId } from "./features/navigation/dashboardTabs";
import { useDashboardTabAccess } from "./features/navigation/useDashboardTabAccess";
import { useDashboardNavigation } from "./features/navigation/useDashboardNavigation";
import { DangXuLyTab as PendingDangXuLyTab } from "./features/pending/PendingTabs";
import { ChuyenVienTable } from "./features/stats/ChuyenVienTable";
import { OverviewTab } from "./features/stats/OverviewTab";
import { DonutChart, SummaryBarChart } from "./features/stats/StatsCharts";
import { ThongKeTab } from "./features/stats/ThongKeTab";
import {
  renderTt48ExpandCell,
  renderTt48GroupTotal,
  renderTt48InlineValueWithPct,
  renderTt48Num,
  renderTt48SubRow,
  type Tt48LoaiHoSoSubRowValues,
} from "./features/stats/tt48LoaiHoSoDisplay";
import {
  COLORS,
  QUICK_FILTERS,
  TT48_LOAI_LABELS,
  fetchEarliestDate,
  fetchGiaiQuyet,
  fetchMonthly,
  fetchSummary,
  fetchTonSau,
  fetchTt48LoaiHoSo,
  fetchTt48ReceivedMonthlyLoai,
  getPreset,
  type GiaiQuyetData,
  type MonthData,
  type MonthlyData,
  type SummaryData,
  type TabFilter,
  type TonSauData,
  type Tt48LoaiHoSoData,
  type Tt48LoaiHoSoRow,
  type Tt48ReceivedMonthlyLoaiData,
  type Tt48ReceivedMonthlyLoaiRow,
} from "./features/stats/statsShared";
import { useDashboardStatsFilters } from "./features/stats/useDashboardStatsFilters";

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

  const renderExpandCell = (key: string, label: string, isTotal = false) =>
    renderTt48ExpandCell(key, label, expandedRows, toggleRow, tdL, isTotal);
  const renderSubRow = (key: string, label: string, values: Tt48LoaiHoSoSubRowValues, isTotal = false) =>
    renderTt48SubRow({
      key,
      label,
      values,
      totals,
      tdC,
      tdL,
      numCell: renderTt48Num,
      renderInlineValueWithPct: renderTt48InlineValueWithPct,
      isTotal,
    });


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
                {renderTt48ExpandCell(row.loai_ho_so, TT48_LOAI_LABELS[row.loai_ho_so] ?? row.loai_ho_so, expandedRows, toggleRow, tdL)}
                <td className={`${tdC} bg-pink-50/70`}>{renderTt48GroupTotal(row.ton_truoc_total, totals.ton_truoc_total, "text-pink-700")}</td>
                {renderTt48Num(row.ton_truoc_hinh_thuc_1, `${tdC} bg-pink-50/70 text-slate-700`)}
                {renderTt48Num(row.ton_truoc_hinh_thuc_2, `${tdC} bg-pink-50/70 text-slate-700`)}
                <td className={`${tdC} bg-blue-50/70`}>{renderTt48GroupTotal(row.da_nhan_total, totals.da_nhan_total, "text-blue-700")}</td>
                {renderTt48Num(row.da_nhan_hinh_thuc_1, `${tdC} bg-blue-50/70 text-slate-700`)}
                {renderTt48Num(row.da_nhan_hinh_thuc_2, `${tdC} bg-blue-50/70 text-slate-700`)}
                <td className={`${tdC} bg-green-50/80`}>{renderTt48GroupTotal(row.giai_quyet_total, totals.giai_quyet_total, "text-green-700")}</td>
                {renderTt48Num(row.giai_quyet_hinh_thuc_1, `${tdC} bg-green-50/80 text-slate-700`)}
                {renderTt48Num(row.giai_quyet_hinh_thuc_2, `${tdC} bg-green-50/80 text-slate-700`)}
                <td className={`${tdC} bg-amber-50/80`}>{renderTt48GroupTotal(row.ton_total, totals.ton_total, "text-amber-700")}</td>
                {renderTt48Num(row.ton_hinh_thuc_1, `${tdC} bg-amber-50/80 text-slate-700`)}
                {renderTt48Num(row.ton_hinh_thuc_2, `${tdC} bg-amber-50/80 text-slate-700`)}
                {renderTt48Num(row.treo, `${tdC} bg-orange-50 font-bold text-orange-700`)}
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
              {renderTt48Num(totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_truoc_hinh_thuc_1, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_truoc_hinh_thuc_2, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderTt48Num(totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.da_nhan_hinh_thuc_1, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.da_nhan_hinh_thuc_2, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderTt48Num(totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.giai_quyet_hinh_thuc_1, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.giai_quyet_hinh_thuc_2, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderTt48Num(totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_hinh_thuc_1, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_hinh_thuc_2, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderTt48Num(totals.treo, `${tdC} text-orange-700 font-bold`)}
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

function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>(DEFAULT_DASHBOARD_TAB_ID);
  const [showAdmin, setShowAdmin] = useState(false);
  const [hideEmptyExperts, setHideEmptyExperts] = useState(true);
  const {
    lookupState,
    setLookupState,
    lookupDoneState,
    setLookupDoneState,
    resetLookupStates,
  } = useDashboardLookupState();
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
      resetLookupStates();
      setActiveTab(DEFAULT_DASHBOARD_TAB_ID);
    },
  });
  const isAdmin = authRole === "admin";
  const { visibleTabs } = useDashboardTabAccess({
    isAdmin,
    activeTab,
    setActiveTab,
  });
  const { openAdmin, closeAdmin } = useAdminPanelShell({
    isAdmin,
    showAdmin,
    setShowAdmin,
  });

  const { data: syncStatus } = useDashboardSyncStatus(authRole);

  // Filter state riêng cho từng tab Thống kê (48 / 47 / 46) — không bị reset khi chuyển tab
  const {
    Provider: StatsFiltersProvider,
    filtersValue,
    updateFilter,
  } = useDashboardStatsFilters();

  const {
    openLookupByChuyenVien,
    openLookupByChuyenGia,
    openLookupByTinhTrang,
    openLookupDoneByChuyenVien,
    openLookupDoneByTinhTrang,
    openThongKeFromTongQuan,
    openDangXuLyFromTongQuan,
  } = useDashboardNavigation({
    isAdmin,
    defaultLookupState: DEFAULT_TRA_CUU_FILTER_STATE,
    defaultLookupDoneState: DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
    setLookupState,
    setLookupDoneState,
    setActiveTab,
    updateFilter,
  });

  const renderTabContent = (tabId: DashboardTabId) => (
    <DashboardContentSwitch
      tabId={tabId}
      renderTongQuan={() => (
        <OverviewTab
          onOpenThongKe={openThongKeFromTongQuan}
          onOpenDangXuLy={openDangXuLyFromTongQuan}
          renderMonthlyTrend={(thuTuc, fromDate, toDate) => (
            <MonthlyTrendChart thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} hideTitle />
          )}
        />
      )}
      renderThongKe={(thuTuc) => (
        <ThongKeTab
          thuTuc={thuTuc}
          renderChuyenVienTable={(tt, fromDate, toDate) => (
            <ChuyenVienTable
              thuTuc={tt}
              fromDate={fromDate}
              toDate={toDate}
              onCvClick={(tenCvRaw) => openLookupDoneByChuyenVien(tenCvRaw, tt)}
              onTinhTrangClick={(tinhTrang) => openLookupDoneByTinhTrang(tt, tinhTrang)}
            />
          )}
          renderMonthlyTrend={(tt, fromDate, toDate) => (
            <MonthlyTrendChart thuTuc={tt} fromDate={fromDate} toDate={toDate} />
          )}
          renderTt48LoaiHoSoTable={(fromDate, toDate) => (
            <Tt48LoaiHoSoTable fromDate={fromDate} toDate={toDate} />
          )}
          renderTt48LoaiHoSoMonthlyChart={(fromDate, toDate) => (
            <Tt48LoaiHoSoMonthlyChart fromDate={fromDate} toDate={toDate} />
          )}
        />
      )}
      renderDangXuLy={(thuTuc) =>
        thuTuc === 48 ? (
          <PendingDangXuLyTab
            thuTuc={48}
            onCvLookup={openLookupByChuyenVien}
            onCgLookup={openLookupByChuyenGia}
            onTinhTrangLookup={openLookupByTinhTrang}
            hideEmptyExperts={hideEmptyExperts}
            setHideEmptyExperts={setHideEmptyExperts}
          />
        ) : (
          <PendingDangXuLyTab thuTuc={thuTuc} onCvLookup={openLookupByChuyenVien} />
        )
      }
      renderLookupDangXuLy={() =>
        isAdmin ? <LookupPendingTab state={lookupState} setState={setLookupState} isActive={activeTab === "tra_cuu_dang_xl"} /> : null
      }
      renderLookupDaXuLy={() =>
        isAdmin ? <LookupDoneTab state={lookupDoneState} setState={setLookupDoneState} isActive={activeTab === "tra_cuu_da_xl"} /> : null
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
      <StatsFiltersProvider value={filtersValue}>
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
      </StatsFiltersProvider>
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

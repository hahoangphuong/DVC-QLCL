import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_ANIMATION_MS } from "../../shared/chartConfig";
import {
  fetchTt48ReceivedMonthlyBreakdown,
  type Tt48MonthlyReceivedCategory,
  type Tt48MonthlyReceivedGroupBy,
  type Tt48ReceivedMonthlyRow,
} from "./statsShared";

type ViewMode = "month" | "year";

const GROUP_BY_OPTIONS: Array<{ value: Tt48MonthlyReceivedGroupBy; label: string }> = [
  { value: "loai_ho_so", label: "Theo Loại hồ sơ" },
  { value: "hinh_thuc", label: "Theo Hình thức" },
  { value: "submission_kind", label: "Theo Lần nộp" },
];

function renderBarLabel(fill: string) {
  return (props: any) => {
    const { x, y, width, height, value } = props;
    if (!value) return null;
    const cx = (x ?? 0) + (width ?? 0) / 2;
    if ((height ?? 0) < 16) {
      return (
        <text
          x={cx}
          y={(y ?? 0) - 4}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize={9}
          fill={fill}
          fontWeight={600}
        >
          {value}
        </text>
      );
    }
    if ((width ?? 0) >= 18) {
      return (
        <text
          x={cx}
          y={(y ?? 0) + Math.max(12, (height ?? 0) / 2)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={9}
          fill={fill}
          fontWeight={600}
        >
          {value}
        </text>
      );
    }
    const cy = (y ?? 0) + 13;
    return (
      <text
        x={cx}
        y={cy}
        transform={`rotate(-90, ${cx}, ${cy})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fill={fill}
        fontWeight={600}
      >
        {value}
      </text>
    );
  };
}

export function Tt48LoaiHoSoMonthlyChart({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [showLabels, setShowLabels] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [groupBy, setGroupBy] = useState<Tt48MonthlyReceivedGroupBy>("loai_ho_so");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tt48-monthly-received", groupBy],
    queryFn: () => fetchTt48ReceivedMonthlyBreakdown(groupBy),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const allMonths = data?.months ?? [];
  const categories = data?.categories ?? [];
  const [fy, fm] = fromDate ? [+fromDate.slice(0, 4), +fromDate.slice(5, 7)] : [0, 0];
  const [ty, tm] = toDate ? [+toDate.slice(0, 4), +toDate.slice(5, 7)] : [9999, 12];
  const months = allMonths.filter((item) => {
    const after = Number(item.year) > fy || (Number(item.year) === fy && Number(item.month) >= fm);
    const before = Number(item.year) < ty || (Number(item.year) === ty && Number(item.month) <= tm);
    return after && before;
  });

  useEffect(() => {
    setViewMode(months.length > 30 ? "year" : "month");
  }, [groupBy, fromDate, toDate, months.length]);

  const chartData = useMemo(() => {
    if (viewMode === "month") return months;

    const byYear = new Map<number, Tt48ReceivedMonthlyRow>();
    for (const item of months) {
      const year = Number(item.year);
      const existing = byYear.get(year);
      if (!existing) {
        const seed: Tt48ReceivedMonthlyRow = {
          label: String(year),
          year,
          month: Number(item.month),
          total: Number(item.total ?? 0),
        };
        for (const category of categories) {
          seed[category.key] = Number(item[category.key] ?? 0);
        }
        byYear.set(year, seed);
        continue;
      }

      existing.total = Number(existing.total ?? 0) + Number(item.total ?? 0);
      existing.month = Math.max(Number(existing.month), Number(item.month));
      for (const category of categories) {
        existing[category.key] = Number(existing[category.key] ?? 0) + Number(item[category.key] ?? 0);
      }
    }
    return Array.from(byYear.values()).sort((left, right) => Number(left.year) - Number(right.year));
  }, [categories, months, viewMode]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (isError || chartData.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            {"Hồ sơ tiếp nhận theo phân loại"}
          </h3>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as Tt48MonthlyReceivedGroupBy)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition-colors hover:border-blue-400 focus:border-blue-500"
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={[
                "rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                viewMode === "month"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700",
              ].join(" ")}
            >
              {"Theo tháng"}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("year")}
              className={[
                "rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                viewMode === "year"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700",
              ].join(" ")}
            >
              {"Theo năm"}
            </button>
          </div>
          {categories.map((item: Tt48MonthlyReceivedCategory) => (
            <span key={item.key} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: item.color }} /> {item.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-violet-600" /> {"Tổng"}
          </span>
          <label className="ml-1 flex cursor-pointer select-none items-center gap-1 border-l border-slate-200 pl-4">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-blue-600"
            />
            <span>{"Hiện số liệu"}</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={chartData}
          barGap={2}
          margin={{ top: showLabels ? 16 : 20, right: 30, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            interval={chartData.length > 24 ? Math.floor(chartData.length / 24) : 0}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={45} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number, name: string) => {
              const label = categories.find((item) => item.key === name)?.label ?? (name === "total" ? "Tổng" : name);
              return [value.toLocaleString("vi-VN"), label];
            }}
          />
          {categories.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="tt48-received"
              fill={item.color}
              name={item.key}
              radius={index === categories.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
              animationDuration={CHART_ANIMATION_MS}
            >
              {showLabels && <LabelList dataKey={item.key} content={renderBarLabel(item.color)} />}
            </Bar>
          ))}
          <Line
            type="monotone"
            dataKey="total"
            stroke="#7c3aed"
            strokeWidth={3}
            dot={chartData.length <= 24}
            activeDot={{ r: 5 }}
            name="total"
            animationDuration={CHART_ANIMATION_MS}
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

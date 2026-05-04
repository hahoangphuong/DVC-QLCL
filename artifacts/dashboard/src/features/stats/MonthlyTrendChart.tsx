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
import { fetchMonthly, type SupportedThuTuc } from "./statsShared";

export function MonthlyTrendChart({
  thuTuc,
  fromDate,
  toDate,
  hideTitle = false,
}: {
  thuTuc: SupportedThuTuc;
  fromDate: string;
  toDate: string;
  hideTitle?: boolean;
}) {
  const [showLabels, setShowLabels] = useState(false);
  const [viewMode, setViewMode] = useState<"month" | "year">("month");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["monthly", thuTuc],
    queryFn: () => fetchMonthly(thuTuc),
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

  useEffect(() => {
    setViewMode(months.length > 30 ? "year" : "month");
  }, [thuTuc, fromDate, toDate, months.length]);

  const chartData = useMemo(() => {
    if (viewMode === "month") return months;

    const byYear = new Map<number, { label: string; year: number; month: number; da_nhan: number; da_giai_quyet: number; ton_sau: number }>();
    for (const item of months) {
      const existing = byYear.get(item.year);
      if (existing) {
        existing.da_nhan += item.da_nhan;
        existing.da_giai_quyet += item.da_giai_quyet;
        existing.ton_sau += item.ton_sau;
      } else {
        byYear.set(item.year, {
          label: String(item.year),
          year: item.year,
          month: 0,
          da_nhan: item.da_nhan,
          da_giai_quyet: item.da_giai_quyet,
          ton_sau: item.ton_sau,
        });
      }
    }
    return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  }, [months, viewMode]);

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
      <div className="flex items-center justify-between mb-4">
        {!hideTitle ? (
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            {"Bi\u1ec3u \u0111\u1ed3 xu h\u01b0\u1edbng"}
          </h3>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
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
              {"Theo th\u00e1ng"}
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
              {"Theo n\u0103m"}
            </button>
          </div>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#60a5fa]" /> {"Ti\u1ebfp nh\u1eadn"}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#34d399]" /> {"Gi\u1ea3i quy\u1ebft"}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> {"H\u1ed3 s\u01a1 t\u1ed3n"}
          </span>
          <label className="flex items-center gap-1 cursor-pointer select-none border-l border-slate-200 pl-4 ml-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-3 h-3 accent-blue-600 cursor-pointer"
            />
            <span>{"Hi\u1ec7n s\u1ed1 li\u1ec7u"}</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={chartData}
          margin={{ top: showLabels ? 10 : 20, right: 30, bottom: 5, left: 10 }}
          barGap={2}
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
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} width={45} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} width={55} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                da_nhan: "Ti\u1ebfp nh\u1eadn",
                da_giai_quyet: "Gi\u1ea3i quy\u1ebft",
                ton_sau: "H\u1ed3 s\u01a1 t\u1ed3n",
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
                        fill="#1e40af"
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
                        fill="#1e40af"
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
                      fill="#1e40af"
                      fontWeight={600}
                    >
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
                        fill="#065f46"
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
                        fill="#065f46"
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
                      fill="#065f46"
                      fontWeight={600}
                    >
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
            dot={chartData.length <= 24}
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

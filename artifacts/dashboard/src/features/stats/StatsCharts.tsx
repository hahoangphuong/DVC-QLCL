import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_ANIMATION_MS } from "../../shared/chartConfig";

const OVERVIEW_BAR_CHART_HEIGHT = 224;
const OVERVIEW_DONUT_CHART_HEIGHT = 188;
const OVERVIEW_DONUT_INNER_RADIUS = 50;
const OVERVIEW_DONUT_OUTER_RADIUS = 80;

export interface BarData {
  name: string;
  value: number;
  color: string;
}

export function SummaryBarChart({ data }: { data: BarData[] }) {
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
    <ResponsiveContainer width="100%" height={OVERVIEW_BAR_CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 16, right: 20, left: -10, bottom: 2 }}>
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

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  title: string;
  segments: DonutSegment[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  emptyMessage?: string;
  spinnerColor?: string;
  startAngle?: number;
  endAngle?: number;
}

export function DonutChart({
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
          <text
            x={sx}
            y={sy}
            fill="#fff"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fontWeight={700}
          >
            {pct}%
          </text>
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
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="relative mb-1 flex items-center justify-center">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide text-center">{title}</h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium absolute right-0">Đang tải...</span>}
        {isError && <span className="text-xs text-red-500 font-medium absolute right-0">Lỗi tải dữ liệu</span>}
      </div>

      {isLoading ? (
        <div className="flex min-h-[236px] flex-1 items-center justify-center">
          <div
            className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: `${spinnerColor} transparent transparent transparent` }}
          />
        </div>
      ) : total === 0 ? (
        <div className="flex min-h-[236px] flex-1 flex-col items-center justify-center text-slate-400 text-sm">
          <div className="text-3xl mb-2">—</div>
          <div>{emptyMessage ?? "Không có dữ liệu"}</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center">
          <div className="flex min-h-[188px] w-full flex-1 items-center justify-center">
            <ResponsiveContainer width="100%" height={OVERVIEW_DONUT_CHART_HEIGHT}>
              <PieChart>
                <Pie
                  data={segments}
                  cx="50%"
                  cy="52%"
                  innerRadius={OVERVIEW_DONUT_INNER_RADIUS}
                  outerRadius={OVERVIEW_DONUT_OUTER_RADIUS}
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
          </div>

          <div className="mt-1 flex flex-wrap justify-center gap-x-6 gap-y-1">
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

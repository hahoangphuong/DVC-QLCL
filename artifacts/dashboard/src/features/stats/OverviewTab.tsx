import { useState, type ReactNode } from "react";
import { toDMY } from "../../shared/dateUtils";
import { useTabFilter } from "./statsFilterContext";
import type { TabFilter } from "./statsShared";
import { ThongKeDateFilterPanel, ThongKeOverviewCharts } from "./StatsOverview";

export function OverviewTab({
  onOpenThongKe,
  onOpenDangXuLy,
  renderMonthlyTrend,
}: {
  onOpenThongKe: (thuTuc: 48 | 47 | 46, filter: TabFilter) => void;
  onOpenDangXuLy: (thuTuc: 48 | 47 | 46) => void;
  renderMonthlyTrend: (thuTuc: 48 | 47 | 46, fromDate: string, toDate: string) => ReactNode;
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
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{`T\u1ed4NG QUAN TT${thuTuc}`}</h2>
            <div className="flex items-center gap-2">
              <div className="mr-2 text-xs font-medium text-slate-500">
                {"K\u1ef2 TH\u1ed0NG K\u00ca: "}
                <span className="text-slate-700">{toDMY(fromDate)}</span>
                {" \u2192 "}
                <span className="text-slate-700">{toDMY(toDate)}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenThongKe(thuTuc, currentFilter)}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 hover:bg-blue-50"
              >
                {"CHI TI\u1ebeT TH\u1ed0NG K\u00ca"}
              </button>
              <button
                type="button"
                onClick={() => onOpenDangXuLy(thuTuc)}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
              >
                {"CHI TI\u1ebeT \u0110ANG X\u1eec L\u00dd"}
              </button>
            </div>
          </div>
          <ThongKeOverviewCharts thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />
          <div className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedMonthly((prev) => ({ ...prev, [thuTuc]: !prev[thuTuc] }))}
              className="flex w-full items-center gap-2 px-5 py-3 text-left"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
                {expandedMonthly[thuTuc] ? "\u2212" : "+"}
              </span>
              <span className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {`XU H\u01af\u1edaNG THEO TH\u00c1NG \u2014 TT${thuTuc}`}
              </span>
            </button>
            {expandedMonthly[thuTuc] && <div className="px-4 pb-4">{renderMonthlyTrend(thuTuc, fromDate, toDate)}</div>}
          </div>
        </section>
      ))}
    </div>
  );
}

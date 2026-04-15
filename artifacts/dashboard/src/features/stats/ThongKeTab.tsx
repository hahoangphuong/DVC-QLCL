import type { ReactNode } from "react";
import { ThongKeDateFilterPanel, ThongKeOverviewCharts } from "./StatsOverview";
import { useTabFilter } from "./statsFilterContext";

export function ThongKeTab({
  thuTuc,
  renderChuyenVienTable,
  renderMonthlyTrend,
  renderTt48LoaiHoSoTable,
  renderTt48LoaiHoSoMonthlyChart,
}: {
  thuTuc: 48 | 47 | 46;
  renderChuyenVienTable: (thuTuc: 48 | 47 | 46, fromDate: string, toDate: string) => ReactNode;
  renderMonthlyTrend: (thuTuc: 48 | 47 | 46, fromDate: string, toDate: string) => ReactNode;
  renderTt48LoaiHoSoTable?: (fromDate: string, toDate: string) => ReactNode;
  renderTt48LoaiHoSoMonthlyChart?: (fromDate: string, toDate: string) => ReactNode;
}) {
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

      {renderChuyenVienTable(thuTuc, fromDate, toDate)}

      {renderMonthlyTrend(thuTuc, fromDate, toDate)}

      {thuTuc === 48 && renderTt48LoaiHoSoTable?.(fromDate, toDate)}
      {thuTuc === 48 && renderTt48LoaiHoSoMonthlyChart?.(fromDate, toDate)}
    </div>
  );
}

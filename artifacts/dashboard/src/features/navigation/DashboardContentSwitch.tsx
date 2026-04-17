import type { ReactNode } from "react";
import type { SupportedThuTuc } from "../stats/statsShared";
import type { DashboardTabId } from "./dashboardTabs";

export type DashboardContentSwitchProps = {
  tabId: DashboardTabId;
  renderTongQuan: () => ReactNode;
  renderThongKe: (thuTuc: SupportedThuTuc) => ReactNode;
  renderDangXuLy: (thuTuc: SupportedThuTuc) => ReactNode;
  renderLookupDangXuLy: () => ReactNode;
  renderLookupDaXuLy: () => ReactNode;
};

export function DashboardContentSwitch({
  tabId,
  renderTongQuan,
  renderThongKe,
  renderDangXuLy,
  renderLookupDangXuLy,
  renderLookupDaXuLy,
}: DashboardContentSwitchProps) {
  switch (tabId) {
    case "tong_quan":
      return <>{renderTongQuan()}</>;
    case "tt48_thong_ke":
      return <>{renderThongKe(48)}</>;
    case "tt48_dang_xl":
      return <>{renderDangXuLy(48)}</>;
    case "tt47_thong_ke":
      return <>{renderThongKe(47)}</>;
    case "tt47_dang_xl":
      return <>{renderDangXuLy(47)}</>;
    case "tt46_thong_ke":
      return <>{renderThongKe(46)}</>;
    case "tt46_dang_xl":
      return <>{renderDangXuLy(46)}</>;
    case "tra_cuu_dang_xl":
      return <>{renderLookupDangXuLy()}</>;
    case "tra_cuu_da_xl":
      return <>{renderLookupDaXuLy()}</>;
    default:
      return null;
  }
}

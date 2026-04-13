import { useEffect, useMemo } from "react";
import { DASHBOARD_TABS, DEFAULT_DASHBOARD_TAB_ID, type DashboardTabId } from "./dashboardTabs";

type Params = {
  isAdmin: boolean;
  activeTab: DashboardTabId;
  setActiveTab: (tabId: DashboardTabId) => void;
};

export function useDashboardTabAccess({ isAdmin, activeTab, setActiveTab }: Params) {
  const visibleTabs = useMemo(
    () => (isAdmin ? DASHBOARD_TABS : DASHBOARD_TABS.filter((tab) => !tab.adminOnly)),
    [isAdmin]
  );

  useEffect(() => {
    if (!isAdmin && (activeTab === "tra_cuu_dang_xl" || activeTab === "tra_cuu_da_xl")) {
      setActiveTab(DEFAULT_DASHBOARD_TAB_ID);
    }
  }, [activeTab, isAdmin, setActiveTab]);

  return {
    visibleTabs,
  };
}

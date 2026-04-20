import { useEffect, useMemo } from "react";
import {
  DASHBOARD_TABS,
  DEFAULT_DASHBOARD_TAB_ID,
  isAdminOnlyDashboardTab,
  type DashboardTabId,
  type DashboardTabSetter,
} from "./dashboardTabs";

type Params = {
  isAdmin: boolean;
  activeTab: DashboardTabId;
  setActiveTab: DashboardTabSetter;
};

export function useDashboardTabAccess({ isAdmin, activeTab, setActiveTab }: Params) {
  const visibleTabs = useMemo(
    () => (isAdmin ? DASHBOARD_TABS : DASHBOARD_TABS.filter((tab) => !tab.adminOnly)),
    [isAdmin]
  );

  useEffect(() => {
    if (!isAdmin && isAdminOnlyDashboardTab(activeTab)) {
      setActiveTab(DEFAULT_DASHBOARD_TAB_ID);
    }
  }, [activeTab, isAdmin, setActiveTab]);

  return {
    visibleTabs,
  };
}

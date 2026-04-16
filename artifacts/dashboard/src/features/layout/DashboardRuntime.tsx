import { useState } from "react";
import { DashboardAuthGate } from "../auth/DashboardAuthGate";
import { useDashboardAuth } from "../auth/useDashboardAuth";
import { AdminPanel } from "../admin/AdminPanel";
import { AdminPanelMount } from "../admin/AdminPanelMount";
import { useAdminPanelShell } from "../admin/useAdminPanelShell";
import {
  DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
  DEFAULT_TRA_CUU_FILTER_STATE,
} from "../lookup/lookupShared";
import { DashboardRuntimePanels } from "./DashboardRuntimePanels";
import { DashboardShellHeader } from "./DashboardShellHeader";
import { useDashboardSyncStatus } from "./useDashboardSyncStatus";
import { useDashboardLookupState } from "../lookup/useDashboardLookupState";
import { DEFAULT_DASHBOARD_TAB_ID, type DashboardTabId } from "../navigation/dashboardTabs";
import { useDashboardTabAccess } from "../navigation/useDashboardTabAccess";
import { useDashboardNavigation } from "../navigation/useDashboardNavigation";
import { useDashboardStatsFilters } from "../stats/useDashboardStatsFilters";

export function DashboardRuntime() {
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

          <DashboardRuntimePanels
            tabs={visibleTabs}
            activeTab={activeTab}
            isAdmin={isAdmin}
            pendingExperts={{ hideEmptyExperts, setHideEmptyExperts }}
            lookupPanels={{
              lookupState,
              setLookupState,
              lookupDoneState,
              setLookupDoneState,
            }}
            navigation={{
              openLookupByChuyenVien,
              openLookupByChuyenGia,
              openLookupByTinhTrang,
              openLookupDoneByChuyenVien,
              openLookupDoneByTinhTrang,
              openThongKeFromTongQuan,
              openDangXuLyFromTongQuan,
            }}
          />

          <AdminPanelMount isAdmin={isAdmin} showAdmin={showAdmin}>
            <AdminPanel onClose={closeAdmin} />
          </AdminPanelMount>
        </div>
      </StatsFiltersProvider>
    </DashboardAuthGate>
  );
}

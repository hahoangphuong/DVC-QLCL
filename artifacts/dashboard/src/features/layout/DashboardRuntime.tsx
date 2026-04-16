import { useState } from "react";
import { DashboardAuthGate } from "../auth/DashboardAuthGate";
import { useDashboardAuth } from "../auth/useDashboardAuth";
import { AdminPanel } from "../admin/AdminPanel";
import { AdminPanelMount } from "../admin/AdminPanelMount";
import { useAdminPanelShell } from "../admin/useAdminPanelShell";
import { LookupDoneTab } from "../lookup/LookupDoneTab";
import { LookupPendingTab } from "../lookup/LookupPendingTab";
import {
  DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
  DEFAULT_TRA_CUU_FILTER_STATE,
} from "../lookup/lookupShared";
import { DashboardShellHeader } from "./DashboardShellHeader";
import { useDashboardSyncStatus } from "./useDashboardSyncStatus";
import { useDashboardLookupState } from "../lookup/useDashboardLookupState";
import { DashboardContentSwitch } from "../navigation/DashboardContentSwitch";
import { DashboardTabPanels } from "../navigation/DashboardTabPanels";
import { DEFAULT_DASHBOARD_TAB_ID, type DashboardTabId } from "../navigation/dashboardTabs";
import { useDashboardTabAccess } from "../navigation/useDashboardTabAccess";
import { useDashboardNavigation } from "../navigation/useDashboardNavigation";
import { DangXuLyTab as PendingDangXuLyTab } from "../pending/PendingTabs";
import { ChuyenVienTable } from "../stats/ChuyenVienTable";
import { MonthlyTrendChart } from "../stats/MonthlyTrendChart";
import { OverviewTab } from "../stats/OverviewTab";
import { ThongKeTab } from "../stats/ThongKeTab";
import { Tt48LoaiHoSoTable } from "../stats/Tt48LoaiHoSoTable";
import { Tt48LoaiHoSoMonthlyChart } from "../stats/Tt48LoaiHoSoMonthlyChart";
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
        isAdmin ? (
          <LookupPendingTab
            state={lookupState}
            setState={setLookupState}
            isActive={activeTab === "tra_cuu_dang_xl"}
          />
        ) : null
      }
      renderLookupDaXuLy={() =>
        isAdmin ? (
          <LookupDoneTab
            state={lookupDoneState}
            setState={setLookupDoneState}
            isActive={activeTab === "tra_cuu_da_xl"}
          />
        ) : null
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

          <DashboardTabPanels
            tabs={visibleTabs}
            activeTab={activeTab}
            renderTabContent={renderTabContent}
          />

          <AdminPanelMount isAdmin={isAdmin} showAdmin={showAdmin}>
            <AdminPanel onClose={closeAdmin} />
          </AdminPanelMount>
        </div>
      </StatsFiltersProvider>
    </DashboardAuthGate>
  );
}

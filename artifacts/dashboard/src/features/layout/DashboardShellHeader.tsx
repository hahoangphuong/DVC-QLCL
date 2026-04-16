import { DashboardHeaderActions } from "./DashboardHeaderActions";
import { DashboardHeaderBrand } from "./DashboardHeaderBrand";
import { DashboardTabBar } from "../navigation/DashboardTabBar";
import type { DashboardTabId, DashboardTabItem } from "../navigation/dashboardTabs";
import type { DashboardRole } from "../auth/authApi";
import type { SyncStatus } from "./useDashboardSyncStatus";

type Props = {
  authRole: DashboardRole;
  isAdmin: boolean;
  syncStatus: SyncStatus | null | undefined;
  visibleTabs: readonly DashboardTabItem[];
  activeTab: DashboardTabId;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onSelectTab: (tabId: DashboardTabId) => void;
};

export function DashboardShellHeader({
  authRole,
  isAdmin,
  syncStatus,
  visibleTabs,
  activeTab,
  onOpenAdmin,
  onLogout,
  onSelectTab,
}: Props) {
  return (
    <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <DashboardHeaderBrand />
        <DashboardHeaderActions
          authRole={authRole}
          isAdmin={isAdmin}
          syncStatus={syncStatus}
          onOpenAdmin={onOpenAdmin}
          onLogout={onLogout}
        />
      </div>
      <DashboardTabBar tabs={visibleTabs} activeTab={activeTab} onSelectTab={onSelectTab} />
    </header>
  );
}

import { DashboardHeaderActions, type DashboardHeaderActionsProps } from "./DashboardHeaderActions";
import { DashboardHeaderBrand } from "./DashboardHeaderBrand";
import { DashboardTabBar } from "../navigation/DashboardTabBar";
import type { DashboardTabId, DashboardTabItem } from "../navigation/dashboardTabs";

type Props = DashboardHeaderActionsProps & {
  visibleTabs: readonly DashboardTabItem[];
  activeTab: DashboardTabId;
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

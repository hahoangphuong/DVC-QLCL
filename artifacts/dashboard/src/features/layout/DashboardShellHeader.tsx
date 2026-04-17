import { DashboardHeaderActions, type DashboardHeaderActionsProps } from "./DashboardHeaderActions";
import { DashboardHeaderBrand } from "./DashboardHeaderBrand";
import { DashboardTabBar, type DashboardTabBarProps } from "../navigation/DashboardTabBar";

type Props = DashboardHeaderActionsProps & {
  tabBar: DashboardTabBarProps;
};

export function DashboardShellHeader({
  authRole,
  isAdmin,
  syncStatus,
  tabBar,
  onOpenAdmin,
  onLogout,
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
      <DashboardTabBar {...tabBar} />
    </header>
  );
}

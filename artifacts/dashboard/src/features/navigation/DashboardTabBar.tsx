import type { DashboardTabId, DashboardTabItem, DashboardTabSetter } from "./dashboardTabs";

export type DashboardTabBarProps = {
  tabs: readonly DashboardTabItem[];
  activeTab: DashboardTabId;
  onSelectTab: DashboardTabSetter;
};

export function DashboardTabBar({ tabs, activeTab, onSelectTab }: DashboardTabBarProps) {
  return (
    <div className="max-w-screen-2xl mx-auto px-4 flex overflow-x-auto gap-0 scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          className={[
            "flex-shrink-0 px-5 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-all whitespace-nowrap",
            activeTab === tab.id
              ? "border-blue-600 text-blue-700 bg-blue-50"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

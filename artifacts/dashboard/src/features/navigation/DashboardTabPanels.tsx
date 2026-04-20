import type { ReactNode } from "react";
import type { DashboardTabId, DashboardTabItem } from "./dashboardTabs";

export type DashboardTabPanelsProps = {
  tabs: readonly DashboardTabItem[];
  activeTab: DashboardTabId;
  renderTabContent: (tabId: DashboardTabId) => ReactNode;
};

export function DashboardTabPanels({
  tabs,
  activeTab,
  renderTabContent,
}: DashboardTabPanelsProps) {
  return (
    <main className="max-w-screen-2xl mx-auto px-4 py-6">
      {tabs.map((tab) => (
        <div key={tab.id} className={activeTab === tab.id ? "block" : "hidden"}>
          {renderTabContent(tab.id)}
        </div>
      ))}
    </main>
  );
}

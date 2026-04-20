export const DASHBOARD_TABS = [
  { id: "tong_quan", label: "T\u1ed4NG QUAN", adminOnly: false },
  { id: "tt48_thong_ke", label: "TH\u1ed0NG K\u00ca TT48", adminOnly: false },
  { id: "tt48_dang_xl", label: "\u0110ANG X\u1eec L\u00dd TT48", adminOnly: false },
  { id: "tt47_thong_ke", label: "TH\u1ed0NG K\u00ca TT47", adminOnly: false },
  { id: "tt47_dang_xl", label: "\u0110ANG X\u1eec L\u00dd TT47", adminOnly: false },
  { id: "tt46_thong_ke", label: "TH\u1ed0NG K\u00ca TT46", adminOnly: false },
  { id: "tt46_dang_xl", label: "\u0110ANG X\u1eec L\u00dd TT46", adminOnly: false },
  { id: "tra_cuu_dang_xl", label: "TRA C\u1ee8U HS \u0110ANG X\u1eec L\u00dd", adminOnly: true },
  { id: "tra_cuu_da_xl", label: "TRA C\u1ee8U HS \u0110\u00c3 X\u1eec L\u00dd", adminOnly: true },
] as const;

export type DashboardTabItem = typeof DASHBOARD_TABS[number];
export type DashboardTabId = typeof DASHBOARD_TABS[number]["id"];
export type DashboardTabSetter = (tabId: DashboardTabId) => void;

export const DEFAULT_DASHBOARD_TAB_ID: DashboardTabId = DASHBOARD_TABS[0].id;

export const ADMIN_ONLY_DASHBOARD_TAB_IDS = DASHBOARD_TABS
  .filter((tab) => tab.adminOnly)
  .map((tab) => tab.id) as readonly DashboardTabId[];

export function isAdminOnlyDashboardTab(tabId: DashboardTabId): boolean {
  return ADMIN_ONLY_DASHBOARD_TAB_IDS.includes(tabId);
}

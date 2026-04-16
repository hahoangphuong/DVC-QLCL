# HANDOFF

This file is the fastest onboarding reference for continuing work on this repository in a new Codex/ChatGPT session or account.

Read this file together with [`README.md`](/D:/DVC-QLCL/README.md) before making changes.

## 1. Project summary

`DVC-QLCL` is an internal DAV dossier reporting system with three runtime layers:

- Python FastAPI backend
  - logs into `dichvucong.dav.gov.vn`
  - fetches raw dossier/workflow data
  - writes to PostgreSQL
  - exposes internal admin endpoints
  - handles DAV-integrated actions such as TT48 dossier detail and attachment fetch
- Node/Express API server
  - serves dashboard-facing `/api/*`
  - enforces auth/role access
  - exposes stats, lookup, exports, and admin relay endpoints
- React/Vite dashboard
  - statistics tabs for TT48/TT47/TT46
  - processing tabs
  - lookup tab
  - admin panel

Main data domain:

- `Tra_cuu_chung`: dossier master/reference data
- `Dang_xu_ly`: dossiers currently in workflow
- `Da_xu_ly`: completed dossiers

Primary procedures in scope:

- TT48
- TT47
- TT46

## 2. Runtime architecture

### Python backend

Entrypoint:

- [`D:\DVC-QLCL\main.py`](/D:/DVC-QLCL/main.py)

Key modules:

- [`D:\DVC-QLCL\sync_service.py`](/D:/DVC-QLCL/sync_service.py)
- [`D:\DVC-QLCL\auth_client.py`](/D:/DVC-QLCL/auth_client.py)
- [`D:\DVC-QLCL\migration_service.py`](/D:/DVC-QLCL/migration_service.py)
- [`D:\DVC-QLCL\stats_views.py`](/D:/DVC-QLCL/stats_views.py)
- [`D:\DVC-QLCL\internal_routes.py`](/D:/DVC-QLCL/internal_routes.py)
- [`D:\DVC-QLCL\public_routes.py`](/D:/DVC-QLCL/public_routes.py)
- [`D:\DVC-QLCL\scheduler_service.py`](/D:/DVC-QLCL/scheduler_service.py)

Important behavior:

- startup now runs only lightweight schema migration
- heavy stats migration was moved out of startup
- scheduled sync does not run immediately at startup anymore
- `sync/all` now logs phase timings and defers MV refresh to one final pass

### API server

Entrypoint:

- [`D:\DVC-QLCL\artifacts\api-server\src\index.ts`](/D:/DVC-QLCL/artifacts/api-server/src/index.ts)

Important routes/files:

- [`D:\DVC-QLCL\artifacts\api-server\src\routes\stats.ts`](/D:/DVC-QLCL/artifacts/api-server/src/routes/stats.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\routes\admin.ts`](/D:/DVC-QLCL/artifacts/api-server/src/routes/admin.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\routes\auth.ts`](/D:/DVC-QLCL/artifacts/api-server/src/routes/auth.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\lib\auth.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/auth.ts)

Important behavior:

- role-based dashboard auth is enforced here
- `viewer` can access stats only
- `admin` can access lookup, DAV detail/file routes, and admin routes
- Admin routes still also require `ADMIN_EXPORT_TOKEN`

### Dashboard

Current shell and feature files:

- shell:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\layout\DashboardRuntime.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/layout/DashboardRuntime.tsx)
- shared text:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\uiText.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/uiText.ts)
- shared date helpers:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\shared\dateUtils.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/shared/dateUtils.ts)
- auth feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\auth\authApi.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/auth/authApi.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\auth\LoginScreen.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/auth/LoginScreen.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\auth\DashboardAuthGate.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/auth/DashboardAuthGate.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\auth\useDashboardAuth.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/auth/useDashboardAuth.ts)
- lookup feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\lookupShared.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/lookupShared.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useDashboardLookupState.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useDashboardLookupState.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupTabState.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupTabState.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupExport.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupExport.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupSelectField.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupSelectField.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupTextFilterField.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupTextFilterField.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupActionBar.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupActionBar.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupErrorPanel.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupErrorPanel.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupProgressBar.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupProgressBar.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupInactiveCancel.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupInactiveCancel.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupQuery.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupQuery.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupSortedRows.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupSortedRows.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupSortableHeader.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupSortableHeader.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupFilterControls.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupFilterControls.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupDetailModal.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupDetailModal.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupResetFilters.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupResetFilters.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupSort.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupSort.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupHoSoDetailModal.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupHoSoDetailModal.tsx)
- pending feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\pending\pendingShared.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/pending/pendingShared.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\pending\PendingTabs.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/pending/PendingTabs.tsx)
- stats feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\statsShared.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/statsShared.ts)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\statsFilterContext.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/statsFilterContext.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\StatsOverview.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/StatsOverview.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\OverviewTab.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/OverviewTab.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\ThongKeTab.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/ThongKeTab.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\MonthlyTrendChart.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/MonthlyTrendChart.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\Tt48LoaiHoSoTable.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/Tt48LoaiHoSoTable.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\Tt48LoaiHoSoMonthlyChart.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/Tt48LoaiHoSoMonthlyChart.tsx)
- [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\useDashboardStatsFilters.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/useDashboardStatsFilters.ts)
- navigation feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\dashboardTabs.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/dashboardTabs.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\DashboardTabBar.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/DashboardTabBar.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\DashboardTabPanels.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/DashboardTabPanels.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\DashboardContentSwitch.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/DashboardContentSwitch.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\useDashboardNavigation.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/useDashboardNavigation.ts)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\useDashboardTabAccess.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/useDashboardTabAccess.ts)
- layout feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\layout\SyncStatusBadge.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/layout/SyncStatusBadge.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\layout\DashboardHeaderActions.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/layout/DashboardHeaderActions.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\layout\DashboardHeaderBrand.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/layout/DashboardHeaderBrand.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\layout\DashboardShellHeader.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/layout/DashboardShellHeader.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\layout\useDashboardSyncStatus.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/layout/useDashboardSyncStatus.ts)
- admin feature:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\admin\AdminPanel.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/admin/AdminPanel.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\admin\AdminPanelMount.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/admin/AdminPanelMount.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\admin\useAdminPanelShell.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/admin/useAdminPanelShell.ts)

Important behavior:

- `App.tsx` should now stay as the root provider/router only; dashboard runtime shell should live in `features/layout/DashboardRuntime.tsx`
- login screen before dashboard
- role-based tab visibility
- admin button only for `admin`
- lookup tabs are hidden for `viewer`
- mutable Vietnamese labels for lookup/detail surfaces should be centralized in `uiText.ts`
- new UI work should prefer editing the feature file directly instead of adding more logic back into `App.tsx`
- pending workflow UI and charts should now be edited in `features/pending/*`, not in `App.tsx`
- pending tab runtime shell should live in `features/pending/PendingTabs.tsx`; dead local `DangXuLyTab` and `ChuyenGiaTable` implementations have been removed from `App.tsx`
- pending types, fetchers, and color maps should live in `features/pending/pendingShared.ts`; the duplicated local definitions have been removed from `App.tsx`
- stats overview/filter panel should now be edited in `features/stats/*`, not re-added inline to `App.tsx`
- overview tab runtime shell should live in `features/stats/OverviewTab.tsx`; `App.tsx` should only pass cross-tab handlers and the monthly-trend render callback
- statistics tab runtime shell should live in `features/stats/ThongKeTab.tsx`; `App.tsx` should only pass render callbacks for heavier chart/table blocks
- specialist statistics table runtime should live in `features/stats/ChuyenVienTable.tsx`; `App.tsx` should not reintroduce the local `ChuyenVienTable` implementation
- monthly trend chart runtime should live in `features/stats/MonthlyTrendChart.tsx`; `App.tsx` should not reintroduce the local `MonthlyTrendChart` implementation
- TT48 dossier classification table should live in `features/stats/Tt48LoaiHoSoTable.tsx`; `App.tsx` should not reintroduce the local `Tt48LoaiHoSoTable` implementation
- TT48 received-by-month classification chart should live in `features/stats/Tt48LoaiHoSoMonthlyChart.tsx`; `App.tsx` should not reintroduce the local `Tt48LoaiHoSoMonthlyChart` implementation
- stats filter context should live in `features/stats/statsFilterContext.tsx`, not be recreated inside `App.tsx`
- stats filter state/provider wiring should live in `features/stats/useDashboardStatsFilters.ts`; `App.tsx` should consume `StatsFiltersCtx.Provider` via that hook, not recreate local filter context/types
- shared date parsing/clamping should live in `shared/dateUtils.ts`, and shared ISO display formatting should live in `shared/displayFormatters.ts`; duplicated local helpers have been removed from `App.tsx`
- dashboard tab ids/labels should live in `features/navigation/dashboardTabs.ts`, not be redefined inline in `App.tsx`
- dashboard tab navigation rendering should live in `features/navigation/DashboardTabBar.tsx`, not be expanded inline again in `App.tsx`
- dashboard main tab-panel host rendering should live in `features/navigation/DashboardTabPanels.tsx`, not be expanded inline again in `App.tsx`
- dashboard tab dispatcher switch should live in `features/navigation/DashboardContentSwitch.tsx`; `App.tsx` should only pass render callbacks and shell state
- dashboard cross-tab navigation callbacks should live in `features/navigation/useDashboardNavigation.ts`; `App.tsx` should only wire state setters/defaults into that hook
- dashboard role-based visible tabs and active-tab access guard should live in `features/navigation/useDashboardTabAccess.ts`
- dashboard header sync-status rendering should live in `features/layout/SyncStatusBadge.tsx`, not be expanded inline again in `App.tsx`
- dashboard header auth controls (role badge, Admin button, logout button) should live in `features/layout/DashboardHeaderActions.tsx`, not be expanded inline again in `App.tsx`
- dashboard header brand/title rendering should live in `features/layout/DashboardHeaderBrand.tsx`, not be expanded inline again in `App.tsx`
- dashboard header shell composition should live in `features/layout/DashboardShellHeader.tsx`; `App.tsx` should only pass shell props into it
- dashboard sync-status fetch/query should live in `features/layout/useDashboardSyncStatus.ts`; `App.tsx` should only consume the hook result
- dashboard auth loading/login gate should live in `features/auth/DashboardAuthGate.tsx`; `App.tsx` should only pass auth shell state into it
- dashboard auth bootstrap/login/logout wiring should live in `features/auth/useDashboardAuth.ts`; `App.tsx` should only pass reset callbacks into that hook
- lookup shared source of truth:
  - labels, sort order, option lists, submission display, export helpers:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\lookupShared.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/lookupShared.ts)
  - lookup shell state/reset wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useDashboardLookupState.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useDashboardLookupState.ts)
  - lookup tab local-state wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupTabState.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupTabState.ts)
  - lookup export state/handler wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupExport.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupExport.ts)
  - lookup shared select field UI:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupSelectField.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupSelectField.tsx)
  - lookup shared dossier-code text field UI:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupTextFilterField.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupTextFilterField.tsx)
  - lookup shared action bar UI:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupActionBar.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupActionBar.tsx)
  - lookup shared error panel UI:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupErrorPanel.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupErrorPanel.tsx)
  - lookup shared progress bar UI:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupProgressBar.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupProgressBar.tsx)
  - lookup inactive-tab query cancel wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupInactiveCancel.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupInactiveCancel.ts)
  - lookup query wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupQuery.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupQuery.ts)
  - lookup sorted-rows derivation:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupSortedRows.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupSortedRows.ts)
  - lookup sortable-header UI:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupSortableHeader.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupSortableHeader.tsx)
  - lookup filter setter wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupFilterControls.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupFilterControls.ts)
  - lookup detail modal state wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupDetailModal.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupDetailModal.ts)
  - lookup reset-filter wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupResetFilters.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupResetFilters.ts)
  - lookup sort toggle wiring:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\useLookupSort.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/useLookupSort.ts)
  - name formatting shared helpers:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\shared\nameFormatters.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/shared/nameFormatters.ts)
  - shared chart timing:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\shared\chartConfig.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/shared/chartConfig.ts)
  - shared ISO date display formatting:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\shared\displayFormatters.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/shared/displayFormatters.ts)
  - stats shared constants, types, and fetchers:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\statsShared.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/statsShared.ts)
  - stats presentational charts:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\StatsCharts.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/StatsCharts.tsx)
  - pending table display helpers:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\pending\pendingDisplay.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/pending/pendingDisplay.tsx)
  - admin export table metadata:
    - [`D:\DVC-QLCL\artifacts\dashboard\src\features\admin\adminShared.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/admin/adminShared.ts)
- admin panel runtime UI should live in `features/admin/AdminPanel.tsx`; do not reintroduce a local `AdminPanel` block in `App.tsx`
- admin panel shell mounting should live in `features/admin/AdminPanelMount.tsx`; `App.tsx` should only pass gate flags and panel content
- admin panel hash/Esc/open/close shell wiring should live in `features/admin/useAdminPanelShell.ts`; `App.tsx` should only pass gate state and use returned handlers
- lookup shell state/reset should live in `features/lookup/useDashboardLookupState.ts`; `App.tsx` should not recreate local lookup filter state or reset logic
- repeated lookup tab local-state wiring (`localState / state / setState / isActive`) should live in `features/lookup/useLookupTabState.ts`; `App.tsx` should not duplicate it across lookup tabs
- repeated lookup export state/handler wiring (`exporting / handleExportExcel`) should live in `features/lookup/useLookupExport.ts`; `App.tsx` should not duplicate export try/catch/finally blocks across lookup tabs
- repeated lookup select-field UI should live in `features/lookup/LookupSelectField.tsx`; `App.tsx` should not duplicate local `SelectField`/`LookupSelectField` component blocks across lookup tabs
- repeated lookup dossier-code text filter UI should live in `features/lookup/LookupTextFilterField.tsx`; `App.tsx` should not duplicate the `Lọc mã hồ sơ` label/input block across lookup tabs
- repeated lookup action-bar UI (`reset`, `xuất Excel`, `đang tải/tìm thấy`) should live in `features/lookup/LookupActionBar.tsx`; `App.tsx` should not duplicate that block across lookup tabs
- repeated lookup error-panel UI should live in `features/lookup/LookupErrorPanel.tsx`; `App.tsx` should not duplicate the red error-state block across lookup tabs
- stats shared constants/types/fetchers (`COLORS`, `QUICK_FILTERS`, `getPreset`, summary/monthly/ton-sau/chuyen-vien/tt48 classification fetchers, and related types) should live in `features/stats/statsShared.ts`; `App.tsx` should not reintroduce local duplicates
- stats presentational chart components (`SummaryBarChart`, `DonutChart`, `KpiCard`) should live in `features/stats/StatsCharts.tsx`; `App.tsx` should not reintroduce local chart blocks
- pending table display helpers (`Num`, `Pct`, row summation helper) should live in `features/pending/pendingDisplay.tsx`; `App.tsx` should not reintroduce local duplicates
- repeated lookup progress-bar UI should live in `features/lookup/LookupProgressBar.tsx`; `App.tsx` should not duplicate the loading progress block across lookup tabs
- repeated lookup inactive-tab query cancel wiring should live in `features/lookup/useLookupInactiveCancel.ts`; `App.tsx` should not duplicate `useEffect(... cancelQueries ...)` across lookup tabs
- repeated lookup query wiring should live in `features/lookup/useLookupQuery.ts`; `App.tsx` should not duplicate the `useQuery({ queryKey, queryFn, placeholderData, retry })` block across lookup tabs
- repeated lookup sorted-row derivation should live in `features/lookup/useLookupSortedRows.ts`; `App.tsx` should not duplicate the `useMemo(... rows.sort ...)` block across lookup tabs
- repeated lookup sortable-header UI should live in `features/lookup/LookupSortableHeader.tsx`; `App.tsx` should not duplicate local `SortableHeader` component blocks across lookup tabs
- repeated lookup results-table UI should live in `features/lookup/LookupResultsTable.tsx`; `App.tsx` should not duplicate large table render blocks across the two lookup tabs
- runtime shell for `Tra cứu HS đã xử lý` should live in `features/lookup/LookupDoneTab.tsx`; the old inline implementation has been removed from `App.tsx`
- runtime shell for `Tra cứu HS đang xử lý` should live in `features/lookup/LookupPendingTab.tsx`; the old inline implementation has been removed from `App.tsx`
- repeated lookup filter-panel UI should live in `features/lookup/LookupFilterPanel.tsx`; feature tab shells should not duplicate the combobox/input/action-bar form block
- repeated lookup detail-modal mount should live in `features/lookup/LookupDetailModalMount.tsx`; feature tab shells should not duplicate the conditional modal render block
- dead local `LookupHoSoDetailModal` and `LoginScreen` implementations have been removed from `App.tsx`; do not reintroduce them there
- repeated lookup field setter callbacks should live in `features/lookup/useLookupFilterControls.ts`; `App.tsx` should not duplicate `setChuyenVien/setChuyenGia/setThuTuc/setTinhTrang/setMaHoSo` across lookup tabs
- lookup detail modal open/close state should live in `features/lookup/useLookupDetailModal.ts`; duplicated `selectedDetail` state should not be recreated inline across lookup tabs
- repeated lookup reset-filter logic should live in `features/lookup/useLookupResetFilters.ts`; `App.tsx` should not duplicate `handleResetFilters` blocks across lookup tabs
- repeated lookup sort toggle logic should live in `features/lookup/useLookupSort.ts`; `App.tsx` should not duplicate `toggleSort` blocks across lookup tabs
- lookup types, fetchers, export helpers, and display helpers should stay in `features/lookup/lookupShared.ts`; `App.tsx` should import them instead of redefining local copies
- lookup status labels/options/sort-order, display helpers, and export download helpers have been removed from `App.tsx`; the single source of truth is `features/lookup/lookupShared.ts`
- do not duplicate lookup/admin constants inside `App.tsx` or feature components; if a constant is used in more than one place, move it to a shared module first
- do not reintroduce `DangXuLyTab`, `ChuyenGiaTable`, or pending fetch/types into `App.tsx`; the shell should only wire them
- preferred edit order for dashboard changes:
  1. shared constants/types/helpers
  2. feature component
  3. `App.tsx` shell only if wiring actually changes

## 3. Production services

### Python service

Service name:

- `dvc-qlcl-python.service`

Config:

```ini
[Unit]
Description=DVC-QLCL Python FastAPI
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=hahoangphuong
WorkingDirectory=/home/hahoangphuong/DVC-QLCL
EnvironmentFile=/home/hahoangphuong/DVC-QLCL/.env
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/hahoangphuong/DVC-QLCL/venv/bin/python3 -m uvicorn --app-dir /home/hahoangphuong/DVC-QLCL main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dvc-qlcl-python

[Install]
WantedBy=multi-user.target
```

### API service

Service name:

- `dvc-qlcl-api.service`

Config:

```ini
[Unit]
Description=DVC-QLCL Node API
After=network.target

[Service]
Type=simple
User=hahoangphuong
WorkingDirectory=/home/hahoangphuong/DVC-QLCL
EnvironmentFile=/home/hahoangphuong/DVC-QLCL/.env
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=PYTHON_INTERNAL_URL=http://127.0.0.1:8000
ExecStart=/bin/bash -lc 'source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node /home/hahoangphuong/DVC-QLCL/artifacts/api-server/dist/index.cjs'
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dvc-qlcl-api

[Install]
WantedBy=multi-user.target
```

Note:

- current TypeScript code uses `PYTHON_API_BASE_URL`
- service currently sets `PYTHON_INTERNAL_URL`
- if relays to Python fail after API changes, check this first

### Nginx

File:

- `/etc/nginx/sites-available/dvc-qlcl`

Config:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    location = / {
        return 302 /dashboard/;
    }

    location /dashboard/ {
        alias /home/hahoangphuong/DVC-QLCL/artifacts/dashboard/dist/public/;
        index index.html;
        try_files $uri $uri/ /dashboard/index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 4. Environment variables

### Core

- `DATABASE_URL`
- `BASE_URL`
- `LOGIN_PATH`
- `REMOTE_USERNAME`
- `REMOTE_PASSWORD`
- `ADMIN_EXPORT_TOKEN`

### Python/API bridge

- `PYTHON_API_BASE_URL`
  - expected by current API server code
  - should normally be `http://127.0.0.1:8000`

### Dashboard auth

- `DASHBOARD_VIEWER_PASSWORD`
- `DASHBOARD_ADMIN_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- `DASHBOARD_COOKIE_SECURE`
  - `false` for HTTP deployments
  - `true` only if the dashboard is actually served through HTTPS

## 5. Common deploy workflow

Typical production update:

```bash
cd /home/hahoangphuong/DVC-QLCL
git pull
```

### Rebuild API server

```bash
cd /home/hahoangphuong/DVC-QLCL/artifacts/api-server
pnpm install
pnpm build
sudo systemctl restart dvc-qlcl-api
sudo systemctl status dvc-qlcl-api
```

### Rebuild dashboard

```bash
cd /home/hahoangphuong/DVC-QLCL/artifacts/dashboard
pnpm install
pnpm build
```

Then reload nginx if needed:

```bash
sudo systemctl reload nginx
```

### Restart Python backend

```bash
sudo systemctl restart dvc-qlcl-python
sudo systemctl status dvc-qlcl-python
```

## 6. Vietnamese encoding safety rules

This repo has repeatedly hit Vietnamese text corruption during code edits, especially in:

- [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx)
- large TSX/JSX files edited from PowerShell
- scripted replacements that rewrite an entire file

These rules should be treated as mandatory.

### Required rules

- Always preserve files as `UTF-8` without BOM.
- Prefer minimal diffs. Do not rewrite a whole file when only one component or block needs to change.
- Avoid bulk PowerShell replacements on Vietnamese-heavy files unless there is no safer option.
- Do not use PowerShell line-array rewrite flows such as `Get-Content` -> mutate array -> `WriteAllLines` on TSX/JSX files; this has repeatedly introduced mojibake into Vietnamese UI text.
- If a large TSX edit cannot be expressed safely with `apply_patch`, split the component first or move the target block into a smaller helper/feature file before editing.
- Before committing, always inspect `git diff` for mojibake such as:
  - `Ã`
  - `á»`
  - `â€”`
  - or obviously broken Vietnamese sequences
- If Vietnamese corruption appears outside the intended change, discard that file change and reapply cleanly.

### Preferred edit order

Use this order of preference:

1. `apply_patch` with small local hunks
2. targeted edits that affect only the intended block
3. only as a last resort, scripted replacement of one function/block followed by immediate diff inspection

### String safety rule

When tooling is unstable around Vietnamese text:

- leave existing correct Vietnamese strings untouched whenever possible
- for new or changed literals, Unicode escapes are acceptable and preferred over corrupting the file
- never place `\u....` escapes directly as raw JSX text content; in JSX text nodes, wrap them in a JS string expression such as `{"\u0110ang t\u1ea3i..."}` or use a verified UTF-8 literal
- in TSX/JSX, prefer storing changed Vietnamese UI labels in JS constants/arrays/objects first, then render them via `{label}` instead of typing Vietnamese directly across many text nodes
- if a block has many Vietnamese labels, refactor that block to consume a small local text map rather than editing multiple inline literals one by one
- for dashboard labels that are likely to be changed again, put them in [`D:\DVC-QLCL\artifacts\dashboard\src\uiText.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/uiText.ts) instead of leaving them inline in `App.tsx`

Examples:

- `"\u0110ang t\u1ea3i chi ti\u1ebft h\u1ed3 s\u01a1..."`
- `"\u2014"`

This is less readable, but safer than accidental mojibake.

### PowerShell caution

Avoid these patterns on Vietnamese-heavy files unless absolutely necessary:

- `Get-Content ... | Set-Content ...`
- regex replacements that rewrite the whole file
- write operations that do not explicitly control encoding
- trusting terminal-rendered mojibake from PowerShell as proof that file bytes are wrong

If a scripted write is unavoidable:

- read with UTF-8
- write with UTF-8 **without BOM**
- immediately re-check the diff to ensure no BOM or mojibake was introduced

### Recovery procedure

If a file starts showing corrupted Vietnamese after an edit:

1. Stop editing immediately.
2. Run `git diff -- <file>` and check whether the corruption is local or widespread.
3. If widespread, restore the file from Git.
4. Reapply only the intended functional change with smaller edits.
5. Re-check `git diff` before staging.

### Extra TSX rule learned from production issue

For TSX/JSX files:

- if text is rendered directly between tags, do **not** paste `\u...` as raw text content
- either use a verified UTF-8 literal or wrap the escaped string in a JS expression, for example:
  - `{"\u0110ang t\u1ea3i..."}`
- after changing Vietnamese text in a modal or table header, verify the rendered UI, not just the source diff

### Strict workflow for Vietnamese-heavy UI edits

Use this workflow on every edit to a Vietnamese-heavy TSX file:

1. change the smallest possible block with `apply_patch`
2. avoid whole-file rewrite tools
3. prefer JS string expressions or local text constants for every changed Vietnamese label
4. if the text belongs to lookup, dossier detail modal, or another reused UI surface, add or edit it in `uiText.ts`
5. inspect `git diff` for mojibake patterns before any commit
6. if the change touches a modal, table header, or button label, verify the rendered UI before closing the task

If any mojibake appears during the edit, stop and restore the file before retrying with a smaller patch.

### Attachment dedupe rule learned from DAV detail payloads

For TT48 dossier detail attachments:

- do not only dedupe within each `listTepHoSo` bundle
- dedupe cumulatively across submission rounds in display order
- if a file with the same `tenTep` and `duongDanTep` already appeared in an earlier round, hide it from later rounds
- treat this as an upstream data cleanup rule for the UI, not as a source-of-truth change in backend data

### Repo-specific rule

For [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx):

- treat it as a high-risk encoding file
- never do large blind rewrites
- always inspect the diff before commit
- do not introduce new mutable Vietnamese literals inline if they belong to lookup/detail modal; put them in [`D:\DVC-QLCL\artifacts\dashboard\src\uiText.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/uiText.ts)
- when a direct inline change is unavoidable, prefer local constants or `{ "...escaped..." }` string expressions over raw JSX text
- after the refactor, do not add new lookup/auth/admin UI blocks back into `App.tsx`; edit the feature files directly:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\lookup\LookupHoSoDetailModal.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/lookup/LookupHoSoDetailModal.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\auth\LoginScreen.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/auth/LoginScreen.tsx)
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\admin\AdminPanel.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/admin/AdminPanel.tsx)
- for shared day parsing/formatting logic, edit [`D:\DVC-QLCL\artifacts\dashboard\src\shared\dateUtils.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/shared/dateUtils.ts) instead of duplicating helpers in `App.tsx`

## 7. Stats migration workflow

Heavy stats migration is no longer executed automatically at Python startup.

Use it only when deploying changes that alter:

- materialized view SQL
- stats indexes
- stats schema shape
- columns required by stats queries

How to run:

- Admin panel button: `Stats Migration`
- or:

```bash
curl -X POST http://127.0.0.1:8000/internal/migrate/stats
```

Important:

- do not run this after every `sync/all`
- only run when stats schema changed

## 8. Sync behavior and performance notes

Important recent changes:

- sync log now separates:
  - raw fetch time
  - processing time
  - DB write time
  - final MV refresh time
- `sync/all` refreshes stats MVs once at the end, not after every dataset
- dashboard API uses caching and stale-while-revalidate to reduce lockups during sync
- Python startup was previously very slow because heavy stats migration ran during startup; this was moved out

Known operational reality:

- Python startup can still take noticeable time on heavy DB work, but should now be much faster than before
- if dashboard becomes sluggish during scheduled sync, first inspect:
  - sync logs
  - final MV refresh duration
  - DB contention

## 9. TT48 workflow logic

This is the functional workflow currently assumed in code and UI reasoning.

1. Hồ sơ được tiếp nhận.
2. Hồ sơ được chuyển lên Trưởng phòng.
3. Trưởng phòng phân công hồ sơ cho chuyên viên thụ lý.
4. Chuyên viên thẩm định hồ sơ.
5. Chuyên viên chuyển hồ sơ cho chuyên gia.
6. Chuyên gia thẩm định xong chuyển lại cho chuyên viên.
7. Chuyên viên tổng hợp hồ sơ và trình Tổ trưởng.
8. Tổ trưởng thẩm định và chuyển Trưởng phòng.
9. Trưởng phòng xét duyệt:
   - nếu hồ sơ cần bổ sung:
     - ký công văn
     - chuyển Văn thư ban hành
   - nếu hồ sơ đạt:
     - chuyển lại chuyên viên để kết thúc hồ sơ
   - nếu không đồng ý:
     - trả lại chuyên viên để thẩm định lại
10. Khi bị trả lại, chu trình lại quay về:
    - chuyên viên thẩm định
    - chuyển chuyên gia
    - tổng hợp
    - trình Tổ trưởng
    - trình Trưởng phòng

Implication for dashboard logic:

- TT48 statuses are not purely linear
- hồ sơ có thể quay vòng nhiều lần giữa chuyên viên, chuyên gia, tổ trưởng, trưởng phòng
- expert and specialist statistics should be interpreted carefully against this loop

## 10. Auth notes

Current dashboard access model:

- `viewer`
  - can access statistics tabs
  - cannot access lookup
  - cannot access admin panel
- `admin`
  - can access everything

Implementation details:

- auth session is a signed cookie handled by the API server
- admin routes additionally require `ADMIN_EXPORT_TOKEN`
- if login appears successful but admin/lookup calls fail with `Chưa đăng nhập dashboard.`, check:
  - `DASHBOARD_COOKIE_SECURE`
  - browser hard refresh
  - whether the cookie was actually set
## 11. High-risk files

Files that tend to have broad impact:

- [`D:\DVC-QLCL\sync_service.py`](/D:/DVC-QLCL/sync_service.py)
- [`D:\DVC-QLCL\migration_service.py`](/D:/DVC-QLCL/migration_service.py)
- [`D:\DVC-QLCL\stats_views.py`](/D:/DVC-QLCL/stats_views.py)
- [`D:\DVC-QLCL\artifacts\api-server\src\lib\stats\workflow.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/stats/workflow.ts)
- [`D:\DVC-QLCL\artifacts\api-server\src\lib\stats\overview.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/stats/overview.ts)
- [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx)

Guideline:

- read carefully before touching
- avoid mixing unrelated fixes in these files

## 12. Recommended startup prompt for a new Codex session

Use something like this in a fresh account/session:

```text
Read README.md and HANDOFF.md first. Then summarize:
1. architecture
2. deploy/runbook
3. important env vars
4. recent operational gotchas
Do not change code until after that summary.
```

If resuming a specific task:

```text
Current repo is DVC-QLCL. Read README.md and HANDOFF.md first, then inspect the latest commits and continue from there.
```

## 12. What to update in this file

Whenever major behavior changes, update this file with:

- new env vars
- changed service names or ports
- new deploy steps
- new admin actions
- changed TT48 workflow assumptions
- major performance or migration changes

## 13. Dashboard refactor ownership notes

- TT48 classification table display helpers now live in:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\stats\tt48LoaiHoSoDisplay.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/features/stats/tt48LoaiHoSoDisplay.tsx)
- This file owns:
  - group-total rendering
  - inline value-with-percent rendering
  - numeric cell rendering
  - expand-cell rendering
  - TT48 sub-row rendering
- [`D:\DVC-QLCL\artifacts\dashboard\src\App.tsx`](/D:/DVC-QLCL/artifacts/dashboard/src/App.tsx) may keep thin wrappers only when needed for local table state such as `expandedRows` and `toggleRow`, but should not grow new TT48 table display logic again.
- Cross-tab dashboard navigation continues to live in:
  - [`D:\DVC-QLCL\artifacts\dashboard\src\features\navigation\useDashboardNavigation.ts`](/D:/DVC-QLCL/artifacts/dashboard/src/features/navigation/useDashboardNavigation.ts)
- This hook now owns both:
  - navigation from `Đang xử lý` -> `Tra cứu HS đang xử lý`
  - navigation from `Thống kê` specialist table -> `Tra cứu HS đã xử lý`
- Processed dossier lookup ownership:
  - [`D:\DVC-QLCL\artifacts\api-server\src\lib\stats\workflow.ts`](/D:/DVC-QLCL/artifacts/api-server/src/lib/stats/workflow.ts)
- Rule:
  - `Tra cứu HS đã xử lý` must deduplicate by handling cycle, not by `ma_ho_so`
  - preferred cycle key is `COALESCE(NULLIF(TRIM(da_xu_ly_id), ''), tcc_id)`

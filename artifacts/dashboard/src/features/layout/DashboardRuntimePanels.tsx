import { DashboardContentSwitch } from "../navigation/DashboardContentSwitch";
import { DashboardTabPanels } from "../navigation/DashboardTabPanels";
import type { DashboardTabId, DashboardTabItem } from "../navigation/dashboardTabs";
import { LookupDoneTab } from "../lookup/LookupDoneTab";
import { LookupPendingTab } from "../lookup/LookupPendingTab";
import type { TraCuuFilterState } from "../lookup/lookupShared";
import { DangXuLyTab as PendingDangXuLyTab } from "../pending/PendingTabs";
import { ChuyenVienTable } from "../stats/ChuyenVienTable";
import { MonthlyTrendChart } from "../stats/MonthlyTrendChart";
import { OverviewTab } from "../stats/OverviewTab";
import { ThongKeTab } from "../stats/ThongKeTab";
import { Tt48LoaiHoSoMonthlyChart } from "../stats/Tt48LoaiHoSoMonthlyChart";
import { Tt48LoaiHoSoTable } from "../stats/Tt48LoaiHoSoTable";
import type { LookupTinhTrang } from "../lookup/lookupShared";
import type { SupportedThuTuc, TabFilter } from "../stats/statsShared";

type Props = {
  tabs: readonly DashboardTabItem[];
  activeTab: DashboardTabId;
  isAdmin: boolean;
  hideEmptyExperts: boolean;
  setHideEmptyExperts: (value: boolean) => void;
  lookupState: TraCuuFilterState;
  setLookupState: (state: TraCuuFilterState) => void;
  lookupDoneState: TraCuuFilterState;
  setLookupDoneState: (state: TraCuuFilterState) => void;
  openLookupByChuyenVien: (tenCvRaw: string, thuTuc: SupportedThuTuc) => void;
  openLookupByChuyenGia: (tenCg: string) => void;
  openLookupByTinhTrang: (thuTuc: SupportedThuTuc, tinhTrang: LookupTinhTrang) => void;
  openLookupDoneByChuyenVien: (tenCvRaw: string, thuTuc: SupportedThuTuc) => void;
  openLookupDoneByTinhTrang: (thuTuc: SupportedThuTuc, tinhTrang: string) => void;
  openThongKeFromTongQuan: (thuTuc: SupportedThuTuc, filter: TabFilter) => void;
  openDangXuLyFromTongQuan: (thuTuc: SupportedThuTuc) => void;
};

export function DashboardRuntimePanels({
  tabs,
  activeTab,
  isAdmin,
  hideEmptyExperts,
  setHideEmptyExperts,
  lookupState,
  setLookupState,
  lookupDoneState,
  setLookupDoneState,
  openLookupByChuyenVien,
  openLookupByChuyenGia,
  openLookupByTinhTrang,
  openLookupDoneByChuyenVien,
  openLookupDoneByTinhTrang,
  openThongKeFromTongQuan,
  openDangXuLyFromTongQuan,
}: Props) {
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
    <DashboardTabPanels
      tabs={tabs}
      activeTab={activeTab}
      renderTabContent={renderTabContent}
    />
  );
}

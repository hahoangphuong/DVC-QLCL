import { useCallback } from "react";
import type { SupportedThuTuc, TabFilter } from "../stats/statsShared";
import type {
  LookupTinhTrang,
  TraCuuFilterState,
  TraCuuFilterStateSetter,
} from "../lookup/lookupShared";
import type { DashboardTabId, DashboardTabSetter } from "./dashboardTabs";

type Params = {
  isAdmin: boolean;
  defaultLookupState: TraCuuFilterState;
  defaultLookupDoneState: TraCuuFilterState;
  setLookupState: TraCuuFilterStateSetter;
  setLookupDoneState: TraCuuFilterStateSetter;
  setActiveTab: DashboardTabSetter;
  updateFilter: (thuTuc: SupportedThuTuc, patch: Partial<TabFilter>) => void;
};

export type DashboardRuntimeNavigation = {
  openLookupByChuyenVien: (tenCvRaw: string, thuTuc: SupportedThuTuc) => void;
  openLookupByChuyenGia: (tenCg: string) => void;
  openLookupByTinhTrang: (thuTuc: SupportedThuTuc, tinhTrang: LookupTinhTrang) => void;
  openLookupDoneByChuyenVien: (tenCvRaw: string, thuTuc: SupportedThuTuc) => void;
  openLookupDoneByTinhTrang: (thuTuc: SupportedThuTuc, tinhTrang: string) => void;
  openThongKeFromTongQuan: (thuTuc: SupportedThuTuc, filter: TabFilter) => void;
  openDangXuLyFromTongQuan: (thuTuc: SupportedThuTuc) => void;
};

export function useDashboardNavigation({
  isAdmin,
  defaultLookupState,
  defaultLookupDoneState,
  setLookupState,
  setLookupDoneState,
  setActiveTab,
  updateFilter,
}: Params): DashboardRuntimeNavigation {
  const openLookupByChuyenVien = useCallback((tenCvRaw: string, thuTuc: SupportedThuTuc) => {
    if (!isAdmin) return;
    setLookupState({
      ...defaultLookupState,
      thuTuc,
      chuyenVien: tenCvRaw,
    });
    setActiveTab("tra_cuu_dang_xl");
  }, [defaultLookupState, isAdmin, setActiveTab, setLookupState]);

  const openLookupByChuyenGia = useCallback((tenCg: string) => {
    if (!isAdmin) return;
    setLookupState({
      ...defaultLookupState,
      thuTuc: 48,
      chuyenGia: tenCg.trim(),
      tinhTrang: "cho_chuyen_gia",
    });
    setActiveTab("tra_cuu_dang_xl");
  }, [defaultLookupState, isAdmin, setActiveTab, setLookupState]);

  const openLookupByTinhTrang = useCallback((thuTuc: SupportedThuTuc, tinhTrang: string) => {
    if (!isAdmin) return;
    setLookupState({
      ...defaultLookupState,
      thuTuc,
      tinhTrang,
    });
    setActiveTab("tra_cuu_dang_xl");
  }, [defaultLookupState, isAdmin, setActiveTab, setLookupState]);

  const openLookupDoneByChuyenVien = useCallback((tenCvRaw: string, thuTuc: SupportedThuTuc) => {
    if (!isAdmin) return;
    setLookupDoneState({
      ...defaultLookupDoneState,
      thuTuc,
      chuyenVien: tenCvRaw,
    });
    setActiveTab("tra_cuu_da_xl");
  }, [defaultLookupDoneState, isAdmin, setActiveTab, setLookupDoneState]);

  const openLookupDoneByTinhTrang = useCallback((thuTuc: SupportedThuTuc, tinhTrang: string) => {
    if (!isAdmin) return;
    setLookupDoneState({
      ...defaultLookupDoneState,
      thuTuc,
      tinhTrang,
    });
    setActiveTab("tra_cuu_da_xl");
  }, [defaultLookupDoneState, isAdmin, setActiveTab, setLookupDoneState]);

  const openThongKeFromTongQuan = useCallback((thuTuc: SupportedThuTuc, filter: TabFilter) => {
    updateFilter(thuTuc, {
      fromDate: filter.fromDate,
      toDate: filter.toDate,
      fromInput: filter.fromInput,
      toInput: filter.toInput,
      activePreset: filter.activePreset,
      loadingAll: false,
    });
    setActiveTab(`tt${thuTuc}_thong_ke`);
  }, [setActiveTab, updateFilter]);

  const openDangXuLyFromTongQuan = useCallback((thuTuc: SupportedThuTuc) => {
    setActiveTab(`tt${thuTuc}_dang_xl`);
  }, [setActiveTab]);

  return {
    openLookupByChuyenVien,
    openLookupByChuyenGia,
    openLookupByTinhTrang,
    openLookupDoneByChuyenVien,
    openLookupDoneByTinhTrang,
    openThongKeFromTongQuan,
    openDangXuLyFromTongQuan,
  };
}

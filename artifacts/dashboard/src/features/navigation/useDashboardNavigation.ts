import { useCallback } from "react";
import type { SupportedThuTuc, TabFilter } from "../stats/statsShared";
import type { DashboardTabId } from "./dashboardTabs";

type Params<TLookupState extends object> = {
  isAdmin: boolean;
  defaultLookupState: TLookupState;
  defaultLookupDoneState: TLookupState;
  setLookupState: (state: TLookupState) => void;
  setLookupDoneState: (state: TLookupState) => void;
  setActiveTab: (tabId: DashboardTabId) => void;
  updateFilter: (thuTuc: SupportedThuTuc, patch: Partial<TabFilter>) => void;
};

export function useDashboardNavigation<TLookupState extends object>({
  isAdmin,
  defaultLookupState,
  defaultLookupDoneState,
  setLookupState,
  setLookupDoneState,
  setActiveTab,
  updateFilter,
}: Params<TLookupState>) {
  const openLookupByChuyenVien = useCallback((tenCvRaw: string, thuTuc: SupportedThuTuc) => {
    if (!isAdmin) return;
    setLookupState({
      ...defaultLookupState,
      thuTuc,
      chuyenVien: tenCvRaw,
    } as TLookupState);
    setActiveTab("tra_cuu_dang_xl");
  }, [defaultLookupState, isAdmin, setActiveTab, setLookupState]);

  const openLookupByChuyenGia = useCallback((tenCg: string) => {
    if (!isAdmin) return;
    setLookupState({
      ...defaultLookupState,
      thuTuc: 48,
      chuyenGia: tenCg.trim(),
      tinhTrang: "cho_chuyen_gia",
    } as TLookupState);
    setActiveTab("tra_cuu_dang_xl");
  }, [defaultLookupState, isAdmin, setActiveTab, setLookupState]);

  const openLookupByTinhTrang = useCallback((thuTuc: SupportedThuTuc, tinhTrang: string) => {
    if (!isAdmin) return;
    setLookupState({
      ...defaultLookupState,
      thuTuc,
      tinhTrang,
    } as TLookupState);
    setActiveTab("tra_cuu_dang_xl");
  }, [defaultLookupState, isAdmin, setActiveTab, setLookupState]);

  const openLookupDoneByChuyenVien = useCallback((tenCvRaw: string, thuTuc: SupportedThuTuc) => {
    if (!isAdmin) return;
    setLookupDoneState({
      ...defaultLookupDoneState,
      thuTuc,
      chuyenVien: tenCvRaw,
    } as TLookupState);
    setActiveTab("tra_cuu_da_xl");
  }, [defaultLookupDoneState, isAdmin, setActiveTab, setLookupDoneState]);

  const openLookupDoneByTinhTrang = useCallback((thuTuc: SupportedThuTuc, tinhTrang: string) => {
    if (!isAdmin) return;
    setLookupDoneState({
      ...defaultLookupDoneState,
      thuTuc,
      tinhTrang,
    } as TLookupState);
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

import { LOOKUP_TEXT } from "../../uiText";
import { LookupDetailModalMount } from "./LookupDetailModalMount";
import { LookupFilterPanel } from "./LookupFilterPanel";
import { useDebouncedValue } from "./useDebouncedValue";
import { useLookupDetailModal } from "./useLookupDetailModal";
import { useLookupExport } from "./useLookupExport";
import { useLookupFilterControls } from "./useLookupFilterControls";
import { LookupProgressBar } from "./LookupProgressBar";
import { useLookupQuery } from "./useLookupQuery";
import { LookupResultsTable } from "./LookupResultsTable";
import { useLookupInactiveCancel } from "./useLookupInactiveCancel";
import { useLookupResetFilters } from "./useLookupResetFilters";
import { useLookupSortedRows } from "./useLookupSortedRows";
import { useLookupSort } from "./useLookupSort";
import { useLookupTabState, type LookupTabProps } from "./useLookupTabState";
import {
  DEFAULT_TRA_CUU_FILTER_STATE,
  LOOKUP_COMMON_MESSAGES,
  downloadTraCuuDangXuLyExcel,
  fetchTraCuuDangXuLy,
  getPendingTinhTrangOptionGroups,
  isPendingTinhTrangAllowed,
} from "./lookupShared";

export function LookupPendingTab(props?: LookupTabProps) {
  const { state, setState, isActive } = useLookupTabState(props, DEFAULT_TRA_CUU_FILTER_STATE);
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const { selectedDetail, openDetail, closeDetail } = useLookupDetailModal();
  const { setChuyenVien, setChuyenGia, setTinhTrang, setMaHoSo } = useLookupFilterControls(setState);
  const tinhTrangOptionGroups = getPendingTinhTrangOptionGroups(thuTuc);
  const handleThuTucChange = (value: typeof thuTuc) => {
    setState((prev) => ({
      ...prev,
      thuTuc: value,
      tinhTrang: isPendingTinhTrangAllowed(value, prev.tinhTrang) ? prev.tinhTrang : "all",
    }));
  };
  const debouncedMaHoSo = useDebouncedValue(maHoSo, 250);
  const { exporting, handleExportExcel } = useLookupExport(() =>
    downloadTraCuuDangXuLyExcel({
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo,
      sortBy,
      sortDir,
    }),
  );

  const { data, isLoading, isFetching, isError } = useLookupQuery({
    queryKey: "tra-cuu-dang-xu-ly",
    params: {
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo: debouncedMaHoSo,
    },
    fetcher: fetchTraCuuDangXuLy,
    enabled: isActive,
  });

  useLookupInactiveCancel(isActive, "tra-cuu-dang-xu-ly");

  const chuyenVienOptions = data?.options.chuyen_vien ?? [];
  const chuyenGiaOptions = data?.options.chuyen_gia ?? [];
  const sortedRows = useLookupSortedRows(data?.rows, sortBy, sortDir);
  const toggleSort = useLookupSort(setState, sortBy);
  const handleResetFilters = useLookupResetFilters(setState, DEFAULT_TRA_CUU_FILTER_STATE);

  return (
    <div className="space-y-6">
      <LookupFilterPanel
        thuTuc={thuTuc}
        chuyenVien={chuyenVien}
        chuyenGia={chuyenGia}
        tinhTrang={tinhTrang}
        maHoSo={maHoSo}
        chuyenVienOptions={chuyenVienOptions}
        chuyenGiaOptions={chuyenGiaOptions}
        tinhTrangOptionGroups={tinhTrangOptionGroups}
        onThuTucChange={handleThuTucChange}
        onChuyenVienChange={setChuyenVien}
        onChuyenGiaChange={setChuyenGia}
        onTinhTrangChange={setTinhTrang}
        onMaHoSoChange={setMaHoSo}
        onReset={handleResetFilters}
        onExport={handleExportExcel}
        exporting={exporting}
        isFetching={isFetching}
        hasData={Boolean(data)}
        rowCount={data?.rows.length ?? 0}
      />

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <LookupResultsTable
        data={data}
        sortedRows={sortedRows}
        isError={isError}
        errorMessage={LOOKUP_TEXT.pendingLookupLoadError}
        selectedThuTuc={thuTuc}
        sortBy={sortBy}
        sortDir={sortDir}
        onToggleSort={toggleSort}
        secondDateLabel={"Hẹn trả"}
        durationLabel={LOOKUP_COMMON_MESSAGES.pendingDurationLabel}
        loadingMessage={LOOKUP_COMMON_MESSAGES.loadingResults}
        emptyMessage={LOOKUP_COMMON_MESSAGES.emptyResults}
        onOpenDetail={openDetail}
      />

      <LookupDetailModalMount selectedDetail={selectedDetail} onClose={closeDetail} />
    </div>
  );
}

import { useDeferredValue, type Dispatch, type SetStateAction } from "react";
import { LOOKUP_TEXT } from "../../uiText";
import { LookupDetailModalMount } from "./LookupDetailModalMount";
import { LookupFilterPanel } from "./LookupFilterPanel";
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
import { useLookupTabState } from "./useLookupTabState";
import {
  DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
  TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS,
  displayLookupCg,
  displayLookupCv,
  downloadTraCuuDaXuLyExcel,
  fetchTraCuuDaXuLy,
  type LookupThuTuc,
  type LookupTinhTrang,
  type TraCuuFilterState,
} from "./lookupShared";

export function LookupDoneTab(props?: {
  state: TraCuuFilterState;
  setState: Dispatch<SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  const { state, setState, isActive } = useLookupTabState(props, DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const { selectedDetail, openDetail, closeDetail } = useLookupDetailModal();
  const { setChuyenVien, setChuyenGia, setThuTuc, setTinhTrang, setMaHoSo } = useLookupFilterControls(setState);
  const deferredMaHoSo = useDeferredValue(maHoSo);
  const { exporting, handleExportExcel } = useLookupExport(() =>
    downloadTraCuuDaXuLyExcel({
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
    queryKey: "tra-cuu-da-xu-ly",
    params: {
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo: deferredMaHoSo,
    },
    fetcher: fetchTraCuuDaXuLy,
    enabled: isActive,
  });

  useLookupInactiveCancel(isActive, "tra-cuu-da-xu-ly");

  const chuyenVienOptions = data?.options.chuyen_vien ?? [];
  const chuyenGiaOptions = data?.options.chuyen_gia ?? [];
  const sortedRows = useLookupSortedRows(data?.rows, sortBy, sortDir);
  const toggleSort = useLookupSort(setState, sortBy);
  const handleResetFilters = useLookupResetFilters(setState, DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);

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
        tinhTrangOptions={TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS}
        onThuTucChange={setThuTuc}
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
        errorMessage={LOOKUP_TEXT.doneLookupLoadError}
        sortBy={sortBy}
        sortDir={sortDir}
        onToggleSort={toggleSort}
        dateReceivedLabel={LOOKUP_TEXT.dateReceived}
        secondDateLabel={LOOKUP_TEXT.resultDateShort}
        durationLabel={"Th\u1eddi gian x\u1eed l\u00fd"}
        loadingMessage={"\u0110ang chu\u1ea9n b\u1ecb d\u1eef li\u1ec7u tra c\u1ee9u..."}
        emptyMessage={"Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 ph\u00f9 h\u1ee3p v\u1edbi \u0111i\u1ec1u ki\u1ec7n l\u1ecdc."}
        onOpenDetail={openDetail}
      />

      <LookupDetailModalMount selectedDetail={selectedDetail} onClose={closeDetail} />
    </div>
  );
}

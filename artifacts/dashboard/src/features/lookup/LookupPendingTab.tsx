import { useDeferredValue, type Dispatch, type SetStateAction } from "react";
import { LOOKUP_TEXT } from "../../uiText";
import { LookupActionBar } from "./LookupActionBar";
import { LookupHoSoDetailModal } from "./LookupHoSoDetailModal";
import { useLookupDetailModal } from "./useLookupDetailModal";
import { useLookupExport } from "./useLookupExport";
import { useLookupFilterControls } from "./useLookupFilterControls";
import { LookupProgressBar } from "./LookupProgressBar";
import { useLookupQuery } from "./useLookupQuery";
import { LookupResultsTable } from "./LookupResultsTable";
import { LookupSelectField } from "./LookupSelectField";
import { LookupTextFilterField } from "./LookupTextFilterField";
import { useLookupInactiveCancel } from "./useLookupInactiveCancel";
import { useLookupResetFilters } from "./useLookupResetFilters";
import { useLookupSortedRows } from "./useLookupSortedRows";
import { useLookupSort } from "./useLookupSort";
import { useLookupTabState } from "./useLookupTabState";
import {
  DEFAULT_TRA_CUU_FILTER_STATE,
  TRA_CUU_TINH_TRANG_OPTIONS,
  displayLookupCg,
  displayLookupCv,
  downloadTraCuuDangXuLyExcel,
  fetchTraCuuDangXuLy,
  type LookupThuTuc,
  type LookupTinhTrang,
  type TraCuuFilterState,
} from "./lookupShared";

export function LookupPendingTab(props?: {
  state: TraCuuFilterState;
  setState: Dispatch<SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  const { state, setState, isActive } = useLookupTabState(props, DEFAULT_TRA_CUU_FILTER_STATE);
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const { selectedDetail, openDetail, closeDetail } = useLookupDetailModal();
  const { setChuyenVien, setChuyenGia, setThuTuc, setTinhTrang, setMaHoSo } = useLookupFilterControls(setState);
  const deferredMaHoSo = useDeferredValue(maHoSo);
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
      maHoSo: deferredMaHoSo,
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <LookupSelectField label={"Chuy\u00ean vi\u00ean"} value={chuyenVien} onChange={setChuyenVien}>
            <option value="">{LOOKUP_TEXT.all}</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </LookupSelectField>

          <LookupSelectField label={"Chuy\u00ean gia"} value={chuyenGia} onChange={setChuyenGia}>
            <option value="">{LOOKUP_TEXT.all}</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCg(option)}</option>
            ))}
          </LookupSelectField>

          <LookupSelectField
            label={"Th\u1ee7 t\u1ee5c"}
            value={String(thuTuc)}
            onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}
          >
            <option value="all">{LOOKUP_TEXT.all}</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </LookupSelectField>

          <LookupSelectField
            label={"T\u00ecnh tr\u1ea1ng"}
            value={tinhTrang}
            onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}
          >
            {TRA_CUU_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </LookupSelectField>

          <LookupTextFilterField value={maHoSo} onChange={setMaHoSo} />

          <LookupActionBar
            onReset={handleResetFilters}
            onExport={handleExportExcel}
            exporting={exporting}
            isFetching={isFetching}
            hasData={Boolean(data)}
            rowCount={data?.rows.length ?? 0}
          />
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <LookupResultsTable
        data={data}
        sortedRows={sortedRows}
        isError={isError}
        errorMessage={LOOKUP_TEXT.pendingLookupLoadError}
        sortBy={sortBy}
        sortDir={sortDir}
        onToggleSort={toggleSort}
        dateReceivedLabel={LOOKUP_TEXT.dateReceived}
        secondDateLabel={LOOKUP_TEXT.dueDate}
        durationLabel={"Th\u1eddi gian ch\u1edd"}
        loadingMessage={"\u0110ang chu\u1ea9n b\u1ecb d\u1eef li\u1ec7u tra c\u1ee9u..."}
        emptyMessage={"Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 ph\u00f9 h\u1ee3p v\u1edbi \u0111i\u1ec1u ki\u1ec7n l\u1ecdc."}
        onOpenDetail={openDetail}
      />

      {selectedDetail && (
        <LookupHoSoDetailModal hoSoId={selectedDetail.hoSoId} maHoSo={selectedDetail.maHoSo} onClose={closeDetail} />
      )}
    </div>
  );
}

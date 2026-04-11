import { useDeferredValue, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LOOKUP_TEXT } from "../../uiText";
import { LookupHoSoDetailModal } from "./LookupHoSoDetailModal";
import { DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE, DEFAULT_TRA_CUU_FILTER_STATE, LOOKUP_TINH_TRANG_SORT_ORDER, TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS, TRA_CUU_TINH_TRANG_OPTIONS, displayLookupCg, displayLookupCv, displayLookupTinhTrang, displaySubmissionKind, downloadTraCuuDaXuLyExcel, downloadTraCuuDangXuLyExcel, extractHoSoId, fetchTraCuuDaXuLy, fetchTraCuuDangXuLy, isoToDisplay, type LookupThuTuc, type LookupTinhTrang, type TraCuuDangXuLyRow, type TraCuuFilterState } from "./lookupShared";

const LOOKUP_UI = {
  loadingData: "\u0110ang t\u1ea3i d\u1eef li\u1ec7u...",
  specialist: "Chuy\u00ean vi\u00ean",
  expert: "Chuy\u00ean gia",
  procedure: "Th\u1ee7 t\u1ee5c",
  status: "T\u00ecnh tr\u1ea1ng",
  filterCode: "L\u1ecdc m\u00e3 h\u1ed3 s\u01a1",
  enterCode: "Nh\u1eadp m\u00e3 h\u1ed3 s\u01a1",
  resetFilters: "\u0110\u1eb7t l\u1ea1i b\u1ed9 l\u1ecdc",
  exportExcel: "Xu\u1ea5t Excel",
  exporting: "\u0110ang xu\u1ea5t...",
  found: (count: number) => `T\u00ecm th\u1ea5y ${count.toLocaleString("vi-VN")} h\u1ed3 s\u01a1`,
  loadProcessedError: "Kh\u00f4ng th\u1ec3 t\u1ea3i danh m\u1ee5c h\u1ed3 s\u01a1 \u0111\u00e3 x\u1eed l\u00fd",
  loadPendingError: "Kh\u00f4ng th\u1ec3 t\u1ea3i danh m\u1ee5c h\u1ed3 s\u01a1 \u0111ang x\u1eed l\u00fd",
  dossierCode: "M\u00e3 h\u1ed3 s\u01a1",
  submissionRound: "L\u1ea7n n\u1ed9p",
  dossierType: "Lo\u1ea1i h\u1ed3 s\u01a1",
  processingTime: "Th\u1eddi gian x\u1eed l\u00fd",
  waitingTime: "Th\u1eddi gian ch\u1edd",
  dossierInfo: "Th\u00f4ng tin h\u1ed3 s\u01a1",
  preparingLookup: "\u0110ang chu\u1ea9n b\u1ecb d\u1eef li\u1ec7u tra c\u1ee9u...",
  noMatching: "Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 ph\u00f9 h\u1ee3p v\u1edbi \u0111i\u1ec1u ki\u1ec7n l\u1ecdc.",
  day: "ng\u00e0y",
  detail: "Chi ti\u1ebft",
  exportError: "L\u1ed7i xu\u1ea5t Excel",
  sortIdle: "\u2195",
  sortAsc: "\u2191",
  sortDesc: "\u2193",
  resetIcon: "\u21ba",
} as const;

export function LookupProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50">
      <div className="relative h-2 w-full overflow-hidden bg-blue-100">
        <div className="h-full w-full animate-pulse bg-blue-500" />
      </div>
      <div className="px-3 py-2 text-xs font-medium text-blue-700">{LOOKUP_UI.loadingData}</div>
    </div>
  );
}

export function TraCuuDaXuLyTab(props?: {
  state: TraCuuFilterState;
  setState: Dispatch<SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  const queryClient = useQueryClient();
  const [localState, setLocalState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
  const state = props?.state ?? localState;
  const setState = props?.setState ?? setLocalState;
  const isActive = props?.isActive ?? true;
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const [selectedDetail, setSelectedDetail] = useState<{ hoSoId: number; maHoSo: string } | null>(null);
  const setChuyenVien = (value: string) => setState((prev) => ({ ...prev, chuyenVien: value }));
  const setChuyenGia = (value: string) => setState((prev) => ({ ...prev, chuyenGia: value }));
  const setThuTuc = (value: LookupThuTuc | "all") => setState((prev) => ({ ...prev, thuTuc: value }));
  const setTinhTrang = (value: LookupTinhTrang | "all") => setState((prev) => ({ ...prev, tinhTrang: value }));
  const setMaHoSo = (value: string) => setState((prev) => ({ ...prev, maHoSo: value }));
  const deferredMaHoSo = useDeferredValue(maHoSo);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["tra-cuu-da-xu-ly", thuTuc, chuyenVien, chuyenGia, tinhTrang, deferredMaHoSo],
    queryFn: ({ signal }) => fetchTraCuuDaXuLy({
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo: deferredMaHoSo,
      signal,
    }),
    enabled: isActive,
    placeholderData: (previousData) => previousData,
    retry: 2,
  });

  useEffect(() => {
    if (!isActive) {
      void queryClient.cancelQueries({ queryKey: ["tra-cuu-da-xu-ly"] });
    }
  }, [isActive]);

  const chuyenVienOptions = data?.options.chuyen_vien ?? [];
  const chuyenGiaOptions = data?.options.chuyen_gia ?? [];

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    if (sortBy === "stt") return sortDir === "asc" ? rows : rows.reverse();

    const getValue = (row: TraCuuDangXuLyRow) => {
      switch (sortBy) {
        case "ma_ho_so": return row.ma_ho_so;
        case "ngay_tiep_nhan": return row.ngay_tiep_nhan ?? "";
        case "ngay_hen_tra": return row.ngay_hen_tra ?? "";
        case "loai_ho_so": return row.loai_ho_so ?? "";
        case "submission_kind": return row.submission_kind === "first" ? "0" : row.submission_kind === "supplement" ? "1" : "2";
        case "tinh_trang": return LOOKUP_TINH_TRANG_SORT_ORDER[row.tinh_trang] ?? Number.MAX_SAFE_INTEGER;
        case "chuyen_vien": return displayLookupCv(row.chuyen_vien);
        case "chuyen_gia": return displayLookupCg(row.chuyen_gia);
        case "thoi_gian_cho_ngay": return row.thoi_gian_cho_ngay;
        case "stt": return 0;
      }
    };

    rows.sort((left, right) => {
      const a = getValue(left);
      const b = getValue(right);
      let result = 0;
      if (typeof a === "number" && typeof b === "number") result = a - b;
      else result = String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
      if (result === 0) result = left.ma_ho_so.localeCompare(right.ma_ho_so, "vi", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    });
    return rows;
  }, [data?.rows, sortBy, sortDir]);

  const toggleSort = (key: typeof sortBy) => {
    if (key === "stt") return;
    if (sortBy === key) {
      setState((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }));
      return;
    }
    setState((prev) => ({ ...prev, sortBy: key, sortDir: "desc" }));
  };

  const SortableHeader = ({ label, sortKey, center = false }: { label: string; sortKey: typeof sortBy; center?: boolean }) => {
    const active = sortBy === sortKey;
    const arrow = !active ? LOOKUP_UI.sortIdle : sortDir === "asc" ? LOOKUP_UI.sortAsc : LOOKUP_UI.sortDesc;
    return (
      <th className={`px-3 py-3 ${center ? "text-center" : "text-left"} font-semibold uppercase tracking-wide whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors ${active ? "text-blue-700" : "text-slate-600 hover:text-slate-800"}`}
        >
          <span>{label}</span>
          <span className={`text-[10px] ${active ? "text-blue-600" : "text-slate-400"}`}>{arrow}</span>
        </button>
      </th>
    );
  };

  const SelectField = ({
    label,
    value,
    onChange,
    children,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
      >
        {children}
      </select>
    </label>
  );

  const handleResetFilters = () => setState((prev) => ({
    ...DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
    sortBy: prev.sortBy,
    sortDir: prev.sortDir,
  }));

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadTraCuuDaXuLyExcel({
        thuTuc,
        chuyenVien,
        chuyenGia,
        tinhTrang,
        maHoSo,
        sortBy,
        sortDir,
      });
    } catch (e) {
      alert(`${LOOKUP_UI.exportError}: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <SelectField label={LOOKUP_UI.specialist} value={chuyenVien} onChange={setChuyenVien}>
            <option value="">{LOOKUP_TEXT.all}</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </SelectField>
          <SelectField label={LOOKUP_UI.expert} value={chuyenGia} onChange={setChuyenGia}>
            <option value="">{LOOKUP_TEXT.all}</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectField>
          <SelectField label={LOOKUP_UI.procedure} value={String(thuTuc)} onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}>
            <option value="all">{LOOKUP_TEXT.all}</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </SelectField>
          <SelectField label={LOOKUP_UI.status} value={tinhTrang} onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}>
            {TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>
          <label className="flex min-w-[260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{LOOKUP_UI.filterCode}</span>
            <input
              type="text"
              value={maHoSo}
              onChange={(e) => setMaHoSo(e.target.value)}
              placeholder={LOOKUP_UI.enterCode}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleResetFilters} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800" title={LOOKUP_UI.resetFilters} aria-label={LOOKUP_UI.resetFilters}>{LOOKUP_UI.resetIcon}</button>
            <button type="button" onClick={handleExportExcel} disabled={exporting || isFetching || !data} className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
              {exporting ? LOOKUP_UI.exporting : LOOKUP_UI.exportExcel}
            </button>
          </div>
          <div className="ml-auto text-xs text-slate-500 font-medium">
            {isFetching ? LOOKUP_UI.loadingData : LOOKUP_UI.found(data?.rows.length ?? 0)}
          </div>
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">{LOOKUP_UI.loadProcessedError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 1220, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 78 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="px-3 py-3 text-center font-semibold uppercase tracking-wide whitespace-nowrap">STT</th>
                  <SortableHeader label={LOOKUP_UI.dossierCode} sortKey="ma_ho_so" />
                  <SortableHeader label={LOOKUP_TEXT.dateReceived} sortKey="ngay_tiep_nhan" center />
                  <SortableHeader label={LOOKUP_TEXT.resultDateShort} sortKey="ngay_hen_tra" center />
                  <SortableHeader label={LOOKUP_UI.submissionRound} sortKey="submission_kind" />
                  <SortableHeader label={LOOKUP_UI.dossierType} sortKey="loai_ho_so" center />
                  <SortableHeader label={LOOKUP_UI.specialist} sortKey="chuyen_vien" />
                  <SortableHeader label={LOOKUP_UI.expert} sortKey="chuyen_gia" />
                  <SortableHeader label={LOOKUP_UI.processingTime} sortKey="thoi_gian_cho_ngay" center />
                  <SortableHeader label={LOOKUP_UI.status} sortKey="tinh_trang" />
                  <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">{LOOKUP_UI.dossierInfo}</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">{LOOKUP_UI.preparingLookup}</td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">{LOOKUP_UI.noMatching}</td>
                  </tr>
                ) : sortedRows.map((row, index) => (
                  <tr key={`${row.thu_tuc}-${row.ma_ho_so}-${index}`} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} group hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{row.ma_ho_so}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_tiep_nhan)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_hen_tra)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displaySubmissionKind(row.submission_kind)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{row.loai_ho_so || ""}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCv(row.chuyen_vien)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCg(row.chuyen_gia)}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">{row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ${LOOKUP_UI.day}` : ""}</td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{displayLookupTinhTrang(row.tinh_trang)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const hoSoId = row.thu_tuc === 48 ? extractHoSoId(row.ma_ho_so) : null;
                          if (hoSoId) setSelectedDetail({ hoSoId, maHoSo: row.ma_ho_so });
                        }}
                        disabled={row.thu_tuc !== 48 || extractHoSoId(row.ma_ho_so) === null}
                        className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >{LOOKUP_UI.detail}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedDetail && (
        <LookupHoSoDetailModal hoSoId={selectedDetail.hoSoId} maHoSo={selectedDetail.maHoSo} onClose={() => setSelectedDetail(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export function TraCuuDangXuLyTab(props?: {
  state: TraCuuFilterState;
  setState: Dispatch<SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  const queryClient = useQueryClient();
  const [localState, setLocalState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_FILTER_STATE);
  const state = props?.state ?? localState;
  const setState = props?.setState ?? setLocalState;
  const isActive = props?.isActive ?? true;
  const { thuTuc, chuyenVien, chuyenGia, tinhTrang, maHoSo, sortBy, sortDir } = state;
  const [selectedDetail, setSelectedDetail] = useState<{ hoSoId: number; maHoSo: string } | null>(null);
  const setChuyenVien = (value: string) => setState((prev) => ({ ...prev, chuyenVien: value }));
  const setChuyenGia = (value: string) => setState((prev) => ({ ...prev, chuyenGia: value }));
  const setThuTuc = (value: LookupThuTuc | "all") => setState((prev) => ({ ...prev, thuTuc: value }));
  const setTinhTrang = (value: LookupTinhTrang | "all") => setState((prev) => ({ ...prev, tinhTrang: value }));
  const setMaHoSo = (value: string) => setState((prev) => ({ ...prev, maHoSo: value }));
  const deferredMaHoSo = useDeferredValue(maHoSo);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["tra-cuu-dang-xu-ly", thuTuc, chuyenVien, chuyenGia, tinhTrang, deferredMaHoSo],
    queryFn: ({ signal }) => fetchTraCuuDangXuLy({
      thuTuc,
      chuyenVien,
      chuyenGia,
      tinhTrang,
      maHoSo: deferredMaHoSo,
      signal,
    }),
    enabled: isActive,
    placeholderData: (previousData) => previousData,
    retry: 2,
  });

  useEffect(() => {
    if (!isActive) {
      void queryClient.cancelQueries({ queryKey: ["tra-cuu-dang-xu-ly"] });
    }
  }, [isActive]);

  const chuyenVienOptions = data?.options.chuyen_vien ?? [];
  const chuyenGiaOptions = data?.options.chuyen_gia ?? [];

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    if (sortBy === "stt") {
      return sortDir === "asc" ? rows : rows.reverse();
    }
    const getValue = (row: TraCuuDangXuLyRow) => {
      switch (sortBy) {
        case "ma_ho_so":
          return row.ma_ho_so;
        case "ngay_tiep_nhan":
          return row.ngay_tiep_nhan ?? "";
        case "ngay_hen_tra":
          return row.ngay_hen_tra ?? "";
        case "loai_ho_so":
          return row.loai_ho_so ?? "";
        case "submission_kind":
          return row.submission_kind === "first" ? "0" : row.submission_kind === "supplement" ? "1" : "2";
        case "tinh_trang":
          return LOOKUP_TINH_TRANG_SORT_ORDER[row.tinh_trang] ?? Number.MAX_SAFE_INTEGER;
        case "chuyen_vien":
          return displayLookupCv(row.chuyen_vien);
        case "chuyen_gia":
          return displayLookupCg(row.chuyen_gia);
        case "thoi_gian_cho_ngay":
          return row.thoi_gian_cho_ngay;
        case "stt":
          return 0;
      }
    };

    rows.sort((left, right) => {
      const a = getValue(left);
      const b = getValue(right);
      let result = 0;
      if (typeof a === "number" && typeof b === "number") {
        result = a - b;
      } else {
        result = String(a).localeCompare(String(b), "vi", { numeric: true, sensitivity: "base" });
      }
      if (result === 0) result = left.ma_ho_so.localeCompare(right.ma_ho_so, "vi", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    });
    return rows;
  }, [data?.rows, sortBy, sortDir]);

  const toggleSort = (key: typeof sortBy) => {
    if (key === "stt") return;
    if (sortBy === key) {
      setState((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }));
      return;
    }
    setState((prev) => ({ ...prev, sortBy: key, sortDir: "desc" }));
  };

  const SortableHeader = ({ label, sortKey, center = false }: { label: string; sortKey: typeof sortBy; center?: boolean }) => {
    const active = sortBy === sortKey;
    const arrow = !active ? LOOKUP_UI.sortIdle : sortDir === "asc" ? LOOKUP_UI.sortAsc : LOOKUP_UI.sortDesc;
    return (
      <th className={`px-3 py-3 ${center ? "text-center" : "text-left"} font-semibold uppercase tracking-wide whitespace-nowrap`}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors ${active ? "text-blue-700" : "text-slate-600 hover:text-slate-800"}`}
        >
          <span>{label}</span>
          <span className={`text-[10px] ${active ? "text-blue-600" : "text-slate-400"}`}>{arrow}</span>
        </button>
      </th>
    );
  };

  const SelectField = ({
    label,
    value,
    onChange,
    children,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
  }) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
      >
        {children}
      </select>
    </label>
  );

  const handleResetFilters = () => setState((prev) => ({
    ...DEFAULT_TRA_CUU_FILTER_STATE,
    sortBy: prev.sortBy,
    sortDir: prev.sortDir,
  }));

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadTraCuuDangXuLyExcel({
        thuTuc,
        chuyenVien,
        chuyenGia,
        tinhTrang,
        maHoSo,
        sortBy,
        sortDir,
      });
    } catch (e) {
      alert(`${LOOKUP_UI.exportError}: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <SelectField label={LOOKUP_UI.specialist} value={chuyenVien} onChange={setChuyenVien}>
            <option value="">{LOOKUP_TEXT.all}</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </SelectField>

          <SelectField label={LOOKUP_UI.expert} value={chuyenGia} onChange={setChuyenGia}>
            <option value="">{LOOKUP_TEXT.all}</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectField>

          <SelectField label={LOOKUP_UI.procedure} value={String(thuTuc)} onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}>
            <option value="all">{LOOKUP_TEXT.all}</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </SelectField>

          <SelectField label={LOOKUP_UI.status} value={tinhTrang} onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}>
            {TRA_CUU_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>

          <label className="flex min-w-[260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{LOOKUP_UI.filterCode}</span>
            <input
              type="text"
              value={maHoSo}
              onChange={(e) => setMaHoSo(e.target.value)}
              placeholder={LOOKUP_UI.enterCode}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800"
              title={LOOKUP_UI.resetFilters}
              aria-label={LOOKUP_UI.resetFilters}
            >
              {LOOKUP_UI.resetIcon}
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || isFetching || !data}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? LOOKUP_UI.exporting : LOOKUP_UI.exportExcel}
            </button>
          </div>

          <div className="ml-auto text-xs text-slate-500 font-medium">
            {isFetching ? LOOKUP_UI.loadingData : LOOKUP_UI.found(data?.rows.length ?? 0)}
          </div>
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">{LOOKUP_UI.loadPendingError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 1220, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 78 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 110 }} />
                <col />
                            <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="px-3 py-3 text-center font-semibold uppercase tracking-wide whitespace-nowrap">STT</th>
                  <SortableHeader label={LOOKUP_UI.dossierCode} sortKey="ma_ho_so" />
                  <SortableHeader label={LOOKUP_TEXT.dateReceived} sortKey="ngay_tiep_nhan" center />
                  <SortableHeader label={LOOKUP_TEXT.dueDate} sortKey="ngay_hen_tra" center />
                  <SortableHeader label={LOOKUP_UI.submissionRound} sortKey="submission_kind" />
                  <SortableHeader label={LOOKUP_UI.dossierType} sortKey="loai_ho_so" center />
                  <SortableHeader label={LOOKUP_UI.specialist} sortKey="chuyen_vien" />
                  <SortableHeader label={LOOKUP_UI.expert} sortKey="chuyen_gia" />
                  <SortableHeader label={LOOKUP_UI.waitingTime} sortKey="thoi_gian_cho_ngay" center />
                  <SortableHeader label={LOOKUP_UI.status} sortKey="tinh_trang" />
                  <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">{LOOKUP_UI.dossierInfo}</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">{LOOKUP_UI.preparingLookup}</td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">{LOOKUP_UI.noMatching}</td>
                  </tr>
                ) : sortedRows.map((row, index) => (
                  <tr key={`${row.thu_tuc}-${row.ma_ho_so}-${index}`} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} group hover:bg-blue-50`}>
                    <td className="px-3 py-2.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{row.ma_ho_so}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_tiep_nhan)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{isoToDisplay(row.ngay_hen_tra)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displaySubmissionKind(row.submission_kind)}</td>
                    <td className="px-3 py-2.5 text-center text-slate-700">{row.loai_ho_so || ""}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCv(row.chuyen_vien)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{displayLookupCg(row.chuyen_gia)}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">
                      {row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ${LOOKUP_UI.day}` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{displayLookupTinhTrang(row.tinh_trang)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const hoSoId = row.thu_tuc === 48 ? extractHoSoId(row.ma_ho_so) : null;
                          if (hoSoId) setSelectedDetail({ hoSoId, maHoSo: row.ma_ho_so });
                        }}
                        disabled={row.thu_tuc !== 48 || extractHoSoId(row.ma_ho_so) === null}
                        className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >{LOOKUP_UI.detail}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedDetail && (
        <LookupHoSoDetailModal
          hoSoId={selectedDetail.hoSoId}
          maHoSo={selectedDetail.maHoSo}
          onClose={() => setSelectedDetail(null)}
        />
      )}
    </div>
  );
}

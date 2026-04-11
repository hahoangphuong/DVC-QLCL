import { useDeferredValue, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LookupHoSoDetailModal } from "./LookupHoSoDetailModal";
import { DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE, DEFAULT_TRA_CUU_FILTER_STATE, LOOKUP_TINH_TRANG_SORT_ORDER, TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS, TRA_CUU_TINH_TRANG_OPTIONS, displayLookupCg, displayLookupCv, displayLookupTinhTrang, displaySubmissionKind, downloadTraCuuDaXuLyExcel, downloadTraCuuDangXuLyExcel, extractHoSoId, fetchTraCuuDaXuLy, fetchTraCuuDangXuLy, isoToDisplay, type LookupThuTuc, type LookupTinhTrang, type TraCuuDangXuLyRow, type TraCuuFilterState } from "./lookupShared";

export function LookupProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50">
      <div className="relative h-2 w-full overflow-hidden bg-blue-100">
        <div className="h-full w-full animate-pulse bg-blue-500" />
      </div>
      <div className="px-3 py-2 text-xs font-medium text-blue-700">
        Đang tải dữ liệu...
      </div>
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
    const arrow = !active ? "↕" : sortDir === "asc" ? "↑" : "↓";
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
      alert(`Lỗi xuất Excel: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <SelectField label="Chuyên viên" value={chuyenVien} onChange={setChuyenVien}>
            <option value="">Tất cả</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </SelectField>
          <SelectField label="Chuyên gia" value={chuyenGia} onChange={setChuyenGia}>
            <option value="">Tất cả</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectField>
          <SelectField label="Thủ tục" value={String(thuTuc)} onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}>
            <option value="all">Tất cả</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </SelectField>
          <SelectField label="Tình trạng" value={tinhTrang} onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}>
            {TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>
          <label className="flex min-w-[260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lọc mã hồ sơ</span>
            <input
              type="text"
              value={maHoSo}
              onChange={(e) => setMaHoSo(e.target.value)}
              placeholder="Nhập mã hồ sơ"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleResetFilters} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800" title="Đặt lại bộ lọc" aria-label="Đặt lại bộ lọc">↺</button>
            <button type="button" onClick={handleExportExcel} disabled={exporting || isFetching || !data} className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </button>
          </div>
          <div className="ml-auto text-xs text-slate-500 font-medium">
            {isFetching ? "Đang tải dữ liệu..." : `Tìm thấy ${data?.rows.length.toLocaleString("vi-VN") ?? 0} hồ sơ`}
          </div>
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">
            Không thể tải danh mục hồ sơ đã xử lý
          </div>
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
                  <SortableHeader label="Mã hồ sơ" sortKey="ma_ho_so" />
                  <SortableHeader label={LOOKUP_TEXT.dateReceived} sortKey="ngay_tiep_nhan" center />
                  <SortableHeader label={LOOKUP_TEXT.resultDateShort} sortKey="ngay_hen_tra" center />
                  <SortableHeader label="Lần nộp" sortKey="submission_kind" />
                  <SortableHeader label="Loại hồ sơ" sortKey="loai_ho_so" center />
                  <SortableHeader label="Chuyên viên" sortKey="chuyen_vien" />
                  <SortableHeader label="Chuyên gia" sortKey="chuyen_gia" />
                  <SortableHeader label="Thời gian xử lý" sortKey="thoi_gian_cho_ngay" center />
                  <SortableHeader label="Tình trạng" sortKey="tinh_trang" />
                  <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">Thông tin hồ sơ</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">Đang chuẩn bị dữ liệu tra cứu...</td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">Không có hồ sơ phù hợp với điều kiện lọc.</td>
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
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap">{row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ngày` : ""}</td>
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
                      >
                        Chi tiết
                      </button>
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
// Generic DonutChart — tái sử dụng cho mọi biểu đồ tròn
// ---------------------------------------------------------------------------

/* const TRA_CUU_TINH_TRANG_OPTIONS: Array<{ value: "all" | LookupTinhTrang; label: string }> = [
  { value: "all", label: LOOKUP_TEXT.all },
  { value: "cho_phan_cong", label: LOOKUP_TEXT.pendingAssignment },
  { value: "cho_chuyen_vien", label: LOOKUP_TEXT.pendingSpecialist },
  { value: "chua_xu_ly", label: LOOKUP_TEXT.notProcessed },
  { value: "bi_tra_lai", label: LOOKUP_TEXT.returned },
  { value: "cho_tong_hop", label: LOOKUP_TEXT.pendingSummary },
  { value: "cho_chuyen_gia", label: LOOKUP_TEXT.pendingExpert },
  { value: "cho_to_truong", label: LOOKUP_TEXT.pendingLeader },
  { value: "cho_truong_phong", label: LOOKUP_TEXT.pendingManager },
  { value: "cho_cong_bo", label: LOOKUP_TEXT.pendingPublish },
  { value: "cho_van_thu", label: LOOKUP_TEXT.pendingClerical },
];
const TRA_CUU_DA_XU_LY_TINH_TRANG_OPTIONS: Array<{ value: "all" | LookupTinhTrang; label: string }> = [
  { value: "all", label: LOOKUP_TEXT.all },
  { value: "can_bo_sung", label: LOOKUP_TEXT.requiresSupplement },
  { value: "khong_dat", label: LOOKUP_TEXT.failed },
  { value: "da_hoan_thanh", label: LOOKUP_TEXT.completed },
];

const LOOKUP_TINH_TRANG_LABELS: Record<LookupTinhTrang, string> = {
  cho_phan_cong: LOOKUP_TEXT.pendingAssignment,
  cho_chuyen_vien: LOOKUP_TEXT.pendingSpecialist,
  chua_xu_ly: LOOKUP_TEXT.notProcessed,
  bi_tra_lai: LOOKUP_TEXT.returned,
  cho_tong_hop: LOOKUP_TEXT.pendingSummary,
  cho_chuyen_gia: LOOKUP_TEXT.pendingExpert,
  cho_to_truong: LOOKUP_TEXT.pendingLeader,
  cho_truong_phong: LOOKUP_TEXT.pendingManager,
  cho_cong_bo: LOOKUP_TEXT.pendingPublish,
  cho_van_thu: LOOKUP_TEXT.pendingClerical,
  can_bo_sung: LOOKUP_TEXT.requiresSupplement,
  khong_dat: LOOKUP_TEXT.failed,
  da_hoan_thanh: LOOKUP_TEXT.completed,
};
const LOOKUP_TINH_TRANG_SORT_ORDER: Record<LookupTinhTrang, number> = {
  cho_phan_cong: 1,
  cho_chuyen_vien: 2,
  chua_xu_ly: 3,
  bi_tra_lai: 4,
  cho_tong_hop: 5,
  cho_chuyen_gia: 6,
  cho_to_truong: 7,
  cho_truong_phong: 8,
  cho_cong_bo: 9,
  cho_van_thu: 10,
  can_bo_sung: 11,
  khong_dat: 12,
  da_hoan_thanh: 13,
};

export function displayLookupTinhTrang(value: LookupTinhTrang): string {
  return LOOKUP_TINH_TRANG_LABELS[value] ?? value;
}
export function displayLookupCv(raw: string | null): string {
  if (!raw) return "";
  if (raw === "__CHUA_PHAN__") return LOOKUP_TEXT.pendingAssignment;
  return cleanCvName(raw);
}

export function displayLookupCg(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/^CG\s*:\s*/i, "").trim();
}

export function displaySubmissionKind(value: string | null): string {
  if (value === "first") return "Lần đầu";
  if (value === "supplement") return "Lần bổ sung";
  return "";
}

async function downloadTraCuuDangXuLyExcel(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
}) {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien.trim()) search.set("chuyen_vien", params.chuyenVien.trim());
  if (params.chuyenGia.trim()) search.set("chuyen_gia", params.chuyenGia.trim());
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());
  search.set("sort_by", params.sortBy);
  search.set("sort_dir", params.sortDir);

  const res = await fetch(`${API}/stats/tra-cuu-dang-xu-ly/export?${search.toString()}`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {}
    throw new Error(detail);
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const matched = cd.match(/filename="?([^"]+)"?/);
  const filename = matched?.[1] ?? "Tra_cuu_dang_xu_ly.xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function downloadTraCuuDaXuLyExcel(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
}) {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien.trim()) search.set("chuyen_vien", params.chuyenVien.trim());
  if (params.chuyenGia.trim()) search.set("chuyen_gia", params.chuyenGia.trim());
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());
  search.set("sort_by", params.sortBy);
  search.set("sort_dir", params.sortDir);

  const res = await fetch(`${API}/stats/tra-cuu-da-xu-ly/export?${search.toString()}`);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {}
    throw new Error(detail);
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const matched = cd.match(/filename="?([^"]+)"?/);
  const filename = matched?.[1] ?? "Tra_cuu_da_xu_ly.xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

*/
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
    const arrow = !active ? "↕" : sortDir === "asc" ? "↑" : "↓";
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
      alert(`Lỗi xuất Excel: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <SelectField label="Chuyên viên" value={chuyenVien} onChange={setChuyenVien}>
            <option value="">Tất cả</option>
            {chuyenVienOptions.map((option) => (
              <option key={option} value={option}>{displayLookupCv(option)}</option>
            ))}
          </SelectField>

          <SelectField label="Chuyên gia" value={chuyenGia} onChange={setChuyenGia}>
            <option value="">Tất cả</option>
            {chuyenGiaOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectField>

          <SelectField label="Thủ tục" value={String(thuTuc)} onChange={(value) => setThuTuc(value === "all" ? "all" : Number(value) as LookupThuTuc)}>
            <option value="all">Tất cả</option>
            <option value="48">TT48</option>
            <option value="47">TT47</option>
            <option value="46">TT46</option>
          </SelectField>

          <SelectField label="Tình trạng" value={tinhTrang} onChange={(value) => setTinhTrang(value as LookupTinhTrang | "all")}>
            {TRA_CUU_TINH_TRANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>

          <label className="flex min-w-[260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lọc mã hồ sơ</span>
            <input
              type="text"
              value={maHoSo}
              onChange={(e) => setMaHoSo(e.target.value)}
              placeholder="Nhập mã hồ sơ"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800"
              title="Đặt lại bộ lọc"
              aria-label="Đặt lại bộ lọc"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || isFetching || !data}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </button>
          </div>

          <div className="ml-auto text-xs text-slate-500 font-medium">
            {isFetching ? "Đang tải dữ liệu..." : `Tìm thấy ${data?.rows.length.toLocaleString("vi-VN") ?? 0} hồ sơ`}
          </div>
        </div>
      </div>

      <LookupProgressBar visible={isActive && (isLoading || isFetching)} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isError ? (
          <div className="flex items-center justify-center h-48 text-red-400 text-sm">
            Không thể tải danh mục hồ sơ đang xử lý
          </div>
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
                  <SortableHeader label="Mã hồ sơ" sortKey="ma_ho_so" />
                  <SortableHeader label={LOOKUP_TEXT.dateReceived} sortKey="ngay_tiep_nhan" center />
                  <SortableHeader label={LOOKUP_TEXT.dueDate} sortKey="ngay_hen_tra" center />
                  <SortableHeader label="Lần nộp" sortKey="submission_kind" />
                  <SortableHeader label="Loại hồ sơ" sortKey="loai_ho_so" center />
                  <SortableHeader label="Chuyên viên" sortKey="chuyen_vien" />
                  <SortableHeader label="Chuyên gia" sortKey="chuyen_gia" />
                  <SortableHeader label="Thời gian chờ" sortKey="thoi_gian_cho_ngay" center />
                  <SortableHeader label="Tình trạng" sortKey="tinh_trang" />
                  <th className="px-3 py-3 text-center font-semibold tracking-wide whitespace-nowrap">Thông tin hồ sơ</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">
                      Đang chuẩn bị dữ liệu tra cứu...
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">
                      Không có hồ sơ phù hợp với điều kiện lọc.
                    </td>
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
                      {row.thoi_gian_cho_ngay > 0 ? `${row.thoi_gian_cho_ngay} ngày` : ""}
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
                      >
                        Chi tiết
                      </button>
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

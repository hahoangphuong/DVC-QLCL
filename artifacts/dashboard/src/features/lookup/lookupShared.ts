import type { Dispatch, SetStateAction } from "react";
import { LOOKUP_TEXT } from "../../uiText";
import { cleanCgName, cleanCvName } from "../../shared/nameFormatters";
export { isoToDisplay } from "../../shared/displayFormatters";

const API = "/api";

export type LookupThuTuc = 46 | 47 | 48;
export type LookupTinhTrang =
  | "cho_phan_cong"
  | "cho_chuyen_vien"
  | "dang_tham_dinh"
  | "cho_tham_dinh"
  | "cho_quyet_dinh"
  | "cho_ke_hoach"
  | "cho_bao_cao"
  | "dang_xu_ly"
  | "cho_nop_capa"
  | "cho_danh_gia_capa"
  | "chua_xu_ly"
  | "bi_tra_lai"
  | "cho_tong_hop"
  | "cho_chuyen_gia"
  | "cho_to_truong"
  | "cho_truong_phong"
  | "cho_cong_bo"
  | "cho_van_thu"
  | "can_bo_sung"
  | "khong_dat"
  | "da_hoan_thanh";

export type LookupTinhTrangOption = {
  value: "all" | LookupTinhTrang;
  label: string;
};

export type LookupTinhTrangOptionGroup = {
  label: string;
  options: LookupTinhTrangOption[];
};

export interface TraCuuDangXuLyRow {
  thu_tuc: LookupThuTuc;
  ma_ho_so: string;
  ngay_tiep_nhan: string | null;
  ngay_hen_tra: string | null;
  loai_ho_so: string | null;
  submission_kind: string | null;
  tinh_trang: LookupTinhTrang;
  chuyen_vien: string | null;
  chuyen_gia: string | null;
  thoi_gian_cho_ngay: number;
}

export type TraCuuSortKey =
  | "stt"
  | "ma_ho_so"
  | "ngay_tiep_nhan"
  | "ngay_hen_tra"
  | "loai_ho_so"
  | "submission_kind"
  | "tinh_trang"
  | "chuyen_vien"
  | "chuyen_gia"
  | "thoi_gian_cho_ngay";

export type TraCuuFilterState = {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
};

export type TraCuuFilterStateSetter = Dispatch<SetStateAction<TraCuuFilterState>>;

const BASE_TRA_CUU_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
};

export const DEFAULT_TRA_CUU_FILTER_STATE: TraCuuFilterState = {
  ...BASE_TRA_CUU_FILTER_STATE,
};

export const DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE: TraCuuFilterState = {
  ...BASE_TRA_CUU_FILTER_STATE,
};

export interface TraCuuDangXuLyData {
  filters: {
    thu_tuc: LookupThuTuc | null;
    chuyen_vien: string | null;
    chuyen_gia: string | null;
    tinh_trang: LookupTinhTrang | null;
    ma_ho_so: string | null;
  };
  options: {
    chuyen_vien: string[];
    chuyen_gia: string[];
  };
  rows: TraCuuDangXuLyRow[];
}

export interface TraCuuDaXuLyData extends TraCuuDangXuLyData {}

export interface DavTt48FileItem {
  duongDanTep?: string | null;
  tenTep?: string | null;
  moTaTep?: string | null;
  code?: string | null;
}

export interface DavTt48HoSoBundle {
  lanBoSung?: number | null;
  moTaTep?: string | null;
  danhSachTepDinhKem?: DavTt48FileItem[];
}

export interface DavTt48HistoryItem {
  nguoiXuLy?: string | null;
  hanhDongXuLy?: string | null;
  ngayXuLy?: string | null;
  noiDungYKien?: string | null;
  soNgayXuLy?: number | null;
  soNgayQuaHan?: number | null;
}

export interface DavTt48DetailData {
  ok: boolean;
  thu_tuc: 48;
  ho_so_id: number;
  view: {
    hoSo: Record<string, unknown>;
    trangThaiHoSo: number | null;
    urlGiayBaoThu: string | null;
    urlBanDangKy: string | null;
    listTepHoSo: DavTt48HoSoBundle[];
    listTepHoSoXuLy: Array<Record<string, unknown>>;
    parsedJsonDonHang: Record<string, unknown> | null;
    parsedJsonPhamViKinhDoanh: Array<Record<string, unknown>> | null;
  };
  history: {
    listYKien: DavTt48HistoryItem[];
  };
}

export async function fetchTraCuuDangXuLy(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  signal?: AbortSignal;
}): Promise<TraCuuDangXuLyData> {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien) search.set("chuyen_vien", params.chuyenVien);
  if (params.chuyenGia) search.set("chuyen_gia", params.chuyenGia);
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());

  const qs = search.toString();
  const res = await fetch(`${API}/stats/tra-cuu-dang-xu-ly${qs ? `?${qs}` : ""}`, { signal: params.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTraCuuDaXuLy(params: {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  signal?: AbortSignal;
}): Promise<TraCuuDaXuLyData> {
  const search = new URLSearchParams();
  if (params.thuTuc !== "all") search.set("thu_tuc", String(params.thuTuc));
  if (params.chuyenVien) search.set("chuyen_vien", params.chuyenVien);
  if (params.chuyenGia) search.set("chuyen_gia", params.chuyenGia);
  if (params.tinhTrang !== "all") search.set("tinh_trang", params.tinhTrang);
  if (params.maHoSo.trim()) search.set("ma_ho_so", params.maHoSo.trim());

  const qs = search.toString();
  const res = await fetch(`${API}/stats/tra-cuu-da-xu-ly${qs ? `?${qs}` : ""}`, { signal: params.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchDavTt48HoSoDetail(hoSoId: number): Promise<DavTt48DetailData> {
  const res = await fetch(`${API}/dav/tt48/ho-so/${hoSoId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function extractHoSoId(maHoSo: string): number | null {
  const matched = /^\s*(\d+)\s*\/\s*TT48\s*$/i.exec(maHoSo);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function buildDavViewFileUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  return `${API}/dav/file?path=${encodeURIComponent(pathOrUrl)}`;
}

const LOOKUP_PENDING_COMMON_OPTIONS: LookupTinhTrangOption[] = [
  { value: "cho_phan_cong", label: LOOKUP_TEXT.pendingAssignment },
];

const LOOKUP_PENDING_TT47_46_OPTIONS: LookupTinhTrangOption[] = [
  { value: "cho_tham_dinh", label: LOOKUP_TEXT.pendingAppraisalWait },
  { value: "cho_quyet_dinh", label: LOOKUP_TEXT.pendingDecisionWait },
  { value: "cho_ke_hoach", label: LOOKUP_TEXT.pendingPlanWait },
  { value: "cho_bao_cao", label: LOOKUP_TEXT.pendingReportWait },
  { value: "dang_xu_ly", label: LOOKUP_TEXT.pendingProcessing },
  { value: "cho_nop_capa", label: LOOKUP_TEXT.pendingCapaSubmit },
  { value: "cho_danh_gia_capa", label: LOOKUP_TEXT.pendingCapaReview },
];

const LOOKUP_PENDING_TT48_OPTIONS: LookupTinhTrangOption[] = [
  { value: "cho_chuyen_vien", label: LOOKUP_TEXT.pendingSpecialist },
  { value: "dang_tham_dinh", label: LOOKUP_TEXT.pendingReview },
  { value: "chua_xu_ly", label: LOOKUP_TEXT.notProcessed },
  { value: "bi_tra_lai", label: LOOKUP_TEXT.returned },
  { value: "cho_tong_hop", label: LOOKUP_TEXT.pendingSummary },
  { value: "cho_chuyen_gia", label: LOOKUP_TEXT.pendingExpert },
  { value: "cho_to_truong", label: LOOKUP_TEXT.pendingLeader },
  { value: "cho_truong_phong", label: LOOKUP_TEXT.pendingManager },
  { value: "cho_cong_bo", label: LOOKUP_TEXT.pendingPublish },
  { value: "cho_van_thu", label: LOOKUP_TEXT.pendingClerical },
];

const LOOKUP_DONE_COMMON_OPTIONS: LookupTinhTrangOption[] = [
  { value: "can_bo_sung", label: LOOKUP_TEXT.requiresSupplement },
  { value: "khong_dat", label: LOOKUP_TEXT.failed },
  { value: "da_hoan_thanh", label: LOOKUP_TEXT.completed },
];

export function getPendingTinhTrangOptionGroups(
  thuTuc: LookupThuTuc | "all",
): LookupTinhTrangOptionGroup[] {
  if (thuTuc === 46 || thuTuc === 47) {
    return [
      { label: "Chung", options: LOOKUP_PENDING_COMMON_OPTIONS },
      { label: "TT47 / TT46", options: LOOKUP_PENDING_TT47_46_OPTIONS },
    ];
  }

  if (thuTuc === 48) {
    return [
      { label: "Chung", options: LOOKUP_PENDING_COMMON_OPTIONS },
      { label: "TT48", options: LOOKUP_PENDING_TT48_OPTIONS },
    ];
  }

  return [
    { label: "Chung", options: LOOKUP_PENDING_COMMON_OPTIONS },
    { label: "TT47 / TT46", options: LOOKUP_PENDING_TT47_46_OPTIONS },
    { label: "TT48", options: LOOKUP_PENDING_TT48_OPTIONS },
  ];
}

export function getDoneTinhTrangOptionGroups(
  _thuTuc: LookupThuTuc | "all",
): LookupTinhTrangOptionGroup[] {
  return [
    { label: "Tất cả thủ tục", options: LOOKUP_DONE_COMMON_OPTIONS },
  ];
}

export function isPendingTinhTrangAllowed(
  thuTuc: LookupThuTuc | "all",
  tinhTrang: LookupTinhTrang | "all",
): boolean {
  if (tinhTrang === "all") return true;
  return getPendingTinhTrangOptionGroups(thuTuc).some((group) =>
    group.options.some((option) => option.value === tinhTrang)
  );
}

export function isDoneTinhTrangAllowed(
  thuTuc: LookupThuTuc | "all",
  tinhTrang: LookupTinhTrang | "all",
): boolean {
  if (tinhTrang === "all") return true;
  return getDoneTinhTrangOptionGroups(thuTuc).some((group) =>
    group.options.some((option) => option.value === tinhTrang)
  );
}

export const LOOKUP_TINH_TRANG_LABELS: Record<LookupTinhTrang, string> = {
  cho_phan_cong: LOOKUP_TEXT.pendingAssignment,
  cho_chuyen_vien: LOOKUP_TEXT.pendingSpecialist,
  dang_tham_dinh: LOOKUP_TEXT.pendingReview,
  cho_tham_dinh: LOOKUP_TEXT.pendingAppraisalWait,
  cho_quyet_dinh: LOOKUP_TEXT.pendingDecisionWait,
  cho_ke_hoach: LOOKUP_TEXT.pendingPlanWait,
  cho_bao_cao: LOOKUP_TEXT.pendingReportWait,
  dang_xu_ly: LOOKUP_TEXT.pendingProcessing,
  cho_nop_capa: LOOKUP_TEXT.pendingCapaSubmit,
  cho_danh_gia_capa: LOOKUP_TEXT.pendingCapaReview,
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

export const LOOKUP_TINH_TRANG_SORT_ORDER: Record<LookupTinhTrang, number> = {
  cho_phan_cong: 1,
  cho_chuyen_vien: 2,
  dang_tham_dinh: 3,
  cho_tham_dinh: 4,
  cho_quyet_dinh: 5,
  cho_ke_hoach: 6,
  cho_bao_cao: 7,
  dang_xu_ly: 8,
  cho_nop_capa: 9,
  cho_danh_gia_capa: 10,
  chua_xu_ly: 11,
  bi_tra_lai: 12,
  cho_tong_hop: 13,
  cho_chuyen_gia: 14,
  cho_to_truong: 15,
  cho_truong_phong: 16,
  cho_cong_bo: 17,
  cho_van_thu: 18,
  can_bo_sung: 19,
  khong_dat: 20,
  da_hoan_thanh: 21,
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
  return cleanCgName(raw);
}

export function displaySubmissionKind(value: string | null): string {
  if (value === "first") return "Lần đầu";
  if (value === "supplement") return "Lần bổ sung";
  return "";
}

export const LOOKUP_COMMON_MESSAGES = {
  loadingResults: "\u0110ang chu\u1ea9n b\u1ecb d\u1eef li\u1ec7u tra c\u1ee9u...",
  emptyResults: "Kh\u00f4ng c\u00f3 h\u1ed3 s\u01a1 ph\u00f9 h\u1ee3p v\u1edbi \u0111i\u1ec1u ki\u1ec7n l\u1ecdc.",
  pendingDurationLabel: "Th\u1eddi gian ch\u1edd",
  doneDurationLabel: "Th\u1eddi gian x\u1eed l\u00fd",
} as const;

async function downloadBlob(url: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(url);
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
  const matched = cd.match(/filename=\"?([^\"]+)\"?/);
  const filename = matched?.[1] ?? fallbackFilename;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export async function downloadTraCuuDangXuLyExcel(params: {
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
  await downloadBlob(`${API}/stats/tra-cuu-dang-xu-ly/export?${search.toString()}`, "Tra_cuu_dang_xu_ly.xlsx");
}

export async function downloadTraCuuDaXuLyExcel(params: {
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
  await downloadBlob(`${API}/stats/tra-cuu-da-xu-ly/export?${search.toString()}`, "Tra_cuu_da_xu_ly.xlsx");
}

// ---------------------------------------------------------------------------
// Chuyên gia data model
// ---------------------------------------------------------------------------

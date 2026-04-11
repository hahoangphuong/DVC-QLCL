const API = "/api";

export type LookupThuTuc = 46 | 47 | 48;
export type LookupTinhTrang =
  | "cho_phan_cong"
  | "cho_chuyen_vien"
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

export const DEFAULT_TRA_CUU_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
};

export const DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
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

export function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = iso.split("T")[0];
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
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

// ---------------------------------------------------------------------------
// Chuyên gia data model
// ---------------------------------------------------------------------------

import type { SupportedThuTuc } from "../stats/statsShared";

const API = "/api";

export type PendingThuTuc = SupportedThuTuc;

export interface DangXuLyRow {
  cv_name: string;
  tong: number;
  cho_cv: number;
  cho_cg: number;
  cho_to_truong: number;
  cho_trp: number;
  cho_pct: number;
  cho_van_thu: number;
  con_han: number;
  qua_han: number;
  cham_so_ngay: number;
  cham_ma: string | null;
  cham_ngay: string | null;
  chua_xu_ly?: number;
  bi_tra_lai?: number;
  cho_tong_hop?: number;
  cho_cong_bo?: number;
  chua_xu_ly_con?: number;
  chua_xu_ly_qua?: number;
  bi_tra_lai_con?: number;
  bi_tra_lai_qua?: number;
  cho_cg_con?: number;
  cho_cg_qua?: number;
  cho_tong_hop_con?: number;
  cho_tong_hop_qua?: number;
  cho_to_truong_con?: number;
  cho_to_truong_qua?: number;
  cho_trp_con?: number;
  cho_trp_qua?: number;
  cho_cong_bo_con?: number;
  cho_cong_bo_qua?: number;
  cho_pct_con?: number;
  cho_pct_qua?: number;
  cho_van_thu_con?: number;
  cho_van_thu_qua?: number;
}

export interface DangXuLyData {
  thu_tuc: number;
  cho_phan_cong: DangXuLyRow | null;
  rows: DangXuLyRow[];
  months: { label: string; year: number; month: number; cnt: number }[];
}

export interface ChuyenGiaRow {
  ten: string;
  da_giai_quyet: number;
  tong: number;
  con_han: number;
  qua_han: number;
  cham_so_ngay: number;
  cham_ma: string | null;
  cham_ngay: string | null;
  cham_cv: string | null;
}

export interface ChuyenGiaData {
  thu_tuc: number;
  chuyen_gia: ChuyenGiaRow[];
  chuyen_vien_cg: ChuyenGiaRow[];
}

export async function fetchDangXuLy(thuTuc: PendingThuTuc): Promise<DangXuLyData> {
  const url = `${API}/stats/dang-xu-ly?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchChuyenGia(thuTuc: PendingThuTuc): Promise<ChuyenGiaData> {
  const url = `${API}/stats/chuyen-gia?thu_tuc=${thuTuc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const CHO_COLORS = {
  cho_cv: { fill: "#3b82f6", label: "Chờ CV", text: "#1d4ed8" },
  cho_cg: { fill: "#22c55e", label: "Chờ CG", text: "#15803d" },
  cho_to_truong: { fill: "#fb923c", label: "Chờ Tổ trưởng", text: "#c2410c" },
  cho_trp: { fill: "#f97316", label: "Chờ TrP", text: "#c2410c" },
  cho_pct: { fill: "#a855f7", label: "Chờ PCT", text: "#7e22ce" },
  cho_van_thu: { fill: "#64748b", label: "Chờ Văn thư", text: "#334155" },
} as const;

export const CHO_COLORS_48 = [
  { key: "chua_xu_ly", fill: "#3b82f6", label: "Chưa xử lý" },
  { key: "bi_tra_lai", fill: "#ef4444", label: "Bị trả lại" },
  { key: "cho_cg", fill: "#22c55e", label: "Chờ chuyên gia" },
  { key: "cho_tong_hop", fill: "#06b6d4", label: "Chờ tổng hợp" },
  { key: "cho_to_truong", fill: "#fb923c", label: "Chờ Tổ trưởng" },
  { key: "cho_trp", fill: "#f97316", label: "Chờ Trưởng phòng" },
  { key: "cho_cong_bo", fill: "#10b981", label: "Chờ công bố" },
  { key: "cho_pct", fill: "#a855f7", label: "Chờ PCT" },
  { key: "cho_van_thu", fill: "#64748b", label: "Chờ Văn thư" },
] as const;

export const PENDING_COMMON_MESSAGES = {
  loadingPending: "Đang tải dữ liệu...",
  errorPending: (thuTuc: PendingThuTuc) => `Không thể tải dữ liệu đang xử lý TT${thuTuc}`,
  loadingExperts: "Đang tải thống kê chuyên gia...",
  errorExperts: (thuTuc: number) => `Không thể tải dữ liệu chuyên gia TT${thuTuc}`,
  noExpertCases: "Không có hồ sơ đang ở bước chuyên gia",
  noSpecialistExperts: "Không có chuyên viên đóng vai chuyên gia",
} as const;

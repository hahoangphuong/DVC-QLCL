import { Fragment, useState, useCallback, useEffect, useMemo, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend,
  ComposedChart, Line,
  AreaChart, Area,
} from "recharts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { CHART_ANIMATION_MS } from "./shared/chartConfig";
import { clampToToday, parseDMY, toDMY, toYMD } from "./shared/dateUtils";
import { isoToDisplay } from "./shared/displayFormatters";
import { DashboardAuthGate } from "./features/auth/DashboardAuthGate";
import { useDashboardAuth } from "./features/auth/useDashboardAuth";
import { AdminPanel } from "./features/admin/AdminPanel";
import { AdminPanelMount } from "./features/admin/AdminPanelMount";
import { useAdminPanelShell } from "./features/admin/useAdminPanelShell";
import { DashboardShellHeader } from "./features/layout/DashboardShellHeader";
import { useDashboardSyncStatus } from "./features/layout/useDashboardSyncStatus";
import { useDashboardLookupState } from "./features/lookup/useDashboardLookupState";
import { LookupDoneTab } from "./features/lookup/LookupDoneTab";
import { LookupPendingTab } from "./features/lookup/LookupPendingTab";
import { DashboardContentSwitch } from "./features/navigation/DashboardContentSwitch";
import { DashboardTabPanels } from "./features/navigation/DashboardTabPanels";
import { DEFAULT_DASHBOARD_TAB_ID, type DashboardTabId } from "./features/navigation/dashboardTabs";
import { useDashboardTabAccess } from "./features/navigation/useDashboardTabAccess";
import { useDashboardNavigation } from "./features/navigation/useDashboardNavigation";
import { DangXuLyTab as PendingDangXuLyTab } from "./features/pending/PendingTabs";
import { Num, Pct, sumNumericField } from "./features/pending/pendingDisplay";
import { OverviewTab } from "./features/stats/OverviewTab";
import { DonutChart, SummaryBarChart } from "./features/stats/StatsCharts";
import { ThongKeTab } from "./features/stats/ThongKeTab";
import {
  COLORS,
  QUICK_FILTERS,
  TT48_LOAI_LABELS,
  fetchChuyenVien,
  fetchEarliestDate,
  fetchGiaiQuyet,
  fetchMonthly,
  fetchSummary,
  fetchTonSau,
  fetchTt48LoaiHoSo,
  fetchTt48ReceivedMonthlyLoai,
  getPreset,
  type ChuyenVienData,
  type ChuyenVienRow,
  type GiaiQuyetData,
  type MonthData,
  type MonthlyData,
  type SummaryData,
  type TabFilter,
  type TonSauData,
  type Tt48LoaiHoSoData,
  type Tt48LoaiHoSoRow,
  type Tt48ReceivedMonthlyLoaiData,
  type Tt48ReceivedMonthlyLoaiRow,
} from "./features/stats/statsShared";
import { useDashboardStatsFilters } from "./features/stats/useDashboardStatsFilters";
import { cleanCvName } from "./shared/nameFormatters";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 2,
    },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // e.g. "/dashboard"
const API  = "/api"; // API base — tách biệt khỏi BASE để production routing hoạt động

type LookupThuTuc = 46 | 47 | 48;
type LookupTinhTrang =
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

interface TraCuuDangXuLyRow {
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

type TraCuuSortKey =
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

type TraCuuFilterState = {
  thuTuc: LookupThuTuc | "all";
  chuyenVien: string;
  chuyenGia: string;
  tinhTrang: LookupTinhTrang | "all";
  maHoSo: string;
  sortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
};

const DEFAULT_TRA_CUU_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
};

const DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE: TraCuuFilterState = {
  thuTuc: "all",
  chuyenVien: "",
  chuyenGia: "",
  tinhTrang: "all",
  maHoSo: "",
  sortBy: "stt",
  sortDir: "asc",
};

interface TraCuuDangXuLyData {
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

interface TraCuuDaXuLyData extends TraCuuDangXuLyData {}

interface DavTt48FileItem {
  duongDanTep?: string | null;
  tenTep?: string | null;
  moTaTep?: string | null;
  code?: string | null;
}

interface DavTt48HoSoBundle {
  lanBoSung?: number | null;
  moTaTep?: string | null;
  danhSachTepDinhKem?: DavTt48FileItem[];
}

interface DavTt48HistoryItem {
  nguoiXuLy?: string | null;
  hanhDongXuLy?: string | null;
  ngayXuLy?: string | null;
  noiDungYKien?: string | null;
  soNgayXuLy?: number | null;
  soNgayQuaHan?: number | null;
}

interface DavTt48DetailData {
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

async function fetchTraCuuDangXuLy(params: {
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

async function fetchTraCuuDaXuLy(params: {
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

async function fetchDavTt48HoSoDetail(hoSoId: number): Promise<DavTt48DetailData> {
  const res = await fetch(`${API}/dav/tt48/ho-so/${hoSoId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function extractHoSoId(maHoSo: string): number | null {
  const matched = /^\s*(\d+)\s*\/\s*TT48\s*$/i.exec(maHoSo);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function buildDavViewFileUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  return `${API}/dav/file?path=${encodeURIComponent(pathOrUrl)}`;
}

interface ChuyenVienTableProps {
  thuTuc:   48 | 47 | 46;
  fromDate: string;
  toDate:   string;
  onCvClick?: (tenCvRaw: string) => void;
}

function ChuyenVienTable({ thuTuc, fromDate, toDate, onCvClick }: ChuyenVienTableProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-vien", thuTuc, fromDate, toDate],
    queryFn:  () => fetchChuyenVien(thuTuc, fromDate, toDate),
    enabled:  !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const rows = data?.rows ?? [];
  const cpc  = data?.cho_phan_cong ?? null;

  const thC  = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL  = "px-2 py-2 text-left   text-xs font-bold uppercase tracking-wide";
  // Sub-header không uppercase (cho cột con — trừ TỔNG)
  const thS  = "px-2 py-2 text-center text-xs font-semibold";
  const tdC  = "px-2 py-2 text-center text-xs";
  const tdL  = "px-2 py-2 text-left   text-xs";
  const totRow = "bg-slate-200 font-bold border-t-2 border-slate-400";

  // Sticky column helpers — STT fixed at left:0, CV fixed at left:36px
  const STT_W = 36;  // pixel width của cột STT
  const stickySTT = { position: "sticky" as const, left: 0,       zIndex: 10 };
  const stickyCV  = { position: "sticky" as const, left: STT_W,   zIndex: 10,
                      boxShadow: "2px 0 4px -1px rgba(0,0,0,0.12)" };

  const totals: Record<string, number> = {
    ton_truoc:       sumNumericField(rows, "ton_truoc"),
    da_nhan:         sumNumericField(rows, "da_nhan") + (cpc?.da_nhan ?? 0),
    gq_tong:         sumNumericField(rows, "gq_tong"),
    can_bo_sung:     sumNumericField(rows, "can_bo_sung"),
    khong_dat:       sumNumericField(rows, "khong_dat"),
    hoan_thanh:      sumNumericField(rows, "hoan_thanh"),
    dung_han:        sumNumericField(rows, "dung_han"),
    qua_han:         sumNumericField(rows, "qua_han"),
    ton_sau_tong:    sumNumericField(rows, "ton_sau_tong") + (cpc?.ton_sau_tong ?? 0),
    ton_sau_con_han: sumNumericField(rows, "ton_sau_con_han") + (cpc?.ton_sau_con_han ?? 0),
    ton_sau_qua_han: sumNumericField(rows, "ton_sau_qua_han") + (cpc?.ton_sau_qua_han ?? 0),
    treo:            sumNumericField(rows, "treo"),
  };
  const tot_pct_dh = totals.gq_tong > 0 ? Math.round(totals.dung_han / totals.gq_tong * 100) : 0;
  const tot_pct_gq = (totals.ton_truoc + totals.da_nhan) > 0
    ? Math.round(totals.gq_tong / (totals.ton_truoc + totals.da_nhan) * 100) : 0;

  // Tính ngưỡng top 30% cho từng cột cần highlight
  function topThresh(vals: (number | null)[]): number {
    const sorted = vals
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => b - a);
    if (sorted.length === 0) return Infinity;
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.3) - 1)];
  }
  const hiThresh = {
    ton_truoc:    topThresh(rows.map(r => r.ton_truoc)),
    da_nhan:      topThresh(rows.map(r => r.da_nhan)),
    gq_tong:      topThresh(rows.map(r => r.gq_tong)),
    hoan_thanh:   topThresh(rows.map(r => r.hoan_thanh)),
    tg_tb:        topThresh(rows.map(r => r.tg_tb)),
    ton_sau_tong: topThresh(rows.map(r => r.ton_sau_tong)),
  };
  const isHi = (thresh: number, v: number | null | undefined) =>
    v != null && v > 0 && v >= thresh;
  // Trả về class td có thêm highlight nền vàng nhạt nếu đủ điều kiện
  const hiTd = (thresh: number, v: number | null | undefined, extra = "") =>
    `${tdC}${extra ? " " + extra : ""}${isHi(thresh, v) ? " bg-amber-100" : ""}`;

  function CvRow({ row, idx }: { row: ChuyenVienRow; idx: number }) {
    const bgCls  = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    const tonTruocBg = idx % 2 === 0 ? "bg-pink-50/70" : "bg-pink-50/40";
    const daNhanBg = idx % 2 === 0 ? "bg-blue-50/70" : "bg-blue-50/40";
    const giaiQuyetBg = idx % 2 === 0 ? "bg-green-50/80" : "bg-green-50/50";
    const tonSauBg = idx % 2 === 0 ? "bg-amber-50/80" : "bg-amber-50/50";
    const treoBg = idx % 2 === 0 ? "bg-orange-50/80" : "bg-orange-50/60";
    return (
      <tr className={`${bgCls} hover:bg-blue-50/40 transition-colors`}>
        <td className={`${tdC} text-slate-400`}
            style={{ ...stickySTT, backgroundColor: bgColor, width: STT_W, minWidth: STT_W }}>
          {idx + 1}
        </td>
        <td className={`${tdL} font-semibold text-slate-800 min-w-[160px]`}
            style={{ ...stickyCV, backgroundColor: bgColor }}>
          {onCvClick ? (
            <button
              type="button"
              onClick={() => onCvClick(row.ten_cv)}
              className="cursor-pointer text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              {cleanCvName(row.ten_cv)}
            </button>
          ) : (
            cleanCvName(row.ten_cv)
          )}
        </td>
        <td className={hiTd(hiThresh.ton_truoc,    row.ton_truoc, tonTruocBg)}><Num v={row.ton_truoc} color="#be185d" bold /></td>
        <td className={hiTd(hiThresh.da_nhan,       row.da_nhan, daNhanBg)}><Num v={row.da_nhan}   color="#1d4ed8" bold /></td>
        <td className={hiTd(hiThresh.gq_tong,       row.gq_tong, `${giaiQuyetBg} font-bold text-slate-700`)}><Num v={row.gq_tong} /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.can_bo_sung} color="#b45309" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.khong_dat}   color="#dc2626" /></td>
        <td className={hiTd(hiThresh.hoan_thanh,    row.hoan_thanh, giaiQuyetBg)}><Num v={row.hoan_thanh}  color="#15803d" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.dung_han}    color="#15803d" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.qua_han}     color="#dc2626" /></td>
        <td className={hiTd(hiThresh.tg_tb,          row.tg_tb, giaiQuyetBg)}><Num v={row.tg_tb} color="#6b7280" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Pct v={row.pct_gq_dung_han} warnBelow={30} /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Pct v={row.pct_da_gq} /></td>
        <td className={hiTd(hiThresh.ton_sau_tong,  row.ton_sau_tong, `${tonSauBg} font-bold text-slate-700`)}><Num v={row.ton_sau_tong} /></td>
        <td className={`${tdC} ${tonSauBg}`}><Num v={row.ton_sau_con_han} color="#2563eb" /></td>
        <td className={`${tdC} ${tonSauBg}`}><Num v={row.ton_sau_qua_han} color="#dc2626" /></td>
        <td className={`${tdC} ${treoBg}`}><Num v={row.treo} color="#ea580c" bold /></td>
      </tr>
    );
  }

  const colSpan = 17;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Chi tiết theo chuyên viên — TT{thuTuc}
        </h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium">Đang tải...</span>}
        {isError   && <span className="text-xs text-red-500 font-medium">Lỗi tải dữ liệu</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 1100, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col /><col /><col /><col /><col />
            <col /><col /><col /><col /><col />
            <col /><col /><col /><col /><col />
          </colgroup>
          <thead>
            {/* Hàng 1: nhóm cột */}
            <tr className="bg-slate-700 text-white">
              <th className={`${thC} bg-slate-700 text-white`} rowSpan={2}
                  style={{ ...stickySTT, backgroundColor: "#334155", width: STT_W, minWidth: STT_W }}>
                STT
              </th>
              <th className={`${thL} bg-slate-700 text-white min-w-[160px]`} rowSpan={2}
                  style={{ ...stickyCV, backgroundColor: "#334155" }}>
                Chuyên viên
              </th>
              <th className={`${thC} bg-pink-700 text-white`} rowSpan={2}>Tồn<br />trước</th>
              <th className={`${thC} bg-blue-700 text-white`} rowSpan={2}>Đã<br />nhận</th>
              <th className={`${thC} bg-green-700 text-white`} colSpan={9}>Đã giải quyết</th>
              <th className={`${thC} bg-amber-700 text-white`} colSpan={3}>Tồn sau</th>
              <th className={`${thC} bg-orange-600 text-white`} rowSpan={2}>TREO</th>
            </tr>
            <tr className="bg-slate-100">
              <th className={`${thC} bg-green-50`}>Tổng</th>
              <th className={`${thS} bg-amber-50`}>Cần bổ sung</th>
              <th className={`${thS} bg-red-50`}>Không đạt</th>
              <th className={`${thS} bg-green-50`}>Hoàn thành</th>
              <th className={`${thS} bg-green-50 text-green-700`}>Đúng hạn</th>
              <th className={`${thS} bg-red-50 text-red-700`}>Quá hạn</th>
              <th className={`${thS} bg-slate-50`}>Thời gian TB</th>
              <th className={`${thS} bg-green-50 text-green-700`}>% Đúng hạn</th>
              <th className={`${thS} bg-slate-50 text-slate-600`}>% Đã GQ</th>
              <th className={`${thC} bg-amber-50`}>Tổng</th>
              <th className={`${thS} bg-blue-50 text-blue-700`}>Còn hạn</th>
              <th className={`${thS} bg-red-50 text-red-700`}>Quá hạn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  <span>Đang tải...</span>
                </div>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">Không có dữ liệu</td></tr>
            ) : (
              <>
                {/* Hàng "Chờ phân công" nếu có */}
                {cpc && (cpc.ton_sau_tong > 0 || cpc.da_nhan > 0) && (
                  <tr className="bg-yellow-50 border-b-2 border-yellow-200">
                    <td className={`${tdC} text-slate-400`}
                        style={{ ...stickySTT, backgroundColor: "#fefce8", width: STT_W, minWidth: STT_W }}>
                      —
                    </td>
                    <td className={`${tdL} text-amber-700 font-semibold`}
                        style={{ ...stickyCV, backgroundColor: "#fefce8" }}>
                      Chờ phân công...
                    </td>
                    <td className={tdC}></td>
                    <td className={tdC}><Num v={cpc.da_nhan} color="#1d4ed8" bold /></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}></td>
                    <td className={tdC}><Num v={cpc.ton_sau_tong} color="#b45309" bold /></td>
                    <td className={tdC}><Num v={cpc.ton_sau_con_han} color="#2563eb" /></td>
                    <td className={tdC}><Num v={cpc.ton_sau_qua_han} color="#dc2626" /></td>
                    <td className={tdC}></td>
                  </tr>
                )}
                {rows.map((row, idx) => <CvRow key={row.ten_cv} row={row} idx={idx} />)}
              </>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={totRow}>
                <td className={tdC}
                    style={{ ...stickySTT, backgroundColor: "#e2e8f0", width: STT_W, minWidth: STT_W }} />
                <td className={`${tdL} text-slate-700 font-bold`}
                    style={{ ...stickyCV, backgroundColor: "#e2e8f0" }}>
                  TỔNG
                </td>
                <td className={tdC}><Num v={totals.ton_truoc}       color="#be185d" bold /></td>
                <td className={tdC}><Num v={totals.da_nhan}         color="#1d4ed8" bold /></td>
                <td className={tdC}><Num v={totals.gq_tong}         bold /></td>
                <td className={tdC}><Num v={totals.can_bo_sung}     color="#b45309" bold /></td>
                <td className={tdC}><Num v={totals.khong_dat}       color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.hoan_thanh}      color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.dung_han}        color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.qua_han}         color="#dc2626" bold /></td>
                <td className={tdC} />
                <td className={tdC}><Pct v={tot_pct_dh} warnBelow={30} /></td>
                <td className={tdC}><Pct v={tot_pct_gq} /></td>
                <td className={tdC}><Num v={totals.ton_sau_tong}    bold /></td>
                <td className={tdC}><Num v={totals.ton_sau_con_han} color="#2563eb" bold /></td>
                <td className={tdC}><Num v={totals.ton_sau_qua_han} color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.treo}            color="#ea580c" bold /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Biểu đồ xu hướng theo tháng (bar + line, giống thiết kế Excel)
// ---------------------------------------------------------------------------
function MonthlyTrendChart({ thuTuc, fromDate, toDate, hideTitle = false }: {
  thuTuc: 48 | 47 | 46;
  fromDate: string;
  toDate:   string;
  hideTitle?: boolean;
}) {
  const [showLabels, setShowLabels] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["monthly", thuTuc],
    queryFn:  () => fetchMonthly(thuTuc),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // Lọc các tháng nằm trong kỳ fromDate..toDate
  const allMonths = data?.months ?? [];
  const [fy, fm] = fromDate ? [+fromDate.slice(0,4), +fromDate.slice(5,7)] : [0, 0];
  const [ty, tm] = toDate   ? [+toDate.slice(0,4),   +toDate.slice(5,7)]   : [9999, 12];
  const months = allMonths.filter(m => {
    const after  = m.year > fy  || (m.year === fy  && m.month >= fm);
    const before = m.year < ty  || (m.year === ty  && m.month <= tm);
    return after && before;
  });

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="h-64 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );

  if (isError || months.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        {!hideTitle ? (
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            Xu hướng theo tháng — TT{thuTuc}
          </h3>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#60a5fa]" /> Tiếp nhận
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#34d399]" /> Giải quyết
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> Hồ sơ tồn
          </span>
          <label className="flex items-center gap-1 cursor-pointer select-none border-l border-slate-200 pl-4 ml-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-3 h-3 accent-blue-600 cursor-pointer"
            />
            <span>Hiện số liệu</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={months}
          margin={{ top: showLabels ? 10 : 20, right: 30, bottom: 5, left: 10 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            interval={months.length > 24 ? Math.floor(months.length / 24) : 0}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "#64748b" }} width={45} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }} width={55} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                da_nhan:       "Tiếp nhận",
                da_giai_quyet: "Giải quyết",
                ton_sau:       "Hồ sơ tồn",
              };
              return [value.toLocaleString("vi-VN"), labels[name] ?? name];
            }}
          />
          <Bar yAxisId="left" dataKey="da_nhan" fill="#60a5fa" name="da_nhan" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
            {showLabels && (
              <LabelList
                dataKey="da_nhan"
                content={(props: any) => {
                  const { x, y, width, height, value } = props;
                  if (!value || height < 16) return null;
                  const cx = (x ?? 0) + (width ?? 0) / 2;
                  // Đặt center của text cách đỉnh cột một khoảng = nửa chiều dài text
                  // Tại fontSize 9, mỗi ký tự ≈ 6px; dự phòng 13px là đủ cho 3–4 chữ số
                  const cy = (y ?? 0) + 13;
                  return (
                    <text x={cx} y={cy}
                      transform={`rotate(-90, ${cx}, ${cy})`}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={9} fill="#1e40af" fontWeight={600}>
                      {value}
                    </text>
                  );
                }}
              />
            )}
          </Bar>
          <Bar yAxisId="left" dataKey="da_giai_quyet" fill="#34d399" name="da_giai_quyet" radius={[2, 2, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
            {showLabels && (
              <LabelList
                dataKey="da_giai_quyet"
                content={(props: any) => {
                  const { x, y, width, height, value } = props;
                  if (!value || height < 16) return null;
                  const cx = (x ?? 0) + (width ?? 0) / 2;
                  const cy = (y ?? 0) + 13;
                  return (
                    <text x={cx} y={cy}
                      transform={`rotate(-90, ${cx}, ${cy})`}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={9} fill="#065f46" fontWeight={600}>
                      {value}
                    </text>
                  );
                }}
              />
            )}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ton_sau"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={months.length <= 24}
            name="ton_sau"
            animationDuration={CHART_ANIMATION_MS}
          >
            {showLabels && (
              <LabelList
                dataKey="ton_sau"
                position="top"
                style={{ fontSize: 9, fill: "#b45309", fontWeight: 600 }}
                formatter={(v: number) => v || ""}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tt48LoaiHoSoMonthlyChart({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [showLabels, setShowLabels] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tt48-monthly-received"],
    queryFn: () => fetchTt48ReceivedMonthlyLoai(),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const allMonths = data?.months ?? [];
  const [fy, fm] = fromDate ? [+fromDate.slice(0, 4), +fromDate.slice(5, 7)] : [0, 0];
  const [ty, tm] = toDate ? [+toDate.slice(0, 4), +toDate.slice(5, 7)] : [9999, 12];
  const months = allMonths.filter((m) => {
    const after = m.year > fy || (m.year === fy && m.month >= fm);
    const before = m.year < ty || (m.year === ty && m.month <= tm);
    return after && before;
  });

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="h-64 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );

  if (isError || months.length === 0) return null;

  const series = [
    { key: "A", label: "Loại A", color: "#ec4899" },
    { key: "B", label: "Loại B", color: "#3b82f6" },
    { key: "C", label: "Loại C", color: "#22c55e" },
    { key: "D", label: "Loại D", color: "#f59e0b" },
    { key: "total", label: "Tổng", color: "#7c3aed" },
  ] as const;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Hồ sơ tiếp nhận theo tháng - TT48
        </h3>
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          {series.map((item) => (
            <span key={item.key} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: item.color }} /> {item.label}
            </span>
          ))}
          <label className="flex items-center gap-1 cursor-pointer select-none border-l border-slate-200 pl-4 ml-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-3 h-3 accent-blue-600 cursor-pointer"
            />
            <span>Hiện số liệu</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={months}
          barGap={2}
          margin={{ top: showLabels ? 16 : 20, right: 30, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#64748b" }}
            interval={months.length > 24 ? Math.floor(months.length / 24) : 0}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={45} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                A: "Loại A",
                B: "Loại B",
                C: "Loại C",
                D: "Loại D",
                total: "Tổng",
              };
              return [value.toLocaleString("vi-VN"), labels[name] ?? name];
            }}
          />
          {series.filter((item) => item.key !== "total").map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="tt48-received"
              fill={item.color}
              name={item.key}
              radius={item.key === "D" ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            >
              {showLabels && (
                <LabelList
                  dataKey={item.key}
                  content={(props: any) => {
                    const { x, y, width, height, value } = props;
                    if (!value || height < 16) return null;
                    const cx = (x ?? 0) + (width ?? 0) / 2;
                    const cy = (y ?? 0) + 13;
                    return (
                      <text
                        x={cx}
                        y={cy}
                        transform={`rotate(-90, ${cx}, ${cy})`}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={9}
                        fill={item.color}
                        fontWeight={600}
                      >
                        {value}
                      </text>
                    );
                  }}
                />
              )}
            </Bar>
          ))}
          <Line
            type="monotone"
            dataKey="total"
            stroke="#7c3aed"
            strokeWidth={3}
            dot={months.length <= 24}
            activeDot={{ r: 5 }}
            name="total"
          >
            {showLabels && (
              <LabelList
                dataKey="total"
                position="top"
                style={{ fontSize: 9, fill: "#7c3aed", fontWeight: 600 }}
                formatter={(v: number) => v || ""}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ThongKeDateFilterPanel({
  thuTuc,
  fromDate,
  toDate,
  fromInput,
  toInput,
  activePreset,
  loadingAll,
  update,
}: {
  thuTuc: number;
  fromDate: string;
  toDate: string;
  fromInput: string;
  toInput: string;
  activePreset: string;
  loadingAll: boolean;
  update: (patch: Partial<TabFilter>) => void;
}) {
  const applyDates = useCallback((from: string, to: string, preset?: string) => {
    const clampedTo = clampToToday(to);
    update({ fromDate: from, toDate: clampedTo, fromInput: toDMY(from), toInput: toDMY(clampedTo), activePreset: preset ?? "" });
  }, [update]);

  const handleTatCa = useCallback(async () => {
    update({ loadingAll: true });
    try {
      const earliest = thuTuc === 0
        ? (await Promise.all([fetchEarliestDate(48), fetchEarliestDate(47), fetchEarliestDate(46)])).sort()[0]
        : await fetchEarliestDate(thuTuc);
      const today = toYMD(new Date());
      applyDates(earliest, today, "tat_ca");
    } finally {
      update({ loadingAll: false });
    }
  }, [applyDates, thuTuc, update]);

  const handleFromBlur = () => {
    const parsed = parseDMY(fromInput);
    if (parsed) update({ fromDate: parsed, activePreset: "" });
    else update({ fromInput: toDMY(fromDate) });
  };

  const handleToBlur = () => {
    const parsed = parseDMY(toInput);
    if (parsed) {
      const clamped = clampToToday(parsed);
      update({ toDate: clamped, toInput: toDMY(clamped), activePreset: "" });
    }
    else update({ toInput: toDMY(toDate) });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Từ</label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={fromInput}
              onChange={(e) => update({ fromInput: e.target.value })}
              onBlur={handleFromBlur}
              className="w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
          <div className="pb-2 text-slate-400 font-semibold">—</div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Đến</label>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={toInput}
              onChange={(e) => update({ toInput: e.target.value })}
              onBlur={handleToBlur}
              className="w-36 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTatCa}
            disabled={loadingAll}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold transition-all border",
              activePreset === "tat_ca"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700",
              loadingAll ? "opacity-60 cursor-wait" : "",
            ].join(" ")}
          >
            {loadingAll ? "..." : "Tất cả"}
          </button>
          {QUICK_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { const p = getPreset(key); applyDates(p.from, p.to, key); }}
              className={[
                "rounded-lg px-3 py-2 text-xs font-semibold transition-all border",
                activePreset === key
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-slate-500 font-medium hidden lg:block">
          Kỳ thống kê: <span className="text-slate-800 font-bold">{toDMY(fromDate)}</span>
          {" → "}
          <span className="text-slate-800 font-bold">{toDMY(toDate)}</span>
        </div>
      </div>
    </div>
  );
}

function ThongKeOverviewCharts({ thuTuc, fromDate, toDate }: {
  thuTuc: 48 | 47 | 46;
  fromDate: string;
  toDate: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["summary", thuTuc, fromDate, toDate],
    queryFn: () => fetchSummary(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const { data: gqData, isLoading: gqLoading, isError: gqError } = useQuery({
    queryKey: ["giai-quyet", thuTuc, fromDate, toDate],
    queryFn: () => fetchGiaiQuyet(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const { data: tsData, isLoading: tsLoading, isError: tsError } = useQuery({
    queryKey: ["ton-sau", thuTuc, toDate],
    queryFn: () => fetchTonSau(thuTuc, toDate),
    enabled: !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const barData: BarData[] = [
    { name: "TỒN TRƯỚC", value: data?.ton_truoc ?? 0, color: COLORS.ton_truoc.bar },
    { name: "ĐÃ NHẬN", value: data?.da_nhan ?? 0, color: COLORS.da_nhan.bar },
    { name: "ĐÃ GIẢI QUYẾT", value: data?.da_giai_quyet ?? 0, color: COLORS.da_giai_quyet.bar },
    { name: "TỒN SAU", value: data?.ton_sau ?? 0, color: COLORS.ton_sau.bar },
  ];
  const giaiQuyetRatioTotal = (data?.da_giai_quyet ?? 0) + (data?.ton_sau ?? 0);
  const ttLabel = `TT${thuTuc}`;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "3.7fr 2.1fr 2.1fr 2.1fr" }}>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="relative flex items-center justify-center mb-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide text-center">
            Tình trạng hồ sơ {ttLabel}
          </h3>
          {isLoading && (
            <span className="text-xs text-blue-500 animate-pulse font-medium absolute right-0">Đang tải...</span>
          )}
          {isError && (
            <span className="text-xs text-red-500 font-medium absolute right-0">Lỗi tải dữ liệu</span>
          )}
        </div>

        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <SummaryBarChart data={barData} />
        )}

        <div className="mt-3 flex flex-wrap gap-3 justify-center">
          {Object.values(COLORS).map(({ bar, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bar }} />
              <span className="text-xs text-slate-500 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <DonutChart
        title="TỶ LỆ GIẢI QUYẾT"
        total={giaiQuyetRatioTotal}
        segments={[
          { name: "Đã giải quyết", value: data?.da_giai_quyet ?? 0, color: "#22c55e" },
          { name: "Tồn trong kỳ", value: data?.ton_sau ?? 0, color: "#f59e0b" },
        ]}
        isLoading={isLoading}
        isError={isError}
        emptyMessage="Không có hồ sơ trong kỳ thống kê"
        spinnerColor="#22c55e"
        startAngle={270}
        endAngle={-90}
      />

      <DonutChart
        title="ĐÃ GIẢI QUYẾT / HẠN"
        total={gqData?.total ?? 0}
        segments={[
          { name: "Đúng hạn", value: gqData?.dung_han ?? 0, color: "#22c55e" },
          { name: "Quá hạn", value: gqData?.qua_han ?? 0, color: "#ef4444" },
        ]}
        isLoading={gqLoading}
        isError={gqError}
        emptyMessage="Không có hồ sơ đã giải quyết trong kỳ"
        spinnerColor="#22c55e"
      />

      <DonutChart
        title="TỒN SAU / HẠN"
        total={tsData?.total ?? 0}
        segments={[
          { name: "Còn hạn", value: tsData?.con_han ?? 0, color: "#60a5fa" },
          { name: "Quá hạn", value: tsData?.qua_han ?? 0, color: "#f97316" },
        ]}
        isLoading={tsLoading}
        isError={tsError}
        emptyMessage="Không có hồ sơ tồn sau trong kỳ"
        spinnerColor="#60a5fa"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TT48 — Bảng phân loại hồ sơ theo A/B/C/D và lần nộp
// ---------------------------------------------------------------------------

function Tt48LoaiHoSoTable({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tt48-phan-loai", fromDate, toDate],
    queryFn: () => fetchTt48LoaiHoSo(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({
    A: false,
    B: false,
    C: false,
    D: false,
    TOTAL: false,
  });

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-center h-24 text-slate-400 text-sm gap-2">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Đang tải bảng phân loại hồ sơ TT48...
      </div>
    </div>
  );

  if (isError || !data) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm text-red-500 text-center">
      Không thể tải bảng phân loại hồ sơ TT48
    </div>
  );

  const rows = ["A", "B", "C", "D"].map((key) => (
    data.rows.find((row) => row.loai_ho_so === key) ?? {
      loai_ho_so: key,
      ton_truoc_total: 0,
      ton_truoc_first: 0,
      ton_truoc_supplement: 0,
      ton_truoc_first_hinh_thuc_1: 0,
      ton_truoc_first_hinh_thuc_2: 0,
      ton_truoc_supplement_hinh_thuc_1: 0,
      ton_truoc_supplement_hinh_thuc_2: 0,
      ton_truoc_hinh_thuc_1: 0,
      ton_truoc_hinh_thuc_2: 0,
      da_nhan_total: 0,
      da_nhan_first: 0,
      da_nhan_supplement: 0,
      da_nhan_first_hinh_thuc_1: 0,
      da_nhan_first_hinh_thuc_2: 0,
      da_nhan_supplement_hinh_thuc_1: 0,
      da_nhan_supplement_hinh_thuc_2: 0,
      da_nhan_hinh_thuc_1: 0,
      da_nhan_hinh_thuc_2: 0,
      giai_quyet_total: 0,
      giai_quyet_first: 0,
      giai_quyet_supplement: 0,
      giai_quyet_first_hinh_thuc_1: 0,
      giai_quyet_first_hinh_thuc_2: 0,
      giai_quyet_supplement_hinh_thuc_1: 0,
      giai_quyet_supplement_hinh_thuc_2: 0,
      giai_quyet_hinh_thuc_1: 0,
      giai_quyet_hinh_thuc_2: 0,
      ton_total: 0,
      ton_first: 0,
      ton_supplement: 0,
      ton_first_hinh_thuc_1: 0,
      ton_first_hinh_thuc_2: 0,
      ton_supplement_hinh_thuc_1: 0,
      ton_supplement_hinh_thuc_2: 0,
      ton_hinh_thuc_1: 0,
      ton_hinh_thuc_2: 0,
      treo: 0,
    }
  ));

  const totals = rows.reduce((acc, row) => ({
    ton_truoc_total: acc.ton_truoc_total + row.ton_truoc_total,
    ton_truoc_first: acc.ton_truoc_first + row.ton_truoc_first,
    ton_truoc_supplement: acc.ton_truoc_supplement + row.ton_truoc_supplement,
    ton_truoc_first_hinh_thuc_1: acc.ton_truoc_first_hinh_thuc_1 + row.ton_truoc_first_hinh_thuc_1,
    ton_truoc_first_hinh_thuc_2: acc.ton_truoc_first_hinh_thuc_2 + row.ton_truoc_first_hinh_thuc_2,
    ton_truoc_supplement_hinh_thuc_1: acc.ton_truoc_supplement_hinh_thuc_1 + row.ton_truoc_supplement_hinh_thuc_1,
    ton_truoc_supplement_hinh_thuc_2: acc.ton_truoc_supplement_hinh_thuc_2 + row.ton_truoc_supplement_hinh_thuc_2,
    ton_truoc_hinh_thuc_1: acc.ton_truoc_hinh_thuc_1 + row.ton_truoc_hinh_thuc_1,
    ton_truoc_hinh_thuc_2: acc.ton_truoc_hinh_thuc_2 + row.ton_truoc_hinh_thuc_2,
    da_nhan_total: acc.da_nhan_total + row.da_nhan_total,
    da_nhan_first: acc.da_nhan_first + row.da_nhan_first,
    da_nhan_supplement: acc.da_nhan_supplement + row.da_nhan_supplement,
    da_nhan_first_hinh_thuc_1: acc.da_nhan_first_hinh_thuc_1 + row.da_nhan_first_hinh_thuc_1,
    da_nhan_first_hinh_thuc_2: acc.da_nhan_first_hinh_thuc_2 + row.da_nhan_first_hinh_thuc_2,
    da_nhan_supplement_hinh_thuc_1: acc.da_nhan_supplement_hinh_thuc_1 + row.da_nhan_supplement_hinh_thuc_1,
    da_nhan_supplement_hinh_thuc_2: acc.da_nhan_supplement_hinh_thuc_2 + row.da_nhan_supplement_hinh_thuc_2,
    da_nhan_hinh_thuc_1: acc.da_nhan_hinh_thuc_1 + row.da_nhan_hinh_thuc_1,
    da_nhan_hinh_thuc_2: acc.da_nhan_hinh_thuc_2 + row.da_nhan_hinh_thuc_2,
    giai_quyet_total: acc.giai_quyet_total + row.giai_quyet_total,
    giai_quyet_first: acc.giai_quyet_first + row.giai_quyet_first,
    giai_quyet_supplement: acc.giai_quyet_supplement + row.giai_quyet_supplement,
    giai_quyet_first_hinh_thuc_1: acc.giai_quyet_first_hinh_thuc_1 + row.giai_quyet_first_hinh_thuc_1,
    giai_quyet_first_hinh_thuc_2: acc.giai_quyet_first_hinh_thuc_2 + row.giai_quyet_first_hinh_thuc_2,
    giai_quyet_supplement_hinh_thuc_1: acc.giai_quyet_supplement_hinh_thuc_1 + row.giai_quyet_supplement_hinh_thuc_1,
    giai_quyet_supplement_hinh_thuc_2: acc.giai_quyet_supplement_hinh_thuc_2 + row.giai_quyet_supplement_hinh_thuc_2,
    giai_quyet_hinh_thuc_1: acc.giai_quyet_hinh_thuc_1 + row.giai_quyet_hinh_thuc_1,
    giai_quyet_hinh_thuc_2: acc.giai_quyet_hinh_thuc_2 + row.giai_quyet_hinh_thuc_2,
    ton_total: acc.ton_total + row.ton_total,
    ton_first: acc.ton_first + row.ton_first,
    ton_supplement: acc.ton_supplement + row.ton_supplement,
    ton_first_hinh_thuc_1: acc.ton_first_hinh_thuc_1 + row.ton_first_hinh_thuc_1,
    ton_first_hinh_thuc_2: acc.ton_first_hinh_thuc_2 + row.ton_first_hinh_thuc_2,
    ton_supplement_hinh_thuc_1: acc.ton_supplement_hinh_thuc_1 + row.ton_supplement_hinh_thuc_1,
    ton_supplement_hinh_thuc_2: acc.ton_supplement_hinh_thuc_2 + row.ton_supplement_hinh_thuc_2,
    ton_hinh_thuc_1: acc.ton_hinh_thuc_1 + row.ton_hinh_thuc_1,
    ton_hinh_thuc_2: acc.ton_hinh_thuc_2 + row.ton_hinh_thuc_2,
    treo: acc.treo + row.treo,
  }), {
    ton_truoc_total: 0,
    ton_truoc_first: 0,
    ton_truoc_supplement: 0,
    ton_truoc_first_hinh_thuc_1: 0,
    ton_truoc_first_hinh_thuc_2: 0,
    ton_truoc_supplement_hinh_thuc_1: 0,
    ton_truoc_supplement_hinh_thuc_2: 0,
    ton_truoc_hinh_thuc_1: 0,
    ton_truoc_hinh_thuc_2: 0,
    da_nhan_total: 0,
    da_nhan_first: 0,
    da_nhan_supplement: 0,
    da_nhan_first_hinh_thuc_1: 0,
    da_nhan_first_hinh_thuc_2: 0,
    da_nhan_supplement_hinh_thuc_1: 0,
    da_nhan_supplement_hinh_thuc_2: 0,
    da_nhan_hinh_thuc_1: 0,
    da_nhan_hinh_thuc_2: 0,
    giai_quyet_total: 0,
    giai_quyet_first: 0,
    giai_quyet_supplement: 0,
    giai_quyet_first_hinh_thuc_1: 0,
    giai_quyet_first_hinh_thuc_2: 0,
    giai_quyet_supplement_hinh_thuc_1: 0,
    giai_quyet_supplement_hinh_thuc_2: 0,
    giai_quyet_hinh_thuc_1: 0,
    giai_quyet_hinh_thuc_2: 0,
    ton_total: 0,
    ton_first: 0,
    ton_supplement: 0,
    ton_first_hinh_thuc_1: 0,
    ton_first_hinh_thuc_2: 0,
    ton_supplement_hinh_thuc_1: 0,
    ton_supplement_hinh_thuc_2: 0,
    ton_hinh_thuc_1: 0,
    ton_hinh_thuc_2: 0,
    treo: 0,
  });

  const pct = (value: number, total: number) => total > 0 ? `${Math.round(value / total * 100)}%` : "0%";
  const renderGroupTotal = (value: number, total: number, textColor: string) => (
    value ? (
      <div className="flex items-baseline justify-center gap-2">
        <span className={`font-bold ${textColor}`}>{value.toLocaleString("vi-VN")}</span>
        <span className="text-slate-600">({pct(value, total)})</span>
      </div>
    ) : null
  );
  const renderInlineValueWithPct = (value: number, total: number, cls = "") => (
    <td className={`px-2 py-2 text-center text-sm ${cls}`}>
      {value ? (
        <div className="flex items-baseline justify-center gap-2">
          <span>{value.toLocaleString("vi-VN")}</span>
          <span className="text-slate-500">({pct(value, total)})</span>
        </div>
      ) : ""}
    </td>
  );
  const num = (value: number, cls = "") => (
    <td className={`px-2 py-2 text-center text-sm ${cls}`}>{value ? value.toLocaleString("vi-VN") : ""}</td>
  );
  const thC = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide";
  const thS = "px-2 py-2 text-center text-xs font-semibold";
  const tdC = "px-2 py-2 text-center text-xs";
  const tdL = "px-3 py-2 text-left text-xs font-semibold text-slate-800";
  const totalRow = "bg-slate-200 font-bold border-t-2 border-slate-400";
  const ratioRow = "bg-slate-50 text-slate-600 border-t border-slate-200";
  const subgroupLabels = ["TỔNG", "H.thức 1", "H.thức 2"];
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const renderExpandCell = (key: string, label: string, isTotal = false) => (
    <td className={`${tdL} ${isTotal ? "text-slate-700 font-bold" : ""}`}>
      <button
        type="button"
        onClick={() => toggleRow(key)}
        className="inline-flex items-center gap-2 text-left"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
          {expandedRows[key] ? "−" : "+"}
        </span>
        <span>{label}</span>
      </button>
    </td>
  );
  const renderSubRow = (
    key: string,
    label: string,
    values: {
      ton_truoc: number;
      ton_truoc_hinh_thuc_1?: number;
      ton_truoc_hinh_thuc_2?: number;
      da_nhan: number;
      da_nhan_hinh_thuc_1?: number;
      da_nhan_hinh_thuc_2?: number;
      giai_quyet: number;
      giai_quyet_hinh_thuc_1?: number;
      giai_quyet_hinh_thuc_2?: number;
      ton: number;
      ton_hinh_thuc_1?: number;
      ton_hinh_thuc_2?: number;
    },
    isTotal = false,
  ) => (
    <tr key={key} className={`${isTotal ? "bg-slate-100" : "bg-slate-50/80"} border-t border-slate-200`}>
      <td className="px-3 py-2 text-left text-xs font-medium text-slate-600">
        <div className="flex items-center gap-2 pl-7">
          <span className="inline-block h-px w-3 bg-slate-300" />
          <span>{label}</span>
        </div>
      </td>
      {isTotal
        ? renderInlineValueWithPct(values.ton_truoc, totals.ton_truoc_total, `${tdC} bg-pink-50/50 text-slate-600`)
        : num(values.ton_truoc, `${tdC} bg-pink-50/50 text-slate-600`)}
      {num(values.ton_truoc_hinh_thuc_1 ?? 0, `${tdC} bg-pink-50/50 text-slate-600`)}
      {num(values.ton_truoc_hinh_thuc_2 ?? 0, `${tdC} bg-pink-50/50 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.da_nhan, totals.da_nhan_total, `${tdC} bg-blue-50/50 text-slate-600`)
        : num(values.da_nhan, `${tdC} bg-blue-50/50 text-slate-600`)}
      {num(values.da_nhan_hinh_thuc_1 ?? 0, `${tdC} bg-blue-50/50 text-slate-600`)}
      {num(values.da_nhan_hinh_thuc_2 ?? 0, `${tdC} bg-blue-50/50 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.giai_quyet, totals.giai_quyet_total, `${tdC} bg-green-50/60 text-slate-600`)
        : num(values.giai_quyet, `${tdC} bg-green-50/60 text-slate-600`)}
      {num(values.giai_quyet_hinh_thuc_1 ?? 0, `${tdC} bg-green-50/60 text-slate-600`)}
      {num(values.giai_quyet_hinh_thuc_2 ?? 0, `${tdC} bg-green-50/60 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.ton, totals.ton_total, `${tdC} bg-amber-50/60 text-slate-600`)
        : num(values.ton, `${tdC} bg-amber-50/60 text-slate-600`)}
      {num(values.ton_hinh_thuc_1 ?? 0, `${tdC} bg-amber-50/60 text-slate-600`)}
      {num(values.ton_hinh_thuc_2 ?? 0, `${tdC} bg-amber-50/60 text-slate-600`)}
      <td className={`${tdC} bg-orange-50/70`} />
    </tr>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Chi tiết theo loại hồ sơ & lần nộp - TT48
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 1280 }}>
          <colgroup>
            <col style={{ width: 260 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 130 }} /><col style={{ width: 86 }} /><col style={{ width: 86 }} />
            <col style={{ width: 92 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={`${thL} bg-slate-700 text-white`}>Phân loại hồ sơ</th>
              <th colSpan={3} className={`${thC} bg-pink-700 text-white`}>TỒN TRƯỚC</th>
              <th colSpan={3} className={`${thC} bg-blue-700 text-white`}>HỒ SƠ ĐÃ TIẾP NHẬN</th>
              <th colSpan={3} className={`${thC} bg-green-700 text-white`}>HỒ SƠ ĐÃ GIẢI QUYẾT</th>
              <th colSpan={3} className={`${thC} bg-amber-700 text-white`}>HỒ SƠ TỒN</th>
              <th rowSpan={2} className={`${thC} bg-orange-600 text-white`}>HỒ SƠ TREO</th>
            </tr>
            <tr>
              {[0, 1, 2, 3].flatMap((groupIndex) =>
                subgroupLabels.map((label, labelIndex) => (
                  <th
                    key={`${groupIndex}-${labelIndex}-${label}`}
                    className={`${thS} ${
                      groupIndex === 0 ? "bg-pink-50 text-pink-700" :
                      groupIndex === 1 ? "bg-blue-50 text-blue-700" :
                      groupIndex === 2 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {label}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <Fragment key={row.loai_ho_so}>
              <tr className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50/40 transition-colors`}>
                {renderExpandCell(row.loai_ho_so, TT48_LOAI_LABELS[row.loai_ho_so] ?? row.loai_ho_so)}
                <td className={`${tdC} bg-pink-50/70`}>{renderGroupTotal(row.ton_truoc_total, totals.ton_truoc_total, "text-pink-700")}</td>
                {num(row.ton_truoc_hinh_thuc_1, `${tdC} bg-pink-50/70 text-slate-700`)}
                {num(row.ton_truoc_hinh_thuc_2, `${tdC} bg-pink-50/70 text-slate-700`)}
                <td className={`${tdC} bg-blue-50/70`}>{renderGroupTotal(row.da_nhan_total, totals.da_nhan_total, "text-blue-700")}</td>
                {num(row.da_nhan_hinh_thuc_1, `${tdC} bg-blue-50/70 text-slate-700`)}
                {num(row.da_nhan_hinh_thuc_2, `${tdC} bg-blue-50/70 text-slate-700`)}
                <td className={`${tdC} bg-green-50/80`}>{renderGroupTotal(row.giai_quyet_total, totals.giai_quyet_total, "text-green-700")}</td>
                {num(row.giai_quyet_hinh_thuc_1, `${tdC} bg-green-50/80 text-slate-700`)}
                {num(row.giai_quyet_hinh_thuc_2, `${tdC} bg-green-50/80 text-slate-700`)}
                <td className={`${tdC} bg-amber-50/80`}>{renderGroupTotal(row.ton_total, totals.ton_total, "text-amber-700")}</td>
                {num(row.ton_hinh_thuc_1, `${tdC} bg-amber-50/80 text-slate-700`)}
                {num(row.ton_hinh_thuc_2, `${tdC} bg-amber-50/80 text-slate-700`)}
                {num(row.treo, `${tdC} bg-orange-50 font-bold text-orange-700`)}
              </tr>
              {expandedRows[row.loai_ho_so] && renderSubRow(
                `${row.loai_ho_so}-first`,
                "Lần đầu",
                {
                  ton_truoc: row.ton_truoc_first,
                  ton_truoc_hinh_thuc_1: row.ton_truoc_first_hinh_thuc_1,
                  ton_truoc_hinh_thuc_2: row.ton_truoc_first_hinh_thuc_2,
                  da_nhan: row.da_nhan_first,
                  da_nhan_hinh_thuc_1: row.da_nhan_first_hinh_thuc_1,
                  da_nhan_hinh_thuc_2: row.da_nhan_first_hinh_thuc_2,
                  giai_quyet: row.giai_quyet_first,
                  giai_quyet_hinh_thuc_1: row.giai_quyet_first_hinh_thuc_1,
                  giai_quyet_hinh_thuc_2: row.giai_quyet_first_hinh_thuc_2,
                  ton: row.ton_first,
                  ton_hinh_thuc_1: row.ton_first_hinh_thuc_1,
                  ton_hinh_thuc_2: row.ton_first_hinh_thuc_2,
                },
              )}
              {expandedRows[row.loai_ho_so] && renderSubRow(
                `${row.loai_ho_so}-supplement`,
                "Lần bổ sung",
                {
                  ton_truoc: row.ton_truoc_supplement,
                  ton_truoc_hinh_thuc_1: row.ton_truoc_supplement_hinh_thuc_1,
                  ton_truoc_hinh_thuc_2: row.ton_truoc_supplement_hinh_thuc_2,
                  da_nhan: row.da_nhan_supplement,
                  da_nhan_hinh_thuc_1: row.da_nhan_supplement_hinh_thuc_1,
                  da_nhan_hinh_thuc_2: row.da_nhan_supplement_hinh_thuc_2,
                  giai_quyet: row.giai_quyet_supplement,
                  giai_quyet_hinh_thuc_1: row.giai_quyet_supplement_hinh_thuc_1,
                  giai_quyet_hinh_thuc_2: row.giai_quyet_supplement_hinh_thuc_2,
                  ton: row.ton_supplement,
                  ton_hinh_thuc_1: row.ton_supplement_hinh_thuc_1,
                  ton_hinh_thuc_2: row.ton_supplement_hinh_thuc_2,
                },
              )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className={totalRow}>
              {renderExpandCell("TOTAL", "TỔNG", true)}
              {num(totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_truoc_hinh_thuc_1, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_truoc_hinh_thuc_2, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {num(totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderInlineValueWithPct(totals.da_nhan_hinh_thuc_1, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderInlineValueWithPct(totals.da_nhan_hinh_thuc_2, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {num(totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderInlineValueWithPct(totals.giai_quyet_hinh_thuc_1, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderInlineValueWithPct(totals.giai_quyet_hinh_thuc_2, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {num(totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_hinh_thuc_1, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderInlineValueWithPct(totals.ton_hinh_thuc_2, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {num(totals.treo, `${tdC} text-orange-700 font-bold`)}
            </tr>
            {expandedRows.TOTAL && renderSubRow(
              "TOTAL-first",
              "Lần đầu",
              {
                ton_truoc: totals.ton_truoc_first,
                ton_truoc_hinh_thuc_1: totals.ton_truoc_first_hinh_thuc_1,
                ton_truoc_hinh_thuc_2: totals.ton_truoc_first_hinh_thuc_2,
                da_nhan: totals.da_nhan_first,
                da_nhan_hinh_thuc_1: totals.da_nhan_first_hinh_thuc_1,
                da_nhan_hinh_thuc_2: totals.da_nhan_first_hinh_thuc_2,
                giai_quyet: totals.giai_quyet_first,
                giai_quyet_hinh_thuc_1: totals.giai_quyet_first_hinh_thuc_1,
                giai_quyet_hinh_thuc_2: totals.giai_quyet_first_hinh_thuc_2,
                ton: totals.ton_first,
                ton_hinh_thuc_1: totals.ton_first_hinh_thuc_1,
                ton_hinh_thuc_2: totals.ton_first_hinh_thuc_2,
              },
              true,
            )}
            {expandedRows.TOTAL && renderSubRow(
              "TOTAL-supplement",
              "Lần bổ sung",
              {
                ton_truoc: totals.ton_truoc_supplement,
                ton_truoc_hinh_thuc_1: totals.ton_truoc_supplement_hinh_thuc_1,
                ton_truoc_hinh_thuc_2: totals.ton_truoc_supplement_hinh_thuc_2,
                da_nhan: totals.da_nhan_supplement,
                da_nhan_hinh_thuc_1: totals.da_nhan_supplement_hinh_thuc_1,
                da_nhan_hinh_thuc_2: totals.da_nhan_supplement_hinh_thuc_2,
                giai_quyet: totals.giai_quyet_supplement,
                giai_quyet_hinh_thuc_1: totals.giai_quyet_supplement_hinh_thuc_1,
                giai_quyet_hinh_thuc_2: totals.giai_quyet_supplement_hinh_thuc_2,
                ton: totals.ton_supplement,
                ton_hinh_thuc_1: totals.ton_supplement_hinh_thuc_1,
                ton_hinh_thuc_2: totals.ton_supplement_hinh_thuc_2,
              },
              true,
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TraCuuDaXuLyTab(props?: {
  state: TraCuuFilterState;
  setState: React.Dispatch<React.SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  return <LookupDoneTab {...props} />;
}

function TraCuuDangXuLyTab(props?: {
  state: TraCuuFilterState;
  setState: React.Dispatch<React.SetStateAction<TraCuuFilterState>>;
  isActive?: boolean;
}) {
  return <LookupPendingTab {...props} />;
}

// ---------------------------------------------------------------------------
// ChuyenGiaTable — bảng thống kê chuyên gia (chỉ dùng cho TT48)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTabId>(DEFAULT_DASHBOARD_TAB_ID);
  const [showAdmin, setShowAdmin] = useState(false);
  const [hideEmptyExperts, setHideEmptyExperts] = useState(true);
  const {
    lookupState,
    setLookupState,
    lookupDoneState,
    setLookupDoneState,
    resetLookupStates,
  } = useDashboardLookupState();
  const {
    authLoading,
    authRole,
    loginPassword,
    setLoginPassword,
    loginBusy,
    authError,
    handleLogin,
    handleLogout,
  } = useDashboardAuth({
    onAfterLogout: () => {
      setShowAdmin(false);
      if (window.location.hash === "#admin") {
        history.pushState("", document.title, window.location.pathname + window.location.search);
      }
      resetLookupStates();
      setActiveTab(DEFAULT_DASHBOARD_TAB_ID);
    },
  });
  const isAdmin = authRole === "admin";
  const { visibleTabs } = useDashboardTabAccess({
    isAdmin,
    activeTab,
    setActiveTab,
  });
  const { openAdmin, closeAdmin } = useAdminPanelShell({
    isAdmin,
    showAdmin,
    setShowAdmin,
  });

  const { data: syncStatus } = useDashboardSyncStatus(authRole);

  // Filter state riêng cho từng tab Thống kê (48 / 47 / 46) — không bị reset khi chuyển tab
  const {
    Provider: StatsFiltersProvider,
    filtersValue,
    updateFilter,
  } = useDashboardStatsFilters();

  const {
    openLookupByChuyenVien,
    openLookupByChuyenGia,
    openLookupByTinhTrang,
    openThongKeFromTongQuan,
    openDangXuLyFromTongQuan,
  } = useDashboardNavigation({
    isAdmin,
    defaultLookupState: DEFAULT_TRA_CUU_FILTER_STATE,
    setLookupState,
    setActiveTab,
    updateFilter,
  });

  const renderTabContent = (tabId: DashboardTabId) => (
    <DashboardContentSwitch
      tabId={tabId}
      renderTongQuan={() => (
        <OverviewTab
          onOpenThongKe={openThongKeFromTongQuan}
          onOpenDangXuLy={openDangXuLyFromTongQuan}
          renderMonthlyTrend={(thuTuc, fromDate, toDate) => (
            <MonthlyTrendChart thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} hideTitle />
          )}
        />
      )}
      renderThongKe={(thuTuc) => (
        <ThongKeTab
          thuTuc={thuTuc}
          renderChuyenVienTable={(tt, fromDate, toDate) => (
            <ChuyenVienTable thuTuc={tt} fromDate={fromDate} toDate={toDate} />
          )}
          renderMonthlyTrend={(tt, fromDate, toDate) => (
            <MonthlyTrendChart thuTuc={tt} fromDate={fromDate} toDate={toDate} />
          )}
          renderTt48LoaiHoSoTable={(fromDate, toDate) => (
            <Tt48LoaiHoSoTable fromDate={fromDate} toDate={toDate} />
          )}
          renderTt48LoaiHoSoMonthlyChart={(fromDate, toDate) => (
            <Tt48LoaiHoSoMonthlyChart fromDate={fromDate} toDate={toDate} />
          )}
        />
      )}
      renderDangXuLy={(thuTuc) =>
        thuTuc === 48 ? (
          <PendingDangXuLyTab
            thuTuc={48}
            onCvLookup={openLookupByChuyenVien}
            onCgLookup={openLookupByChuyenGia}
            onTinhTrangLookup={openLookupByTinhTrang}
            hideEmptyExperts={hideEmptyExperts}
            setHideEmptyExperts={setHideEmptyExperts}
          />
        ) : (
          <PendingDangXuLyTab thuTuc={thuTuc} onCvLookup={openLookupByChuyenVien} />
        )
      }
      renderLookupDangXuLy={() =>
        isAdmin ? <TraCuuDangXuLyTab state={lookupState} setState={setLookupState} isActive={activeTab === "tra_cuu_dang_xl"} /> : null
      }
      renderLookupDaXuLy={() =>
        isAdmin ? <TraCuuDaXuLyTab state={lookupDoneState} setState={setLookupDoneState} isActive={activeTab === "tra_cuu_da_xl"} /> : null
      }
    />
  );

  return (
    <DashboardAuthGate
      authLoading={authLoading}
      authRole={authRole}
      password={loginPassword}
      setPassword={setLoginPassword}
      busy={loginBusy}
      error={authError}
      onSubmit={handleLogin}
    >
      <StatsFiltersProvider value={filtersValue}>
      <div className="min-h-screen bg-slate-50">
        <DashboardShellHeader
          authRole={authRole}
          isAdmin={isAdmin}
          syncStatus={syncStatus}
          visibleTabs={visibleTabs}
          activeTab={activeTab}
        onOpenAdmin={openAdmin}
          onLogout={handleLogout}
          onSelectTab={setActiveTab}
        />

        <DashboardTabPanels tabs={visibleTabs} activeTab={activeTab} renderTabContent={renderTabContent} />

        <AdminPanelMount isAdmin={isAdmin} showAdmin={showAdmin}>
          <AdminPanel onClose={closeAdmin} />
        </AdminPanelMount>
      </div>
      </StatsFiltersProvider>
    </DashboardAuthGate>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={BASE}>
        <Dashboard />
      </WouterRouter>
    </QueryClientProvider>
  );
}

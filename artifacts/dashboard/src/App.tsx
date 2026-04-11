import { Fragment, useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
  ComposedChart, Line,
  AreaChart, Area,
} from "recharts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { DashboardRole, fetchAuthMe, loginDashboard, logoutDashboard } from "./features/auth/authApi";
import { LoginScreen } from "./features/auth/LoginScreen";
import { AdminPanel } from "./features/admin/AdminPanel";
import { TraCuuDangXuLyTab, TraCuuDaXuLyTab } from "./features/lookup/LookupTabs";
import { DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE, DEFAULT_TRA_CUU_FILTER_STATE, type LookupTinhTrang, type TraCuuFilterState } from "./features/lookup/lookupShared";
import { DangXuLyTab } from "./features/pending/PendingTabs";
import { StatsFiltersCtx, type StatsFiltersCtxType, useTabFilter } from "./features/stats/statsFilterContext";
import { ThongKeDateFilterPanel, ThongKeOverviewCharts } from "./features/stats/StatsOverview";
import {
  fetchChuyenVien,
  fetchEarliestDate,
  fetchGiaiQuyet,
  fetchMonthly,
  fetchSummary,
  fetchSyncStatus,
  fetchTonSau,
  fetchTt48LoaiHoSo,
  fetchTt48ReceivedMonthlyLoai,
  makeTabFilter,
  type ChuyenVienData,
  type ChuyenVienRow,
  type GiaiQuyetData,
  type MonthData,
  type MonthlyData,
  type SummaryData,
  type SyncStatus,
  type TabFilter,
  type TonSauData,
  TT48_LOAI_LABELS,
  type Tt48LoaiHoSoData,
  type Tt48LoaiHoSoRow,
  type Tt48ReceivedMonthlyLoaiData,
  type Tt48ReceivedMonthlyLoaiRow,
} from "./features/stats/statsShared";
import { CHART_ANIMATION_MS } from "./shared/chartConfig";
import { minYmd, toDMY } from "./shared/dateUtils";

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


// BÃƒÂ¡Ã‚ÂºÃ‚Â£ng chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t theo chuyÃƒÆ’Ã‚Âªn viÃƒÆ’Ã‚Âªn (Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§y Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â§ cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t theo thiÃƒÂ¡Ã‚ÂºÃ‚Â¿t kÃƒÂ¡Ã‚ÂºÃ‚Â¿ Excel)
// ---------------------------------------------------------------------------
const CV_PREFIX = "CV thÃƒÂ¡Ã‚Â»Ã‚Â¥ lÃƒÆ’Ã‚Â½ : ";
function cleanCvName(raw: string): string {
  return raw.startsWith(CV_PREFIX) ? raw.slice(CV_PREFIX.length).trim() : raw.trim();
}

function Num({ v, color, bold }: { v: number | null | undefined; color?: string; bold?: boolean }) {
  if (v === null || v === undefined) return <span className="text-slate-300">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>;
  if (v === 0) return <span />;
  return (
    <span className={bold ? "font-bold" : "font-medium"} style={{ color: color ?? "#374151" }}>
      {v.toLocaleString("vi-VN")}
    </span>
  );
}

function Pct({ v, warnBelow }: { v: number; warnBelow?: number }) {
  const color = warnBelow !== undefined && v < warnBelow ? "#ef4444" : "#15803d";
  return <span className="font-bold text-xs" style={{ color }}>{v}%</span>;
}

function cvSum(rows: ChuyenVienRow[], key: keyof ChuyenVienRow): number {
  return rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
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
  // Sub-header khÃƒÆ’Ã‚Â´ng uppercase (cho cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t con ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â trÃƒÂ¡Ã‚Â»Ã‚Â« TÃƒÂ¡Ã‚Â»Ã¢â‚¬ÂNG)
  const thS  = "px-2 py-2 text-center text-xs font-semibold";
  const tdC  = "px-2 py-2 text-center text-xs";
  const tdL  = "px-2 py-2 text-left   text-xs";
  const totRow = "bg-slate-200 font-bold border-t-2 border-slate-400";

  // Sticky column helpers ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â STT fixed at left:0, CV fixed at left:36px
  const STT_W = 36;  // pixel width cÃƒÂ¡Ã‚Â»Ã‚Â§a cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t STT
  const stickySTT = { position: "sticky" as const, left: 0,       zIndex: 10 };
  const stickyCV  = { position: "sticky" as const, left: STT_W,   zIndex: 10,
                      boxShadow: "2px 0 4px -1px rgba(0,0,0,0.12)" };

  const totals: Record<string, number> = {
    ton_truoc:       cvSum(rows, "ton_truoc"),
    da_nhan:         cvSum(rows, "da_nhan") + (cpc?.da_nhan ?? 0),
    gq_tong:         cvSum(rows, "gq_tong"),
    can_bo_sung:     cvSum(rows, "can_bo_sung"),
    khong_dat:       cvSum(rows, "khong_dat"),
    hoan_thanh:      cvSum(rows, "hoan_thanh"),
    dung_han:        cvSum(rows, "dung_han"),
    qua_han:         cvSum(rows, "qua_han"),
    ton_sau_tong:    cvSum(rows, "ton_sau_tong")    + (cpc?.ton_sau_tong    ?? 0),
    ton_sau_con_han: cvSum(rows, "ton_sau_con_han") + (cpc?.ton_sau_con_han ?? 0),
    ton_sau_qua_han: cvSum(rows, "ton_sau_qua_han") + (cpc?.ton_sau_qua_han ?? 0),
    treo:            cvSum(rows, "treo"),
  };
  const tot_pct_dh = totals.gq_tong > 0 ? Math.round(totals.dung_han / totals.gq_tong * 100) : 0;
  const tot_pct_gq = (totals.ton_truoc + totals.da_nhan) > 0
    ? Math.round(totals.gq_tong / (totals.ton_truoc + totals.da_nhan) * 100) : 0;

  // TÃƒÆ’Ã‚Â­nh ngÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â¡ng top 30% cho tÃƒÂ¡Ã‚Â»Ã‚Â«ng cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t cÃƒÂ¡Ã‚ÂºÃ‚Â§n highlight
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
  // TrÃƒÂ¡Ã‚ÂºÃ‚Â£ vÃƒÂ¡Ã‚Â»Ã‚Â class td cÃƒÆ’Ã‚Â³ thÃƒÆ’Ã‚Âªm highlight nÃƒÂ¡Ã‚Â»Ã‚Ân vÃƒÆ’Ã‚Â ng nhÃƒÂ¡Ã‚ÂºÃ‚Â¡t nÃƒÂ¡Ã‚ÂºÃ‚Â¿u Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â§ Ãƒâ€žÃ¢â‚¬ËœiÃƒÂ¡Ã‚Â»Ã‚Âu kiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n
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
          Chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t theo chuyÃƒÆ’Ã‚Âªn viÃƒÆ’Ã‚Âªn ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â TT{thuTuc}
        </h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium">Ãƒâ€žÃ‚Âang tÃƒÂ¡Ã‚ÂºÃ‚Â£i...</span>}
        {isError   && <span className="text-xs text-red-500 font-medium">LÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i tÃƒÂ¡Ã‚ÂºÃ‚Â£i dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u</span>}
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
            {/* HÃƒÆ’Ã‚Â ng 1: nhÃƒÆ’Ã‚Â³m cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t */}
            <tr className="bg-slate-700 text-white">
              <th className={`${thC} bg-slate-700 text-white`} rowSpan={2}
                  style={{ ...stickySTT, backgroundColor: "#334155", width: STT_W, minWidth: STT_W }}>
                STT
              </th>
              <th className={`${thL} bg-slate-700 text-white min-w-[160px]`} rowSpan={2}
                  style={{ ...stickyCV, backgroundColor: "#334155" }}>
                ChuyÃƒÆ’Ã‚Âªn viÃƒÆ’Ã‚Âªn
              </th>
              <th className={`${thC} bg-pink-700 text-white`} rowSpan={2}>TÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“n<br />trÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc</th>
              <th className={`${thC} bg-blue-700 text-white`} rowSpan={2}>Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£<br />nhÃƒÂ¡Ã‚ÂºÃ‚Â­n</th>
              <th className={`${thC} bg-green-700 text-white`} colSpan={9}>Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ giÃƒÂ¡Ã‚ÂºÃ‚Â£i quyÃƒÂ¡Ã‚ÂºÃ‚Â¿t</th>
              <th className={`${thC} bg-amber-700 text-white`} colSpan={3}>TÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“n sau</th>
              <th className={`${thC} bg-orange-600 text-white`} rowSpan={2}>TREO</th>
            </tr>
            <tr className="bg-slate-100">
              <th className={`${thC} bg-green-50`}>TÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ng</th>
              <th className={`${thS} bg-amber-50`}>CÃƒÂ¡Ã‚ÂºÃ‚Â§n bÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ sung</th>
              <th className={`${thS} bg-red-50`}>KhÃƒÆ’Ã‚Â´ng Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â¡t</th>
              <th className={`${thS} bg-green-50`}>HoÃƒÆ’Ã‚Â n thÃƒÆ’Ã‚Â nh</th>
              <th className={`${thS} bg-green-50 text-green-700`}>Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Âºng hÃƒÂ¡Ã‚ÂºÃ‚Â¡n</th>
              <th className={`${thS} bg-red-50 text-red-700`}>QuÃƒÆ’Ã‚Â¡ hÃƒÂ¡Ã‚ÂºÃ‚Â¡n</th>
              <th className={`${thS} bg-slate-50`}>ThÃƒÂ¡Ã‚Â»Ã‚Âi gian TB</th>
              <th className={`${thS} bg-green-50 text-green-700`}>% Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Âºng hÃƒÂ¡Ã‚ÂºÃ‚Â¡n</th>
              <th className={`${thS} bg-slate-50 text-slate-600`}>% Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â£ GQ</th>
              <th className={`${thC} bg-amber-50`}>TÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ng</th>
              <th className={`${thS} bg-blue-50 text-blue-700`}>CÃƒÆ’Ã‚Â²n hÃƒÂ¡Ã‚ÂºÃ‚Â¡n</th>
              <th className={`${thS} bg-red-50 text-red-700`}>QuÃƒÆ’Ã‚Â¡ hÃƒÂ¡Ã‚ÂºÃ‚Â¡n</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  <span>Ãƒâ€žÃ‚Âang tÃƒÂ¡Ã‚ÂºÃ‚Â£i...</span>
                </div>
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">KhÃƒÆ’Ã‚Â´ng cÃƒÆ’Ã‚Â³ dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u</td></tr>
            ) : (
              <>
                {/* HÃƒÆ’Ã‚Â ng "ChÃƒÂ¡Ã‚Â»Ã‚Â phÃƒÆ’Ã‚Â¢n cÃƒÆ’Ã‚Â´ng" nÃƒÂ¡Ã‚ÂºÃ‚Â¿u cÃƒÆ’Ã‚Â³ */}
                {cpc && (cpc.ton_sau_tong > 0 || cpc.da_nhan > 0) && (
                  <tr className="bg-yellow-50 border-b-2 border-yellow-200">
                    <td className={`${tdC} text-slate-400`}
                        style={{ ...stickySTT, backgroundColor: "#fefce8", width: STT_W, minWidth: STT_W }}>
                      ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
                    </td>
                    <td className={`${tdL} text-amber-700 font-semibold`}
                        style={{ ...stickyCV, backgroundColor: "#fefce8" }}>
                      ChÃƒÂ¡Ã‚Â»Ã‚Â phÃƒÆ’Ã‚Â¢n cÃƒÆ’Ã‚Â´ng...
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
                  TÃƒÂ¡Ã‚Â»Ã¢â‚¬ÂNG
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
// BiÃƒÂ¡Ã‚Â»Ã†â€™u Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ xu hÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºng theo thÃƒÆ’Ã‚Â¡ng (bar + line, giÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng thiÃƒÂ¡Ã‚ÂºÃ‚Â¿t kÃƒÂ¡Ã‚ÂºÃ‚Â¿ Excel)
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

  // LÃƒÂ¡Ã‚Â»Ã‚Âc cÃƒÆ’Ã‚Â¡c thÃƒÆ’Ã‚Â¡ng nÃƒÂ¡Ã‚ÂºÃ‚Â±m trong kÃƒÂ¡Ã‚Â»Ã‚Â³ fromDate..toDate
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
            Xu hÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºng theo thÃƒÆ’Ã‚Â¡ng ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â TT{thuTuc}
          </h3>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#60a5fa]" /> TiÃƒÂ¡Ã‚ÂºÃ‚Â¿p nhÃƒÂ¡Ã‚ÂºÃ‚Â­n
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#34d399]" /> GiÃƒÂ¡Ã‚ÂºÃ‚Â£i quyÃƒÂ¡Ã‚ÂºÃ‚Â¿t
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> HÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ tÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“n
          </span>
          <label className="flex items-center gap-1 cursor-pointer select-none border-l border-slate-200 pl-4 ml-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-3 h-3 accent-blue-600 cursor-pointer"
            />
            <span>HiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u</span>
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
                da_nhan:       "TiÃƒÂ¡Ã‚ÂºÃ‚Â¿p nhÃƒÂ¡Ã‚ÂºÃ‚Â­n",
                da_giai_quyet: "GiÃƒÂ¡Ã‚ÂºÃ‚Â£i quyÃƒÂ¡Ã‚ÂºÃ‚Â¿t",
                ton_sau:       "HÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ tÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“n",
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
                  // Ãƒâ€žÃ‚ÂÃƒÂ¡Ã‚ÂºÃ‚Â·t center cÃƒÂ¡Ã‚Â»Ã‚Â§a text cÃƒÆ’Ã‚Â¡ch Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Â°nh cÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t mÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢t khoÃƒÂ¡Ã‚ÂºÃ‚Â£ng = nÃƒÂ¡Ã‚Â»Ã‚Â­a chiÃƒÂ¡Ã‚Â»Ã‚Âu dÃƒÆ’Ã‚Â i text
                  // TÃƒÂ¡Ã‚ÂºÃ‚Â¡i fontSize 9, mÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i kÃƒÆ’Ã‚Â½ tÃƒÂ¡Ã‚Â»Ã‚Â± ÃƒÂ¢Ã¢â‚¬Â°Ã‹â€  6px; dÃƒÂ¡Ã‚Â»Ã‚Â± phÃƒÆ’Ã‚Â²ng 13px lÃƒÆ’Ã‚Â  Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã‚Â§ cho 3ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“4 chÃƒÂ¡Ã‚Â»Ã‚Â¯ sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ
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
    { key: "A", label: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i A", color: "#ec4899" },
    { key: "B", label: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i B", color: "#3b82f6" },
    { key: "C", label: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i C", color: "#22c55e" },
    { key: "D", label: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i D", color: "#f59e0b" },
    { key: "total", label: "TÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ng", color: "#7c3aed" },
  ] as const;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          HÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ tiÃƒÂ¡Ã‚ÂºÃ‚Â¿p nhÃƒÂ¡Ã‚ÂºÃ‚Â­n theo thÃƒÆ’Ã‚Â¡ng - TT48
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
            <span>HiÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡n sÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u</span>
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
                A: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i A",
                B: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i B",
                C: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i C",
                D: "LoÃƒÂ¡Ã‚ÂºÃ‚Â¡i D",
                total: "TÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ng",
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


function TongQuanTab({
  onOpenThongKe,
  onOpenDangXuLy,
}: {
  onOpenThongKe: (thuTuc: 48 | 47 | 46, filter: TabFilter) => void;
  onOpenDangXuLy: (thuTuc: 48 | 47 | 46) => void;
}) {
  const { fromDate, toDate, fromInput, toInput, activePreset, loadingAll, update } = useTabFilter(0);
  const [expandedMonthly, setExpandedMonthly] = useState<Record<48 | 47 | 46, boolean>>({
    48: false,
    47: false,
    46: false,
  });
  const currentFilter: TabFilter = { fromDate, toDate, fromInput, toInput, activePreset, loadingAll };

  return (
    <div className="space-y-6">
      <ThongKeDateFilterPanel
        thuTuc={0}
        fromDate={fromDate}
        toDate={toDate}
        fromInput={fromInput}
        toInput={toInput}
        activePreset={activePreset}
        loadingAll={loadingAll}
        update={update}
      />

      {[48, 47, 46].map((thuTuc) => (
        <section key={thuTuc} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">TÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ng quan TT{thuTuc}</h2>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-slate-500 mr-2">
                KÃƒÂ¡Ã‚Â»Ã‚Â³ thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng kÃƒÆ’Ã‚Âª: <span className="text-slate-700">{toDMY(fromDate)}</span>
                {" ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "}
                <span className="text-slate-700">{toDMY(toDate)}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenThongKe(thuTuc as 48 | 47 | 46, currentFilter)}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 hover:bg-blue-50"
              >
                Chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t thÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng kÃƒÆ’Ã‚Âª
              </button>
              <button
                type="button"
                onClick={() => onOpenDangXuLy(thuTuc as 48 | 47 | 46)}
                className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
              >
                Chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t Ãƒâ€žÃ¢â‚¬Ëœang xÃƒÂ¡Ã‚Â»Ã‚Â­ lÃƒÆ’Ã‚Â½
              </button>
            </div>
          </div>
          <ThongKeOverviewCharts thuTuc={thuTuc as 48 | 47 | 46} fromDate={fromDate} toDate={toDate} />
          <div className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedMonthly((prev) => ({ ...prev, [thuTuc]: !prev[thuTuc as 48 | 47 | 46] }))}
              className="flex w-full items-center gap-2 px-5 py-3 text-left"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
                {expandedMonthly[thuTuc as 48 | 47 | 46] ? "ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢" : "+"}
              </span>
              <span className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Xu hÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºng theo thÃƒÆ’Ã‚Â¡ng ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â TT{thuTuc}
              </span>
            </button>
            {expandedMonthly[thuTuc as 48 | 47 | 46] && (
              <div className="px-4 pb-4">
                <MonthlyTrendChart thuTuc={thuTuc as 48 | 47 | 46} fromDate={fromDate} toDate={toDate} hideTitle />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: THÃƒÂ¡Ã‚Â»Ã‚ÂNG KÃƒÆ’Ã…Â  (tab 1, 3, 5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â TT48 / TT47 / TT46)
// ---------------------------------------------------------------------------
function ThongKeTab({ thuTuc }: { thuTuc: 48 | 47 | 46 }) {
  const { fromDate, toDate, fromInput, toInput, activePreset, loadingAll, update } = useTabFilter(thuTuc);

  return (
    <div className="space-y-6">
      <ThongKeDateFilterPanel
        thuTuc={thuTuc}
        fromDate={fromDate}
        toDate={toDate}
        fromInput={fromInput}
        toInput={toInput}
        activePreset={activePreset}
        loadingAll={loadingAll}
        update={update}
      />

      <ThongKeOverviewCharts thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {/* BÃƒÂ¡Ã‚ÂºÃ‚Â£ng chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t theo chuyÃƒÆ’Ã‚Âªn viÃƒÆ’Ã‚Âªn */}
      <ChuyenVienTable thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {/* BiÃƒÂ¡Ã‚Â»Ã†â€™u Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ xu hÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºng theo thÃƒÆ’Ã‚Â¡ng */}
      <MonthlyTrendChart thuTuc={thuTuc} fromDate={fromDate} toDate={toDate} />

      {thuTuc === 48 && <Tt48LoaiHoSoTable fromDate={fromDate} toDate={toDate} />}
      {thuTuc === 48 && <Tt48LoaiHoSoMonthlyChart fromDate={fromDate} toDate={toDate} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TT48 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â BÃƒÂ¡Ã‚ÂºÃ‚Â£ng phÃƒÆ’Ã‚Â¢n loÃƒÂ¡Ã‚ÂºÃ‚Â¡i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ theo A/B/C/D vÃƒÆ’Ã‚Â  lÃƒÂ¡Ã‚ÂºÃ‚Â§n nÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢p
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
        Ãƒâ€žÃ‚Âang tÃƒÂ¡Ã‚ÂºÃ‚Â£i bÃƒÂ¡Ã‚ÂºÃ‚Â£ng phÃƒÆ’Ã‚Â¢n loÃƒÂ¡Ã‚ÂºÃ‚Â¡i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ TT48...
      </div>
    </div>
  );

  if (isError || !data) return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm text-red-500 text-center">
      KhÃƒÆ’Ã‚Â´ng thÃƒÂ¡Ã‚Â»Ã†â€™ tÃƒÂ¡Ã‚ÂºÃ‚Â£i bÃƒÂ¡Ã‚ÂºÃ‚Â£ng phÃƒÆ’Ã‚Â¢n loÃƒÂ¡Ã‚ÂºÃ‚Â¡i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ TT48
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
  const subgroupLabels = ["TÃƒÂ¡Ã‚Â»Ã¢â‚¬ÂNG", "H.thÃƒÂ¡Ã‚Â»Ã‚Â©c 1", "H.thÃƒÂ¡Ã‚Â»Ã‚Â©c 2"];
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
          {expandedRows[key] ? "ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢" : "+"}
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
          Chi tiÃƒÂ¡Ã‚ÂºÃ‚Â¿t theo loÃƒÂ¡Ã‚ÂºÃ‚Â¡i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡ & lÃƒÂ¡Ã‚ÂºÃ‚Â§n nÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢p - TT48
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
              <th rowSpan={2} className={`${thL} bg-slate-700 text-white`}>PhÃƒÆ’Ã‚Â¢n loÃƒÂ¡Ã‚ÂºÃ‚Â¡i hÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ sÃƒâ€ Ã‚Â¡</th>
              <th colSpan={3} className={`${thC} bg-pink-700 text-white`}>TÃƒÂ¡Ã‚Â»Ã¢â‚¬â„¢N TRÃƒâ€ Ã‚Â¯ÃƒÂ¡Ã‚Â»Ã…Â¡C</th>
              <th colSpan={3} className={`${thC} bg-blue-700 text-white`}>HÃƒÂ¡Ã‚Â»Ã¢â‚¬â„¢ SÃƒâ€ Ã‚Â  Ãƒâ€žÃ‚ÂÃƒÆ’Ã†â€™ TIÃƒÂ¡Ã‚ÂºÃ‚Â¾P NHÃƒÂ¡Ã‚ÂºÃ‚Â¬N</th>
              <th colSpan={3} className={`${thC} bg-green-700 text-white`}>HÃƒÂ¡Ã‚Â»Ã¢â‚¬â„¢ SÃƒâ€ Ã‚Â  Ãƒâ€žÃ‚ÂÃƒÆ’Ã†â€™ GIÃƒÂ¡Ã‚ÂºÃ‚Â¢I QUYÃƒÂ¡Ã‚ÂºÃ‚Â¾T</th>
              <th colSpan={3} className={`${thC} bg-amber-700 text-white`}>HÃƒÂ¡Ã‚Â»Ã¢â‚¬â„¢ SÃƒâ€ Ã‚Â  TÃƒÂ¡Ã‚Â»Ã¢â‚¬â„¢N</th>
              <th rowSpan={2} className={`${thC} bg-orange-600 text-white`}>HÃƒÂ¡Ã‚Â»Ã¢â‚¬â„¢ SÃƒâ€ Ã‚Â  TREO</th>
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
                "LÃƒÂ¡Ã‚ÂºÃ‚Â§n Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u",
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
                "LÃƒÂ¡Ã‚ÂºÃ‚Â§n bÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ sung",
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
              {renderExpandCell("TOTAL", "TÃƒÂ¡Ã‚Â»Ã¢â‚¬ÂNG", true)}
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
              "LÃƒÂ¡Ã‚ÂºÃ‚Â§n Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚ÂºÃ‚Â§u",
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
              "LÃƒÂ¡Ã‚ÂºÃ‚Â§n bÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢ sung",
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

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------
const TABS = [
  { id: "tong_quan", label: "TÃƒÂ¡Ã‚Â»Ã¢â‚¬ÂNG QUAN", content: () => <TongQuanTab /> },
  { id: "tt48_thong_ke",  label: "THÃƒÂ¡Ã‚Â»Ã‚ÂNG KÃƒÆ’Ã…Â  TT48",       content: () => <ThongKeTab thuTuc={48} /> },
  { id: "tt48_dang_xl",   label: "Ãƒâ€žÃ‚ÂANG XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â TT48",     content: () => <DangXuLyTab thuTuc={48} /> },
  { id: "tt47_thong_ke",  label: "THÃƒÂ¡Ã‚Â»Ã‚ÂNG KÃƒÆ’Ã…Â  TT47",        content: () => <ThongKeTab thuTuc={47} /> },
  { id: "tt47_dang_xl",   label: "Ãƒâ€žÃ‚ÂANG XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â TT47",     content: () => <DangXuLyTab thuTuc={47} /> },
  { id: "tt46_thong_ke",  label: "THÃƒÂ¡Ã‚Â»Ã‚ÂNG KÃƒÆ’Ã…Â  TT46",        content: () => <ThongKeTab thuTuc={46} /> },
  { id: "tt46_dang_xl",   label: "Ãƒâ€žÃ‚ÂANG XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â TT46",     content: () => <DangXuLyTab thuTuc={46} /> },
  { id: "tra_cuu_dang_xl", label: "TRA CÃƒÂ¡Ã‚Â»Ã‚Â¨U HS Ãƒâ€žÃ‚ÂANG XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â", content: () => <TraCuuDangXuLyTab /> },
  { id: "tra_cuu_da_xl", label: "TRA CÃƒÂ¡Ã‚Â»Ã‚Â¨U HS Ãƒâ€žÃ‚ÂÃƒÆ’Ã†â€™ XÃƒÂ¡Ã‚Â»Ã‚Â¬ LÃƒÆ’Ã‚Â", content: () => <TraCuuDaXuLyTab /> },
] as const;

// ---------------------------------------------------------------------------
// Admin Panel (chÃƒÂ¡Ã‚Â»Ã¢â‚¬Â° hiÃƒÂ¡Ã‚Â»Ã†â€™n thÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ khi URL hash = #admin)
function Dashboard() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authRole, setAuthRole] = useState<DashboardRole | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const [showAdmin, setShowAdmin] = useState(false);
  const [lookupState, setLookupState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_FILTER_STATE);
  const [lookupDoneState, setLookupDoneState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
  const [hideEmptyExperts, setHideEmptyExperts] = useState(true);
  const isAdmin = authRole === "admin";
  const visibleTabs = useMemo(
    () => (isAdmin ? TABS : TABS.filter((tab) => !["tra_cuu_dang_xl", "tra_cuu_da_xl"].includes(tab.id))),
    [isAdmin]
  );

  useEffect(() => {
    let cancelled = false;
    fetchAuthMe()
      .then((data) => {
        if (cancelled) return;
        setAuthRole(data.authenticated ? data.role : null);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthRole(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // TrÃƒÂ¡Ã‚ÂºÃ‚Â¡ng thÃƒÆ’Ã‚Â¡i sync gÃƒÂ¡Ã‚ÂºÃ‚Â§n nhÃƒÂ¡Ã‚ÂºÃ‚Â¥t ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tÃƒÂ¡Ã‚Â»Ã‚Â± Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â€žÂ¢ng refresh mÃƒÂ¡Ã‚Â»Ã¢â‚¬â€i 5 phÃƒÆ’Ã‚Âºt
  const { data: syncStatus } = useQuery({
    queryKey: ["sync-status", authRole],
    queryFn: fetchSyncStatus,
    enabled: Boolean(authRole),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  // Filter state riÃƒÆ’Ã‚Âªng cho tÃƒÂ¡Ã‚Â»Ã‚Â«ng tab ThÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng kÃƒÆ’Ã‚Âª (48 / 47 / 46) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â khÃƒÆ’Ã‚Â´ng bÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ reset khi chuyÃƒÂ¡Ã‚Â»Ã†â€™n tab
  const [filters, setFilters] = useState<Record<number, TabFilter>>({
    0: makeTabFilter("nam_nay"),
    48: makeTabFilter("nam_nay"),
    47: makeTabFilter("nam_nay"),
    46: makeTabFilter("nam_nay"),
  });

  const updateFilter = useCallback((thuTuc: number, patch: Partial<TabFilter>) => {
    setFilters(prev => ({ ...prev, [thuTuc]: { ...prev[thuTuc], ...patch } }));
  }, []);

  const filtersValue = useMemo<StatsFiltersCtxType>(
    () => ({ filters, updateFilter }),
    [filters, updateFilter]
  );

  useEffect(() => {
    if (!isAdmin && ["tra_cuu_dang_xl", "tra_cuu_da_xl"].includes(activeTab)) {
      setActiveTab(TABS[0].id);
    }
  }, [activeTab, isAdmin]);

  // MÃƒÂ¡Ã‚Â»Ã…Â¸ panel khi hash = #admin, Ãƒâ€žÃ¢â‚¬ËœÃƒÆ’Ã‚Â³ng khi hash thay Ãƒâ€žÃ¢â‚¬ËœÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¢i
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#admin" && isAdmin) setShowAdmin(true);
      else {
        setShowAdmin(false);
        if (window.location.hash === "#admin" && !isAdmin) {
          history.pushState("", document.title, window.location.pathname + window.location.search);
        }
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [isAdmin]);

  // Ãƒâ€žÃ‚ÂÃƒÆ’Ã‚Â³ng panel bÃƒÂ¡Ã‚ÂºÃ‚Â±ng Esc
  useEffect(() => {
    if (!showAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAdmin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAdmin]);

  const closeAdmin = () => {
    setShowAdmin(false);
    if (window.location.hash === "#admin") {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  };

  const handleLogin = useCallback(async () => {
    if (!loginPassword.trim()) return;
    setLoginBusy(true);
    setAuthError(null);
    try {
      const data = await loginDashboard(loginPassword);
      setAuthRole(data.role);
      setLoginPassword("");
    } catch (e) {
      setAuthError(String(e));
    } finally {
      setLoginBusy(false);
    }
  }, [loginPassword]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutDashboard();
    } catch {
      // ignore
    }
    closeAdmin();
    setAuthRole(null);
    setLookupState(DEFAULT_TRA_CUU_FILTER_STATE);
    setLookupDoneState(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
    setActiveTab(TABS[0].id);
  }, []);

  const openLookupByChuyenVien = useCallback((tenCvRaw: string, thuTuc: 48 | 47 | 46) => {
    if (!isAdmin) return;
    setLookupState({
      ...DEFAULT_TRA_CUU_FILTER_STATE,
      thuTuc,
      chuyenVien: tenCvRaw,
    });
    setActiveTab("tra_cuu_dang_xl");
  }, [isAdmin]);

  const openLookupByChuyenGia = useCallback((tenCg: string) => {
    if (!isAdmin) return;
    setLookupState({
      ...DEFAULT_TRA_CUU_FILTER_STATE,
      thuTuc: 48,
      chuyenGia: tenCg.trim(),
      tinhTrang: "cho_chuyen_gia",
    });
    setActiveTab("tra_cuu_dang_xl");
  }, [isAdmin]);

  const openLookupByTinhTrang = useCallback((thuTuc: 48 | 47 | 46, tinhTrang: LookupTinhTrang) => {
    if (!isAdmin) return;
    setLookupState({
      ...DEFAULT_TRA_CUU_FILTER_STATE,
      thuTuc,
      tinhTrang,
    });
    setActiveTab("tra_cuu_dang_xl");
  }, [isAdmin]);

  const openThongKeFromTongQuan = useCallback((thuTuc: 48 | 47 | 46, filter: TabFilter) => {
    updateFilter(thuTuc, {
      fromDate: filter.fromDate,
      toDate: filter.toDate,
      fromInput: filter.fromInput,
      toInput: filter.toInput,
      activePreset: filter.activePreset,
      loadingAll: false,
    });
    setActiveTab(`tt${thuTuc}_thong_ke`);
  }, [updateFilter]);

  const openDangXuLyFromTongQuan = useCallback((thuTuc: 48 | 47 | 46) => {
    setActiveTab(`tt${thuTuc}_dang_xl`);
  }, []);

  const renderTabContent = (tabId: string) => {
    switch (tabId) {
      case "tong_quan":
        return <TongQuanTab onOpenThongKe={openThongKeFromTongQuan} onOpenDangXuLy={openDangXuLyFromTongQuan} />;
      case "tt48_thong_ke":
        return <ThongKeTab thuTuc={48} />;
      case "tt48_dang_xl":
        return <DangXuLyTab thuTuc={48} onCvLookup={openLookupByChuyenVien} onCgLookup={openLookupByChuyenGia} onTinhTrangLookup={openLookupByTinhTrang} hideEmptyExperts={hideEmptyExperts} setHideEmptyExperts={setHideEmptyExperts} />;
      case "tt47_thong_ke":
        return <ThongKeTab thuTuc={47} />;
      case "tt47_dang_xl":
        return <DangXuLyTab thuTuc={47} onCvLookup={openLookupByChuyenVien} />;
      case "tt46_thong_ke":
        return <ThongKeTab thuTuc={46} />;
      case "tt46_dang_xl":
        return <DangXuLyTab thuTuc={46} onCvLookup={openLookupByChuyenVien} />;
      case "tra_cuu_dang_xl":
        return isAdmin ? <TraCuuDangXuLyTab state={lookupState} setState={setLookupState} isActive={activeTab === "tra_cuu_dang_xl"} /> : null;
      case "tra_cuu_da_xl":
        return isAdmin ? <TraCuuDaXuLyTab state={lookupDoneState} setState={setLookupDoneState} isActive={activeTab === "tra_cuu_da_xl"} /> : null;
      default:
        return null;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">Ãƒâ€žÃ‚Âang kiÃƒÂ¡Ã‚Â»Ã†â€™m tra Ãƒâ€žÃ¢â‚¬ËœÃƒâ€žÃ†â€™ng nhÃƒÂ¡Ã‚ÂºÃ‚Â­p...</div>
      </div>
    );
  }

  if (!authRole) {
    return (
      <LoginScreen
        password={loginPassword}
        setPassword={setLoginPassword}
        busy={loginBusy}
        error={authError}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <StatsFiltersCtx.Provider value={filtersValue}>
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow flex-shrink-0">
            DAV
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800 leading-none">
              Dashboard HÃƒÂ¡Ã‚Â»Ã¢â‚¬Å“ SÃƒâ€ Ã‚Â¡ PQLCL
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">CÃƒÂ¡Ã‚Â»Ã‚Â¥c QuÃƒÂ¡Ã‚ÂºÃ‚Â£n lÃƒÆ’Ã‚Â½ DÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã‚Â£c</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${isAdmin ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
              {authRole}
            </span>
            {isAdmin && (
              <button
                onClick={() => {
                  window.location.hash = "admin";
                  setShowAdmin(true);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Admin
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Ãƒâ€žÃ‚ÂÃƒâ€žÃ†â€™ng xuÃƒÂ¡Ã‚ÂºÃ‚Â¥t
            </button>
          </div>
          {syncStatus && (() => {
            const iso = syncStatus.lastSyncedAt;
            if (!iso) return (
              <p className="text-xs text-slate-400 text-right leading-snug hidden sm:block">
                DÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u cÃƒÂ¡Ã‚ÂºÃ‚Â­p nhÃƒÂ¡Ã‚ÂºÃ‚Â­t lÃƒÂ¡Ã‚ÂºÃ‚Â§n cuÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi<br />
                <span className="text-slate-400 italic">ChÃƒâ€ Ã‚Â°a cÃƒÆ’Ã‚Â³ dÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u sync</span>
                <span className="text-slate-400"> Ãƒâ€šÃ‚Â· {syncStatus.totalSizeMB.toFixed(2)} MB</span>
              </p>
            );
            const d   = new Date(iso);
            const dd  = String(d.getDate()).padStart(2, "0");
            const mm  = String(d.getMonth() + 1).padStart(2, "0");
            const hh  = String(d.getHours()).padStart(2, "0");
            const min = String(d.getMinutes()).padStart(2, "0");
            return (
              <p className="text-xs text-slate-400 text-right leading-snug hidden sm:block">
                DÃƒÂ¡Ã‚Â»Ã‚Â¯ liÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¡u cÃƒÂ¡Ã‚ÂºÃ‚Â­p nhÃƒÂ¡Ã‚ÂºÃ‚Â­t lÃƒÂ¡Ã‚ÂºÃ‚Â§n cuÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœi<br />
                <span className="font-medium text-slate-600">
                  {dd}-{mm}-{d.getFullYear()} lÃƒÆ’Ã‚Âºc {hh}:{min}
                  {" "}({syncStatus.totalSizeMB.toFixed(2)} MB)
                </span>
              </p>
            );
          })()}
        </div>

        {/* Tab navigation */}
        <div className="max-w-screen-2xl mx-auto px-4 flex overflow-x-auto gap-0 scrollbar-none">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex-shrink-0 px-5 py-2.5 text-xs font-bold uppercase tracking-wide border-b-2 transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700 bg-blue-50"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        {visibleTabs.map((tab) => (
          <div key={tab.id} className={activeTab === tab.id ? "block" : "hidden"}>
            {renderTabContent(tab.id)}
          </div>
        ))}
      </main>

      {/* Admin Panel ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â chÃƒÂ¡Ã‚Â»Ã¢â‚¬Â° hiÃƒÂ¡Ã‚Â»Ã†â€™n thÃƒÂ¡Ã‚Â»Ã¢â‚¬Â¹ khi URL hash = #admin */}
      {isAdmin && showAdmin && <AdminPanel onClose={closeAdmin} />}
    </div>
    </StatsFiltersCtx.Provider>
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








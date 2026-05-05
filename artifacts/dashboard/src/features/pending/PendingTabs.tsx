import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, ResponsiveContainer, Cell, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { cleanCvName } from "../../shared/nameFormatters";
import { isoToDisplay } from "../../shared/displayFormatters";
import { CHART_ANIMATION_MS } from "../../shared/chartConfig";
import { type LookupTinhTrang } from "../lookup/lookupShared";
import {
  CHO_COLORS,
  CHO_COLORS_48,
  PENDING_COMMON_MESSAGES,
  fetchChuyenGia,
  fetchDangXuLy,
  type ChuyenGiaRow,
  type DangXuLyRow,
  type PendingThuTuc,
} from "./pendingShared";

// Extracted from App.tsx to keep pending-workflow UI isolated from the dashboard shell.

export type PendingExpertsControls = {
  hideEmptyExperts?: boolean;
  setHideEmptyExperts?: (value: boolean) => void;
};

export type PendingExpertsState = Required<PendingExpertsControls>;

export function DangXuLyTab({
  thuTuc,
  onCvLookup,
  onCgLookup,
  onTinhTrangLookup,
  hideEmptyExperts = false,
  setHideEmptyExperts,
}: {
  thuTuc: PendingThuTuc;
  onCvLookup?: (tenCvRaw: string, thuTuc: PendingThuTuc) => void;
  onCgLookup?: (tenCg: string) => void;
  onTinhTrangLookup?: (thuTuc: PendingThuTuc, tinhTrang: LookupTinhTrang) => void;
} & PendingExpertsControls) {
  const [showTt48TotalBreakdown, setShowTt48TotalBreakdown] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dang-xu-ly", thuTuc],
    queryFn: () => fetchDangXuLy(thuTuc),
    retry: 2,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      {PENDING_COMMON_MESSAGES.loadingPending}
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center h-48 text-red-400 text-sm">
      {PENDING_COMMON_MESSAGES.errorPending(thuTuc)}
    </div>
  );

  const allRows   = data.rows;
  const cpc       = data.cho_phan_cong;
  const months    = data.months;
  const is48      = thuTuc === 48;
  const is46Or47  = thuTuc === 46 || thuTuc === 47;

  // Ẩn cột nếu toàn bộ dữ liệu (kể cả hàng chờ phân công) đều bằng 0
  const showPct    = allRows.some(r => r.cho_pct    > 0) || (cpc?.cho_pct    ?? 0) > 0;
  const showVanThu = allRows.some(r => r.cho_van_thu > 0) || (cpc?.cho_van_thu ?? 0) > 0;

  // Aggregate totals for charts
  const totCon = allRows.reduce((s, r) => s + r.con_han, 0) + (cpc?.con_han ?? 0);
  const totQua = allRows.reduce((s, r) => s + r.qua_han, 0) + (cpc?.qua_han ?? 0);
  const grandTotal = totCon + totQua;

  // Aggregate cho TT47/46
  const totChoThamDinh = allRows.reduce((s, r) => s + r.cho_tham_dinh, 0);
  const totChoQuyetDinh = allRows.reduce((s, r) => s + r.cho_quyet_dinh, 0);
  const totChoKeHoach = allRows.reduce((s, r) => s + r.cho_ke_hoach, 0);
  const totChoBaoCao = allRows.reduce((s, r) => s + r.cho_bao_cao, 0);
  const totCg       = allRows.reduce((s, r) => s + r.cho_cg,        0);
  const totChoNopCapa = allRows.reduce((s, r) => s + r.cho_nop_capa, 0);
  const totChoDanhGiaCapa = allRows.reduce((s, r) => s + r.cho_danh_gia_capa, 0);
  const totToTruong = allRows.reduce((s, r) => s + r.cho_to_truong, 0);
  const totTrp      = allRows.reduce((s, r) => s + r.cho_trp,       0);
  const totPct      = allRows.reduce((s, r) => s + r.cho_pct,       0);
  const totVanThu   = allRows.reduce((s, r) => s + r.cho_van_thu,   0);

  // Aggregate TT48 buoc
  const tot48 = (key: keyof DangXuLyRow) =>
    allRows.reduce((s, r) => s + ((r[key] as number) || 0), 0) + ((cpc?.[key] as number) || 0);
  const tot48Chart = (key: keyof DangXuLyRow) =>
    allRows.reduce((s, r) => s + ((r[key] as number) || 0), 0);

  const catData = is48
    ? [
        ...(cpc && cpc.tong > 0
          ? [{ name: "Ch\u1edd ph\u00e2n c\u00f4ng", value: cpc.tong, fill: "#6366f1" }]
          : []),
        ...CHO_COLORS_48.map(c => ({
        name:  c.label,
        value: tot48Chart(c.key as keyof DangXuLyRow),
        fill:  c.fill,
      })),
      ].filter(d => d.value > 0)
    : [
        ...(cpc && cpc.tong > 0
          ? [{ name: "Ch\u1edd ph\u00e2n c\u00f4ng", value: cpc.tong, fill: "#6366f1" }]
          : []),
        { name: "Ch\u1edd th\u1ea9m \u0111\u1ecbnh", value: totChoThamDinh, fill: "#3b82f6" },
        { name: "Ch\u1edd Quy\u1ebft \u0111\u1ecbnh", value: totChoQuyetDinh, fill: "#0ea5e9" },
        ...(is46Or47 ? [
          { name: "Ch\u1edd K\u1ebf ho\u1ea1ch", value: totChoKeHoach, fill: "#10b981" },
          { name: "Ch\u1edd b\u00e1o c\u00e1o", value: totChoBaoCao, fill: "#14b8a6" },
        ] : []),
        { name: "\u0110ang x\u1eed l\u00fd", value: totCg, fill: "#22c55e" },
        { name: "Ch\u1edd n\u1ed9p CAPA", value: totChoNopCapa, fill: "#f59e0b" },
        { name: "Ch\u1edd \u0111\u00e1nh gi\u00e1 CAPA", value: totChoDanhGiaCapa, fill: "#8b5cf6" },
      ].filter(d => d.value > 0);

  const hanData = [
    { name: "Còn hạn", value: totCon, fill: "#3b82f6" },
    { name: "Quá hạn", value: totQua, fill: "#f97316" },
  ];

  const catTotal = catData.reduce((s, d) => s + d.value, 0);

  // Custom tooltip giống DonutChart
  const CatTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const pct = catTotal > 0 ? ((item.value / catTotal) * 100).toFixed(1) : "0.0";
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: item.payload.fill }} />
          <span className="font-semibold text-slate-700">{item.name}</span>
        </div>
        <div className="mt-1 font-bold text-slate-900">{item.value.toLocaleString("vi-VN")} hồ sơ</div>
        <div className="text-slate-500">{pct}%</div>
      </div>
    );
  };

  const HanTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const pct = grandTotal > 0 ? ((item.value / grandTotal) * 100).toFixed(1) : "0.0";
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: item.payload.fill }} />
          <span className="font-semibold text-slate-700">{item.name.replace(/ \(\d+%\)$/, "")}</span>
        </div>
        <div className="mt-1 font-bold text-slate-900">{item.value.toLocaleString("vi-VN")} hồ sơ</div>
        <div className="text-slate-500">{pct}%</div>
      </div>
    );
  };

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
    if (catTotal === 0) return null;
    const RADIAN = Math.PI / 180;
    // Đặt nhãn ở giữa vành khăn (midpoint giữa innerRadius và outerRadius)
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = Math.round(value / catTotal * 100);
    if (pct < 5) return null;
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{pct}%</text>;
  };

  const renderHanLabel = ({ cx, cy, midAngle, outerRadius, value }: any) => {
    const RADIAN = Math.PI / 180;
    const r = outerRadius * 0.62;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = grandTotal > 0 ? Math.round(value / grandTotal * 100) : 0;
    if (pct < 5) return null;
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700}>{pct}%</text>;
  };

  // Table cell helpers
  const numCell = (val: number, bg?: string, bold?: boolean) => (
    <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${bg ?? ""} ${bold ? "font-bold" : ""}`}>
      {val || ""}
    </td>
  );
  const pctCell = (qua: number, tot: number) => {
    const p = tot > 0 ? Math.round(qua / tot * 100) : 0;
    const color = p >= 95 ? "text-red-600" : p >= 85 ? "text-orange-600" : "text-slate-600";
    return (
      <td className={`px-2 py-1.5 text-center text-xs font-semibold whitespace-nowrap ${color}`}>
        {tot > 0 ? `${p}%` : ""}
      </td>
    );
  };

  const renderRow = (row: DangXuLyRow, idx: number | null) => {
    const isCpc = idx === null;
    const bgRow = isCpc ? "bg-amber-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const cvLabel = isCpc ? "Chờ phân công ..." : cleanCvName(row.cv_name);

    const chamSoNgay = row.cham_so_ngay;
    const tgDisplay = chamSoNgay > 0
      ? chamSoNgay
      : row.cham_ngay
        ? Math.floor((Date.now() - new Date(row.cham_ngay).getTime()) / 86400000)
        : 0;
    const isOverdue = chamSoNgay > 0;
    const tgColor = isOverdue && tgDisplay >= 300 ? "text-red-600 font-bold"
      : isOverdue && tgDisplay >= 100 ? "text-orange-600 font-semibold"
      : "text-slate-600";

    const stickyBase = (
      <>
        <td className={`sticky left-0 z-10 px-1 py-1.5 text-center text-xs text-slate-400 w-9 ${bgRow}`}>
          {idx !== null ? idx + 1 : ""}
        </td>
        <td className={`sticky left-9 z-10 px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[160px] max-w-[220px] ${bgRow}`}
            style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
          {isCpc ? (
            onTinhTrangLookup ? (
              <button
                type="button"
                onClick={() => onTinhTrangLookup(thuTuc, "cho_phan_cong")}
                className="cursor-pointer text-left font-semibold text-amber-700 hover:text-amber-800"
              >
                {cvLabel}
              </button>
            ) : (
              cvLabel
            )
          ) : !onCvLookup ? (
            cvLabel
          ) : (
            <button
              type="button"
              onClick={() => onCvLookup(row.cv_name, thuTuc)}
              className="cursor-pointer text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              {cvLabel}
            </button>
          )}
        </td>
      </>
    );

    const totCell = (
      <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap ${row.tong > 100 ? "text-pink-700 bg-pink-50" : "text-slate-700"}`}>
        {row.tong}
      </td>
    );
    const chamCells = (
      <>
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 ${tgColor}`}>
          {tgDisplay > 0 ? `${tgDisplay} ngày` : ""}
        </td>
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {isoToDisplay(row.cham_ngay)}
        </td>
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {row.cham_ma ?? ""}
        </td>
      </>
    );
    const hanCells = (
      <>
        {numCell(row.con_han, row.con_han > 0 ? "text-blue-600" : "text-slate-300")}
        <td className={`px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap ${row.qua_han > 70 ? "bg-orange-100 text-orange-800" : row.qua_han > 0 ? "text-orange-700" : "text-slate-300"}`}>
          {row.qua_han || ""}
        </td>
        {pctCell(row.qua_han, row.tong)}
      </>
    );

    if (is48) {
      const v = (n?: number) => n || 0;
      return (
        <tr key={row.cv_name} className={`${bgRow} hover:bg-blue-50 transition-colors`}>
          {stickyBase}
          {totCell}
          {/* Chưa xử lý */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.chua_xu_ly) > 50 ? "bg-blue-100 text-blue-800 font-bold" : v(row.chua_xu_ly) > 0 ? "text-blue-700" : "text-slate-300"}`}>
            {v(row.chua_xu_ly) || ""}
          </td>
          {/* Bị trả lại */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.bi_tra_lai) > 0 ? "bg-red-50 text-red-700 font-semibold" : "text-slate-300"}`}>
            {v(row.bi_tra_lai) || ""}
          </td>
          {/* Chờ CG */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_cg > 30 ? "bg-green-100 text-green-800 font-bold" : row.cho_cg > 0 ? "text-green-700" : "text-slate-300"}`}>
            {row.cho_cg || ""}
          </td>
          {/* Chờ tổng hợp */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.cho_tong_hop) > 0 ? "text-cyan-700 font-semibold" : "text-slate-300"}`}>
            {v(row.cho_tong_hop) || ""}
          </td>
          {/* Chờ Tổ trưởng */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_to_truong > 0 ? "text-orange-500 font-semibold" : "text-slate-300"}`}>
            {row.cho_to_truong || ""}
          </td>
          {/* Chờ TrP */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_trp > 0 ? "text-orange-700" : "text-slate-300"}`}>
            {row.cho_trp || ""}
          </td>
          {/* Chờ công bố */}
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${v(row.cho_cong_bo) > 0 ? "text-emerald-700 font-semibold" : "text-slate-300"}`}>
            {v(row.cho_cong_bo) || ""}
          </td>
          {/* Chờ PCT — ẩn nếu không có */}
          {showPct && (
            <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_pct > 0 ? "text-purple-700 font-semibold" : "text-slate-300"}`}>
              {row.cho_pct || ""}
            </td>
          )}
          {/* Chờ Văn thư — ẩn nếu không có */}
          {showVanThu && (
            <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_van_thu > 0 ? "text-slate-600" : "text-slate-300"}`}>
              {row.cho_van_thu || ""}
            </td>
          )}
          {hanCells}
          {chamCells}
        </tr>
      );
    }

    // TT47/46
    return (
      <tr key={row.cv_name} className={`${bgRow} hover:bg-blue-50 transition-colors`}>
        {stickyBase}
        {totCell}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_tham_dinh > 50 ? "bg-blue-100 text-blue-800 font-bold" : row.cho_tham_dinh > 0 ? "text-blue-700" : "text-slate-300"}`}>
          {row.cho_tham_dinh || ""}
        </td>
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_quyet_dinh > 20 ? "bg-sky-100 text-sky-800 font-bold" : row.cho_quyet_dinh > 0 ? "text-sky-700" : "text-slate-300"}`}>
          {row.cho_quyet_dinh || ""}
        </td>
        {is46Or47 && (
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_ke_hoach > 0 ? "text-emerald-700 font-semibold" : "text-slate-300"}`}>
            {row.cho_ke_hoach || ""}
          </td>
        )}
        {is46Or47 && (
          <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_bao_cao > 0 ? "text-teal-700 font-semibold" : "text-slate-300"}`}>
            {row.cho_bao_cao || ""}
          </td>
        )}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_nop_capa > 0 ? "text-amber-700 font-semibold" : "text-slate-300"}`}>
          {row.cho_nop_capa || ""}
        </td>
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap ${row.cho_danh_gia_capa > 0 ? "text-violet-700 font-semibold" : "text-slate-300"}`}>
          {row.cho_danh_gia_capa || ""}
        </td>
        {hanCells}
        {chamCells}
      </tr>
    );
  };

  // Summary totals row
  const totRow      = [...allRows, ...(cpc ? [cpc] : [])];
  const sumN = (key: keyof DangXuLyRow) => totRow.reduce((s, r) => s + ((r[key] as number) || 0), 0);
  const sumTong     = sumN("tong");
  const sumChoThamDinh = sumN("cho_tham_dinh");
  const sumChoQuyetDinh = sumN("cho_quyet_dinh");
  const sumChoKeHoach = sumN("cho_ke_hoach");
  const sumChoBaoCao = sumN("cho_bao_cao");
  const sumCg       = sumN("cho_cg");
  const sumChoNopCapa = sumN("cho_nop_capa");
  const sumChoDanhGiaCapa = sumN("cho_danh_gia_capa");
  const sumToTruong = sumN("cho_to_truong");
  const sumTrp      = sumN("cho_trp");
  const sumPct      = sumN("cho_pct");
  const sumVanThu   = sumN("cho_van_thu");
  const sumCon      = sumN("con_han");
  const sumQua      = sumN("qua_han");
  // TT48 buoc sums
  const sum48_cxl   = sumN("chua_xu_ly");
  const sum48_btl   = sumN("bi_tra_lai");
  const sum48_cth   = sumN("cho_tong_hop");
  const sum48_ccb   = sumN("cho_cong_bo");
  // TT48 per-step con/qua for CÒN HẠN / QUÁ HẠN rows
  const sh_c = (k: keyof DangXuLyRow) => totRow.reduce((s, r) => s + ((r[k] as number) || 0), 0);
  const renderTinhTrangHeader = (label: React.ReactNode, tinhTrang: LookupTinhTrang, className: string) => (
    <th className={className}>
      {onTinhTrangLookup ? (
        <button
          type="button"
          onClick={() => onTinhTrangLookup(thuTuc, tinhTrang)}
          className="cursor-pointer text-center hover:text-slate-100"
        >
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Title bar */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Hồ sơ đang giải quyết — TT{thuTuc}
        </h2>
        <span className="text-xs text-slate-400 italic">
          Tổng: <strong className="text-slate-600">{grandTotal}</strong> hồ sơ đang xử lý
        </span>
      </div>

      {/* Charts row */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        {/* Phân loại theo bước xử lý */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-2 text-center">Phân loại theo bước xử lý</p>
          {(
            /* TT48: list dạng thanh ngang — rõ hơn donut khi có nhiều bước */
            <div className="flex flex-col gap-1.5 px-1" style={{ height: 180, overflowY: "auto" }}>
              {catData.map(d => {
                const pct = catTotal > 0 ? (d.value / catTotal * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-2 min-w-0">
                    {/* nhãn */}
                    <span className="text-xs text-slate-600 whitespace-nowrap w-[124px] shrink-0 truncate"
                          title={d.name}>{d.name}</span>
                    {/* thanh + số — dùng positioning để số sát cạnh phải thanh */}
                    <div className="flex-1 relative h-4">
                      {/* track (overflow:hidden để bar clip đúng) */}
                      <div className="absolute inset-0 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full flex items-center justify-end pr-1.5"
                             style={{ width: `${Math.max(pct, 2)}%`, background: d.fill }}>
                          {pct >= 12 && (
                            <span className="text-[10px] font-bold text-white leading-none">{d.value}</span>
                          )}
                        </div>
                      </div>
                      {/* số ngoài — căn trái theo cạnh phải của thanh */}
                      {pct < 12 && (
                        <span className="absolute top-0 h-full flex items-center text-[11px] font-semibold leading-none pl-1"
                              style={{ left: `${Math.max(pct, 2)}%`, color: d.fill }}>
                          {d.value}
                        </span>
                      )}
                    </div>
                    {/* % */}
                    <span className="text-[10px] text-slate-400 shrink-0 w-[30px] text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
              {catData.length === 0 && (
                <div className="flex items-center justify-center h-full text-slate-300 text-xs">
                  Không có dữ liệu
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pie: Tình trạng (Còn hạn / Quá hạn) */}
        <div className="bg-white rounded-xl border border-slate-200 p-3" style={{ width: 220 }}>
          <p className="text-xs font-semibold text-slate-500 mb-1 text-center">Tình trạng</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={hanData} cx="50%" cy="50%" outerRadius={72}
                dataKey="value" labelLine={false} label={renderHanLabel} animationDuration={CHART_ANIMATION_MS}
                startAngle={270} endAngle={-90}>
                {hanData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip content={<HanTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Area: Phân bổ theo thời gian tiếp nhận */}
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-1 text-center">Phân bổ theo thời gian tiếp nhận</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={months} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: number) => [v.toLocaleString("vi-VN"), "Số hồ sơ"]} />
              <Area type="monotone" dataKey="cnt" stroke="#3b82f6" fill="#93c5fd" strokeWidth={2} animationDuration={CHART_ANIMATION_MS} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse"
                 style={{ minWidth: is48 ? 1400 : is46Or47 ? 1180 : 1100, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 160 }} />
              {/* step columns — chia đều */}
              {is48
                ? <>{/* TT48: TỔNG + 7 bước cố định + PCT? + VT? + Còn hạn + Quá hạn + % */}
                    <col /><col /><col /><col /><col />
                    <col /><col /><col />
                    {showPct    && <col />}
                    {showVanThu && <col />}
                    <col /><col /><col />
                  </>
                 : (
                   <>
                     {/* TT47/46: TỔNG + trạng thái + Còn hạn + Quá hạn + % */}
                     {is46Or47 ? (
                       <><col /><col /><col /><col /><col /><col /><col /><col /><col /><col /></>
                     ) : (
                       <><col /><col /><col /><col /><col /><col /><col /><col /><col /></>
                     )}
                   </>
                 )
               }
              {/* 3 cột Hồ sơ chậm nhất */}
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="sticky left-0 z-20 bg-slate-700 px-1 py-2 text-center w-9 text-xs" rowSpan={2}>STT</th>
                <th className="sticky left-9 z-20 bg-slate-700 px-3 py-2 text-left text-xs min-w-[160px]"
                    rowSpan={2} style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.15)" }}>
                  Chuyên viên
                </th>
                <th className="px-2 py-2 text-center text-xs bg-blue-600"
                    colSpan={is48 ? 13 - (showPct ? 0 : 1) - (showVanThu ? 0 : 1) : is46Or47 ? 10 : 9}>
                  ĐANG GIẢI QUYẾT
                </th>
                <th className="px-2 py-2 text-center text-xs bg-rose-700" colSpan={3}>Hồ sơ chậm nhất</th>
              </tr>
              {is48
                ? (
                  <tr className="bg-slate-600 text-white">
                    <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">{"T\u1ed4NG"}</th>
                    {renderTinhTrangHeader(<>{ "Ch\u01b0a" }<br/>{ "x\u1eed l\u00fd" }</>, "chua_xu_ly", "px-2 py-1 text-center text-xs bg-blue-700")}
                    {renderTinhTrangHeader(<>{ "B\u1ecb" }<br/>{ "tr\u1ea3 l\u1ea1i" }</>, "bi_tra_lai", "px-2 py-1 text-center text-xs bg-red-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "chuy\u00ean gia" }</>, "cho_chuyen_gia", "px-2 py-1 text-center text-xs bg-green-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "t\u1ed5ng h\u1ee3p" }</>, "cho_tong_hop", "px-2 py-1 text-center text-xs bg-cyan-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd T\u1ed5" }<br/>{ "tr\u01b0\u1edfng" }</>, "cho_to_truong", "px-2 py-1 text-center text-xs bg-orange-400")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "Tr\u01b0\u1edfng ph\u00f2ng" }</>, "cho_truong_phong", "px-2 py-1 text-center text-xs bg-orange-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "c\u00f4ng b\u1ed1" }</>, "cho_cong_bo", "px-2 py-1 text-center text-xs bg-emerald-600")}
                    {showPct    && <th className="px-2 py-1 text-center text-xs bg-purple-600">Chờ PCT</th>}
                    {showVanThu && renderTinhTrangHeader(<>{ "Chờ" }<br/>{ "Văn thư" }</>, "cho_van_thu", "px-2 py-1 text-center text-xs bg-slate-500")}
                    <th className="px-2 py-1 text-center text-xs bg-green-700">Còn<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-700">% quá<br/>hạn</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hồ sơ</th>
                  </tr>
                 ) : (
                  <tr className="bg-slate-600 text-white">
                    <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">{"T\u1ed4NG"}</th>
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "th\u1ea9m \u0111\u1ecbnh" }</>, "cho_tham_dinh", "px-2 py-1 text-center text-xs bg-blue-700")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd" }<br/>{ "Quy\u1ebft \u0111\u1ecbnh" }</>, "cho_quyet_dinh", "px-2 py-1 text-center text-xs bg-sky-600")}
                    {is46Or47 && renderTinhTrangHeader(<>{ "Ch\u1edd K\u1ebf" }<br/>{ "ho\u1ea1ch" }</>, "cho_ke_hoach", "px-2 py-1 text-center text-xs bg-emerald-600")}
                    {is46Or47 && renderTinhTrangHeader(<>{ "Ch\u1edd b\u00e1o" }<br/>{ "c\u00e1o" }</>, "cho_bao_cao", "px-2 py-1 text-center text-xs bg-teal-600")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd n\u1ed9p" }<br/>{ "CAPA" }</>, "cho_nop_capa", "px-2 py-1 text-center text-xs bg-amber-500")}
                    {renderTinhTrangHeader(<>{ "Ch\u1edd \u0111\u00e1nh gi\u00e1" }<br/>{ "CAPA" }</>, "cho_danh_gia_capa", "px-2 py-1 text-center text-xs bg-violet-600")}
                    <th className="px-2 py-1 text-center text-xs bg-green-700">{"C\u00f2n"}<br/>{"h\u1ea1n"}</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-600">{"Qu\u00e1"}<br/>{"h\u1ea1n"}</th>
                    <th className="px-2 py-1 text-center text-xs bg-orange-700">% {"qu\u00e1"}<br/>{"h\u1ea1n"}</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">{"Th\u1eddi gian ch\u1edd"}</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">{"N\u1ed9p t\u1eeb"}</th>
                    <th className="px-2 py-1 text-center text-xs bg-rose-600">{"M\u00e3 h\u1ed3 s\u01a1"}</th>
                  </tr>
                )
              }
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cpc && renderRow(cpc, null)}
              {allRows.map((row, idx) => renderRow(row, idx))}
            </tbody>
            <tfoot>
              {/* Hàng TỔNG */}
              <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
                <td className="sticky left-0 z-10 bg-slate-100 px-1 py-2 text-center text-xs" />
                <td className="sticky left-9 z-10 bg-slate-100 px-3 py-2 text-xs font-bold"
                    style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>
                  {is48 ? (
                    <button
                      type="button"
                      onClick={() => setShowTt48TotalBreakdown((prev) => !prev)}
                      className="inline-flex items-center gap-2 text-left"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
                        {showTt48TotalBreakdown ? "−" : "+"}
                      </span>
                      <span>TỔNG</span>
                    </button>
                  ) : "TỔNG"}
                </td>
                <td className="px-2 py-2 text-center text-xs font-bold text-slate-700">{sumTong}</td>
                {is48 ? (
                  <>
                    <td className="px-2 py-2 text-center text-xs text-blue-700">{sum48_cxl || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-red-700">{sum48_btl || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-green-700">{sumCg || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-cyan-700">{sum48_cth || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-orange-500">{sumToTruong || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-orange-700">{sumTrp || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-emerald-700">{sum48_ccb || ""}</td>
                    {showPct    && <td className="px-2 py-2 text-center text-xs text-purple-700">{sumPct || ""}</td>}
                    {showVanThu && <td className="px-2 py-2 text-center text-xs text-slate-600">{sumVanThu || ""}</td>}
                  </>
                 ) : (
                  <>
                    <td className="px-2 py-2 text-center text-xs text-blue-700">{sumChoThamDinh || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-sky-700">{sumChoQuyetDinh || ""}</td>
                    {is46Or47 && <td className="px-2 py-2 text-center text-xs text-emerald-700">{sumChoKeHoach || ""}</td>}
                    {is46Or47 && <td className="px-2 py-2 text-center text-xs text-teal-700">{sumChoBaoCao || ""}</td>}
                    <td className="px-2 py-2 text-center text-xs text-amber-700">{sumChoNopCapa || ""}</td>
                    <td className="px-2 py-2 text-center text-xs text-violet-700">{sumChoDanhGiaCapa || ""}</td>
                  </>
                )}
                <td className="px-2 py-2 text-center text-xs text-blue-600">{sumCon}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700 font-bold">{sumQua}</td>
                <td className="px-2 py-2 text-center text-xs text-orange-700">
                  {sumTong > 0 ? `${Math.round(sumQua / sumTong * 100)}%` : ""}
                </td>
                <td className="px-2 py-2 bg-rose-50" />
                <td className="px-2 py-2 bg-rose-50" />
                <td className="px-2 py-2 bg-rose-50" />
              </tr>
              {/* TT48: hàng CÒN HẠN / QUÁ HẠN per step */}
              {is48 && showTt48TotalBreakdown && (
                <>
                  <tr className="bg-blue-50 text-blue-700 text-xs">
                    <td className="sticky left-0 z-10 bg-blue-50 px-1 py-1 text-center" />
                    <td className="sticky left-9 z-10 bg-blue-50 px-3 py-1 font-semibold"
                        style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>CÒN HẠN</td>
                    <td className="px-2 py-1 text-center">{sh_c("con_han") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("chua_xu_ly_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("bi_tra_lai_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cg_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_tong_hop_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_to_truong_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_trp_con") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cong_bo_con") || ""}</td>
                    {showPct    && <td className="px-2 py-1 text-center">{sh_c("cho_pct_con") || ""}</td>}
                    {showVanThu && <td className="px-2 py-1 text-center">{sh_c("cho_van_thu_con") || ""}</td>}
                    <td className="px-2 py-1 text-center font-bold">{sh_c("con_han") || ""}</td>
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                  </tr>
                  <tr className="bg-orange-50 text-orange-700 text-xs">
                    <td className="sticky left-0 z-10 bg-orange-50 px-1 py-1 text-center" />
                    <td className="sticky left-9 z-10 bg-orange-50 px-3 py-1 font-semibold"
                        style={{ boxShadow: "2px 0 4px -1px rgba(0,0,0,0.08)" }}>QUÁ HẠN</td>
                    <td className="px-2 py-1 text-center">{sh_c("qua_han") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("chua_xu_ly_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("bi_tra_lai_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cg_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_tong_hop_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_to_truong_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_trp_qua") || ""}</td>
                    <td className="px-2 py-1 text-center">{sh_c("cho_cong_bo_qua") || ""}</td>
                    {showPct    && <td className="px-2 py-1 text-center">{sh_c("cho_pct_qua") || ""}</td>}
                    {showVanThu && <td className="px-2 py-1 text-center">{sh_c("cho_van_thu_qua") || ""}</td>}
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 text-center font-bold">{sh_c("qua_han") || ""}</td>
                    <td className="px-2 py-1 text-center" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                    <td className="px-2 py-1 bg-rose-50" />
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </div>
        {thuTuc === 48 && (
          <ChuyenGiaTable
            thuTuc={thuTuc}
            onCgClick={onCgLookup}
            hideEmpty={hideEmptyExperts}
            setHideEmpty={setHideEmptyExperts ?? (() => undefined)}
          />
        )}
    </div>
  );
}

function ChuyenGiaTable({
  thuTuc,
  onCgClick,
  hideEmpty,
  setHideEmpty,
}: {
  thuTuc: number;
  onCgClick?: (tenCg: string) => void;
  hideEmpty: boolean;
  setHideEmpty: (value: boolean) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-gia", thuTuc],
    queryFn: () => fetchChuyenGia(thuTuc),
    retry: 2,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-20 text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      {PENDING_COMMON_MESSAGES.loadingExperts}
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center h-20 text-red-400 text-sm">
      {PENDING_COMMON_MESSAGES.errorExperts(thuTuc)}
    </div>
  );

  const cleanCv = (name: string | null) =>
    name ? name.replace(/^CV thụ lý\s*:\s*/, "") : "";

  const tgDisplay = (row: ChuyenGiaRow) => {
    if (row.tong === 0) return { val: 0, label: "" };
    if (row.cham_so_ngay > 0) return { val: row.cham_so_ngay, label: `${row.cham_so_ngay} ngày` };
    if (row.cham_ngay) {
      const days = Math.floor((Date.now() - new Date(row.cham_ngay).getTime()) / 86400000);
      return { val: days, label: days > 0 ? `${days} ngày` : "" };
    }
    return { val: 0, label: "" };
  };

  const tgColor = (val: number, isOverdue: boolean) => {
    if (!isOverdue) return "text-slate-500";
    if (val >= 500) return "bg-red-100 text-red-700 font-bold";
    if (val >= 300) return "bg-yellow-100 text-orange-700 font-bold";
    return "text-orange-600 font-semibold";
  };

  const renderRow = (row: ChuyenGiaRow, idx: number, bgBase: string) => {
    const tg = tgDisplay(row);
    const isOverdue = row.cham_so_ngay > 0;
    const rowBg = row.tong === 0 ? bgBase : idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    return (
      <tr key={row.ten} className={`${rowBg} hover:bg-blue-50 transition-colors`}>
        <td className="px-2 py-1.5 text-center text-xs text-slate-400">{idx + 1}</td>
        <td className="px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[160px]">
          {onCgClick ? (
            <button
              type="button"
              onClick={() => onCgClick(row.ten.trim())}
              className="cursor-pointer text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              {row.ten}
            </button>
          ) : (
            row.ten
          )}
        </td>
        {/* TỔNG */}
        <td className={`px-2 py-1.5 text-center text-xs font-bold ${row.da_giai_quyet > 0 ? "text-emerald-700 bg-emerald-50" : "text-slate-300"}`}>
          {row.da_giai_quyet || ""}
        </td>
        <td className={`px-2 py-1.5 text-center text-xs font-bold ${row.tong > 15 ? "text-pink-700 bg-pink-50" : row.tong > 0 ? "text-slate-700" : "text-slate-300"}`}>
          {row.tong || ""}
        </td>
        {/* Còn hạn */}
        <td className={`px-2 py-1.5 text-center text-xs ${row.con_han > 0 ? "text-blue-600" : "text-slate-300"}`}>
          {row.con_han || ""}
        </td>
        {/* Quá hạn */}
        <td className={`px-2 py-1.5 text-center text-xs font-bold ${row.qua_han > 15 ? "bg-orange-100 text-orange-800" : row.qua_han > 0 ? "text-orange-600" : "text-slate-300"}`}>
          {row.qua_han || ""}
        </td>
        {/* Thời gian chờ */}
        <td className={`px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 ${tgColor(tg.val, isOverdue)}`}>
          {tg.label}
        </td>
        {/* Nộp từ */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {isoToDisplay(row.cham_ngay)}
        </td>
        {/* Mã hồ sơ */}
        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {row.cham_ma ?? ""}
        </td>
        {/* CV thụ lý */}
        <td className="px-2 py-1.5 text-xs whitespace-nowrap bg-rose-50 text-slate-600">
          {cleanCv(row.cham_cv)}
        </td>
      </tr>
    );
  };

  const visibleChuyenGia = hideEmpty ? data.chuyen_gia.filter((row) => row.tong > 0) : data.chuyen_gia;
  const visibleChuyenVienCg = hideEmpty ? data.chuyen_vien_cg.filter((row) => row.tong > 0) : data.chuyen_vien_cg;
  const allRows = [...visibleChuyenGia, ...visibleChuyenVienCg];
  const grandResolved = allRows.reduce((s, r) => s + r.da_giai_quyet, 0);
  const grandTong  = allRows.reduce((s, r) => s + r.tong,    0);
  const grandCon   = allRows.reduce((s, r) => s + r.con_han, 0);
  const grandQua   = allRows.reduce((s, r) => s + r.qua_han, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-green-700 text-white flex items-center justify-between gap-4">
        <div className="text-xs font-bold uppercase tracking-wide">
          Thống kê hồ sơ đang ở bước Chuyên gia thẩm định — TT{thuTuc}
        </div>
        <label className="flex items-center gap-2 text-[11px] font-semibold normal-case tracking-normal whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="rounded border-white/40 text-green-700 focus:ring-green-200"
          />
          Ẩn chuyên gia không có hồ sơ tồn
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 980, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
            <col style={{ width: "calc((100% - 348px) / 7)" }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="px-2 py-2 text-center text-xs w-9" rowSpan={2}>STT</th>
              <th className="px-3 py-2 text-left text-xs min-w-[220px]" rowSpan={2}>Chuyên gia</th>
              <th className="px-2 py-2 text-center text-xs bg-emerald-700" rowSpan={2}>ĐÃ GIẢI QUYẾT</th>
              <th className="px-2 py-2 text-center text-xs bg-blue-600" colSpan={3}>ĐANG GIẢI QUYẾT</th>
              <th className="px-2 py-2 text-center text-xs bg-rose-700" colSpan={4}>Hồ sơ chậm nhất</th>
            </tr>
            <tr className="bg-slate-600 text-white">
              <th className="px-2 py-1 text-center text-xs bg-slate-600 font-bold">TỔNG</th>
              <th className="px-2 py-1 text-center text-xs bg-green-700">Còn hạn</th>
              <th className="px-2 py-1 text-center text-xs bg-orange-600">Quá hạn</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Thời gian chờ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Nộp từ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Mã hồ sơ</th>
              <th className="px-2 py-1 text-center text-xs bg-rose-600">Chuyên viên thụ lý</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Section 1: Chuyên gia */}
            <tr className="bg-cyan-600 text-white">
              <td colSpan={10} className="px-3 py-1 text-xs font-bold uppercase tracking-wide">
                Chuyên gia
              </td>
            </tr>
            {visibleChuyenGia.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-2 text-xs text-slate-400 italic text-center">{PENDING_COMMON_MESSAGES.noExpertCases}</td></tr>
            ) : (
              visibleChuyenGia.map((row, idx) => renderRow(row, idx, "bg-green-50"))
            )}
            {/* Section 2: Chuyên viên đóng vai chuyên gia */}
            <tr className="bg-amber-500 text-white">
              <td colSpan={10} className="px-3 py-1 text-xs font-bold uppercase tracking-wide">
                Chuyên viên đóng vai chuyên gia
              </td>
            </tr>
            {visibleChuyenVienCg.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-2 text-xs text-slate-400 italic text-center">{PENDING_COMMON_MESSAGES.noSpecialistExperts}</td></tr>
            ) : (
              visibleChuyenVienCg.map((row, idx) => renderRow(row, idx, "bg-amber-50"))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-slate-700 border-t-2 border-slate-300">
              <td />
              <td className="px-3 py-2 text-xs font-bold">TỔNG</td>
              <td className="px-2 py-2 text-center text-xs font-bold text-emerald-700">{grandResolved}</td>
              <td className="px-2 py-2 text-center text-xs font-bold">{grandTong}</td>
              <td className="px-2 py-2 text-center text-xs text-blue-700">{grandCon}</td>
              <td className="px-2 py-2 text-center text-xs text-orange-700 font-bold">{grandQua}</td>
              <td className="bg-rose-50" />
              <td className="bg-rose-50" />
              <td className="bg-rose-50" />
              <td className="bg-rose-50" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

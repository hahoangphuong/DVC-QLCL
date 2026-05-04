import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Num, Pct, sumNumericField } from "../pending/pendingDisplay";
import { fetchNuocSoTai, type NuocSoTaiRow } from "./statsShared";

export function NuocSoTaiTable({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["nuoc-so-tai", fromDate, toDate],
    queryFn: () => fetchNuocSoTai(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const rows = data?.rows ?? [];
  const regionNames = useMemo(
    () =>
      typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
        ? new Intl.DisplayNames(["en"], { type: "region" })
        : null,
    []
  );

  const displayCountry = (code: string) => {
    if (!code || code === "UNKNOWN") return "Unknown";
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  };

  const thC = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL = "px-2 py-2 text-left text-xs font-bold uppercase tracking-wide";
  const thS = "px-2 py-2 text-center text-xs font-semibold";
  const tdC = "px-2 py-2 text-center text-xs";
  const tdL = "px-2 py-2 text-left text-xs";
  const totRow = "bg-slate-200 font-bold border-t-2 border-slate-400";

  const STT_W = 36;
  const stickySTT = { position: "sticky" as const, left: 0, zIndex: 10 };
  const stickyCountry = {
    position: "sticky" as const,
    left: STT_W,
    zIndex: 10,
    boxShadow: "2px 0 4px -1px rgba(0,0,0,0.12)",
  };

  const totals: Record<string, number> = {
    ton_truoc: sumNumericField(rows, "ton_truoc"),
    da_nhan: sumNumericField(rows, "da_nhan"),
    gq_tong: sumNumericField(rows, "gq_tong"),
    can_bo_sung: sumNumericField(rows, "can_bo_sung"),
    khong_dat: sumNumericField(rows, "khong_dat"),
    hoan_thanh: sumNumericField(rows, "hoan_thanh"),
    dung_han: sumNumericField(rows, "dung_han"),
    qua_han: sumNumericField(rows, "qua_han"),
    ton_sau_tong: sumNumericField(rows, "ton_sau_tong"),
    ton_sau_con_han: sumNumericField(rows, "ton_sau_con_han"),
    ton_sau_qua_han: sumNumericField(rows, "ton_sau_qua_han"),
    treo: sumNumericField(rows, "treo"),
  };
  const totPctDh = totals.gq_tong > 0 ? Math.round((totals.dung_han / totals.gq_tong) * 100) : 0;
  const totPctGq =
    totals.ton_truoc + totals.da_nhan > 0
      ? Math.round((totals.gq_tong / (totals.ton_truoc + totals.da_nhan)) * 100)
      : 0;

  function topThresh(vals: (number | null)[]): number {
    const sorted = vals
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => b - a);
    if (sorted.length === 0) return Infinity;
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.3) - 1)];
  }

  const hiThresh = {
    ton_truoc: topThresh(rows.map((r) => r.ton_truoc)),
    da_nhan: topThresh(rows.map((r) => r.da_nhan)),
    gq_tong: topThresh(rows.map((r) => r.gq_tong)),
    hoan_thanh: topThresh(rows.map((r) => r.hoan_thanh)),
    tg_tb: topThresh(rows.map((r) => r.tg_tb)),
    ton_sau_tong: topThresh(rows.map((r) => r.ton_sau_tong)),
  };
  const isHi = (thresh: number, v: number | null | undefined) => v != null && v > 0 && v >= thresh;
  const hiTd = (thresh: number, v: number | null | undefined, extra = "") =>
    `${tdC}${extra ? ` ${extra}` : ""}${isHi(thresh, v) ? " bg-amber-100" : ""}`;

  function CountryRow({ row, idx }: { row: NuocSoTaiRow; idx: number }) {
    const bgCls = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    const tonTruocBg = idx % 2 === 0 ? "bg-pink-50/70" : "bg-pink-50/40";
    const daNhanBg = idx % 2 === 0 ? "bg-blue-50/70" : "bg-blue-50/40";
    const giaiQuyetBg = idx % 2 === 0 ? "bg-green-50/80" : "bg-green-50/50";
    const tonSauBg = idx % 2 === 0 ? "bg-amber-50/80" : "bg-amber-50/50";
    const treoBg = idx % 2 === 0 ? "bg-orange-50/80" : "bg-orange-50/60";

    return (
      <tr className={`${bgCls} hover:bg-blue-50/40 transition-colors`}>
        <td
          className={`${tdC} text-slate-400`}
          style={{ ...stickySTT, backgroundColor: bgColor, width: STT_W, minWidth: STT_W }}
        >
          {idx + 1}
        </td>
        <td
          className={`${tdL} min-w-[180px] font-semibold text-slate-800`}
          style={{ ...stickyCountry, backgroundColor: bgColor }}
        >
          {displayCountry(row.ten_nuoc)}
        </td>
        <td className={hiTd(hiThresh.ton_truoc, row.ton_truoc, tonTruocBg)}><Num v={row.ton_truoc} color="#be185d" bold /></td>
        <td className={hiTd(hiThresh.da_nhan, row.da_nhan, daNhanBg)}><Num v={row.da_nhan} color="#1d4ed8" bold /></td>
        <td className={hiTd(hiThresh.gq_tong, row.gq_tong, `${giaiQuyetBg} font-bold text-slate-700`)}><Num v={row.gq_tong} /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.can_bo_sung} color="#b45309" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.khong_dat} color="#dc2626" /></td>
        <td className={hiTd(hiThresh.hoan_thanh, row.hoan_thanh, giaiQuyetBg)}><Num v={row.hoan_thanh} color="#15803d" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.dung_han} color="#15803d" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.qua_han} color="#dc2626" /></td>
        <td className={hiTd(hiThresh.tg_tb, row.tg_tb, giaiQuyetBg)}><Num v={row.tg_tb} color="#6b7280" /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Pct v={row.pct_gq_dung_han} warnBelow={30} /></td>
        <td className={`${tdC} ${giaiQuyetBg}`}><Pct v={row.pct_da_gq} /></td>
        <td className={hiTd(hiThresh.ton_sau_tong, row.ton_sau_tong, `${tonSauBg} font-bold text-slate-700`)}><Num v={row.ton_sau_tong} /></td>
        <td className={`${tdC} ${tonSauBg}`}><Num v={row.ton_sau_con_han} color="#2563eb" /></td>
        <td className={`${tdC} ${tonSauBg}`}><Num v={row.ton_sau_qua_han} color="#dc2626" /></td>
        <td className={`${tdC} ${treoBg}`}><Num v={row.treo} color="#ea580c" bold /></td>
      </tr>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
          {"Chi tiết theo nước sở tại — TT48"}
        </h3>
        {isLoading && <span className="text-xs font-medium text-blue-500 animate-pulse">{"Đang tải..."}</span>}
        {isError && <span className="text-xs font-medium text-red-500">{"Lỗi tải dữ liệu"}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: 1120, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 180 }} />
            <col /><col /><col /><col /><col /><col /><col /><col /><col />
            <col /><col /><col /><col /><col />
          </colgroup>
          <thead>
            <tr className="bg-slate-700 text-white">
              <th
                className={`${thC} bg-slate-700 text-white`}
                rowSpan={2}
                style={{ ...stickySTT, backgroundColor: "#334155", width: STT_W, minWidth: STT_W }}
              >
                STT
              </th>
              <th
                className={`${thL} min-w-[180px] bg-slate-700 text-white`}
                rowSpan={2}
                style={{ ...stickyCountry, backgroundColor: "#334155" }}
              >
                {"Nước sở tại"}
              </th>
              <th className={`${thC} bg-pink-700 text-white`} rowSpan={2}>{"Tồn"}<br />{"trước"}</th>
              <th className={`${thC} bg-blue-700 text-white`} rowSpan={2}>{"Đã"}<br />{"nhận"}</th>
              <th className={`${thC} bg-green-700 text-white`} colSpan={9}>{"Đã giải quyết"}</th>
              <th className={`${thC} bg-amber-700 text-white`} colSpan={3}>{"Tồn sau"}</th>
              <th className={`${thC} bg-orange-600 text-white`} rowSpan={2}>TREO</th>
            </tr>
            <tr className="bg-slate-100">
              <th className={`${thC} bg-green-50`}>{"Tổng"}</th>
              <th className={`${thS} bg-amber-50`}>{"Cần bổ sung"}</th>
              <th className={`${thS} bg-red-50`}>{"Không đạt"}</th>
              <th className={`${thS} bg-green-50`}>{"Hoàn thành"}</th>
              <th className={`${thS} bg-green-50 text-green-700`}>{"Đúng hạn"}</th>
              <th className={`${thS} bg-red-50 text-red-700`}>{"Quá hạn"}</th>
              <th className={`${thS} bg-slate-50`}>{"Thời gian TB"}</th>
              <th className={`${thS} bg-green-50 text-green-700`}>{"% Đúng hạn"}</th>
              <th className={`${thS} bg-slate-50 text-slate-600`}>{"% Đã GQ"}</th>
              <th className={`${thC} bg-amber-50`}>{"Tổng"}</th>
              <th className={`${thS} bg-blue-50 text-blue-700`}>{"Còn hạn"}</th>
              <th className={`${thS} bg-red-50 text-red-700`}>{"Quá hạn"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={17} className="py-10 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <span>{"Đang tải..."}</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={17} className="py-10 text-center text-slate-400">{"Không có dữ liệu"}</td>
              </tr>
            ) : (
              rows.map((row, idx) => <CountryRow key={`${row.ten_nuoc}-${idx}`} row={row} idx={idx} />)
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className={totRow}>
                <td
                  className={tdC}
                  style={{ ...stickySTT, backgroundColor: "#e2e8f0", width: STT_W, minWidth: STT_W }}
                />
                <td
                  className={`${tdL} font-bold text-slate-700`}
                  style={{ ...stickyCountry, backgroundColor: "#e2e8f0" }}
                >
                  {"TỔNG"}
                </td>
                <td className={tdC}><Num v={totals.ton_truoc} color="#be185d" bold /></td>
                <td className={tdC}><Num v={totals.da_nhan} color="#1d4ed8" bold /></td>
                <td className={tdC}><Num v={totals.gq_tong} bold /></td>
                <td className={tdC}><Num v={totals.can_bo_sung} color="#b45309" bold /></td>
                <td className={tdC}><Num v={totals.khong_dat} color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.hoan_thanh} color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.dung_han} color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.qua_han} color="#dc2626" bold /></td>
                <td className={tdC} />
                <td className={tdC}><Pct v={totPctDh} warnBelow={30} /></td>
                <td className={tdC}><Pct v={totPctGq} /></td>
                <td className={tdC}><Num v={totals.ton_sau_tong} bold /></td>
                <td className={tdC}><Num v={totals.ton_sau_con_han} color="#2563eb" bold /></td>
                <td className={tdC}><Num v={totals.ton_sau_qua_han} color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.treo} color="#ea580c" bold /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Num, Pct, sumNumericField } from "../pending/pendingDisplay";
import { fetchChuyenVien, type ChuyenVienRow, type SupportedThuTuc } from "./statsShared";
import { cleanCvName } from "../../shared/nameFormatters";

export interface ChuyenVienTableProps {
  thuTuc: SupportedThuTuc;
  fromDate: string;
  toDate: string;
  onCvClick?: (tenCvRaw: string) => void;
  onTinhTrangClick?: (tinhTrang: "can_bo_sung" | "khong_dat" | "da_hoan_thanh") => void;
}

export function ChuyenVienTable({
  thuTuc,
  fromDate,
  toDate,
  onCvClick,
  onTinhTrangClick,
}: ChuyenVienTableProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chuyen-vien", thuTuc, fromDate, toDate],
    queryFn: () => fetchChuyenVien(thuTuc, fromDate, toDate),
    enabled: !!fromDate && !!toDate,
    placeholderData: (previousData) => previousData,
  });

  const rows = data?.rows ?? [];
  const cpc = data?.cho_phan_cong ?? null;

  const thC = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL = "px-2 py-2 text-left   text-xs font-bold uppercase tracking-wide";
  const thS = "px-2 py-2 text-center text-xs font-semibold";
  const tdC = "px-2 py-2 text-center text-xs";
  const tdL = "px-2 py-2 text-left   text-xs";
  const totRow = "bg-slate-200 font-bold border-t-2 border-slate-400";

  const STT_W = 36;
  const stickySTT = { position: "sticky" as const, left: 0, zIndex: 10 };
  const stickyCV = {
    position: "sticky" as const,
    left: STT_W,
    zIndex: 10,
    boxShadow: "2px 0 4px -1px rgba(0,0,0,0.12)",
  };

  const totals: Record<string, number> = {
    ton_truoc: sumNumericField(rows, "ton_truoc"),
    da_nhan: sumNumericField(rows, "da_nhan") + (cpc?.da_nhan ?? 0),
    gq_tong: sumNumericField(rows, "gq_tong"),
    can_bo_sung: sumNumericField(rows, "can_bo_sung"),
    khong_dat: sumNumericField(rows, "khong_dat"),
    hoan_thanh: sumNumericField(rows, "hoan_thanh"),
    dung_han: sumNumericField(rows, "dung_han"),
    qua_han: sumNumericField(rows, "qua_han"),
    ton_sau_tong: sumNumericField(rows, "ton_sau_tong") + (cpc?.ton_sau_tong ?? 0),
    ton_sau_con_han: sumNumericField(rows, "ton_sau_con_han") + (cpc?.ton_sau_con_han ?? 0),
    ton_sau_qua_han: sumNumericField(rows, "ton_sau_qua_han") + (cpc?.ton_sau_qua_han ?? 0),
    treo: sumNumericField(rows, "treo"),
  };
  const tot_pct_dh = totals.gq_tong > 0 ? Math.round((totals.dung_han / totals.gq_tong) * 100) : 0;
  const tot_pct_gq =
    totals.ton_truoc + totals.da_nhan > 0
      ? Math.round((totals.gq_tong / (totals.ton_truoc + totals.da_nhan)) * 100)
      : 0;
  const showResolvedSupplementColumn = thuTuc === 48;
  const pendingCapaLabel = "\u0043\u1ea7n b\u1ed5 sung";
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

  function CvRow({ row, idx }: { row: ChuyenVienRow; idx: number }) {
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
          className={`${tdL} font-semibold text-slate-800 min-w-[160px]`}
          style={{ ...stickyCV, backgroundColor: bgColor }}
        >
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
        <td className={hiTd(hiThresh.ton_truoc, row.ton_truoc, tonTruocBg)}><Num v={row.ton_truoc} color="#be185d" bold /></td>
        <td className={hiTd(hiThresh.da_nhan, row.da_nhan, daNhanBg)}><Num v={row.da_nhan} color="#1d4ed8" bold /></td>
        <td className={hiTd(hiThresh.gq_tong, row.gq_tong, `${giaiQuyetBg} font-bold text-slate-700`)}><Num v={row.gq_tong} /></td>
        {showResolvedSupplementColumn ? (
          <td className={`${tdC} ${giaiQuyetBg}`}><Num v={row.can_bo_sung} color="#b45309" /></td>
        ) : null}
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

  const doneColumnCount = showResolvedSupplementColumn ? 9 : 8;
  const colSpan = showResolvedSupplementColumn ? 17 : 16;
  const renderDoneHeader = (
    label: string,
    tinhTrang: "can_bo_sung" | "khong_dat" | "da_hoan_thanh",
    cls: string,
  ) => (
    <th className={cls}>
      {onTinhTrangClick ? (
        <button
          type="button"
          onClick={() => onTinhTrangClick(tinhTrang)}
          className="cursor-pointer text-center hover:text-blue-700"
        >
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          {"Chi tiết theo chuyên viên — TT"}{thuTuc}
        </h3>
        {isLoading && <span className="text-xs text-blue-500 animate-pulse font-medium">{"Đang tải..."}</span>}
        {isError && <span className="text-xs text-red-500 font-medium">{"Lỗi tải dữ liệu"}</span>}
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
            <tr className="bg-slate-700 text-white">
              <th
                className={`${thC} bg-slate-700 text-white`}
                rowSpan={2}
                style={{ ...stickySTT, backgroundColor: "#334155", width: STT_W, minWidth: STT_W }}
              >
                STT
              </th>
              <th
                className={`${thL} bg-slate-700 text-white min-w-[160px]`}
                rowSpan={2}
                style={{ ...stickyCV, backgroundColor: "#334155" }}
              >
                {"Chuyên viên"}
              </th>
              <th className={`${thC} bg-pink-700 text-white`} rowSpan={2}>{"Tồn"}<br />{"trước"}</th>
              <th className={`${thC} bg-blue-700 text-white`} rowSpan={2}>{"Đã"}<br />{"nhận"}</th>
              <th className={`${thC} bg-green-700 text-white`} colSpan={doneColumnCount}>{"Đã giải quyết"}</th>
              <th className={`${thC} bg-amber-700 text-white`} colSpan={3}>{"Tồn sau"}</th>
              <th className={`${thC} bg-orange-600 text-white`} rowSpan={2}>TREO</th>
            </tr>
            <tr className="bg-slate-100">
              <th className={`${thC} bg-green-50`}>{"Tổng"}</th>
              {showResolvedSupplementColumn ? renderDoneHeader(pendingCapaLabel, "can_bo_sung", `${thS} bg-amber-50`) : null}
              {renderDoneHeader("Không đạt", "khong_dat", `${thS} bg-red-50`)}
              {renderDoneHeader("Hoàn thành", "da_hoan_thanh", `${thS} bg-green-50`)}
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
                <td colSpan={colSpan} className="py-10 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <span>{"Đang tải..."}</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-slate-400">{"Không có dữ liệu"}</td>
              </tr>
            ) : (
              <>
                {cpc && (cpc.ton_sau_tong > 0 || cpc.da_nhan > 0) && (
                  <tr className="bg-yellow-50 border-b-2 border-yellow-200">
                    <td
                      className={`${tdC} text-slate-400`}
                      style={{ ...stickySTT, backgroundColor: "#fefce8", width: STT_W, minWidth: STT_W }}
                    >
                      {"—"}
                    </td>
                    <td
                      className={`${tdL} text-amber-700 font-semibold`}
                      style={{ ...stickyCV, backgroundColor: "#fefce8" }}
                    >
                      {"Chờ phân công"}
                    </td>
                    <td className={tdC}></td>
                    <td className={tdC}><Num v={cpc.da_nhan} color="#1d4ed8" bold /></td>
                    <td className={tdC}></td>
                    {showResolvedSupplementColumn ? <td className={tdC}></td> : null}
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
                <td
                  className={tdC}
                  style={{ ...stickySTT, backgroundColor: "#e2e8f0", width: STT_W, minWidth: STT_W }}
                />
                <td
                  className={`${tdL} text-slate-700 font-bold`}
                  style={{ ...stickyCV, backgroundColor: "#e2e8f0" }}
                >
                  {"TỔNG"}
                </td>
                <td className={tdC}><Num v={totals.ton_truoc} color="#be185d" bold /></td>
                <td className={tdC}><Num v={totals.da_nhan} color="#1d4ed8" bold /></td>
                <td className={tdC}><Num v={totals.gq_tong} bold /></td>
                {showResolvedSupplementColumn ? <td className={tdC}><Num v={totals.can_bo_sung} color="#b45309" bold /></td> : null}
                <td className={tdC}><Num v={totals.khong_dat} color="#dc2626" bold /></td>
                <td className={tdC}><Num v={totals.hoan_thanh} color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.dung_han} color="#15803d" bold /></td>
                <td className={tdC}><Num v={totals.qua_han} color="#dc2626" bold /></td>
                <td className={tdC} />
                <td className={tdC}><Pct v={tot_pct_dh} warnBelow={30} /></td>
                <td className={tdC}><Pct v={tot_pct_gq} /></td>
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

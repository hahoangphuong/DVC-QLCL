import {"H? S? TREO"} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  renderTt48ExpandCell,
  renderTt48GroupTotal,
  renderTt48InlineValueWithPct,
  renderTt48Num,
  renderTt48SubRow,
  type Tt48LoaiHoSoSubRowValues,
} from "./tt48LoaiHoSoDisplay";
import { TT48_LOAI_LABELS, fetchTt48LoaiHoSo } from "./statsShared";

export function Tt48LoaiHoSoTable({ fromDate, toDate }: { fromDate: string; toDate: string }) {
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

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-center h-24 text-slate-400 text-sm gap-2">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          {"?ang t?i b?ng ph?n lo?i h? s? TT48..."}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm text-red-500 text-center">
        {"Kh?ng th? t?i b?ng ph?n lo?i h? s? TT48"}
      </div>
    );
  }

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

  const totals = rows.reduce(
    (acc, row) => ({
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
    }),
    {
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
  );

  const thC = "px-2 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const thL = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide";
  const thS = "px-2 py-2 text-center text-xs font-semibold";
  const tdC = "px-2 py-2 text-center text-xs";
  const tdL = "px-3 py-2 text-left text-xs font-semibold text-slate-800";
  const totalRow = "bg-slate-200 font-bold border-t-2 border-slate-400";
  const subgroupLabels = ["T?NG", "H.th?c 1", "H.th?c 2"];

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderExpandCell = (key: string, label: string, isTotal = false) =>
    renderTt48ExpandCell(key, label, expandedRows, toggleRow, tdL, isTotal);

  const renderSubRow = (key: string, label: string, values: Tt48LoaiHoSoSubRowValues, isTotal = false) =>
    renderTt48SubRow({
      key,
      label,
      values,
      totals,
      tdC,
      tdL,
      numCell: renderTt48Num,
      renderInlineValueWithPct: renderTt48InlineValueWithPct,
      isTotal,
    });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          {"Chi ti?t theo lo?i h? s? & l?n n?p - TT48"}
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
              <th rowSpan={2} className={`${thL} bg-slate-700 text-white`}>{"Ph?n lo?i h? s?"}</th>
              <th colSpan={3} className={`${thC} bg-pink-700 text-white`}>{"T?N TR??C"}</th>
              <th colSpan={3} className={`${thC} bg-blue-700 text-white`}>{"H? S? ?? TI?P NH?N"}</th>
              <th colSpan={3} className={`${thC} bg-green-700 text-white`}>{"H? S? ?? GI?I QUY?T"}</th>
              <th colSpan={3} className={`${thC} bg-amber-700 text-white`}>{"H? S? T?N"}</th>
              <th rowSpan={2} className={`${thC} bg-orange-600 text-white`}>{"H? S? TREO"}</th>
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
                  {renderTt48ExpandCell(row.loai_ho_so, TT48_LOAI_LABELS[row.loai_ho_so] ?? row.loai_ho_so, expandedRows, toggleRow, tdL)}
                  <td className={`${tdC} bg-pink-50/70`}>{renderTt48GroupTotal(row.ton_truoc_total, totals.ton_truoc_total, "text-pink-700")}</td>
                  {renderTt48Num(row.ton_truoc_hinh_thuc_1, `${tdC} bg-pink-50/70 text-slate-700`)}
                  {renderTt48Num(row.ton_truoc_hinh_thuc_2, `${tdC} bg-pink-50/70 text-slate-700`)}
                  <td className={`${tdC} bg-blue-50/70`}>{renderTt48GroupTotal(row.da_nhan_total, totals.da_nhan_total, "text-blue-700")}</td>
                  {renderTt48Num(row.da_nhan_hinh_thuc_1, `${tdC} bg-blue-50/70 text-slate-700`)}
                  {renderTt48Num(row.da_nhan_hinh_thuc_2, `${tdC} bg-blue-50/70 text-slate-700`)}
                  <td className={`${tdC} bg-green-50/80`}>{renderTt48GroupTotal(row.giai_quyet_total, totals.giai_quyet_total, "text-green-700")}</td>
                  {renderTt48Num(row.giai_quyet_hinh_thuc_1, `${tdC} bg-green-50/80 text-slate-700`)}
                  {renderTt48Num(row.giai_quyet_hinh_thuc_2, `${tdC} bg-green-50/80 text-slate-700`)}
                  <td className={`${tdC} bg-amber-50/80`}>{renderTt48GroupTotal(row.ton_total, totals.ton_total, "text-amber-700")}</td>
                  {renderTt48Num(row.ton_hinh_thuc_1, `${tdC} bg-amber-50/80 text-slate-700`)}
                  {renderTt48Num(row.ton_hinh_thuc_2, `${tdC} bg-amber-50/80 text-slate-700`)}
                  {renderTt48Num(row.treo, `${tdC} bg-orange-50 font-bold text-orange-700`)}
                </tr>
                {expandedRows[row.loai_ho_so] &&
                  renderSubRow(`${row.loai_ho_so}-first`, "L?n ??u", {
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
                  })}
                {expandedRows[row.loai_ho_so] &&
                  renderSubRow(`${row.loai_ho_so}-supplement`, "L?n b? sung", {
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
                  })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className={totalRow}>
              {renderExpandCell("TOTAL", "T?NG", true)}
              {renderTt48Num(totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_truoc_hinh_thuc_1, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_truoc_hinh_thuc_2, totals.ton_truoc_total, `${tdC} text-pink-700 font-bold`)}
              {renderTt48Num(totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.da_nhan_hinh_thuc_1, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.da_nhan_hinh_thuc_2, totals.da_nhan_total, `${tdC} text-blue-700 font-bold`)}
              {renderTt48Num(totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.giai_quyet_hinh_thuc_1, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.giai_quyet_hinh_thuc_2, totals.giai_quyet_total, `${tdC} text-green-700 font-bold`)}
              {renderTt48Num(totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_hinh_thuc_1, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderTt48InlineValueWithPct(totals.ton_hinh_thuc_2, totals.ton_total, `${tdC} text-amber-700 font-bold`)}
              {renderTt48Num(totals.treo, `${tdC} text-orange-700 font-bold`)}
            </tr>
            {expandedRows.TOTAL &&
              renderSubRow("TOTAL-first", "L?n ??u", {
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
              }, true)}
            {expandedRows.TOTAL &&
              renderSubRow("TOTAL-supplement", "L?n b? sung", {
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
              }, true)}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

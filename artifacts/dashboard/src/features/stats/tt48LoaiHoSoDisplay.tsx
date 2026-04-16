import type { ReactNode } from "react";

export interface Tt48LoaiHoSoSubRowValues {
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
}

interface RenderSubRowArgs {
  key: string;
  label: string;
  values: Tt48LoaiHoSoSubRowValues;
  totals: {
    ton_truoc_total: number;
    da_nhan_total: number;
    giai_quyet_total: number;
    ton_total: number;
  };
  tdC: string;
  tdL: string;
  numCell: (value: number, cls?: string) => ReactNode;
  renderInlineValueWithPct: (value: number, total: number, cls?: string) => ReactNode;
  isTotal?: boolean;
}

export function tt48Pct(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

export function renderTt48GroupTotal(value: number, total: number, textColor: string): ReactNode {
  return value ? (
    <div className="flex items-baseline justify-center gap-2">
      <span className={`font-bold ${textColor}`}>{value.toLocaleString("vi-VN")}</span>
      <span className="text-slate-600">({tt48Pct(value, total)})</span>
    </div>
  ) : null;
}

export function renderTt48InlineValueWithPct(value: number, total: number, cls = ""): ReactNode {
  return (
    <td className={`px-2 py-2 text-center text-sm ${cls}`}>
      {value ? (
        <div className="flex items-baseline justify-center gap-2">
          <span>{value.toLocaleString("vi-VN")}</span>
          <span className="text-slate-500">({tt48Pct(value, total)})</span>
        </div>
      ) : ""}
    </td>
  );
}

export function renderTt48Num(value: number, cls = ""): ReactNode {
  return (
    <td className={`px-2 py-2 text-center text-sm ${cls}`}>
      {value ? value.toLocaleString("vi-VN") : ""}
    </td>
  );
}

export function renderTt48ExpandCell(
  key: string,
  label: string,
  expandedRows: Record<string, boolean>,
  toggleRow: (key: string) => void,
  tdL: string,
  isTotal = false,
): ReactNode {
  return (
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
}

export function renderTt48SubRow({
  key,
  label,
  values,
  totals,
  tdC,
  tdL,
  numCell,
  renderInlineValueWithPct,
  isTotal = false,
}: RenderSubRowArgs): ReactNode {
  return (
    <tr key={key} className={`${isTotal ? "bg-slate-100" : "bg-slate-50/80"} border-t border-slate-200`}>
      <td className="px-3 py-2 text-left text-xs font-medium text-slate-600">
        <div className="flex items-center gap-2 pl-7">
          <span className="inline-block h-px w-3 bg-slate-300" />
          <span>{label}</span>
        </div>
      </td>
      {isTotal
        ? renderInlineValueWithPct(values.ton_truoc, totals.ton_truoc_total, `${tdC} bg-pink-50/50 text-slate-600`)
        : numCell(values.ton_truoc, `${tdC} bg-pink-50/50 text-slate-600`)}
      {numCell(values.ton_truoc_hinh_thuc_1 ?? 0, `${tdC} bg-pink-50/50 text-slate-600`)}
      {numCell(values.ton_truoc_hinh_thuc_2 ?? 0, `${tdC} bg-pink-50/50 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.da_nhan, totals.da_nhan_total, `${tdC} bg-blue-50/50 text-slate-600`)
        : numCell(values.da_nhan, `${tdC} bg-blue-50/50 text-slate-600`)}
      {numCell(values.da_nhan_hinh_thuc_1 ?? 0, `${tdC} bg-blue-50/50 text-slate-600`)}
      {numCell(values.da_nhan_hinh_thuc_2 ?? 0, `${tdC} bg-blue-50/50 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.giai_quyet, totals.giai_quyet_total, `${tdC} bg-green-50/60 text-slate-600`)
        : numCell(values.giai_quyet, `${tdC} bg-green-50/60 text-slate-600`)}
      {numCell(values.giai_quyet_hinh_thuc_1 ?? 0, `${tdC} bg-green-50/60 text-slate-600`)}
      {numCell(values.giai_quyet_hinh_thuc_2 ?? 0, `${tdC} bg-green-50/60 text-slate-600`)}
      {isTotal
        ? renderInlineValueWithPct(values.ton, totals.ton_total, `${tdC} bg-amber-50/60 text-slate-600`)
        : numCell(values.ton, `${tdC} bg-amber-50/60 text-slate-600`)}
      {numCell(values.ton_hinh_thuc_1 ?? 0, `${tdC} bg-amber-50/60 text-slate-600`)}
      {numCell(values.ton_hinh_thuc_2 ?? 0, `${tdC} bg-amber-50/60 text-slate-600`)}
      <td className={`${tdC} bg-orange-50/70`} />
    </tr>
  );
}

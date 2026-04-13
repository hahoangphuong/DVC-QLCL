import { LOOKUP_TEXT } from "../../uiText";

export function LookupActionBar({
  onReset,
  onExport,
  exporting,
  isFetching,
  hasData,
  rowCount,
}: {
  onReset: () => void;
  onExport: () => void;
  exporting: boolean;
  isFetching: boolean;
  hasData: boolean;
  rowCount: number;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800"
          title={LOOKUP_TEXT.resetFilters}
          aria-label={LOOKUP_TEXT.resetFilters}
        >
          ↺
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || isFetching || !hasData}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? LOOKUP_TEXT.exporting : LOOKUP_TEXT.exportExcel}
        </button>
      </div>

      <div className="ml-auto text-xs text-slate-500 font-medium">
        {isFetching
          ? LOOKUP_TEXT.loadingData
          : `${LOOKUP_TEXT.foundDossiersPrefix} ${rowCount.toLocaleString("vi-VN")} ${LOOKUP_TEXT.foundDossiersSuffix}`}
      </div>
    </>
  );
}

import { LOOKUP_TEXT } from "../../uiText";

export function LookupTextFilterField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-[260px] flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {LOOKUP_TEXT.dossierCodeFilterLabel}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={LOOKUP_TEXT.dossierCodeFilterPlaceholder}
        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
      />
    </label>
  );
}

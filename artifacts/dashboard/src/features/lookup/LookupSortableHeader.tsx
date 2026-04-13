import type { TraCuuSortKey } from "./lookupShared";

export function LookupSortableHeader({
  label,
  sortKey,
  currentSortBy,
  sortDir,
  onToggle,
  center = false,
}: {
  label: string;
  sortKey: TraCuuSortKey;
  currentSortBy: TraCuuSortKey;
  sortDir: "asc" | "desc";
  onToggle: (key: TraCuuSortKey) => void;
  center?: boolean;
}) {
  const active = currentSortBy === sortKey;
  const arrow = !active ? "↕" : sortDir === "asc" ? "↑" : "↓";

  return (
    <th className={`px-3 py-3 ${center ? "text-center" : "text-left"} font-semibold uppercase tracking-wide whitespace-nowrap`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? "text-blue-700" : "text-slate-600 hover:text-slate-800"}`}
      >
        <span>{label}</span>
        <span className={`text-[10px] ${active ? "text-blue-600" : "text-slate-400"}`}>{arrow}</span>
      </button>
    </th>
  );
}

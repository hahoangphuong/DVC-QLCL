type SyncStatus = {
  lastSyncedAt: string | null;
  totalSizeMB: number;
};

export function SyncStatusBadge({ syncStatus }: { syncStatus: SyncStatus | null | undefined }) {
  if (!syncStatus) return null;

  const iso = syncStatus.lastSyncedAt;
  if (!iso) {
    return (
      <p className="text-xs text-slate-400 text-right leading-snug hidden sm:block">
        {"D\u1eef li\u1ec7u c\u1eadp nh\u1eadt l\u1ea7n cu\u1ed1i"}
        <br />
        <span className="text-slate-400 italic">{"Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u sync"}</span>
        <span className="text-slate-400"> {"\u00b7"} {syncStatus.totalSizeMB.toFixed(2)} MB</span>
      </p>
    );
  }

  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return (
    <p className="text-xs text-slate-400 text-right leading-snug hidden sm:block">
      {"D\u1eef li\u1ec7u c\u1eadp nh\u1eadt l\u1ea7n cu\u1ed1i"}
      <br />
      <span className="font-medium text-slate-600">
        {dd}-{mm}-{d.getFullYear()} {"l\u00fac"} {hh}:{min} ({syncStatus.totalSizeMB.toFixed(2)} MB)
      </span>
    </p>
  );
}

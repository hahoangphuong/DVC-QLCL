import { SyncStatusBadge } from "./SyncStatusBadge";

type DashboardRole = "viewer" | "admin";
type SyncStatus = {
  lastSyncedAt: string | null;
  totalSizeMB: number;
};

type Props = {
  authRole: DashboardRole;
  isAdmin: boolean;
  syncStatus: SyncStatus | null | undefined;
  onOpenAdmin: () => void;
  onLogout: () => void;
};

export function DashboardHeaderActions({
  authRole,
  isAdmin,
  syncStatus,
  onOpenAdmin,
  onLogout,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${isAdmin ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
          {authRole}
        </span>
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Admin
          </button>
        )}
        <button
          onClick={onLogout}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {"\u0110\u0103ng xu\u1ea5t"}
        </button>
      </div>
      <SyncStatusBadge syncStatus={syncStatus} />
    </>
  );
}

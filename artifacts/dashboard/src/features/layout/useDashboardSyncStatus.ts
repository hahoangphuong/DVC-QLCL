import { useQuery } from "@tanstack/react-query";

export type SyncStatus = {
  lastSyncedAt: string | null;
  totalSizeMB: number;
};

async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch("/api/sync-status");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function useDashboardSyncStatus(authRole: string | null) {
  return useQuery({
    queryKey: ["sync-status", authRole],
    queryFn: fetchSyncStatus,
    enabled: Boolean(authRole),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

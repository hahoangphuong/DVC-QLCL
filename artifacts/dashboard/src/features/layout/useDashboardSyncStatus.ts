import { useQuery } from "@tanstack/react-query";
import type { DashboardRole } from "../auth/authApi";

export type SyncStatus = {
  lastSyncedAt: string | null;
  totalSizeMB: number;
};

async function fetchSyncStatus(): Promise<SyncStatus> {
  try {
    const res = await fetch("/api/sync-status");
    if (!res.ok) {
      return { lastSyncedAt: null, totalSizeMB: 0 };
    }
    return res.json();
  } catch {
    return { lastSyncedAt: null, totalSizeMB: 0 };
  }
}

export function useDashboardSyncStatus(authRole: DashboardRole | null) {
  return useQuery({
    queryKey: ["sync-status", authRole],
    queryFn: fetchSyncStatus,
    enabled: Boolean(authRole),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    placeholderData: { lastSyncedAt: null, totalSizeMB: 0 },
  });
}

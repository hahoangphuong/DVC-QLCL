import { useCallback } from "react";
import type { TraCuuFilterState, TraCuuSortKey } from "./lookupShared";

export function useLookupSort(
  setState: React.Dispatch<React.SetStateAction<TraCuuFilterState>>,
  sortBy: TraCuuSortKey,
) {
  return useCallback((key: TraCuuSortKey) => {
    if (key === "stt") return;
    if (sortBy === key) {
      setState((prev) => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }));
      return;
    }
    setState((prev) => ({ ...prev, sortBy: key, sortDir: "desc" }));
  }, [setState, sortBy]);
}

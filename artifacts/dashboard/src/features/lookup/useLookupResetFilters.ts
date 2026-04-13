import { useCallback } from "react";
import type { TraCuuFilterState } from "./lookupShared";

export function useLookupResetFilters(
  setState: React.Dispatch<React.SetStateAction<TraCuuFilterState>>,
  defaultState: TraCuuFilterState,
) {
  return useCallback(() => {
    setState((prev) => ({
      ...defaultState,
      sortBy: prev.sortBy,
      sortDir: prev.sortDir,
    }));
  }, [setState, defaultState]);
}

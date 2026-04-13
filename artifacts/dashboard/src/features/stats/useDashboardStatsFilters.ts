import { useCallback, useMemo, useState } from "react";
import { StatsFiltersCtx, type StatsFiltersCtxType } from "./statsFilterContext";
import { makeTabFilter, type TabFilter } from "./statsShared";

export function useDashboardStatsFilters() {
  const [filters, setFilters] = useState<Record<number, TabFilter>>({
    0: makeTabFilter("nam_nay"),
    48: makeTabFilter("nam_nay"),
    47: makeTabFilter("nam_nay"),
    46: makeTabFilter("nam_nay"),
  });

  const updateFilter = useCallback((thuTuc: number, patch: Partial<TabFilter>) => {
    setFilters((prev) => ({ ...prev, [thuTuc]: { ...prev[thuTuc], ...patch } }));
  }, []);

  const filtersValue = useMemo<StatsFiltersCtxType>(
    () => ({ filters, updateFilter }),
    [filters, updateFilter]
  );

  return {
    filtersValue,
    updateFilter,
    Provider: StatsFiltersCtx.Provider,
  };
}

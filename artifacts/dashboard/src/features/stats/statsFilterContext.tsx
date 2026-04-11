import { createContext, useContext } from "react";
import type { TabFilter } from "./statsShared";

export interface StatsFiltersCtxType {
  filters: Record<number, TabFilter>;
  updateFilter: (thuTuc: number, patch: Partial<TabFilter>) => void;
}

export const StatsFiltersCtx = createContext<StatsFiltersCtxType | null>(null);

export function useTabFilter(thuTuc: number): TabFilter & { update: (p: Partial<TabFilter>) => void } {
  const ctx = useContext(StatsFiltersCtx);
  if (!ctx) throw new Error("useTabFilter must be inside StatsFiltersCtx.Provider");
  return {
    ...ctx.filters[thuTuc],
    update: (patch) => ctx.updateFilter(thuTuc, patch),
  };
}

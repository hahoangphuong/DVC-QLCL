import { useCallback, useState } from "react";
import {
  DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE,
  DEFAULT_TRA_CUU_FILTER_STATE,
  type TraCuuFilterState,
} from "./lookupShared";

export type DashboardLookupPanelsState = {
  lookupState: TraCuuFilterState;
  setLookupState: (state: TraCuuFilterState) => void;
  lookupDoneState: TraCuuFilterState;
  setLookupDoneState: (state: TraCuuFilterState) => void;
};

export function useDashboardLookupState() {
  const [lookupState, setLookupState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_FILTER_STATE);
  const [lookupDoneState, setLookupDoneState] = useState<TraCuuFilterState>(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);

  const resetLookupStates = useCallback(() => {
    setLookupState(DEFAULT_TRA_CUU_FILTER_STATE);
    setLookupDoneState(DEFAULT_TRA_CUU_DA_XU_LY_FILTER_STATE);
  }, []);

  return {
    lookupState,
    setLookupState,
    lookupDoneState,
    setLookupDoneState,
    resetLookupStates,
  };
}

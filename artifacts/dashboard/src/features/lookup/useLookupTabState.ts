import { useState } from "react";
import type { TraCuuFilterState, TraCuuFilterStateSetter } from "./lookupShared";

export type LookupTabProps = {
  state: TraCuuFilterState;
  setState: TraCuuFilterStateSetter;
  isActive?: boolean;
};

export function useLookupTabState(
  props: LookupTabProps | undefined,
  defaultState: TraCuuFilterState,
) {
  const [localState, setLocalState] = useState<TraCuuFilterState>(defaultState);
  const state = props?.state ?? localState;
  const setState = props?.setState ?? setLocalState;
  const isActive = props?.isActive ?? true;

  return { state, setState, isActive };
}

import { useState, type Dispatch, type SetStateAction } from "react";
import type { TraCuuFilterState } from "./lookupShared";

export type LookupTabProps = {
  state: TraCuuFilterState;
  setState: Dispatch<SetStateAction<TraCuuFilterState>>;
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

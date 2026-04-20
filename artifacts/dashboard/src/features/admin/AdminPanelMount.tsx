import type { PropsWithChildren } from "react";
import type { AdminPanelVisibilityState } from "./useAdminPanelShell";

type Props = PropsWithChildren<AdminPanelVisibilityState>;

export function AdminPanelMount({ isAdmin, showAdmin, children }: Props) {
  if (!isAdmin || !showAdmin) return null;
  return <>{children}</>;
}

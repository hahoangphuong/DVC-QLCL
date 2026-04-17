import type { ReactNode } from "react";
import type { AdminPanelVisibilityState } from "./useAdminPanelShell";

type Props = AdminPanelVisibilityState & {
  children: ReactNode;
};

export function AdminPanelMount({ isAdmin, showAdmin, children }: Props) {
  if (!isAdmin || !showAdmin) return null;
  return <>{children}</>;
}

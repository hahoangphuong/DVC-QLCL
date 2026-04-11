import type { ReactNode } from "react";

type Props = {
  isAdmin: boolean;
  showAdmin: boolean;
  children: ReactNode;
};

export function AdminPanelMount({ isAdmin, showAdmin, children }: Props) {
  if (!isAdmin || !showAdmin) return null;
  return <>{children}</>;
}

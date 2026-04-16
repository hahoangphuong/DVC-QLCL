import type { ReactNode } from "react";
import { LoginScreen } from "./LoginScreen";

type DashboardRole = "viewer" | "admin";

type Props = {
  authLoading: boolean;
  authRole: DashboardRole | null;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  children: ReactNode;
};

export function DashboardAuthGate({
  authLoading,
  authRole,
  password,
  setPassword,
  busy,
  error,
  onSubmit,
  children,
}: Props) {
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">{"\u0110ang ki\u1ec3m tra \u0111\u0103ng nh\u1eadp..."}</div>
      </div>
    );
  }

  if (!authRole) {
    return (
      <LoginScreen
        password={password}
        setPassword={setPassword}
        busy={busy}
        error={error}
        onSubmit={onSubmit}
      />
    );
  }

  return <>{children}</>;
}

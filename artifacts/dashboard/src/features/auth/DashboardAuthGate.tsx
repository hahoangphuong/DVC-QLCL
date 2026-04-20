import type { PropsWithChildren } from "react";
import type { DashboardRole } from "./authApi";
import { LoginScreen, type LoginScreenProps } from "./LoginScreen";

type Props = PropsWithChildren<LoginScreenProps & {
  authLoading: boolean;
  authRole: DashboardRole | null;
}>;

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

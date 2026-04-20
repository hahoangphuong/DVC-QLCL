import { useCallback, useEffect, useState } from "react";
import {
  fetchAuthMe,
  loginDashboard,
  logoutDashboard,
  type DashboardRole,
} from "./authApi";

type Params = {
  onAfterLogout: VoidFunction;
};

export function useDashboardAuth({ onAfterLogout }: Params) {
  const [authLoading, setAuthLoading] = useState(true);
  const [authRole, setAuthRole] = useState<DashboardRole | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAuthMe()
      .then((data) => {
        if (cancelled) return;
        setAuthRole(data.authenticated ? data.role : null);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthRole(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(async () => {
    if (!loginPassword.trim()) return;
    setLoginBusy(true);
    setAuthError(null);
    try {
      const data = await loginDashboard(loginPassword);
      setAuthRole(data.role);
      setLoginPassword("");
    } catch (e) {
      setAuthError(String(e));
    } finally {
      setLoginBusy(false);
    }
  }, [loginPassword]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutDashboard();
    } catch {
      // ignore
    }
    setAuthRole(null);
    onAfterLogout();
  }, [onAfterLogout]);

  return {
    authLoading,
    authRole,
    loginPassword,
    setLoginPassword,
    loginBusy,
    authError,
    handleLogin,
    handleLogout,
  };
}

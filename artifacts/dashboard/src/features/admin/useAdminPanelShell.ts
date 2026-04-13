import { useCallback, useEffect } from "react";

type Params = {
  isAdmin: boolean;
  showAdmin: boolean;
  setShowAdmin: (value: boolean) => void;
};

export function useAdminPanelShell({ isAdmin, showAdmin, setShowAdmin }: Params) {
  const closeAdmin = useCallback(() => {
    setShowAdmin(false);
    if (window.location.hash === "#admin") {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }, [setShowAdmin]);

  const openAdmin = useCallback(() => {
    window.location.hash = "admin";
    setShowAdmin(true);
  }, [setShowAdmin]);

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#admin" && isAdmin) setShowAdmin(true);
      else {
        setShowAdmin(false);
        if (window.location.hash === "#admin" && !isAdmin) {
          history.pushState("", document.title, window.location.pathname + window.location.search);
        }
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [isAdmin, setShowAdmin]);

  useEffect(() => {
    if (!showAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAdmin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAdmin, showAdmin]);

  return {
    openAdmin,
    closeAdmin,
  };
}

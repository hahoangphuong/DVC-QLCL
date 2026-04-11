export type DashboardRole = "viewer" | "admin";
export type AuthMe = { authenticated: boolean; role: DashboardRole | null };

const API = "/api";

export async function fetchAuthMe(): Promise<AuthMe> {
  const res = await fetch(`${API}/auth/me`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loginDashboard(password: string): Promise<AuthMe> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
  const me = await fetchAuthMe();
  if (!me.authenticated || !me.role) {
    throw new Error("\u0110\u0103ng nh\u1eadp kh\u00f4ng t\u1ea1o \u0111\u01b0\u1ee3c session tr\u00ean tr\u00ecnh duy\u1ec7t.");
  }
  return me;
}

export async function logoutDashboard(): Promise<void> {
  const res = await fetch(`${API}/auth/logout`, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

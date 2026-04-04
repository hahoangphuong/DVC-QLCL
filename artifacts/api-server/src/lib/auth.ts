import crypto from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";

export type DashboardRole = "viewer" | "admin";

const SESSION_COOKIE = "dav_dashboard_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function shouldUseSecureCookie(): boolean {
  const raw = (process.env["DASHBOARD_COOKIE_SECURE"] ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return false;
}

function getSessionSecret(): string {
  return process.env["DASHBOARD_SESSION_SECRET"] ?? "";
}

function getRolePassword(role: DashboardRole): string {
  return role === "admin"
    ? (process.env["DASHBOARD_ADMIN_PASSWORD"] ?? "")
    : (process.env["DASHBOARD_VIEWER_PASSWORD"] ?? "");
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  cookieHeader.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function buildSessionValue(role: DashboardRole): string | null {
  const secret = getSessionSecret();
  const password = getRolePassword(role);
  if (!secret || !password) return null;
  const digest = sha256(password).slice(0, 16);
  const payload = `${role}.${digest}`;
  return `${payload}.${sign(payload)}`;
}

export function getDashboardRole(req: Request): DashboardRole | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const cookies = parseCookieHeader(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [roleRaw, digest, signature] = parts;
  if (roleRaw !== "viewer" && roleRaw !== "admin") return null;

  const password = getRolePassword(roleRaw);
  if (!password) return null;
  const expectedDigest = sha256(password).slice(0, 16);
  const payload = `${roleRaw}.${digest}`;
  const expectedSig = sign(payload);
  if (digest !== expectedDigest || signature !== expectedSig) return null;
  return roleRaw;
}

export function setDashboardSession(res: Response, role: DashboardRole): void {
  const value = buildSessionValue(role);
  if (!value) {
    throw new Error("Dashboard auth chua duoc cau hinh day du tren server.");
  }
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

export function clearDashboardSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
  });
}

export function resolveRoleFromPassword(password: string): DashboardRole | null {
  const adminPassword = getRolePassword("admin");
  if (adminPassword && password === adminPassword) return "admin";
  const viewerPassword = getRolePassword("viewer");
  if (viewerPassword && password === viewerPassword) return "viewer";
  return null;
}

function requireRole(minRole: DashboardRole): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getDashboardRole(req);
    if (!role) {
      return void res.status(401).json({ detail: "Chua dang nhap dashboard." });
    }
    if (minRole === "admin" && role !== "admin") {
      return void res.status(403).json({ detail: "Ban khong co quyen truy cap chuc nang nay." });
    }
    next();
  };
}

export const requireViewerSession = requireRole("viewer");
export const requireAdminSession = requireRole("admin");

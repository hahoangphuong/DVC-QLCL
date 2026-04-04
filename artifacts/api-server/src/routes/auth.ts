import { Router, type IRouter } from "express";
import {
  clearDashboardSession,
  getDashboardRole,
  resolveRoleFromPassword,
  setDashboardSession,
} from "../lib/auth";

const router: IRouter = Router();

router.get("/auth/me", (req, res) => {
  const role = getDashboardRole(req);
  res.json({
    authenticated: Boolean(role),
    role,
  });
});

router.post("/auth/login", (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = resolveRoleFromPassword(password);
  if (!role) {
    return void res.status(401).json({ detail: "Mật khẩu không hợp lệ." });
  }

  try {
    setDashboardSession(res, role);
    res.json({ authenticated: true, role });
  } catch (e: unknown) {
    res.status(503).json({ detail: String(e) });
  }
});

router.post("/auth/logout", (_req, res) => {
  clearDashboardSession(res);
  res.json({ ok: true });
});

export default router;

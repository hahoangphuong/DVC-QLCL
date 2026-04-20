import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EXPORT_TABLES,
  authHeaders,
  fmtSyncAt,
  type DbStats,
  type SchedulerInfo,
  type SyncLog,
} from "./adminShared";

const API = "/api";

export function AdminPanel({ onClose }: { onClose: VoidFunction }) {
  const STORAGE_KEY = "dav_admin_token";
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- state các section ----
  const [dbStats,    setDbStats]    = useState<DbStats | null>(null);
  const [dbLoading,  setDbLoading]  = useState(false);

  const [syncBusy,   setSyncBusy]   = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);

  const [scheduler,       setScheduler]       = useState<SchedulerInfo | null>(null);
  const [schedulerHours,  setSchedulerHours]  = useState<string>("");
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [schedulerMsg,    setSchedulerMsg]    = useState<string | null>(null);

  const [syncLog,     setSyncLog]     = useState<SyncLog | null>(null);
  const [logLoading,  setLogLoading]  = useState(false);
  const [logLines,    setLogLines]    = useState<string>("200");
  const logBoxRef = useRef<HTMLDivElement>(null);

  const [exportStatus, setExportStatus] = useState<Record<string, "idle"|"loading"|"error">>({});

  useEffect(() => { inputRef.current?.focus(); }, []);

  const saveToken = (v: string) => {
    setToken(v);
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  };

  const tk = () => encodeURIComponent(token.trim());
  const hasToken = token.trim().length > 0;

  // ---- Load DB stats ----
  const loadDbStats = async () => {
    if (!hasToken) return;
    setDbLoading(true);
    try {
      const r = await fetch(`${API}/admin/db-stats`, {
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setDbStats(d as DbStats);
    } catch (e) {
      alert(`Lỗi tải thống kê DB: ${String(e)}`);
    } finally {
      setDbLoading(false);
    }
  };

  // ---- Load scheduler info ----
  const loadScheduler = async () => {
    if (!hasToken) return;
    try {
      const r = await fetch(`${API}/admin/scheduler`, {
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setScheduler(d as SchedulerInfo);
      setSchedulerHours(String((d as SchedulerInfo).interval_hours));
    } catch { /* silent */ }
  };

  // ---- Force sync (async — trả về ngay, sync chạy background) ----
  const handleForceSync = async () => {
    if (!hasToken) { alert("Vui lòng nhập mã xác thực trước."); return; }
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const r = await fetch(`${API}/admin/force-sync`, {
        method: "POST",
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) {
        setSyncResult(`❌ Lỗi: ${d.detail ?? `HTTP ${r.status}`}`);
      } else {
        setSyncResult(`✅ ${d.message ?? "Sync đã được kích hoạt. Xem log để theo dõi."}`);
      }
    } catch (e) {
      setSyncResult(`❌ Lỗi kết nối: ${String(e)}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleMigrateStats = async () => {
    if (!hasToken) { alert("Vui lòng nhập mã xác thực trước."); return; }
    setMigrateBusy(true);
    setMigrateResult(null);
    try {
      const r = await fetch(`${API}/admin/migrate-stats`, {
        method: "POST",
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) {
        setMigrateResult(`❌ Lỗi: ${d.detail ?? `HTTP ${r.status}`}`);
      } else {
        const elapsed = typeof d.elapsed_sec === "number" ? ` (${d.elapsed_sec}s)` : "";
        setMigrateResult(`✅ Đã chạy stats migration${elapsed}`);
      }
    } catch (e) {
      setMigrateResult(`❌ Lỗi kết nối: ${String(e)}`);
    } finally {
      setMigrateBusy(false);
    }
  };

  // ---- Update scheduler interval ----
  const handleSchedulerSave = async () => {
    if (!hasToken) return;
    const h = parseFloat(schedulerHours);
    if (isNaN(h) || h <= 0) { setSchedulerMsg("⚠ Giá trị không hợp lệ"); return; }
    setSchedulerSaving(true);
    setSchedulerMsg(null);
    try {
      const r = await fetch(`${API}/admin/scheduler`, {
        method: "POST",
        headers: { ...authHeaders(tk()), "Content-Type": "application/json" },
        body: JSON.stringify({ hours: h }),
      });
      const d = await r.json();
      if (!r.ok) {
        setSchedulerMsg(`❌ ${d.detail ?? `HTTP ${r.status}`}`);
      } else {
        setScheduler(d as SchedulerInfo);
        setSchedulerMsg(`✅ Đã cập nhật: mỗi ${d.interval_hours}h`);
      }
    } catch (e) {
      setSchedulerMsg(`❌ Lỗi: ${String(e)}`);
    } finally {
      setSchedulerSaving(false);
    }
  };

  // ---- Load sync log ----
  const handleLoadLog = async () => {
    if (!hasToken) return;
    setLogLoading(true);
    try {
      const n = Math.min(parseInt(logLines)||200, 2000);
      const r = await fetch(`${API}/admin/logs?lines=${n}`, {
        headers: authHeaders(tk()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? `HTTP ${r.status}`);
      setSyncLog(d as SyncLog);
      setTimeout(() => {
        logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    } catch (e) {
      alert(`Lỗi tải log: ${String(e)}`);
    } finally {
      setLogLoading(false);
    }
  };

  // ---- Download Excel ----
  const handleDownload = async (tableId: string) => {
    if (!hasToken) { alert("Vui lòng nhập mã xác thực trước."); return; }
    setExportStatus(s => ({ ...s, [tableId]: "loading" }));
    try {
      const url = `${API}/admin/export/${tableId}`;
      const res = await fetch(url, {
        headers: authHeaders(tk()),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        alert(`Lỗi: ${err.detail ?? "Không thể tải file"}`);
        setExportStatus(s => ({ ...s, [tableId]: "error" }));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const nm = cd.match(/filename="?([^"]+)"?/);
      const filename = nm?.[1] ?? `${tableId}.xlsx`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      setExportStatus(s => ({ ...s, [tableId]: "idle" }));
    } catch (e) {
      alert(`Lỗi kết nối: ${String(e)}`);
      setExportStatus(s => ({ ...s, [tableId]: "error" }));
    }
  };

  // ---- Auto-load when token available ----
  useEffect(() => {
    if (hasToken) { loadDbStats(); loadScheduler(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">Quản trị hệ thống</h2>
            <p className="text-slate-400 text-xs mt-0.5">Chỉ dành cho quản trị viên</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl font-bold leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* 0 — Token */}
          <Section title="Mã xác thực">
            <input
              ref={inputRef}
              type="password"
              value={token}
              onChange={e => saveToken(e.target.value)}
              placeholder="Nhập ADMIN_EXPORT_TOKEN..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Mã được lưu tạm trong trình duyệt của bạn.</p>
          </Section>

          {/* 1 — DB Stats */}
          <Section title="Thống kê bản ghi trong database">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={loadDbStats}
                disabled={!hasToken || dbLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {dbLoading ? "Đang tải..." : "Làm mới"}
              </button>
            </div>
            {dbStats ? (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">Bảng</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">Tổng</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">TT48</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">TT47</th>
                    <th className="text-right px-3 py-2 border border-slate-200 font-semibold text-slate-600">TT46</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">Sync lần cuối</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "tra_cuu_chung", label: "tra_cuu_chung" },
                    { key: "dang_xu_ly",    label: "dang_xu_ly" },
                    { key: "da_xu_ly",      label: "da_xu_ly" },
                  ].map(({ key, label }) => {
                    const t = dbStats.tables[key as keyof DbStats["tables"]];
                    const by = "by_thu_tuc" in t ? t.by_thu_tuc : null;
                    return (
                      <tr key={key} className="hover:bg-slate-50">
                        <td className="px-3 py-2 border border-slate-200 font-mono text-slate-700">{label}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right font-bold text-slate-800">{t.total.toLocaleString()}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right text-slate-600">{by ? by[48]?.toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right text-slate-600">{by ? by[47]?.toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 border border-slate-200 text-right text-slate-600">{by ? by[46]?.toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 border border-slate-200 text-slate-500">
                          {t.last_sync
                            ? <>
                                <span className="font-medium text-slate-700">{fmtSyncAt(t.last_sync)}</span>
                                {(t.fetch_sec != null || t.insert_sec != null) && (
                                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                    {t.fetch_sec  != null && <span>🌐 Kéo: <span className="font-mono text-slate-600">{t.fetch_sec.toFixed(2)}s</span></span>}
                                    {t.fetch_sec  != null && t.insert_sec != null && <span className="mx-1">·</span>}
                                    {t.insert_sec != null && <span>💾 Ghi: <span className="font-mono text-slate-600">{t.insert_sec.toFixed(2)}s</span></span>}
                                  </div>
                                )}
                              </>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-400">{dbLoading ? "Đang tải..." : hasToken ? "Nhấn 'Làm mới' để xem." : "Nhập token để xem."}</p>
            )}
          </Section>

          {/* 2 — Force sync */}
          <Section title="Đồng bộ dữ liệu ngay">
            <p className="text-xs text-slate-500 mb-3">Kích hoạt sync toàn bộ 7 dataset ngay lập tức (thay vì đợi scheduler). Lệnh trả về ngay, sync chạy nền trong 1–3 phút — xem Log bên dưới để theo dõi tiến trình.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleForceSync}
                disabled={!hasToken || syncBusy}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncBusy ? "⏳ Đang sync..." : "▶ Sync ngay"}
              </button>
              {syncResult && <span className="text-xs text-slate-700 font-medium">{syncResult}</span>}
            </div>
          </Section>

          <Section title="Stats Migration">
            <p className="text-xs text-slate-500 mb-3">Chạy thủ công phần recreate materialized views stats sau khi deploy thay đổi schema stats. Tác vụ này không còn chạy lúc startup.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleMigrateStats}
                disabled={!hasToken || migrateBusy}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {migrateBusy ? "⏳ Đang migrate..." : "▶ Chạy stats migration"}
              </button>
              {migrateResult && <span className="text-xs text-slate-700 font-medium">{migrateResult}</span>}
            </div>
          </Section>

          {/* 3 — Scheduler */}
          <Section title="Tần suất tự động sync">
            {scheduler && (
              <p className="text-xs text-slate-500 mb-2">
                Hiện tại: <span className="font-semibold text-slate-700">{scheduler.interval_hours}h</span> / lần
                {scheduler.next_run && (
                  <> · Lần sync tiếp theo: <span className="font-semibold text-slate-700">{fmtSyncAt(scheduler.next_run)}</span></>
                )}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={0.1}
                max={24}
                step={0.5}
                value={schedulerHours}
                onChange={e => setSchedulerHours(e.target.value)}
                className="w-24 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="giờ"
              />
              <span className="text-xs text-slate-500">giờ / lần</span>
              <button
                onClick={handleSchedulerSave}
                disabled={!hasToken || schedulerSaving}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {schedulerSaving ? "Đang lưu..." : "Lưu"}
              </button>
              {schedulerMsg && <span className="text-xs text-slate-700">{schedulerMsg}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Phạm vi: 0.1 – 24 giờ. Thay đổi có hiệu lực ngay, không cần khởi động lại.</p>
          </Section>

          {/* 4 — Sync log */}
          <Section title="Remote fetch log">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-slate-500">Hiển thị</span>
              <input
                type="number"
                min={10}
                max={2000}
                step={50}
                value={logLines}
                onChange={e => setLogLines(e.target.value)}
                className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <span className="text-xs text-slate-500">dòng cuối</span>
              <button
                onClick={handleLoadLog}
                disabled={!hasToken || logLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {logLoading ? "Đang tải..." : "Xem log"}
              </button>
              {syncLog && (
                <span className="text-xs text-slate-400">
                  Hiển thị {syncLog.showing_last}/{syncLog.total_lines} dòng
                </span>
              )}
            </div>
            {syncLog ? (
              <div
                ref={logBoxRef}
                className="bg-slate-900 rounded-lg p-3 overflow-y-auto max-h-64 font-mono text-xs text-green-300 space-y-px leading-relaxed"
              >
                {syncLog.lines.map((line, i) => (
                  <div key={i} className={line.includes("ERROR") ? "text-red-400" : line.includes("WARNING") || line.includes("WARN") ? "text-yellow-300" : undefined}>
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">{hasToken ? "Nhấn 'Xem log' để tải." : "Nhập token để xem."}</p>
            )}
          </Section>

          {/* 5 — Export Excel */}
          <Section title="Xuất dữ liệu Excel">
            <div className="space-y-2">
              {EXPORT_TABLES.map(t => {
                const st = exportStatus[t.id] ?? "idle";
                return (
                  <button
                    key={t.id}
                    onClick={() => handleDownload(t.id)}
                    disabled={st === "loading"}
                    className={[
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all",
                      st === "loading"  ? "border-blue-300 bg-blue-50 opacity-70 cursor-not-allowed"
                      : st === "error"  ? "border-red-300 bg-red-50 hover:bg-red-100"
                                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300",
                    ].join(" ")}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{t.label}</p>
                      <p className="text-xs text-slate-400">{t.desc}</p>
                    </div>
                    <span className="text-xs font-medium text-slate-500 ml-4 flex-shrink-0">
                      {st === "loading" ? "⏳ Đang tải..." : st === "error" ? "❌ Lỗi" : "⬇ .xlsx"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <p className="text-xs text-slate-400 text-center pt-1">
            Thoát: nhấn <kbd className="bg-slate-100 border border-slate-300 rounded px-1 text-xs">Esc</kbd> hoặc click × bên trên
          </p>
        </div>
      </div>
    </div>
  );
}

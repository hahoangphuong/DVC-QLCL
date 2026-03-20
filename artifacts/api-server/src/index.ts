import app from "./app";
import { spawn } from "child_process";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Chỉ spawn Python trong production — dev đã có workflow FastAPI riêng
if (process.env["NODE_ENV"] === "production") {
  // process.cwd() trong production = thư mục gốc repo (nơi main.py tồn tại)
  const repoRoot = process.cwd();

  // Kiểm tra Python sẵn sàng, rồi trigger sync/all
  // Retry mãi mỗi 15s cho đến khi thành công (tối đa 20 phút)
  async function waitAndSync(): Promise<void> {
    const MAX_WAIT_MS = 20 * 60 * 1000; // 20 phút
    const INTERVAL_MS = 15_000;
    const started = Date.now();

    while (Date.now() - started < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      try {
        const probe = await fetch("http://127.0.0.1:8001/");
        if (!probe.ok) {
          console.log("[sync] Python alive but returned non-200, retrying...");
          continue;
        }
        // Python ready — trigger sync
        console.log("[sync] Python is ready! Triggering initial sync/all...");
        const res = await fetch("http://127.0.0.1:8001/sync/all", {
          method: "POST",
        });
        const body = (await res.json()) as { ok?: boolean; results?: unknown[] };
        console.log(
          `[sync] sync/all completed — ok=${String(body.ok)}, datasets=${(body.results ?? []).length}`
        );
        return; // done
      } catch {
        const elapsed = Math.round((Date.now() - started) / 1000);
        console.log(
          `[sync] Python not ready yet (${elapsed}s elapsed), retrying in ${INTERVAL_MS / 1000}s...`
        );
      }
    }
    console.error("[sync] Python did not start within 20 minutes. Giving up.");
  }

  function startPythonServer() {
    console.log(`[python] Starting uvicorn from ${repoRoot} ...`);
    const proc = spawn(
      "uvicorn",
      ["main:app", "--host", "127.0.0.1", "--port", "8001"],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: { ...process.env },
      }
    );

    proc.on("error", (err) => {
      console.error("[python] Failed to start uvicorn:", err.message);
    });

    proc.on("exit", (code, signal) => {
      console.warn(
        `[python] uvicorn exited (code=${code}, signal=${signal}), restarting in 10s...`
      );
      setTimeout(startPythonServer, 10_000);
    });

    void waitAndSync();
  }

  startPythonServer();
}

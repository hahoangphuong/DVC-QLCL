import app from "./app";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

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

// Xác định root repo qua import.meta.url (esbuild tự chuyển sang CJS khi build)
// dev (tsx/ESM): src/index.ts  → 3 cấp trên = root
// prod (CJS):    dist/index.cjs → 3 cấp trên = root
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Trigger initial sync qua Python FastAPI (chạy sau khi Python khởi động xong)
async function triggerInitialSync(retries = 8, delayMs = 8000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch("http://127.0.0.1:8001/sync/all");
      if (res.ok) {
        const body = await res.json() as { ok?: boolean };
        console.log(`[sync] Initial sync triggered successfully (ok=${body.ok})`);
        return;
      }
      console.warn(`[sync] Attempt ${i + 1}: Python returned ${res.status}, retrying...`);
    } catch {
      console.warn(`[sync] Attempt ${i + 1}: Python not ready yet, retrying in ${delayMs / 1000}s...`);
    }
  }
  console.error("[sync] Could not trigger initial sync after all retries");
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
    console.warn(`[python] uvicorn exited (code=${code}, signal=${signal}), restarting in 5s...`);
    setTimeout(startPythonServer, 5000);
  });

  // Sau khi spawn, đợi Python sẵn sàng rồi trigger sync ngay
  triggerInitialSync();
}

startPythonServer();

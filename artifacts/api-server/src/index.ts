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

// Chỉ spawn Python trong production — dev đã có workflow FastAPI riêng.
// Python tự trigger sync ngay lúc startup (qua APScheduler next_run_time=now).
if (process.env["NODE_ENV"] === "production") {
  const repoRoot = process.cwd(); // production khởi động từ root repo
  const PYTHON_PORT = "8001";

  // Ghi vào process.env để admin.ts đọc đúng port khi gọi Python API
  process.env["PYTHON_PORT"] = PYTHON_PORT;

  function startPythonServer() {
    console.log(`[python] Starting uvicorn on port ${PYTHON_PORT} from ${repoRoot} ...`);
    const proc = spawn(
      "uvicorn",
      ["main:app", "--host", "127.0.0.1", "--port", PYTHON_PORT],
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
  }

  startPythonServer();
}

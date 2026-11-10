import { spawn } from "node:child_process";
if (process.env.PORT && process.env.PORT !== "3000")
  throw new Error(
    "Development uses backend port 3000. Unset PORT or set PORT=3000.",
  );
if (
  process.env.PUBLIC_ORIGIN &&
  !["http://localhost:5173", "http://127.0.0.1:5173"].includes(
    process.env.PUBLIC_ORIGIN,
  )
)
  throw new Error(
    "For local development, leave PUBLIC_ORIGIN empty or set it to http://localhost:5173.",
  );
const children = [
  spawn(
    process.execPath,
    ["--watch", "--env-file-if-exists=.env", "server.mjs"],
    { stdio: "inherit", env: { ...process.env, PORT: "3000" } },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill("SIGTERM");
}
for (const c of children)
  c.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

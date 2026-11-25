import { existsSync } from "node:fs";
import { sweep } from "../lib/sweep";

for (const path of [".env.local", ".env"]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

sweep().then((report) => {
  if (!report) {
    console.error("A sweep is already running.");
    process.exitCode = 1;
    return;
  }
  console.table(report.map(({ board, count, error }) => ({ board, count, error })));
  if (report.some(({ error }) => error)) process.exitCode = 1;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL && process.env.ENABLE_WORKER !== "false") {
    const { startWorker } = await import("./lib/worker");
    startWorker();
  }
}

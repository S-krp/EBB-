export async function register() {
  const background = process.env.V2_BACKGROUND_REFRESH ??
    (process.env.ALERT_WEBHOOK_URL ? "true" : "false");
  if (process.env.NEXT_RUNTIME === "nodejs" && background === "true") {
    const { engine } = await import("./lib/engine.mjs");
    engine().start();
  }
}

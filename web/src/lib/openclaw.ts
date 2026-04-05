export async function notifyOpenClaw(message: string): Promise<void> {
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
  const token = process.env.OPENCLAW_WEBHOOK_TOKEN;

  if (!webhookUrl) {
    console.log("[OpenClaw dev mode] Would send:", message);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        name: "FallAlert",
        deliver: true,
        channel: "telegram",
        to: process.env.TELEGRAM_CHAT_ID,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`OpenClaw webhook failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("OpenClaw webhook unreachable:", err);
  } finally {
    clearTimeout(timeout);
  }
}

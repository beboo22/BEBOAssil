export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 5);
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? 300);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 4000);

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Retry failed");
}

export async function waitForChannelReady(channel: any, timeoutMs = 2500): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = String(channel?.state ?? "").toLowerCase();
    if (state === "joined" || state === "subscribed") return;
    await sleep(150);
  }
}

export async function retryChannelSendWithBackoff(
  getChannel: () => any,
  message: { type: string; event: string; payload?: any },
  options: RetryOptions = {},
): Promise<void> {
  await retryWithBackoff(async (attempt) => {
    const channel = getChannel();
    if (!channel) throw new Error("Realtime channel unavailable");

    await waitForChannelReady(channel, Math.min(5000, 1200 + attempt * 500));

    const result = await channel.send(message);
    if (result && result !== "ok") {
      throw new Error(`Realtime send failed: ${String(result)}`);
    }
  }, options);
}
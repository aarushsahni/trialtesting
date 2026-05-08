// Minimal rate limiter + retry helpers (self-contained).

export class RateLimiter {
  private queue: number[] = [];
  constructor(private maxPerWindow: number, private windowMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.queue = this.queue.filter((t) => now - t < this.windowMs);
    if (this.queue.length >= this.maxPerWindow) {
      const wait = this.windowMs - (now - this.queue[0]);
      await new Promise((r) => setTimeout(r, wait + 10));
      return this.acquire();
    }
    this.queue.push(Date.now());
  }
}

export const createCTGovRateLimiter = () => new RateLimiter(40, 1000);

export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 600): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = baseMs * Math.pow(2, i) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let i = 0;
  let done = 0;
  const total = items.length;
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= total) return;
      await fn(items[idx]);
      done++;
      onProgress?.(done, total);
    }
  });
  await Promise.all(workers);
}

import { redis } from './redis';

/** Sliding window rate limiter using Redis. */
export async function rateLimit(key: string, limit?: number, windowSec = 60): Promise<{ ok: boolean; remaining: number }> {
  const max = limit ?? Number(process.env.RATE_LIMIT_PER_MIN ?? 60);
  const k = `rl:${key}`;
  const now = Date.now();
  const windowStart = now - windowSec * 1000;
  const pipe = redis.multi();
  pipe.zremrangebyscore(k, 0, windowStart);
  pipe.zadd(k, now, `${now}-${Math.random()}`);
  pipe.zcard(k);
  pipe.expire(k, windowSec);
  const res = await pipe.exec();
  const count = Number(res?.[2]?.[1] ?? 0);
  return { ok: count <= max, remaining: Math.max(0, max - count) };
}

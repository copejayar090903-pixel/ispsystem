import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;
let isRedisAvailable = false;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 5000,
      retryStrategy(times) {
        return Math.min(times * 500, 2000);
      }
    });

    redis.on("error", (err) => {
      console.warn("[Redis Connection Warn]:", err.message || err);
      isRedisAvailable = false;
    });

    redis.on("connect", () => {
      console.log("[Redis]: Connected successfully.");
      isRedisAvailable = true;
    });
  } catch (err) {
    console.error("[Redis Initialization Error]:", err);
  }
} else {
  console.warn("REDIS_URL env variable not defined. Redis caching disabled (falling back to memory).");
}

// Simple in-memory fallback cache
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (redis && isRedisAvailable) {
      try {
        const val = await redis.get(key);
        if (val) return JSON.parse(val) as T;
      } catch (err) {
        console.warn(`[Redis cache.get Error for key ${key}]:`, err);
      }
    }

    // In-memory fallback
    const memVal = memoryCache.get(key);
    if (memVal) {
      if (Date.now() < memVal.expiresAt) {
        return JSON.parse(memVal.value) as T;
      } else {
        memoryCache.delete(key);
      }
    }
    return null;
  },

  async set<T>(key: string, value: T, ttlSeconds: number = 60): Promise<void> {
    const serialized = JSON.stringify(value);
    if (redis && isRedisAvailable) {
      try {
        await redis.set(key, serialized, "EX", ttlSeconds);
        return;
      } catch (err) {
        console.warn(`[Redis cache.set Error for key ${key}]:`, err);
      }
    }

    // In-memory fallback
    memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  },

  async del(key: string): Promise<void> {
    if (redis && isRedisAvailable) {
      try {
        await redis.del(key);
        return;
      } catch (err) {
        console.warn(`[Redis cache.del Error for key ${key}]:`, err);
      }
    }
    memoryCache.delete(key);
  },

  async invalidatePattern(pattern: string): Promise<void> {
    if (redis && isRedisAvailable) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (err) {
        console.warn(`[Redis invalidatePattern Error for pattern ${pattern}]:`, err);
      }
    }

    // Clear matching memory cache keys
    const regexPattern = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    for (const key of memoryCache.keys()) {
      if (regexPattern.test(key)) {
        memoryCache.delete(key);
      }
    }
  }
};

export { redis };

import { clamp } from "@/lib/engine/indicators";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizePricePoints(points: unknown): Array<[number, number]> {
  if (!Array.isArray(points)) return [];
  const src = points as unknown[];
  return src
    .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([ts, price]): [number, number] => {
      const fixedTs = ts < 1e12 ? ts * 1000 : ts;
      return [fixedTs, price];
    })
    .sort((a, b) => a[0] - b[0]);
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSyntheticDailyHistory(seed = 42): Array<[number, number]> {
  const rand = seeded(seed);
  const now = Date.now();
  const start = now - 365 * 4 * DAY_MS;
  const points: Array<[number, number]> = [];
  let price = 19000;

  for (let ts = start; ts <= now; ts += DAY_MS) {
    const t = (ts - start) / DAY_MS;
    const trend = 0.00045;
    const cycle = Math.sin(t / 46) * 0.012 + Math.sin(t / 130) * 0.018;
    const shock = (rand() - 0.5) * 0.035;
    price = Math.max(2000, price * (1 + trend + cycle + shock));
    points.push([ts, price]);
  }
  return points;
}

export async function fetchDailyYears(): Promise<Array<[number, number]>> {
  const end = Date.now();
  const start = end - 365 * 4 * DAY_MS;
  const rangeUrl = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from=${Math.floor(start / 1000)}&to=${Math.floor(end / 1000)}`;
  const maxUrl = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily";

  for (const url of [rangeUrl, maxUrl]) {
    try {
      const json = await fetchJsonWithTimeout(url);
      const normalized = normalizePricePoints(json.prices).filter((p) => p[0] >= start && p[0] <= end);
      if (normalized.length >= 120) return normalized;
    } catch {
      // fallback next source
    }
  }

  return createSyntheticDailyHistory();
}

export function findNearestPrice(daily: Array<[number, number]>, ts: number, fallback: number): number {
  if (!daily.length) return fallback;
  let best = daily[0];
  let minDiff = Math.abs(daily[0][0] - ts);
  for (let i = 1; i < daily.length; i++) {
    const d = Math.abs(daily[i][0] - ts);
    if (d < minDiff) {
      minDiff = d;
      best = daily[i];
    }
  }
  return best[1] || fallback;
}

export function computeNoise(baseStart: number, baseEnd: number, dayCount: number): number {
  const dailyRet = Math.abs((baseEnd - baseStart) / Math.max(1, baseStart)) / Math.max(1, dayCount);
  return clamp(dailyRet * 2.2, 0.002, 0.02);
}

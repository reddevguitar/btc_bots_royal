export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

export function ema(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let v = mean(arr.slice(0, period));
  for (let i = period; i < arr.length; i++) v = arr[i] * k + v * (1 - k);
  return v;
}

export function rsi(arr: number[], period: number): number | null {
  if (arr.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = arr.length - period; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function bollinger(
  arr: number[],
  period: number,
  mult: number
): { mid: number; upper: number; lower: number } | null {
  if (arr.length < period) return null;
  const s = arr.slice(-period);
  const m = mean(s);
  const sd = stdev(s);
  return { mid: m, upper: m + sd * mult, lower: m - sd * mult };
}

export function donchian(arr: number[], period: number): { high: number; low: number } | null {
  if (arr.length < period + 1) return null;
  const s = arr.slice(-period - 1, -1);
  return { high: Math.max(...s), low: Math.min(...s) };
}

export function roc(arr: number[], period: number): number | null {
  if (arr.length <= period) return null;
  const prev = arr[arr.length - 1 - period];
  const now = arr[arr.length - 1];
  return ((now - prev) / prev) * 100;
}

export function zScore(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const s = arr.slice(-period);
  const m = mean(s);
  const sd = stdev(s);
  if (sd === 0) return 0;
  return (arr[arr.length - 1] - m) / sd;
}

export function adxLike(arr: number[], period = 14): number | null {
  if (arr.length < period + 3) return null;
  let plus = 0;
  let minus = 0;
  let tr = 0;
  for (let i = arr.length - period; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    plus += Math.max(0, d);
    minus += Math.max(0, -d);
    tr += Math.abs(d);
  }
  if (tr === 0) return 0;
  const diPlus = (plus / tr) * 100;
  const diMinus = (minus / tr) * 100;
  return (Math.abs(diPlus - diMinus) / Math.max(1e-9, diPlus + diMinus)) * 100;
}

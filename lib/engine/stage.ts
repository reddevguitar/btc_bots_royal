import { clamp, mean, stdev } from "@/lib/engine/indicators";
import { computeNoise, DAY_MS, findNearestPrice, seeded } from "@/lib/engine/data";
import type { Stage, StagePoint } from "@/lib/engine/types";

export const STAGE_MS = 14 * DAY_MS;

function toKDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function windowFeatures(slice: Array<[number, number]>) {
  const prices = slice.map((d) => d[1]);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const ret = (last - first) / first;
  const vol = stdev(prices) / mean(prices);

  let maxDrop = 0;
  let peak = prices[0];
  for (const p of prices) {
    peak = Math.max(peak, p);
    maxDrop = Math.min(maxDrop, (p - peak) / peak);
  }

  const mid = Math.floor(prices.length * 0.6);
  const firstPart = prices.slice(0, mid);
  const secondPart = prices.slice(mid);
  const firstRange = (Math.max(...firstPart) - Math.min(...firstPart)) / mean(firstPart);
  const secondMove = Math.abs((secondPart[secondPart.length - 1] - secondPart[0]) / secondPart[0]);

  return { ret, vol, maxDrop, firstRange, secondMove };
}

function chooseUnique<T extends { start: number }>(bucket: T[], picked: T[], minGapMs: number): T | undefined {
  return bucket.find((c) => picked.every((p) => Math.abs(p.start - c.start) > minGapMs));
}

export function pickStages(prices: Array<[number, number]>): Stage[] {
  if (!Array.isArray(prices) || prices.length < 20) return [];
  const stepMs = 2 * DAY_MS;
  const candidates: Array<{ start: number; end: number; label: string; score: number; feat: ReturnType<typeof windowFeatures> }> = [];
  const firstTs = prices[0]?.[0];
  const lastTs = prices[prices.length - 1]?.[0];
  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || firstTs >= lastTs) return [];

  for (let t = firstTs; t + STAGE_MS <= lastTs; t += stepMs) {
    const slice = prices.filter((x) => x[0] >= t && x[0] < t + STAGE_MS);
    if (slice.length < 12) continue;
    const feat = windowFeatures(slice);
    candidates.push({ start: t, end: t + STAGE_MS, feat, label: "", score: 0 });
  }

  const up = candidates.map((c) => ({ ...c, label: "상승 추세", score: c.feat.ret * 2 + c.feat.vol })).sort((a, b) => b.score - a.score);
  const down = candidates.map((c) => ({ ...c, label: "하락 추세", score: -c.feat.ret * 2 + c.feat.vol })).sort((a, b) => b.score - a.score);
  const rebound = candidates
    .map((c) => ({ ...c, label: "급락 후 반등", score: Math.abs(c.feat.maxDrop) * 1.5 + Math.max(0, c.feat.ret) }))
    .sort((a, b) => b.score - a.score);
  const breakout = candidates.map((c) => ({ ...c, label: "박스 돌파", score: c.feat.secondMove - c.feat.firstRange })).sort((a, b) => b.score - a.score);
  const chaos = candidates.map((c) => ({ ...c, label: "고변동 혼조", score: c.feat.vol + Math.abs(c.feat.maxDrop) })).sort((a, b) => b.score - a.score);

  const picked: typeof up = [];
  const minGap = 16 * DAY_MS;
  for (const bucket of [up, down, rebound, breakout, chaos]) {
    const found = chooseUnique(bucket, picked, minGap);
    if (found) picked.push(found);
  }

  const fallbackByMove = candidates
    .map((c) => ({ ...c, label: "변동 구간", score: Math.abs(c.feat.ret) + c.feat.vol }))
    .sort((a, b) => b.score - a.score);
  for (const c of fallbackByMove) {
    if (picked.length >= 5) break;
    if (picked.every((p) => Math.abs(p.start - c.start) > minGap)) picked.push(c);
  }

  const selected = picked.slice(0, 5).map((x, i) => ({
    id: `stage_${i + 1}`,
    type: x.label,
    start: x.start,
    end: x.end,
    summary: `${toKDate(x.start)} ~ ${toKDate(x.end)}`
  }));

  if (selected.length === 5) return selected;

  const force = [...selected];
  const span = lastTs - firstTs;
  for (let i = force.length; i < 5; i++) {
    const anchor = firstTs + (span * i) / 5;
    const end = Math.min(anchor + STAGE_MS, lastTs);
    const start = Math.max(firstTs, end - STAGE_MS);
    force.push({
      id: `stage_fallback_${i + 1}`,
      type: `기본 스테이지 ${String.fromCharCode(65 + i)}`,
      start,
      end,
      summary: `${toKDate(start)} ~ ${toKDate(end)}`
    });
  }
  return force.slice(0, 5);
}

export function buildStageSeriesFromDaily(stage: Stage, daily: Array<[number, number]>, seed = 1): StagePoint[] {
  const start = stage.start;
  const end = stage.end;
  const inRange = daily.filter((p) => p[0] >= start - DAY_MS && p[0] <= end + DAY_MS);
  const baseStart = findNearestPrice(inRange, start, daily[daily.length - 1]?.[1] || 30000);
  const baseEnd = findNearestPrice(inRange, end, baseStart);
  const dayCount = Math.max(1, Math.round((end - start) / DAY_MS));
  const noiseAmp = computeNoise(baseStart, baseEnd, dayCount);

  const stepMs = 15 * 60 * 1000;
  const rand = seeded(Math.floor((stage.start + stage.end) / 1000) + seed);
  const series: StagePoint[] = [];

  for (let ts = start; ts <= end; ts += stepMs) {
    const progress = (ts - start) / Math.max(1, end - start);
    const anchor = baseStart + (baseEnd - baseStart) * progress;
    const wave = 1 + Math.sin(progress * Math.PI * 10) * noiseAmp + Math.sin(progress * Math.PI * 36) * noiseAmp * 0.5;
    const jitter = 1 + (rand() - 0.5) * noiseAmp * 1.4;
    const close = Math.max(1000, anchor * wave * jitter);
    series.push({ ts, close: clamp(close, 1000, Number.MAX_SAFE_INTEGER) });
  }

  return series;
}

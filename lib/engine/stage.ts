import { clamp } from "@/lib/engine/indicators";
import { computeNoise, DAY_MS, findNearestPrice, seeded } from "@/lib/engine/data";
import type { Stage, StagePoint } from "@/lib/engine/types";

export const STAGE_MS = 14 * DAY_MS;

function toKDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

type StageTemplate = {
  id: string;
  title: string;
  centerDate: string;
  turningPoint: string;
  description: string;
};

const HISTORY_TEMPLATES: StageTemplate[] = [
  {
    id: "hist_2013_bubble",
    title: "첫 번째 글로벌 버블",
    centerDate: "2013-11-30T00:00:00Z",
    turningPoint: "초기 대중 인지도 급등과 급락 사이클 시작",
    description: "비트코인이 초기 대중 시장에서 급등락을 보이며 고변동 자산으로 각인된 시기"
  },
  {
    id: "hist_2017_ath",
    title: "2017 불장 정점",
    centerDate: "2017-12-17T00:00:00Z",
    turningPoint: "당시 사상 최고가 형성과 대세 하락 전환",
    description: "리테일 자금이 집중되며 과열된 뒤 구조적 조정으로 넘어간 핵심 분기점"
  },
  {
    id: "hist_2020_covid",
    title: "코로나 패닉 크래시",
    centerDate: "2020-03-13T00:00:00Z",
    turningPoint: "글로벌 리스크오프와 동반 폭락 후 강한 반등",
    description: "단기 유동성 쇼크에서 회복하며 이후 장기 상승장의 출발점이 된 구간"
  },
  {
    id: "hist_2020_halving",
    title: "3차 반감기",
    centerDate: "2020-05-11T00:00:00Z",
    turningPoint: "공급 축소 이벤트 반영과 중장기 추세 전환",
    description: "반감기 기대와 실제 이벤트를 전후로 모멘텀이 형성된 대표 시기"
  },
  {
    id: "hist_2021_apr_ath",
    title: "기관장세 1차 정점",
    centerDate: "2021-04-14T00:00:00Z",
    turningPoint: "기관 수요 기대 정점과 변동성 확대",
    description: "상승 추세 속 과열 신호가 강화되며 변동성 장세가 본격화된 구간"
  },
  {
    id: "hist_2021_china_ban",
    title: "중국 채굴 규제 충격",
    centerDate: "2021-05-19T00:00:00Z",
    turningPoint: "대규모 급락과 시장 구조 재편",
    description: "규제 뉴스로 급락이 발생하고 유동성 구조가 다시 재정렬된 변곡점"
  },
  {
    id: "hist_2021_nov_ath",
    title: "2021 최종 ATH",
    centerDate: "2021-11-10T00:00:00Z",
    turningPoint: "최고점 형성 후 장기 약세 전환 시그널",
    description: "상승장의 마지막 고점을 기록하고 방향성이 바뀐 핵심 구간"
  },
  {
    id: "hist_2022_luna",
    title: "루나-3AC 연쇄 붕괴",
    centerDate: "2022-06-18T00:00:00Z",
    turningPoint: "디레버리징 본격화와 신용축소",
    description: "연쇄 청산이 발생하며 시장 리스크 관리의 중요성이 극대화된 구간"
  },
  {
    id: "hist_2022_ftx",
    title: "FTX 붕괴",
    centerDate: "2022-11-10T00:00:00Z",
    turningPoint: "거래소 신뢰 붕괴와 극단적 변동성",
    description: "시장 신뢰가 급격히 훼손되며 바닥 탐색 국면으로 들어간 대표 이벤트"
  },
  {
    id: "hist_2024_etf",
    title: "현물 ETF 승인",
    centerDate: "2024-01-10T00:00:00Z",
    turningPoint: "제도권 자금 유입 기대 현실화",
    description: "비트코인 시장 구조가 제도권 중심으로 재평가된 새로운 사이클의 시작점"
  }
];

function buildStageFromTemplate(t: StageTemplate, firstTs: number, lastTs: number): Stage {
  const center = new Date(t.centerDate).getTime();
  let start = center - 7 * DAY_MS;
  let end = center + 7 * DAY_MS;

  if (start < firstTs) {
    start = firstTs;
    end = Math.min(firstTs + STAGE_MS, lastTs);
  }

  if (end > lastTs) {
    end = lastTs;
    start = Math.max(firstTs, lastTs - STAGE_MS);
  }

  const period = `${toKDate(start)} ~ ${toKDate(end)}`;

  return {
    id: t.id,
    type: "비트코인 역사",
    title: t.title,
    period,
    turningPoint: t.turningPoint,
    description: t.description,
    start,
    end,
    summary: period
  };
}

export function pickStages(prices: Array<[number, number]>): Stage[] {
  if (!Array.isArray(prices) || prices.length < 30) return [];
  const firstTs = prices[0]?.[0];
  const lastTs = prices[prices.length - 1]?.[0];
  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || firstTs >= lastTs) return [];

  return HISTORY_TEMPLATES.map((t) => buildStageFromTemplate(t, firstTs, lastTs));
}

export function buildStageSeriesFromDaily(stage: Stage, daily: Array<[number, number]>, seed = 1): StagePoint[] {
  const start = stage.start;
  const end = stage.end;
  const anchors = daily.filter((p) => p[0] >= start - DAY_MS && p[0] <= end + DAY_MS).sort((a, b) => a[0] - b[0]);

  const fallbackStart = findNearestPrice(daily, start, daily[daily.length - 1]?.[1] || 30000);
  const fallbackEnd = findNearestPrice(daily, end, fallbackStart);
  const dayCount = Math.max(1, Math.round((end - start) / DAY_MS));
  const fallbackNoise = computeNoise(fallbackStart, fallbackEnd, dayCount);

  const stepMs = 15 * 60 * 1000;
  const rand = seeded(Math.floor((stage.start + stage.end) / 1000) + seed);
  const series: StagePoint[] = [];

  function interpolateFromAnchors(ts: number): { price: number; localNoise: number } {
    if (anchors.length < 2) return { price: fallbackStart, localNoise: fallbackNoise };

    let i = 0;
    while (i < anchors.length - 1 && anchors[i + 1][0] < ts) i++;
    const left = anchors[Math.max(0, i)];
    const right = anchors[Math.min(anchors.length - 1, i + 1)];

    if (left[0] === right[0]) {
      return { price: left[1], localNoise: fallbackNoise };
    }

    const ratio = clamp((ts - left[0]) / (right[0] - left[0]), 0, 1);
    const base = left[1] + (right[1] - left[1]) * ratio;
    const legRet = Math.abs((right[1] - left[1]) / Math.max(1, left[1]));
    const localNoise = clamp(legRet * 0.8 + fallbackNoise * 0.7, 0.0015, 0.025);
    return { price: base, localNoise };
  }

  for (let ts = start; ts <= end; ts += stepMs) {
    const progress = (ts - start) / Math.max(1, end - start);
    const { price: anchor, localNoise } = interpolateFromAnchors(ts);
    const wave = 1 + Math.sin(progress * Math.PI * 10) * localNoise + Math.sin(progress * Math.PI * 34) * localNoise * 0.6;
    const jitter = 1 + (rand() - 0.5) * localNoise * 1.5;
    const close = Math.max(1000, anchor * wave * jitter);
    series.push({ ts, close: clamp(close, 1000, Number.MAX_SAFE_INTEGER) });
  }

  return series;
}

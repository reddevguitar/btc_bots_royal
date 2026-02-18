import { bollinger, donchian, ema, roc, rsi } from "@/lib/engine/indicators";
import type { Action, BotContext, BotDefinition } from "@/lib/engine/types";

function makeDonchianTrend(
  entryPeriod: number,
  exitPeriod: number,
  portion: number,
  rsiFloor = 45
): (ctx: BotContext) => Action | null {
  return (ctx) => {
    const en = donchian(ctx.closes, entryPeriod);
    const ex = donchian(ctx.closes, exitPeriod);
    const r = rsi(ctx.closes, 14);
    if (!en || !ex || r == null) return null;
    if (ctx.btc === 0 && ctx.price > en.high * 1.001 && r > rsiFloor) {
      return { type: "buy", portion, reason: `${entryPeriod} 돌파` };
    }
    if (ctx.btc > 0 && (ctx.price < ex.low || r < 43)) {
      return { type: "sell", portion: 1, reason: `${exitPeriod} 이탈` };
    }
    return null;
  };
}

function makeEmaSwing(
  fast: number,
  slow: number,
  portion: number,
  rsiIn = 50,
  rsiOut = 45
): (ctx: BotContext) => Action | null {
  return (ctx) => {
    const ef = ema(ctx.closes, fast);
    const es = ema(ctx.closes, slow);
    const r = rsi(ctx.closes, 14);
    const bb = bollinger(ctx.closes, 20, 2);
    if (ef == null || es == null || r == null || !bb) return null;
    if (ctx.btc === 0 && ef > es && r > rsiIn && ctx.price < bb.upper * 0.998) {
      return { type: "buy", portion, reason: `EMA${fast}/${slow} 정배열` };
    }
    if (ctx.btc > 0 && (ef < es || r < rsiOut || ctx.price > bb.upper * 1.01)) {
      return { type: "sell", portion: 1, reason: "스윙 종료" };
    }
    return null;
  };
}

function makeMeanReversion(
  rsiBuy: number,
  rsiSell: number,
  portion: number,
  bbMult = 2
): (ctx: BotContext) => Action | null {
  return (ctx) => {
    const r = rsi(ctx.closes, 14);
    const bb = bollinger(ctx.closes, 20, bbMult);
    if (r == null || !bb) return null;
    if (ctx.btc === 0 && (r < rsiBuy || ctx.price < bb.lower)) {
      return { type: "buy", portion, reason: "과매도 반등" };
    }
    if (ctx.btc > 0 && (r > rsiSell || ctx.price > bb.mid)) {
      return { type: "sell", portion: 1, reason: "평균 회귀" };
    }
    return null;
  };
}

function makeVolBreak(lookback: number, rocEnter: number, portion: number): (ctx: BotContext) => Action | null {
  return (ctx) => {
    if (ctx.closes.length < lookback + 10) return null;
    const e = ema(ctx.closes, 21);
    const r = roc(ctx.closes, 5);
    const range = ctx.closes.slice(-lookback, -1);
    const high = Math.max(...range);
    const low = Math.min(...range);
    if (e == null || r == null) return null;
    if (ctx.btc === 0 && ctx.price > high * 1.002 && ctx.price > e && r > rocEnter) {
      return { type: "buy", portion, reason: "변동성 돌파" };
    }
    if (ctx.btc > 0 && (ctx.price < low * 0.998 || ctx.price < e)) {
      return { type: "sell", portion: 1, reason: "돌파 실패" };
    }
    return null;
  };
}

function makeRiskGuard(portion = 0.45): (ctx: BotContext) => Action | null {
  return (ctx) => {
    const e10 = ema(ctx.closes, 10);
    const e50 = ema(ctx.closes, 50);
    const r = rsi(ctx.closes, 14);
    if (e10 == null || e50 == null || r == null) return null;
    if (ctx.btc === 0 && ctx.price > e50 && ctx.price > e10 && r > 52 && r < 70) {
      return { type: "buy", portion, reason: "리스크 제한 진입" };
    }
    if (ctx.btc > 0) {
      const entry = ctx.meta.entryPrice || ctx.price;
      const loss = (ctx.price - entry) / Math.max(1, entry);
      if (loss < -0.02 || ctx.price < e10 || r < 45) {
        return { type: "sell", portion: 1, reason: "손실 제한 청산" };
      }
    }
    return null;
  };
}

export const bots: BotDefinition[] = [
  { id: "livermore", name: "리버모어 브레이커", desc: "돌파 추종", inspiration: "Jesse Livermore", step: makeDonchianTrend(20, 10, 0.55, 50) },
  { id: "dennis", name: "데니스 터틀", desc: "터틀 채널", inspiration: "Richard Dennis", step: makeDonchianTrend(55, 20, 0.66, 47) },
  { id: "soros", name: "소로스 리플렉시브", desc: "가속 모멘텀", inspiration: "George Soros", step: makeVolBreak(26, 0.7, 0.58) },
  { id: "ptj", name: "튜더 리스크가드", desc: "손실 방어형", inspiration: "Paul Tudor Jones", step: makeRiskGuard(0.45) },
  { id: "raschke", name: "라슈케 ADX", desc: "추세 눌림", inspiration: "Linda B. Raschke", step: makeEmaSwing(8, 21, 0.6, 49, 44) },
  { id: "schwartz", name: "슈워츠 스윙", desc: "단기 스윙", inspiration: "Marty Schwartz", step: makeEmaSwing(10, 30, 0.56, 51, 46) },
  { id: "seykota", name: "세이코타 트렌드", desc: "시스템 추세", inspiration: "Ed Seykota", step: makeDonchianTrend(35, 14, 0.62, 48) },
  { id: "darvas", name: "다바스 박스", desc: "박스 상단 돌파", inspiration: "Nicolas Darvas", step: makeVolBreak(20, 0.45, 0.57) },
  { id: "oneil", name: "오닐 모멘텀", desc: "강세 모멘텀", inspiration: "William O'Neil", step: makeEmaSwing(12, 26, 0.61, 54, 47) },
  { id: "drucken", name: "드러켄밀러 매크로", desc: "추세 확대", inspiration: "Stanley Druckenmiller", step: makeVolBreak(30, 0.8, 0.63) },
  { id: "minervini", name: "미네르비니 VCP", desc: "수축 후 확장", inspiration: "Mark Minervini", step: makeVolBreak(24, 0.55, 0.52) },
  { id: "williams_l", name: "래리 윌리엄스", desc: "단기 반전", inspiration: "Larry Williams", step: makeMeanReversion(32, 60, 0.58, 2.1) },
  { id: "williams_b", name: "빌 윌리엄스", desc: "혼돈형 추세", inspiration: "Bill Williams", step: makeEmaSwing(5, 34, 0.54, 50, 42) },
  { id: "elder", name: "엘더 트리플", desc: "추세+오실레이터", inspiration: "Alexander Elder", step: makeEmaSwing(13, 34, 0.5, 53, 47) },
  { id: "sperandeo", name: "스페란데오", desc: "추세전환 포착", inspiration: "Victor Sperandeo", step: makeDonchianTrend(18, 9, 0.53, 49) },
  { id: "henry", name: "존 W. 헨리", desc: "CTA 추세형", inspiration: "John W. Henry", step: makeDonchianTrend(40, 15, 0.64, 46) },
  { id: "kovner", name: "코브너 밸런스", desc: "공격-방어 균형", inspiration: "Bruce Kovner", step: makeEmaSwing(9, 26, 0.52, 52, 45) },
  { id: "marcus", name: "마커스 모멘텀", desc: "초기 추세 포착", inspiration: "Michael Marcus", step: makeVolBreak(18, 0.5, 0.59) },
  { id: "basso", name: "바소 리스크엔진", desc: "손실 최소화", inspiration: "Tom Basso", step: makeRiskGuard(0.42) },
  { id: "unger", name: "운거 시스템", desc: "규칙 기반 단타", inspiration: "Andrea Unger", step: makeMeanReversion(29, 57, 0.55, 1.9) },
  { id: "simons", name: "사이먼스 퀀트", desc: "단기 퀀트 스윙", inspiration: "Jim Simons", step: makeEmaSwing(6, 18, 0.5, 51, 44) },
  { id: "dalio", name: "달리오 매크로", desc: "중기 추세 필터", inspiration: "Ray Dalio", step: makeDonchianTrend(28, 12, 0.5, 47) },
  { id: "lynch", name: "린치 모멘텀", desc: "강세 추종", inspiration: "Peter Lynch", step: makeVolBreak(22, 0.52, 0.57) },
  { id: "tepper", name: "테퍼 리스크온", desc: "반등 추세형", inspiration: "David Tepper", step: makeMeanReversion(34, 62, 0.53, 2.2) },
  { id: "cohen", name: "코헨 템포", desc: "빠른 템포 매매", inspiration: "Steve Cohen", step: makeEmaSwing(4, 16, 0.49, 52, 46) },
  { id: "icahn", name: "아이칸 리버설", desc: "되돌림 포착", inspiration: "Carl Icahn", step: makeMeanReversion(31, 58, 0.5, 2.0) },
  { id: "ackman", name: "애크먼 컨빅션", desc: "선택적 진입", inspiration: "Bill Ackman", step: makeRiskGuard(0.4) },
  { id: "paulrotter", name: "폴 로터 스캘프", desc: "초단타 돌파", inspiration: "Paul Rotter", step: makeVolBreak(14, 0.45, 0.46) },
  { id: "linda2", name: "라슈케 스윙2", desc: "추세 전환형", inspiration: "Linda B. Raschke", step: makeEmaSwing(7, 24, 0.55, 50, 45) },
  { id: "drucken2", name: "드러켄밀러2", desc: "가속 추세 확장", inspiration: "Stanley Druckenmiller", step: makeDonchianTrend(30, 11, 0.6, 49) }
];

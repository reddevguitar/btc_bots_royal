import { adxLike, bollinger, donchian, ema, roc, rsi, zScore } from "@/lib/engine/indicators";
import type { Action, BotContext, BotDefinition } from "@/lib/engine/types";

function cooldown(meta: BotContext["meta"], bars: number): boolean {
  const left = Math.max(0, (meta.cooldownBars || 0) - 1);
  meta.cooldownBars = left;
  if (left > 0) return true;
  if (bars > 0) meta.cooldownBars = bars;
  return false;
}

function withHold(meta: BotContext["meta"], hasPos: boolean): number {
  meta.holdBars = hasPos ? (meta.holdBars || 0) + 1 : 0;
  return meta.holdBars || 0;
}

function trendBreakout(entry: number, exit: number, portion: number, coolBars: number, name: string) {
  return (ctx: BotContext): Action | null => {
    const en = donchian(ctx.closes, entry);
    const ex = donchian(ctx.closes, exit);
    const r = rsi(ctx.closes, 14);
    if (!en || !ex || r == null) return null;
    const hold = withHold(ctx.meta, ctx.btc > 0);

    if (ctx.btc === 0) {
      if (cooldown(ctx.meta, 0)) return null;
      if (ctx.price > en.high * 1.001 && r > 48) {
        cooldown(ctx.meta, coolBars);
        return { type: "buy", portion, reason: `${name} 돌파 진입` };
      }
    }

    if (ctx.btc > 0 && (ctx.price < ex.low || r < 42 || hold > 180)) {
      return { type: "sell", portion: 1, reason: `${name} 추세 이탈` };
    }

    return null;
  };
}

function emaMomentum(fast: number, slow: number, portion: number, inRsi: number, outRsi: number, coolBars: number, name: string) {
  return (ctx: BotContext): Action | null => {
    const ef = ema(ctx.closes, fast);
    const es = ema(ctx.closes, slow);
    const r = rsi(ctx.closes, 14);
    const bb = bollinger(ctx.closes, 20, 2);
    if (ef == null || es == null || r == null || !bb) return null;
    const hold = withHold(ctx.meta, ctx.btc > 0);

    if (ctx.btc === 0) {
      if (cooldown(ctx.meta, 0)) return null;
      if (ef > es && r > inRsi && ctx.price < bb.upper * 0.997) {
        cooldown(ctx.meta, coolBars);
        return { type: "buy", portion, reason: `${name} 모멘텀` };
      }
    }

    if (ctx.btc > 0 && (ef < es || r < outRsi || hold > 150)) {
      return { type: "sell", portion: 1, reason: `${name} 모멘텀 종료` };
    }

    return null;
  };
}

function meanReversion(inRsi: number, outRsi: number, portion: number, zIn: number, coolBars: number, name: string) {
  return (ctx: BotContext): Action | null => {
    const r = rsi(ctx.closes, 14);
    const bb = bollinger(ctx.closes, 20, 2);
    const z = zScore(ctx.closes, 20);
    if (r == null || !bb || z == null) return null;
    const hold = withHold(ctx.meta, ctx.btc > 0);

    if (ctx.btc === 0) {
      if (cooldown(ctx.meta, 0)) return null;
      if ((r < inRsi && z < zIn) || ctx.price < bb.lower) {
        cooldown(ctx.meta, coolBars);
        return { type: "buy", portion, reason: `${name} 과매도 반등` };
      }
    }

    if (ctx.btc > 0 && (r > outRsi || ctx.price > bb.mid || hold > 90)) {
      return { type: "sell", portion: 1, reason: `${name} 평균회귀 완료` };
    }

    return null;
  };
}

function volatilityImpulse(lookback: number, rocIn: number, portion: number, coolBars: number, name: string) {
  return (ctx: BotContext): Action | null => {
    if (ctx.closes.length < lookback + 10) return null;
    const high = Math.max(...ctx.closes.slice(-lookback, -1));
    const low = Math.min(...ctx.closes.slice(-lookback, -1));
    const e = ema(ctx.closes, 21);
    const r = roc(ctx.closes, 5);
    const adx = adxLike(ctx.closes, 14);
    if (e == null || r == null || adx == null) return null;
    const hold = withHold(ctx.meta, ctx.btc > 0);

    if (ctx.btc === 0) {
      if (cooldown(ctx.meta, 0)) return null;
      if (ctx.price > high * 1.002 && ctx.price > e && r > rocIn && adx > 20) {
        cooldown(ctx.meta, coolBars);
        return { type: "buy", portion, reason: `${name} 변동성 확장` };
      }
    }

    if (ctx.btc > 0 && (ctx.price < low * 0.998 || ctx.price < e || hold > 120)) {
      return { type: "sell", portion: 1, reason: `${name} 돌파 실패` };
    }

    return null;
  };
}

function riskGuard(portion: number, stopLoss: number, takeProfit: number, name: string) {
  return (ctx: BotContext): Action | null => {
    const e10 = ema(ctx.closes, 10);
    const e50 = ema(ctx.closes, 50);
    const r = rsi(ctx.closes, 14);
    const hold = withHold(ctx.meta, ctx.btc > 0);
    if (e10 == null || e50 == null || r == null) return null;

    if (ctx.btc === 0) {
      if (ctx.price > e50 && ctx.price > e10 && r > 50 && r < 68) {
        return { type: "buy", portion, reason: `${name} 방어형 진입` };
      }
    }

    if (ctx.btc > 0) {
      const entry = ctx.meta.entryPrice || ctx.price;
      const pnl = (ctx.price - entry) / Math.max(1, entry);
      if (pnl <= -stopLoss || pnl >= takeProfit || r < 44 || hold > 130) {
        return { type: "sell", portion: 1, reason: `${name} 리스크 청산` };
      }
    }

    return null;
  };
}

export const bots: BotDefinition[] = [
  { id: "livermore", name: "리버모어 브레이커", inspiration: "Jesse Livermore", desc: "역할: 강한 고점 돌파를 포착해 추세 초기 구간만 빠르게 먹고 이탈하는 추세 추종형", step: trendBreakout(20, 10, 0.58, 14, "리버모어") },
  { id: "dennis", name: "데니스 터틀", inspiration: "Richard Dennis", desc: "역할: 장기 돌파 중심으로 큰 추세를 길게 가져가며 노이즈 거래를 줄이는 저빈도 추세형", step: trendBreakout(55, 20, 0.7, 20, "터틀") },
  { id: "seykota", name: "세이코타 시스템", inspiration: "Ed Seykota", desc: "역할: 기계적 규칙으로 중기 추세를 따라가고 보유시간 제한으로 과도한 집착을 막는 시스템형", step: trendBreakout(34, 14, 0.62, 16, "세이코타") },
  { id: "henry", name: "헨리 CTA", inspiration: "John W. Henry", desc: "역할: CTA 스타일로 완만한 추세를 포착하고 변동성 과열 구간에서 자동 이탈하는 분산형", step: trendBreakout(40, 15, 0.6, 18, "헨리") },

  { id: "schwartz", name: "슈워츠 스윙", inspiration: "Marty Schwartz", desc: "역할: 단기 EMA 정배열과 RSI 조건이 맞을 때만 진입해 스윙 구간을 짧게 소화하는 템포형", step: emaMomentum(8, 21, 0.55, 52, 45, 10, "슈워츠") },
  { id: "oneil", name: "오닐 모멘텀", inspiration: "William O'Neil", desc: "역할: 강한 상대강도 구간에서만 진입해 고점 추격은 줄이고 상승 연속성을 노리는 성장형", step: emaMomentum(12, 26, 0.63, 55, 47, 12, "오닐") },
  { id: "kovner", name: "코브너 밸런스", inspiration: "Bruce Kovner", desc: "역할: 모멘텀과 방어를 균형 있게 가져가며 중간 강도의 추세를 안정적으로 추종하는 균형형", step: emaMomentum(9, 30, 0.5, 51, 44, 9, "코브너") },
  { id: "elder", name: "엘더 트리플", inspiration: "Alexander Elder", desc: "역할: 추세 확인 후 오실레이터 필터를 통과한 신호만 채택해 과매수 구간 진입을 억제하는 필터형", step: emaMomentum(13, 34, 0.52, 53, 46, 11, "엘더") },

  { id: "williams_l", name: "래리 윌리엄스", inspiration: "Larry Williams", desc: "역할: 급한 하락 뒤 반등 탄력을 노리고 목표 수익 도달 시 빠르게 빠지는 단기 역추세형", step: meanReversion(31, 60, 0.6, -1.2, 8, "래리") },
  { id: "icahn", name: "아이칸 리버설", inspiration: "Carl Icahn", desc: "역할: 시장 과민반응 구간에서 되돌림을 노리는 보수적 평균회귀형", step: meanReversion(29, 57, 0.48, -1.05, 12, "아이칸") },
  { id: "unger", name: "운거 시스템", inspiration: "Andrea Unger", desc: "역할: 규칙 기반 역추세 진입 후 보유 시간을 엄격히 제한해 신호 품질을 유지하는 규칙형", step: meanReversion(30, 58, 0.53, -1.1, 10, "운거") },
  { id: "tepper", name: "테퍼 딥바이", inspiration: "David Tepper", desc: "역할: 공포성 급락 구간을 매수해 반등 구간을 짧게 수확하는 공격적 회귀형", step: meanReversion(34, 62, 0.66, -1.4, 14, "테퍼") },

  { id: "soros", name: "소로스 리플렉시브", inspiration: "George Soros", desc: "역할: 변동성 확대와 방향 가속이 동시 발생할 때만 참여해 트렌드 폭발 구간을 노리는 가속형", step: volatilityImpulse(26, 0.75, 0.58, 12, "소로스") },
  { id: "drucken", name: "드러켄밀러", inspiration: "Stanley Druckenmiller", desc: "역할: 확률 우위가 큰 구간에 집중 진입하고 실패하면 빠르게 정리하는 확신형", step: volatilityImpulse(30, 0.9, 0.64, 16, "드러켄") },
  { id: "marcus", name: "마커스 모멘텀", inspiration: "Michael Marcus", desc: "역할: 초기 돌파 신호를 빠르게 받아 수익 구간을 넓히는 초입 포착형", step: volatilityImpulse(18, 0.5, 0.57, 8, "마커스") },
  { id: "darvas", name: "다바스 박스", inspiration: "Nicolas Darvas", desc: "역할: 박스 상단 이탈 시 추종하고 박스 하단 붕괴 시 즉시 철수하는 박스 브레이크형", step: volatilityImpulse(22, 0.55, 0.54, 10, "다바스") },

  { id: "ptj", name: "튜더 리스크가드", inspiration: "Paul Tudor Jones", desc: "역할: 손실 제한을 최우선으로 하며 진입 크기를 낮춰 생존성을 높이는 방어형", step: riskGuard(0.42, 0.02, 0.06, "튜더") },
  { id: "basso", name: "바소 리스크엔진", inspiration: "Tom Basso", desc: "역할: 저변동 운용과 철저한 손실 관리로 계좌 변동폭을 최소화하는 안정형", step: riskGuard(0.35, 0.015, 0.045, "바소") },
  { id: "ackman", name: "애크먼 컨빅션", inspiration: "Bill Ackman", desc: "역할: 확신 조건이 충족될 때만 진입하고 기준 미충족 시 장시간 대기하는 선택형", step: riskGuard(0.5, 0.022, 0.08, "애크먼") },
  { id: "raschke", name: "라슈케 ADX", inspiration: "Linda B. Raschke", desc: "역할: ADX 기반 추세 강도를 확인한 뒤 눌림목만 공략하는 추세-회귀 하이브리드형", step: volatilityImpulse(20, 0.6, 0.52, 9, "라슈케") }
];

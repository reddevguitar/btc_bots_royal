import type { BotDefinition, Competitor, LeaderRow, StagePoint, TickOrder } from "@/lib/engine/types";

export const INITIAL_CAPITAL = 10000;
export const FEE_RATE = 0.001;

export function initCompetitors(bots: BotDefinition[]): Competitor[] {
  return bots.map((b) => ({
    id: b.id,
    name: b.name,
    desc: b.desc,
    inspiration: b.inspiration,
    step: b.step,
    cash: INITIAL_CAPITAL,
    btc: 0,
    trades: [],
    peak: INITIAL_CAPITAL,
    meta: { entryPrice: 0 },
    lastAction: "HOLD",
    lastActionReason: "대기",
    lastActionTick: -999
  }));
}

export function equityOf(bot: Competitor, price: number): number {
  return bot.cash + bot.btc * price;
}

export function processTick(
  competitors: Competitor[],
  series: StagePoint[],
  idx: number
): { orders: TickOrder[]; leaderboard: LeaderRow[] } {
  const closes = series.slice(0, idx + 1).map((d) => d.close);
  const price = closes[closes.length - 1];
  const ts = series[idx].ts;
  const orders: TickOrder[] = [];

  for (const bot of competitors) {
    const action = bot.step({ closes, price, cash: bot.cash, btc: bot.btc, meta: bot.meta });
    if (!action) continue;

    if (action.type === "buy") {
      const usd = bot.cash * action.portion;
      if (usd < 10) continue;
      const fee = usd * FEE_RATE;
      const qty = (usd - fee) / price;
      bot.cash -= usd;
      bot.btc += qty;
      bot.meta.entryPrice = bot.meta.entryPrice > 0 ? (bot.meta.entryPrice + price) / 2 : price;
      bot.trades.push({ side: "BUY", price, qty, ts, reason: action.reason });
      bot.lastAction = "BUY";
      bot.lastActionReason = action.reason;
      bot.lastActionTick = idx;
      orders.push({ botId: bot.id, botName: bot.name, side: "BUY", ts, price, qty, reason: action.reason });
    }

    if (action.type === "sell") {
      const qty = bot.btc * action.portion;
      if (qty * price < 10) continue;
      const gross = qty * price;
      const fee = gross * FEE_RATE;
      bot.cash += gross - fee;
      bot.btc -= qty;
      if (bot.btc < 1e-8) {
        bot.btc = 0;
        bot.meta.entryPrice = 0;
      }
      bot.trades.push({ side: "SELL", price, qty, ts, reason: action.reason });
      bot.lastAction = "SELL";
      bot.lastActionReason = action.reason;
      bot.lastActionTick = idx;
      orders.push({ botId: bot.id, botName: bot.name, side: "SELL", ts, price, qty, reason: action.reason });
    }
  }

  for (const b of competitors) {
    const eq = equityOf(b, price);
    b.peak = Math.max(b.peak, eq);
  }

  return { orders, leaderboard: getLeaderboard(competitors, price) };
}

export function getLeaderboard(competitors: Competitor[], price: number): LeaderRow[] {
  return competitors
    .map((b) => {
      const equity = equityOf(b, price);
      const ret = ((equity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
      const mdd = ((b.peak - equity) / Math.max(1, b.peak)) * 100;
      return {
        id: b.id,
        name: b.name,
        inspiration: b.inspiration,
        equity,
        ret,
        trades: b.trades.length,
        mdd
      };
    })
    .sort((a, b) => b.ret - a.ret);
}

export type RunResult = {
  runId: string;
  stageId: string;
  speed: number;
  completedAt: string;
  bots: Array<{
    id: string;
    name: string;
    returnPct: number;
    equity: number;
    trades: number;
    mdd: number;
  }>;
};

export function buildRunResult(runId: string, stageId: string, speed: number, leaderboard: LeaderRow[]): RunResult {
  return {
    runId,
    stageId,
    speed,
    completedAt: new Date().toISOString(),
    bots: leaderboard.map((b) => ({
      id: b.id,
      name: b.name,
      returnPct: Number(b.ret.toFixed(4)),
      equity: Number(b.equity.toFixed(2)),
      trades: b.trades,
      mdd: Number(b.mdd.toFixed(4))
    }))
  };
}

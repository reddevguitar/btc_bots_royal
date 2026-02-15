export type Side = "BUY" | "SELL";

export type Action = {
  type: "buy" | "sell";
  portion: number;
  reason: string;
};

export type BotContext = {
  closes: number[];
  price: number;
  cash: number;
  btc: number;
  meta: {
    entryPrice: number;
  };
};

export type BotDefinition = {
  id: string;
  name: string;
  desc: string;
  inspiration: string;
  step: (ctx: BotContext) => Action | null;
};

export type Trade = {
  side: Side;
  price: number;
  qty: number;
  ts: number;
  reason: string;
};

export type Competitor = {
  id: string;
  name: string;
  desc: string;
  inspiration: string;
  step: BotDefinition["step"];
  cash: number;
  btc: number;
  trades: Trade[];
  peak: number;
  meta: {
    entryPrice: number;
  };
  lastAction: "BUY" | "SELL" | "HOLD";
  lastActionReason: string;
  lastActionTick: number;
};

export type Stage = {
  id: string;
  type: string;
  start: number;
  end: number;
  summary: string;
};

export type StagePoint = {
  ts: number;
  close: number;
};

export type LeaderRow = {
  id: string;
  name: string;
  inspiration: string;
  equity: number;
  ret: number;
  trades: number;
  mdd: number;
};

export type TickOrder = {
  botId: string;
  botName: string;
  side: Side;
  ts: number;
  price: number;
  qty: number;
  reason: string;
};

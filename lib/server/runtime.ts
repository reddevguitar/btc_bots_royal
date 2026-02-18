import fs from "node:fs";
import path from "node:path";
import { fetchDailyYears } from "@/lib/engine/data";
import { buildStageSeriesFromDaily, pickStages } from "@/lib/engine/stage";
import { bots } from "@/lib/engine/strategies";
import { buildRunResult, getLeaderboard, initCompetitors, processTick, INITIAL_CAPITAL } from "@/lib/engine/simulator";
import type { RunResult } from "@/lib/engine/simulator";
import type { Competitor, LeaderRow, Stage, StagePoint } from "@/lib/engine/types";

const GAME_DURATION_MS = 10 * 60 * 1000;
const STORE_DIR = path.join(process.cwd(), ".runtime");
const STORE_FILE = path.join(STORE_DIR, "runtime-state.json");

type RuntimeStatus = "idle" | "running" | "paused" | "finished";

type PersistedCompetitor = Omit<Competitor, "step">;

type RuntimeData = {
  initialized: boolean;
  status: RuntimeStatus;
  message: string;
  speed: number;
  selectedStageId: string;
  daily: Array<[number, number]>;
  stages: Stage[];
  series: StagePoint[];
  competitors: Competitor[];
  processedIndex: number;
  startedAt: number;
  pausedAt: number;
  pausedAccum: number;
  tradeLogs: string[];
  runResult: RunResult | null;
  timer: NodeJS.Timeout | null;
};

type RuntimeSnapshot = {
  status: RuntimeStatus;
  message: string;
  speed: number;
  stages: Stage[];
  selectedStageId: string;
  botsCatalog: Array<{ id: string; name: string; desc: string; inspiration: string }>;
  progress: number;
  processedIndex: number;
  initialCapital: number;
  leaderboard: LeaderRow[];
  botStates: Array<{
    id: string;
    name: string;
    cash: number;
    btc: number;
    lastAction: "BUY" | "SELL" | "HOLD";
    lastActionReason: string;
    lastActionTick: number;
    ret: number;
    equity: number;
    trades: number;
  }>;
  tradeLogs: string[];
  chartSeries: StagePoint[];
  runResult: RunResult | null;
};

let runtime: RuntimeData = {
  initialized: false,
  status: "idle",
  message: "초기화 중",
  speed: 2,
  selectedStageId: "",
  daily: [],
  stages: [],
  series: [],
  competitors: [],
  processedIndex: 0,
  startedAt: 0,
  pausedAt: 0,
  pausedAccum: 0,
  tradeLogs: [],
  runResult: null,
  timer: null
};

function stopTimer() {
  if (runtime.timer) {
    clearInterval(runtime.timer);
    runtime.timer = null;
  }
}

function persist() {
  const serializable = {
    ...runtime,
    timer: null,
    competitors: runtime.competitors.map((c) => {
      const { step: _, ...plain } = c;
      return plain;
    })
  };
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(serializable));
}

function rehydrateCompetitors(plain: PersistedCompetitor[]): Competitor[] {
  const map = new Map(bots.map((b) => [b.id, b]));
  return plain
    .map((p) => {
      const def = map.get(p.id);
      if (!def) return null;
      return {
        ...p,
        step: def.step
      };
    })
    .filter((x): x is Competitor => x !== null);
}

function tryLoadPersisted() {
  if (!fs.existsSync(STORE_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
    runtime = {
      ...runtime,
      ...raw,
      competitors: rehydrateCompetitors(raw.competitors || []),
      timer: null
    };
  } catch {
    // ignore broken file
  }
}

function formatOrderLog(order: { ts: number; botName: string; side: "BUY" | "SELL"; qty: number; price: number; reason: string }) {
  const at = new Date(order.ts).toLocaleString("ko-KR");
  const money = `$${order.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `[${at}] ${order.botName} ${order.side} ${order.qty.toFixed(5)} @ ${money} | ${order.reason}`;
}

function getCurrentLeaderboard(): LeaderRow[] {
  if (!runtime.series.length || !runtime.competitors.length) return [];
  const idx = Math.max(0, Math.min(runtime.processedIndex, runtime.series.length - 1));
  const price = runtime.series[idx].close;
  return getLeaderboard(runtime.competitors, price);
}

function finalizeRun() {
  const lb = getCurrentLeaderboard();
  runtime.status = "finished";
  runtime.runResult = buildRunResult(`run_${Date.now()}`, runtime.selectedStageId, runtime.speed, lb);
  runtime.message = lb[0] ? `종료. 승자: ${lb[0].name} (${lb[0].ret.toFixed(2)}%)` : "종료";
  stopTimer();
  persist();
}

function tick() {
  if (runtime.status !== "running" || runtime.series.length === 0) return;

  const elapsed = Date.now() - runtime.startedAt - runtime.pausedAccum;
  const effectiveDuration = GAME_DURATION_MS / runtime.speed;
  const stepMs = effectiveDuration / Math.max(1, runtime.series.length - 1);
  const targetIdx = Math.min(runtime.series.length - 1, Math.floor(elapsed / stepMs));

  while (runtime.processedIndex < targetIdx) {
    runtime.processedIndex += 1;
    const { orders } = processTick(runtime.competitors, runtime.series, runtime.processedIndex);
    if (orders.length > 0) {
      const logs = orders.map(formatOrderLog).reverse();
      runtime.tradeLogs = [...logs, ...runtime.tradeLogs].slice(0, 200);
    }
  }

  if (runtime.processedIndex >= runtime.series.length - 1) {
    finalizeRun();
    return;
  }

  persist();
}

function ensureTimer() {
  if (runtime.timer) return;
  runtime.timer = setInterval(tick, 250);
}

async function ensureData() {
  if (runtime.initialized && runtime.stages.length > 0) return;

  runtime.daily = await fetchDailyYears();
  runtime.stages = pickStages(runtime.daily);
  runtime.selectedStageId = runtime.stages[0]?.id || "";
  runtime.initialized = true;
  runtime.message = `준비 완료. 스테이지 ${runtime.stages.length}개 / 봇 ${bots.length}개`;
  persist();
}

export async function initRuntime() {
  if (!runtime.initialized) {
    tryLoadPersisted();
    await ensureData();
    if (runtime.status === "running") {
      runtime.status = "paused";
      runtime.message = "서버 재시작으로 일시정지됨. 재개를 눌러 계속하세요.";
      persist();
    }
  }
}

function getSelectedStage(): Stage | null {
  return runtime.stages.find((s) => s.id === runtime.selectedStageId) || null;
}

export async function startRun(params?: { stageId?: string; speed?: number }) {
  await initRuntime();
  if (runtime.status === "running") return;

  if (params?.stageId) runtime.selectedStageId = params.stageId;
  if (params?.speed) runtime.speed = params.speed;

  const stage = getSelectedStage();
  if (!stage) {
    runtime.message = "선택된 스테이지가 없습니다.";
    persist();
    return;
  }

  runtime.series = buildStageSeriesFromDaily(stage, runtime.daily, 1);
  runtime.competitors = initCompetitors(bots);
  runtime.processedIndex = 0;
  runtime.startedAt = Date.now();
  runtime.pausedAt = 0;
  runtime.pausedAccum = 0;
  runtime.tradeLogs = [];
  runtime.runResult = null;
  runtime.status = "running";
  runtime.message = `진행 중: ${stage.type} / ${runtime.speed}x`;
  ensureTimer();
  persist();
}

export async function pauseRun() {
  await initRuntime();
  if (runtime.status !== "running") return;
  runtime.status = "paused";
  runtime.pausedAt = Date.now();
  runtime.message = "일시정지";
  stopTimer();
  persist();
}

export async function resumeRun() {
  await initRuntime();
  if (runtime.status !== "paused") return;
  runtime.pausedAccum += Date.now() - runtime.pausedAt;
  runtime.pausedAt = 0;
  runtime.status = "running";
  runtime.message = `진행 중 / ${runtime.speed}x`;
  ensureTimer();
  persist();
}

export async function stopRun() {
  await initRuntime();
  stopTimer();
  runtime.status = "idle";
  runtime.message = "중지됨";
  persist();
}

export async function resetRun() {
  await initRuntime();
  stopTimer();
  runtime.status = "idle";
  runtime.series = [];
  runtime.competitors = [];
  runtime.processedIndex = 0;
  runtime.pausedAt = 0;
  runtime.pausedAccum = 0;
  runtime.tradeLogs = [];
  runtime.runResult = null;
  runtime.message = "리셋 완료";
  persist();
}

export async function updateOptions(params: { stageId?: string; speed?: number }) {
  await initRuntime();
  if (runtime.status === "running") return;
  if (params.stageId) runtime.selectedStageId = params.stageId;
  if (params.speed) runtime.speed = params.speed;
  runtime.message = "옵션 변경됨";
  persist();
}

export async function regenerateStages() {
  await initRuntime();
  runtime.stages = pickStages(runtime.daily);
  runtime.selectedStageId = runtime.stages[0]?.id || "";
  runtime.message = `스테이지 갱신 완료. ${runtime.stages.length}개`;
  persist();
}

export async function getSnapshot(): Promise<RuntimeSnapshot> {
  await initRuntime();
  const leaderboard = getCurrentLeaderboard();

  const botStates = runtime.competitors.map((b) => {
    const row = leaderboard.find((l) => l.id === b.id);
    return {
      id: b.id,
      name: b.name,
      cash: b.cash,
      btc: b.btc,
      lastAction: b.lastAction,
      lastActionReason: b.lastActionReason,
      lastActionTick: b.lastActionTick,
      ret: row?.ret ?? 0,
      equity: row?.equity ?? INITIAL_CAPITAL,
      trades: row?.trades ?? 0
    };
  });

  const progress = runtime.series.length
    ? ((runtime.processedIndex + 1) / runtime.series.length) * 100
    : 0;

  const chartSeries = runtime.series.slice(0, runtime.processedIndex + 1);

  return {
    status: runtime.status,
    message: runtime.message,
    speed: runtime.speed,
    stages: runtime.stages,
    selectedStageId: runtime.selectedStageId,
    botsCatalog: bots.map((b) => ({ id: b.id, name: b.name, desc: b.desc, inspiration: b.inspiration })),
    progress,
    processedIndex: runtime.processedIndex,
    initialCapital: INITIAL_CAPITAL,
    leaderboard,
    botStates,
    tradeLogs: runtime.tradeLogs,
    chartSeries,
    runResult: runtime.runResult
  };
}

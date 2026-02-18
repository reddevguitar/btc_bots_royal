"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Chart as ChartType } from "chart.js";

type Stage = {
  id: string;
  type: string;
  title: string;
  period: string;
  turningPoint: string;
  description: string;
  start: number;
  end: number;
  summary: string;
};

type LeaderRow = {
  id: string;
  name: string;
  equity: number;
  ret: number;
  trades: number;
};

type BotState = {
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
};

type Snapshot = {
  status: "idle" | "running" | "paused" | "finished";
  message: string;
  speed: number;
  stages: Stage[];
  selectedStageId: string;
  botsCatalog: Array<{ id: string; name: string; desc: string; inspiration: string }>;
  progress: number;
  processedIndex: number;
  initialCapital: number;
  leaderboard: LeaderRow[];
  botStates: BotState[];
  tradeLogs: string[];
  chartSeries: Array<{ ts: number; close: number }>;
  runResult: Record<string, unknown> | null;
};

const SPEEDS = [1.5, 2, 4, 6];

function emaSeries(values: number[], period: number): Array<number | null> {
  if (values.length === 0) return [];
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function actionClass(action: string): string {
  if (action === "BUY") return "buy";
  if (action === "SELL") return "sell";
  return "hold";
}

export default function Page() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [stageId, setStageId] = useState<string>("");
  const [speed, setSpeed] = useState<number>(2);
  const [busy, setBusy] = useState(false);

  const pollingRef = useRef<number | null>(null);
  const chartRef = useRef<ChartType<"line"> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function fetchSnapshot(): Promise<Snapshot | null> {
    try {
      const res = await fetch("/api/runtime", { cache: "no-store" });
      const data = (await res.json()) as Snapshot;
      setSnapshot(data);
      setStageId((prev) => prev || data.selectedStageId);
      setSpeed((prev) => prev || data.speed);
      return data;
    } catch {
      return null;
    }
  }

  async function sendAction(action: string, payload?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const data = (await res.json()) as Snapshot;
      setSnapshot(data);
      setStageId(data.selectedStageId);
      setSpeed(data.speed);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;

    const poll = async () => {
      const data = await fetchSnapshot();
      if (!active) return;
      const nextDelay = data?.status === "running" ? 300 : 1800;
      pollingRef.current = window.setTimeout(poll, nextDelay);
    };

    void poll();

    return () => {
      active = false;
      if (pollingRef.current !== null) window.clearTimeout(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const setup = async () => {
      if (!canvasRef.current) return;
      const { default: Chart } = await import("chart.js/auto");
      if (disposed) return;

      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "BTC Price",
              data: [],
              borderColor: "#f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              fill: true,
              pointRadius: 0,
              borderWidth: 2,
              tension: 0.12
            },
            {
              label: "EMA 20",
              data: [],
              borderColor: "#22c55e",
              pointRadius: 0,
              borderWidth: 1.4,
              tension: 0.1
            },
            {
              label: "EMA 50",
              data: [],
              borderColor: "#60a5fa",
              pointRadius: 0,
              borderWidth: 1.4,
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { labels: { color: "#89a2bb", boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: $${Number(ctx.parsed.y).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              }
            }
          },
          scales: {
            x: {
              ticks: { color: "#89a2bb", maxTicksLimit: 8 },
              grid: { color: "rgba(137,162,187,.15)" }
            },
            y: {
              ticks: {
                color: "#89a2bb",
                callback: (v) => `$${Number(v).toLocaleString("en-US")}`
              },
              grid: { color: "rgba(137,162,187,.15)" }
            }
          }
        }
      });
    };

    void setup();

    return () => {
      disposed = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const c = chartRef.current;
    const pts = snapshot?.chartSeries || [];
    if (!c || pts.length === 0) return;

    const closes = pts.map((p) => p.close);
    const ema20 = emaSeries(closes, 20);
    const ema50 = emaSeries(closes, 50);

    c.data.labels = pts.map((p) =>
      new Date(p.ts).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    );
    c.data.datasets[0].data = closes;
    c.data.datasets[1].data = ema20;
    c.data.datasets[2].data = ema50;
    c.update("none");
  }, [snapshot?.chartSeries]);

  const leader = snapshot?.leaderboard?.[0];
  const totalTrades = snapshot?.leaderboard?.reduce((s, b) => s + b.trades, 0) ?? 0;
  const selectedStageType = snapshot?.stages.find((s) => s.id === snapshot?.selectedStageId)?.title || "-";
  const chartPoints = snapshot?.chartSeries || [];
  const lastPrice = chartPoints.length ? chartPoints[chartPoints.length - 1].close : 0;
  const prevPrice = chartPoints.length > 1 ? chartPoints[chartPoints.length - 2].close : lastPrice;
  const trendNow = lastPrice > prevPrice ? "상승" : lastPrice < prevPrice ? "하락" : "횡보";
  const ema20Last = (() => {
    const e = emaSeries(chartPoints.map((p) => p.close), 20);
    return e[e.length - 1] || null;
  })();
  const ema50Last = (() => {
    const e = emaSeries(chartPoints.map((p) => p.close), 50);
    return e[e.length - 1] || null;
  })();
  const sortedBotStates = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.botStates.slice().sort((a, b) => b.ret - a.ret);
  }, [snapshot]);

  return (
    <div className="app">
      <aside className="panel">
        <h1>BTC Bot Control Center</h1>
        <p className="muted">서버에서 시뮬레이션이 계속 실행됩니다. 브라우저를 꺼도 서버 프로세스가 살아있으면 계속 진행됩니다.</p>

        <h2>Control Panel</h2>
        <div className="btns">
          <button disabled={busy || snapshot?.status === "running"} onClick={() => sendAction("start", { stageId, speed })}>실행</button>
          <button disabled={busy || snapshot?.status !== "running"} onClick={() => sendAction("pause")}>일시정지</button>
          <button disabled={busy || snapshot?.status !== "paused"} onClick={() => sendAction("resume")}>재개</button>
          <button disabled={busy} onClick={() => sendAction("stop")}>종료</button>
          <button disabled={busy} onClick={() => sendAction("reset")}>리셋</button>
        </div>

        <h2 style={{ marginTop: 12 }}>옵션 변경</h2>
        <div className="btns">
          <label htmlFor="stage">비트코인 역사</label>
          <select id="stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {(snapshot?.stages || []).map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        <div className="btns">
          <label htmlFor="speed">배속</label>
          <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => <option key={v} value={v}>{v}x</option>)}
          </select>
        </div>

        <div className="btns">
          <button disabled={busy} onClick={() => sendAction("options", { stageId, speed })}>옵션 적용</button>
          <button disabled={busy} onClick={() => sendAction("regenerate")}>역사 구간 다시 로드</button>
        </div>

        <h2 style={{ marginTop: 12 }}>비트코인 역사 10구간</h2>
        <div className="list" style={{ maxHeight: 280, overflow: "auto" }}>
          {(snapshot?.stages || []).map((s) => (
            <div
              key={s.id}
              className={`card stage-card ${stageId === s.id ? "active" : ""}`}
              onClick={() => setStageId(s.id)}
            >
              <div className="title">{s.title}</div>
              <div className="sub">{s.period}</div>
              <div className="sub" style={{ marginTop: 4 }}>변곡점: {s.turningPoint}</div>
              <div className="sub" style={{ marginTop: 4 }}>{s.description}</div>
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: 12 }}>봇 20개 역할 ({snapshot?.botsCatalog.length || 0})</h2>
        <div className="list bot-list">
          {(snapshot?.botsCatalog || []).map((b) => (
            <div key={b.id} className="card">
              <div className="title">{b.name}</div>
              <div className="sub">{b.desc}</div>
              <div className="sub" style={{ marginTop: 4 }}>스타일: {b.inspiration}</div>
            </div>
          ))}
        </div>

        <div className="status">{snapshot?.message || "초기화 중..."}</div>
      </aside>

      <main className="panel">
        <div className="grid">
          <div className="metric"><div className="k">상태</div><div className="v">{snapshot?.status || "-"}</div></div>
          <div className="metric"><div className="k">초기 자본(봇당)</div><div className="v">{money(snapshot?.initialCapital || 10000)}</div></div>
          <div className="metric"><div className="k">현재 선두 자본</div><div className="v">{leader ? money(leader.equity) : "-"}</div></div>
          <div className="metric"><div className="k">선두 수익률</div><div className={`v ${leader && leader.ret >= 0 ? "good" : "bad"}`}>{leader ? pct(leader.ret) : "-"}</div></div>
          <div className="metric"><div className="k">총 거래 횟수</div><div className="v">{totalTrades}</div></div>
        </div>

        <div className="grid" style={{ marginTop: 0 }}>
          <div className="metric"><div className="k">진행률</div><div className="v">{(snapshot?.progress || 0).toFixed(1)}%</div></div>
          <div className="metric"><div className="k">배속</div><div className="v">{snapshot?.speed || speed}x</div></div>
          <div className="metric"><div className="k">스테이지</div><div className="v">{selectedStageType}</div></div>
        </div>

        <div className="grid" style={{ marginTop: 0 }}>
          <div className="metric"><div className="k">현재가</div><div className="v">{lastPrice ? money(lastPrice) : "-"}</div></div>
          <div className="metric"><div className="k">EMA20</div><div className="v">{ema20Last ? money(ema20Last) : "-"}</div></div>
          <div className="metric"><div className="k">EMA50</div><div className="v">{ema50Last ? money(ema50Last) : "-"}</div></div>
          <div className="metric"><div className="k">단기 추세</div><div className={`v ${trendNow === "상승" ? "good" : trendNow === "하락" ? "bad" : ""}`}>{trendNow}</div></div>
        </div>

        <div className="chart-wrap" style={{ height: 320 }}>
          <canvas ref={canvasRef} />
        </div>

        <div className="bottom">
          <div className="log">
            {(snapshot?.tradeLogs || []).map((line, idx) => (<div key={`${idx}-${line}`}>{line}</div>))}
          </div>

          <div className="stack">
            <div className="log short">
              <div><b>실시간 순위</b></div>
              {(snapshot?.leaderboard || []).slice(0, 10).map((row, i) => (
                <div key={row.id} className="leader-row">
                  <div>{i + 1}. {row.name}</div>
                  <div className={row.ret >= 0 ? "good" : "bad"}>{pct(row.ret)}</div>
                  <div>{money(row.equity)}</div>
                </div>
              ))}
            </div>

            <div className="log" id="botStateBoard">
              <div className="state-head">
                <div>봇</div><div>수익률</div><div>자본</div><div>현금</div><div>BTC</div><div>거래</div><div>최근 액션</div>
              </div>
              {sortedBotStates.map((b) => {
                const hot = (snapshot?.processedIndex || 0) - b.lastActionTick <= 4;
                return (
                  <div key={b.id} className={`state-row ${hot ? "hot" : ""}`}>
                    <div>{b.name}</div>
                    <div className={b.ret >= 0 ? "good" : "bad"}>{pct(b.ret)}</div>
                    <div>{money(b.equity)}</div>
                    <div>{money(b.cash)}</div>
                    <div>{b.btc.toFixed(4)}</div>
                    <div>{b.trades}</div>
                    <div><span className={`tag ${actionClass(b.lastAction)}`}>{b.lastAction}</span> <span className="sub">{b.lastActionReason}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {snapshot?.runResult && (
          <>
            <h2 style={{ marginTop: 12 }}>Run Result JSON</h2>
            <pre className="log" style={{ height: 220 }}>{JSON.stringify(snapshot.runResult, null, 2)}</pre>
          </>
        )}
      </main>
    </div>
  );
}

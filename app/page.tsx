"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { fetchDailyYears } from "@/lib/engine/data";
import { bots } from "@/lib/engine/strategies";
import { buildStageSeriesFromDaily, pickStages } from "@/lib/engine/stage";
import { buildRunResult, getLeaderboard, initCompetitors, processTick, INITIAL_CAPITAL } from "@/lib/engine/simulator";
import type { Competitor, LeaderRow, Stage, StagePoint, TickOrder } from "@/lib/engine/types";

const GAME_DURATION_MS = 10 * 60 * 1000;
const SPEEDS = [1.5, 2, 4, 6];

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
  const [daily, setDaily] = useState<Array<[number, number]>>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [speed, setSpeed] = useState<number>(2);
  const [status, setStatus] = useState<string>("데이터 로딩 중...");

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [series, setSeries] = useState<StagePoint[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [botStates, setBotStates] = useState<Competitor[]>([]);
  const [tradeLogs, setTradeLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [resultJson, setResultJson] = useState<string>("");

  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const rafRef = useRef<number | null>(null);

  const competitorsRef = useRef<Competitor[]>([]);
  const simRef = useRef({
    startWallTime: 0,
    pauseStartedAt: 0,
    pausedAccum: 0,
    processedIndex: 0
  });

  const selectedStage = useMemo(() => stages.find((s) => s.id === selectedStageId) ?? null, [stages, selectedStageId]);

  useEffect(() => {
    if (!chartCanvasRef.current) return;
    chartRef.current = new Chart(chartCanvasRef.current, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "BTC/USD",
            data: [],
            borderColor: "#f59e0b",
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.12
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { color: "#89a2bb" } } },
        scales: {
          x: { ticks: { color: "#89a2bb", maxTicksLimit: 10 }, grid: { color: "rgba(137,162,187,.15)" } },
          y: {
            ticks: { color: "#89a2bb", callback: (v) => `$${Number(v).toLocaleString("en-US")}` },
            grid: { color: "rgba(137,162,187,.15)" }
          }
        }
      }
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const boot = async () => {
      const loaded = await fetchDailyYears();
      setDaily(loaded);
      const nextStages = pickStages(loaded);
      setStages(nextStages);
      setSelectedStageId(nextStages[0]?.id ?? "");
      setStatus(`준비 완료. 스테이지 ${nextStages.length}개 / 봇 ${bots.length}개`);
    };

    void boot();
  }, []);

  const refreshStages = () => {
    if (!daily.length) return;
    const nextStages = pickStages(daily);
    setStages(nextStages);
    setSelectedStageId(nextStages[0]?.id ?? "");
    setStatus(`스테이지 갱신 완료. ${nextStages.length}개`);
  };

  const updateChart = (idx: number, nextSeries: StagePoint[]) => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = nextSeries.slice(0, idx + 1).map((d) =>
      new Date(d.ts).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
    );
    chart.data.datasets[0].data = nextSeries.slice(0, idx + 1).map((d) => d.close);
    chart.update("none");
  };

  const appendOrderLogs = (orders: TickOrder[]) => {
    if (!orders.length) return;
    const logs = orders.map((o) => {
      const at = new Date(o.ts).toLocaleString("ko-KR");
      return `[${at}] ${o.botName} ${o.side} ${o.qty.toFixed(5)} @ ${money(o.price)} | ${o.reason}`;
    });
    setTradeLogs((prev) => [...logs.reverse(), ...prev].slice(0, 150));
  };

  const finalizeRun = (lb: LeaderRow[]) => {
    setRunning(false);
    setPaused(false);
    const winner = lb[0];
    if (winner) setStatus(`종료. 승자: ${winner.name} (${pct(winner.ret)})`);

    const result = buildRunResult(
      `run_${Date.now()}`,
      selectedStage?.id ?? "stage_unknown",
      speed,
      lb
    );
    setResultJson(JSON.stringify(result, null, 2));
  };

  const frame = () => {
    if (!running || paused || !series.length) return;

    const elapsed = Date.now() - simRef.current.startWallTime - simRef.current.pausedAccum;
    const effectiveDuration = GAME_DURATION_MS / speed;
    const stepMs = effectiveDuration / Math.max(1, series.length - 1);
    const targetIdx = Math.min(series.length - 1, Math.floor(elapsed / stepMs));

    while (simRef.current.processedIndex < targetIdx) {
      simRef.current.processedIndex += 1;
      const idx = simRef.current.processedIndex;

      const { orders, leaderboard: lb } = processTick(competitorsRef.current, series, idx);
      appendOrderLogs(orders);
      setLeaderboard(lb);
      setBotStates([...competitorsRef.current]);
      setProgress(((idx + 1) / series.length) * 100);
      updateChart(idx, series);
    }

    if (simRef.current.processedIndex >= series.length - 1) {
      const finalLB = getLeaderboard(competitorsRef.current, series[series.length - 1].close);
      setLeaderboard(finalLB);
      finalizeRun(finalLB);
      return;
    }

    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    if (running && !paused) rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, speed, series]);

  const startRun = () => {
    if (!selectedStage || !daily.length) return;

    const stageSeries = buildStageSeriesFromDaily(selectedStage, daily, 1);
    setSeries(stageSeries);
    setResultJson("");
    setTradeLogs([]);

    competitorsRef.current = initCompetitors(bots);
    setBotStates([...competitorsRef.current]);

    const initLB = getLeaderboard(competitorsRef.current, stageSeries[0].close);
    setLeaderboard(initLB);
    setProgress(0);
    updateChart(0, stageSeries);

    simRef.current = {
      startWallTime: Date.now(),
      pauseStartedAt: 0,
      pausedAccum: 0,
      processedIndex: 0
    };

    setRunning(true);
    setPaused(false);
    setStatus(`진행 중: ${selectedStage.type} / ${speed}x`);
  };

  const togglePause = () => {
    if (!running) return;
    if (!paused) {
      simRef.current.pauseStartedAt = Date.now();
      setPaused(true);
      setStatus("일시정지");
      return;
    }

    simRef.current.pausedAccum += Date.now() - simRef.current.pauseStartedAt;
    setPaused(false);
    setStatus(`진행 중 / ${speed}x`);
  };

  const leader = leaderboard[0];
  const totalTrades = leaderboard.reduce((s, b) => s + b.trades, 0);

  return (
    <div className="app">
      <aside className="panel">
        <h1>BTC 단타 매매봇 배틀</h1>
        <p className="muted">1단계 구조 분리 버전. 20개 봇을 플러그인 전략으로 분리했고, 결과를 JSON으로 출력합니다.</p>

        <h2>참전자 {bots.length}봇</h2>
        <div className="list bot-list">
          {bots.map((b) => (
            <div key={b.id} className="card">
              <div className="title">{b.name}</div>
              <div className="sub">{b.desc} · {b.inspiration}</div>
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: 12 }}>스테이지 5개</h2>
        <div className="list">
          {stages.map((s) => (
            <div
              key={s.id}
              className={`card stage-card ${selectedStageId === s.id ? "active" : ""}`}
              onClick={() => setSelectedStageId(s.id)}
            >
              <div className="title">{s.type}</div>
              <div className="sub">{s.summary}</div>
            </div>
          ))}
        </div>

        <div className="btns">
          <label htmlFor="speed">배속</label>
          <select id="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => (
              <option key={v} value={v}>{v}x</option>
            ))}
          </select>
        </div>

        <div className="btns">
          <button onClick={refreshStages}>스테이지 재생성</button>
          <button onClick={startRun} disabled={!selectedStageId || running}>배틀 시작</button>
          <button onClick={togglePause} disabled={!running}>{paused ? "재개" : "일시정지"}</button>
        </div>

        <div className="status">{status}</div>
      </aside>

      <main className="panel">
        <div className="grid">
          <div className="metric"><div className="k">초기 자본(봇당)</div><div className="v">{money(INITIAL_CAPITAL)}</div></div>
          <div className="metric"><div className="k">현재 선두 자본</div><div className="v">{leader ? money(leader.equity) : "-"}</div></div>
          <div className="metric"><div className="k">선두 수익률</div><div className={`v ${leader && leader.ret >= 0 ? "good" : "bad"}`}>{leader ? pct(leader.ret) : "-"}</div></div>
          <div className="metric"><div className="k">총 거래 횟수</div><div className="v">{totalTrades}</div></div>
          <div className="metric"><div className="k">진행률</div><div className="v">{progress.toFixed(1)}%</div></div>
        </div>

        <div className="chart-wrap">
          <canvas ref={chartCanvasRef} />
        </div>

        <div className="bottom">
          <div className="log">
            {tradeLogs.map((line, idx) => (<div key={`${line}-${idx}`}>{line}</div>))}
          </div>

          <div className="stack">
            <div className="log short">
              <div><b>실시간 순위</b></div>
              {leaderboard.slice(0, 7).map((row, i) => (
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
              {botStates
                .slice()
                .sort((a, b) => {
                  const aa = leaderboard.find((l) => l.id === a.id)?.ret ?? -999;
                  const bb = leaderboard.find((l) => l.id === b.id)?.ret ?? -999;
                  return bb - aa;
                })
                .map((b) => {
                  const row = leaderboard.find((r) => r.id === b.id);
                  const hot = simRef.current.processedIndex - b.lastActionTick <= 4;
                  return (
                    <div key={b.id} className={`state-row ${hot ? "hot" : ""}`}>
                      <div>{b.name}</div>
                      <div className={row && row.ret >= 0 ? "good" : "bad"}>{row ? pct(row.ret) : "-"}</div>
                      <div>{row ? money(row.equity) : "-"}</div>
                      <div>{money(b.cash)}</div>
                      <div>{b.btc.toFixed(4)}</div>
                      <div>{row?.trades ?? 0}</div>
                      <div>
                        <span className={`tag ${actionClass(b.lastAction)}`}>{b.lastAction}</span> <span className="sub">{b.lastActionReason}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {resultJson && (
          <>
            <h2 style={{ marginTop: 12 }}>Run Result JSON</h2>
            <pre className="log" style={{ height: 220 }}>{resultJson}</pre>
          </>
        )}
      </main>
    </div>
  );
}

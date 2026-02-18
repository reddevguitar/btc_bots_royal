"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Stage = {
  id: string;
  type: string;
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

  async function fetchSnapshot() {
    const res = await fetch("/api/runtime", { cache: "no-store" });
    const data = (await res.json()) as Snapshot;
    setSnapshot(data);
    setStageId((prev) => prev || data.selectedStageId);
    setSpeed((prev) => prev || data.speed);
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
    void fetchSnapshot();
    pollingRef.current = window.setInterval(() => {
      void fetchSnapshot();
    }, 1200);

    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, []);

  const leader = snapshot?.leaderboard?.[0];
  const totalTrades = snapshot?.leaderboard?.reduce((s, b) => s + b.trades, 0) ?? 0;
  const selectedStageType = snapshot?.stages.find((s) => s.id === snapshot?.selectedStageId)?.type || "-";
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

        <h2 style={{ marginTop: 12 }}>Options</h2>
        <div className="btns">
          <label htmlFor="stage">스테이지</label>
          <select id="stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {(snapshot?.stages || []).map((s) => (
              <option key={s.id} value={s.id}>{s.type}</option>
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
          <button disabled={busy} onClick={() => sendAction("regenerate")}>스테이지 재생성</button>
        </div>

        <h2 style={{ marginTop: 12 }}>Bots ({snapshot?.botsCatalog.length || 0})</h2>
        <div className="list bot-list">
          {(snapshot?.botsCatalog || []).map((b) => (
            <div key={b.id} className="card">
              <div className="title">{b.name}</div>
              <div className="sub">{b.desc} · {b.inspiration}</div>
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

        <div className="chart-wrap" style={{ height: 260 }}>
          <svg width="100%" height="100%" viewBox="0 0 1000 260" preserveAspectRatio="none">
            {(() => {
              const pts = snapshot?.chartSeries || [];
              if (pts.length < 2) return null;
              const min = Math.min(...pts.map((p) => p.close));
              const max = Math.max(...pts.map((p) => p.close));
              const path = pts
                .map((p, i) => {
                  const x = (i / (pts.length - 1)) * 1000;
                  const y = 240 - ((p.close - min) / Math.max(1e-9, max - min)) * 220;
                  return `${i === 0 ? "M" : "L"}${x},${y}`;
                })
                .join(" ");
              return <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" />;
            })()}
          </svg>
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

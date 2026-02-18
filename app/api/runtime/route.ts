import { NextResponse } from "next/server";
import {
  getSnapshot,
  pauseRun,
  regenerateStages,
  resetRun,
  resumeRun,
  startRun,
  stopRun,
  updateOptions
} from "@/lib/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  if (action === "start") {
    await startRun({ stageId: body.stageId, speed: body.speed });
  } else if (action === "pause") {
    await pauseRun();
  } else if (action === "resume") {
    await resumeRun();
  } else if (action === "stop") {
    await stopRun();
  } else if (action === "reset") {
    await resetRun();
  } else if (action === "options") {
    await updateOptions({ stageId: body.stageId, speed: body.speed });
  } else if (action === "regenerate") {
    await regenerateStages();
  }

  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot);
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { Asset, Job, JobType } from "@/lib/types";

export type JobResult = { job: Job; assets: Asset[] };

type Props = {
  type: JobType;
  projectId: string | null;
  buildInput: () => Record<string, unknown> | { error: string };
  credits: number;
  steps: Record<string, string>; // step → 표시 문구
  renderResult: (r: JobResult) => React.ReactNode;
  buttonLabel?: string;
  disabled?: boolean;
  initial?: JobResult | null;
};

const POLL_MS = 4000;

export function JobRunner({ type, projectId, buildInput, credits, steps, renderResult, buttonLabel, disabled, initial }: Props) {
  const [result, setResult] = useState<JobResult | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number>(0);

  async function poll(id: string) {
    try {
      const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      const j = (await r.json()) as JobResult & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "상태 확인 실패");
      setResult(j);
      if (j.job.status === "succeeded" || j.job.status === "failed") {
        setBusy(false);
        return;
      }
      timer.current = setTimeout(() => poll(id), POLL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function start() {
    setError(null);
    const input = buildInput();
    if ("error" in input) { setError(String(input.error)); return; }
    setBusy(true);
    setResult(null);
    startedAt.current = Date.now();
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, projectId, input }) });
      const j = (await r.json()) as { job?: Job; error?: string };
      if (!r.ok || !j.job) throw new Error(j.error ?? "작업을 시작할 수 없습니다.");
      setResult({ job: j.job, assets: [] });
      if (j.job.status === "succeeded" || j.job.status === "failed") { await poll(j.job.id); return; }
      timer.current = setTimeout(() => poll(j.job!.id), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const job = result?.job;
  const running = job && (job.status === "queued" || job.status === "running");
  const stepLabel = job?.step ? steps[job.step] ?? steps[job.step.split(":")[0]] ?? job.step : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={start} disabled={busy || disabled} className="btn-primary">
          {busy ? "생성 중…" : buttonLabel ?? "생성하기"}
        </button>
        <span className="text-sm text-muted">ro {credits} 차감 · 실패 시 자동 환불</span>
      </div>
      {error && <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>}

      {running && (
        <div className="card flex items-center gap-4">
          <span className="h-3 w-3 animate-pulse rounded-full bg-brand" />
          <div>
            <p className="font-medium">{stepLabel || "준비 중"}</p>
            <p className="hint">AI가 작업 중입니다. 이 화면을 열어 두세요. 보통 1~3분 걸립니다.</p>
          </div>
        </div>
      )}
      {job?.status === "failed" && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <b>실패:</b> {job.error ?? "알 수 없는 오류"} · ro는 환불되었습니다.
        </div>
      )}
      {job?.status === "succeeded" && result && renderResult(result)}
    </div>
  );
}

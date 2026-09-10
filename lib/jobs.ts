import { adminClient } from "@/lib/supabase/admin";
import { addCredits, deductCredits, InsufficientCredits } from "@/lib/credits";
import type { AssetKind, Job, JobType, Project } from "@/lib/types";
import { getPipeline } from "@/lib/pipelines";

export type JobContext = {
  job: Job;
  project: Project | null;
  orgName: string | null;
  /** 진행 상태 갱신 (step·output 병합) */
  update: (patch: { step?: string; output?: Record<string, unknown>; provider_task_ids?: Record<string, string> }) => Promise<Job>;
  /** 파일을 outputs 버킷에 저장하고 assets에 기록 */
  saveAsset: (p: { kind: AssetKind; ext: string; data: Buffer; mime: string; meta?: Record<string, unknown> }) => Promise<{ id: string; storage_path: string }>;
  /** 업로드된 프로젝트 사진을 읽어온다 */
  loadPhotos: () => Promise<{ data: Buffer; name: string; mime: string }[]>;
};

/** 파이프라인 단계 실행 결과: 다음 step 또는 완료 */
export type StepResult = { next: string } | { done: true };

export type Pipeline = {
  firstStep: string;
  /** 단계 실행. 예외를 던지면 job 실패 + 바나나 환불 */
  run: (ctx: JobContext, step: string) => Promise<StepResult>;
};

const LOCK_SECONDS = 150;

export class SubscriptionRequired extends Error {
  constructor() {
    super("구독 중인 회원만 사용할 수 있습니다. 구독을 시작해 주세요.");
    this.name = "SubscriptionRequired";
  }
}

export async function createJob(p: { userId: string; type: JobType; projectId: string | null; input: Record<string, unknown>; credits: number }): Promise<Job> {
  const db = adminClient();
  // 구독은 게이트가 아니다: 충전 바나나만으로도 사용 가능. 잔고 부족은 deduct_credits가 판단.
  const { data: job, error } = await db
    .from("jobs")
    .insert({ user_id: p.userId, type: p.type, project_id: p.projectId, input: p.input, credits: p.credits, status: "queued", step: getPipeline(p.type).firstStep })
    .select("*")
    .single();
  if (error) throw error;

  try {
    await deductCredits(p.userId, p.credits, `job:${p.type}`, job.id);
  } catch (e) {
    await db.from("jobs").update({ status: "failed", error: e instanceof InsufficientCredits ? e.message : String(e), finished_at: new Date().toISOString() }).eq("id", job.id);
    throw e;
  }
  return job as Job;
}

/** 폴링 시 호출: 잠금을 잡고 현재 단계를 한 번 실행 */
export async function advanceJob(jobId: string, userId: string): Promise<Job> {
  const db = adminClient();
  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single();
  if (!job) throw new Error("작업을 찾을 수 없습니다.");
  const j = job as Job;
  if (j.status === "succeeded" || j.status === "failed") return j;

  // 잠금: lock_until이 미래면 다른 요청이 실행 중
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_SECONDS * 1000).toISOString();
  const { data: locked } = await db
    .from("jobs")
    .update({ status: "running", lock_until: lockUntil })
    .eq("id", jobId)
    .or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  if (!locked) return j; // 다른 요청이 처리 중 → 현재 상태 반환

  let current = locked as Job;
  const [{ data: project }, { data: profile }] = await Promise.all([
    current.project_id ? db.from("projects").select("*").eq("id", current.project_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("profiles").select("org_name").eq("id", userId).single(),
  ]);

  const ctx: JobContext = {
    job: current,
    project: (project as Project | null) ?? null,
    orgName: profile?.org_name ?? null,
    update: async (patch) => {
      const merged = {
        ...(patch.step !== undefined ? { step: patch.step } : {}),
        ...(patch.output ? { output: { ...current.output, ...patch.output } } : {}),
        ...(patch.provider_task_ids ? { provider_task_ids: { ...current.provider_task_ids, ...patch.provider_task_ids } } : {}),
      };
      const { data } = await db.from("jobs").update(merged).eq("id", jobId).select("*").single();
      current = data as Job;
      ctx.job = current;
      return current;
    },
    saveAsset: async ({ kind, ext, data, mime, meta }) => {
      const path = `${userId}/${jobId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage.from("outputs").upload(path, data, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`파일 저장 실패: ${upErr.message}`);
      const { data: asset, error } = await db
        .from("assets")
        .insert({ user_id: userId, job_id: jobId, kind, storage_path: path, mime, size: data.length, meta: meta ?? {} })
        .select("id, storage_path")
        .single();
      if (error) throw error;
      return asset;
    },
    loadPhotos: async () => {
      const paths = (project as Project | null)?.photos ?? [];
      const out: { data: Buffer; name: string; mime: string }[] = [];
      for (const p of paths.slice(0, 3)) {
        const { data } = await db.storage.from("uploads").download(p);
        if (!data) continue;
        out.push({ data: Buffer.from(await data.arrayBuffer()), name: p.split("/").pop() ?? "photo.jpg", mime: p.endsWith(".png") ? "image/png" : "image/jpeg" });
      }
      return out;
    },
  };

  try {
    const result = await getPipeline(current.type).run(ctx, current.step ?? getPipeline(current.type).firstStep);
    if ("done" in result) {
      const { data } = await db.from("jobs").update({ status: "succeeded", step: "done", lock_until: null, finished_at: new Date().toISOString() }).eq("id", jobId).select("*").single();
      return data as Job;
    }
    const { data } = await db.from("jobs").update({ step: result.next, lock_until: null }).eq("id", jobId).select("*").single();
    return data as Job;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[job ${jobId}] step ${current.step} failed:`, e);
    await failJob(current, message);
    const { data } = await db.from("jobs").select("*").eq("id", jobId).single();
    return data as Job;
  }
}

export async function failJob(job: Job, message: string) {
  const db = adminClient();
  await db.from("jobs").update({ status: "failed", error: message, lock_until: null, finished_at: new Date().toISOString() }).eq("id", job.id);
  if (job.credits > 0) {
    try {
      await addCredits(job.user_id, job.credits, `refund:${job.type}`, job.id);
    } catch (e) {
      console.error("refund failed", e);
    }
  }
}

/** 클라이언트에 보낼 작업 + 자산 목록 */
export async function jobWithAssets(jobId: string, userId: string) {
  const db = adminClient();
  const [{ data: job }, { data: assets }] = await Promise.all([
    db.from("jobs").select("*").eq("id", jobId).eq("user_id", userId).single(),
    db.from("assets").select("*").eq("job_id", jobId).order("created_at"),
  ]);
  return { job: job as Job, assets: assets ?? [] };
}

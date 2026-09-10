import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { advanceJob, createJob } from "@/lib/jobs";
import { costFor, getCosts, InsufficientCredits } from "@/lib/credits";
import { checkPII } from "@/lib/pii";
import type { JobType } from "@/lib/types";

export const maxDuration = 300;

const bodySchema = z.object({
  type: z.enum(["document", "newsletter", "cardnews", "promo_video", "music_video"]),
  projectId: z.string().uuid().nullable().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  const { type, projectId, input } = parsed.data;

  // 개인정보 차단
  const text = JSON.stringify(input);
  const pii = checkPII(text);
  if (pii.blocked) return NextResponse.json({ error: pii.warnings[0] }, { status: 400 });

  if (projectId) {
    const { data: proj } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (!proj) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const costs = await getCosts();
  const pages = typeof input.pages === "number" ? input.pages : Number(input.pages) || undefined;
  const credits = costFor(type as JobType, costs, { pages });

  try {
    const job = await createJob({ userId: user.id, type: type as JobType, projectId: projectId ?? null, input, credits });
    // 첫 단계를 바로 실행 (응답 지연을 줄이기 위해 결과와 무관하게 job 반환)
    const advanced = await advanceJob(job.id, user.id);
    return NextResponse.json({ job: advanced });
  } catch (e) {
    const status = e instanceof InsufficientCredits ? 402 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "작업을 시작할 수 없습니다." }, { status });
  }
}

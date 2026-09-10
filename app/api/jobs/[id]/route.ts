import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { advanceJob, jobWithAssets } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 폴링: 진행 중이면 다음 단계를 실행하고 현재 상태와 결과 파일을 돌려준다 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    await advanceJob(id, user.id);
    const result = await jobWithAssets(id, user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "작업 상태를 확인할 수 없습니다." }, { status: 500 });
  }
}

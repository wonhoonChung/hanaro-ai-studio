import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activateSubscription, customerKeyFor } from "@/lib/billing";

export const maxDuration = 60;

/** 토스 결제창에서 카드 등록 성공 → successUrl로 리다이렉트됨 (?customerKey=&authKey=) */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const authKey = searchParams.get("authKey");
  const customerKey = searchParams.get("customerKey");
  const fail = (msg: string) => NextResponse.redirect(`${origin}/studio/billing?error=${encodeURIComponent(msg)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/studio/billing`);
  if (!authKey || !customerKey) return fail("결제 정보가 올바르지 않습니다.");
  if (customerKey !== customerKeyFor(user.id)) return fail("결제 요청자가 일치하지 않습니다.");

  try {
    await activateSubscription(user.id, authKey);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "구독 활성화에 실패했습니다.");
  }
  return NextResponse.redirect(`${origin}/studio/billing?ok=1`);
}

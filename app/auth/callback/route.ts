import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/studio";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("인증 링크가 만료되었거나 잘못되었습니다.")}`);
  }
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/studio"}`);
}

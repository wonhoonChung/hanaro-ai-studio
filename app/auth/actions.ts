"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function safeNext(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/studio";
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  const next = safeNext(formData.get("next"));
  if (error) redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}`);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const org = String(formData.get("org_name") ?? "").trim();
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("비밀번호는 8자 이상이어야 합니다.")}`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, org_name: org }, emailRedirectTo: `${site()}/auth/callback` },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  if (data.session) {
    // 이메일 확인이 꺼진 프로젝트: 바로 로그인됨
    if (org && data.user) await supabase.from("profiles").update({ org_name: org }).eq("id", data.user.id);
    redirect("/studio");
  }
  redirect("/login?message=" + encodeURIComponent("가입 완료. 이메일의 인증 링크를 누른 뒤 로그인하세요."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${site()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent("구글 로그인을 시작할 수 없습니다.")}`);
  redirect(data.url);
}

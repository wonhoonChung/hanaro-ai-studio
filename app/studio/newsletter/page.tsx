import { requireProfile, getSubscription, isSubscribed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCosts, costFor } from "@/lib/credits";
import type { Project } from "@/lib/types";
import { NewsletterClient } from "./NewsletterClient";

export const metadata = { title: "뉴스레터" };

export default async function NewsletterPage({ searchParams }: PageProps<"/studio/newsletter">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [sub, costs, supabase] = await Promise.all([getSubscription(profile.id), getCosts(), createClient()]);
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];
  const preselect = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">뉴스레터</h1>
        <p className="mt-1 text-sm text-muted">5섹션 황금 구조(인사·메인·알짜정보·조합원 이야기·행동 유도) 원고와 카톡 전송용 이미지 1장. SNS는 스쳐가지만 카톡은 도착합니다.</p>
      </div>
      <NewsletterClient projects={projects} preselect={preselect} credits={costFor("newsletter", costs)} subscribed={isSubscribed(sub)} />
    </div>
  );
}

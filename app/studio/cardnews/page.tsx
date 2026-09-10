import { requireProfile, getSubscription, isSubscribed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCosts } from "@/lib/credits";
import type { Project } from "@/lib/types";
import { CardnewsClient } from "./CardnewsClient";

export const metadata = { title: "카드뉴스" };

export default async function CardnewsPage({ searchParams }: PageProps<"/studio/cardnews">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [sub, costs, supabase] = await Promise.all([getSubscription(profile.id), getCosts(), createClient()]);
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];
  const preselect = typeof sp.project === "string" ? sp.project : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">카드뉴스</h1>
        <p className="mt-1 text-sm text-muted">첫 장은 후크, 마지막 장은 행동 유도. 스타일 사전 5종 중 하나로 3~6장을 만듭니다.</p>
      </div>
      <CardnewsClient projects={projects} preselect={preselect} perPage={costs.cardnews_page} subscribed={isSubscribed(sub)} />
    </div>
  );
}

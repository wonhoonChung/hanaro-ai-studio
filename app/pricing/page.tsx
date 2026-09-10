import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, supabaseConfigured } from "@/lib/auth";
import { COST_LABEL, DEFAULT_COSTS } from "@/lib/credits";
import { SiteHeader } from "@/components/SiteHeader";
import type { PlanSettings } from "@/lib/types";

export const metadata = { title: "요금 안내" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const profile = await getProfile();
  let plan: PlanSettings | null = null;
  if (supabaseConfigured()) {
    const { data } = await adminClient().from("plan_settings").select("*").eq("id", 1).single();
    plan = data as PlanSettings | null;
  }
  const p = plan ?? { name: "하나로AI스튜디오 월 정액", price_krw: 99000, monthly_credits: 200, credit_costs: DEFAULT_COSTS };
  const costs = { ...DEFAULT_COSTS, ...p.credit_costs };

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto max-w-4xl px-6 py-14 space-y-10">
        <div className="text-center">
          <h1 className="text-3xl font-black">요금 안내</h1>
          <p className="mt-2 text-muted">요금제는 하나입니다. 월 정액으로 시작하고, 크레딧으로 5종 산출물을 만듭니다.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="card border-brand/40">
            <h2 className="font-semibold">{p.name}</h2>
            <p className="text-4xl font-black mt-2">{p.price_krw.toLocaleString()}<span className="text-base font-medium text-muted">원 / 월</span></p>
            <ul className="mt-4 space-y-1.5 text-sm">
              <li>· 매월 {p.monthly_credits} 크레딧 지급 (이월 없음)</li>
              <li>· Claude · GPT Image · Seedance · ElevenLabs Music 최고 품질 모델</li>
              <li>· 결과물 보관함, 한글(HWPX) 다운로드, mp4·png 다운로드</li>
              <li>· 언제든 해지, 남은 크레딧은 해지 후에도 사용 가능</li>
            </ul>
            <Link href={profile ? "/studio/billing" : "/signup"} className="btn-primary mt-6 w-full">
              {profile ? "구독 시작하기" : "가입하고 시작하기"}
            </Link>
          </section>
          <section className="card">
            <h2 className="font-semibold mb-3">크레딧 단가</h2>
            <table className="w-full text-sm">
              <tbody>
                {Object.keys(COST_LABEL).map((k) => (
                  <tr key={k} className="border-t border-line first:border-0">
                    <td className="py-2">{COST_LABEL[k]}</td>
                    <td className="py-2 text-right font-semibold">{costs[k]} 크레딧</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint mt-3">예) {p.monthly_credits} 크레딧이면 홍보영상 {Math.floor(p.monthly_credits / costs.promo_video)}편 또는 뉴스레터 {Math.floor(p.monthly_credits / costs.newsletter)}건을 만들 수 있습니다.</p>
          </section>
        </div>
      </main>
    </>
  );
}

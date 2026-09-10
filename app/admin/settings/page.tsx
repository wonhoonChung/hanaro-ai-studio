import { adminClient } from "@/lib/supabase/admin";
import { Alert } from "@/components/Alert";
import { COST_LABEL, DEFAULT_COSTS } from "@/lib/credits";
import type { PlanSettings } from "@/lib/types";
import { savePlanSettings } from "./actions";

export const metadata = { title: "관리자 · 설정" };
export const dynamic = "force-dynamic";

export default async function AdminSettings({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const { data } = await adminClient().from("plan_settings").select("*").eq("id", 1).single();
  const p = data as PlanSettings;
  const costs = { ...DEFAULT_COSTS, ...p.credit_costs };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-bold">요금·크레딧 설정</h1><p className="mt-1 text-sm text-muted">변경 즉시 요금 안내와 크레딧 차감에 반영됩니다. 기존 구독자의 다음 결제 금액도 이 값으로 청구됩니다.</p></div>
      {sp.ok && <Alert kind="success">저장되었습니다.</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}
      <form action={savePlanSettings} className="card space-y-5">
        <div><label className="label">요금제 이름</label><input name="name" defaultValue={p.name} className="input" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">월 요금 (원)</label><input name="price_krw" type="number" min={0} defaultValue={p.price_krw} className="input" required /></div>
          <div><label className="label">월 크레딧</label><input name="monthly_credits" type="number" min={0} defaultValue={p.monthly_credits} className="input" required /></div>
        </div>
        <fieldset className="space-y-3">
          <legend className="label">크레딧 단가</legend>
          {Object.keys(COST_LABEL).map((k) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <span className="text-sm">{COST_LABEL[k]}</span>
              <input name={k} type="number" min={0} defaultValue={costs[k]} className="input w-28" required />
            </div>
          ))}
        </fieldset>
        <div className="flex justify-end"><button className="btn-primary">저장</button></div>
      </form>
    </div>
  );
}

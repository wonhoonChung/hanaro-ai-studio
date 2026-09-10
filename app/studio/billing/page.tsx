import { requireProfile, getSubscription } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { customerKeyFor } from "@/lib/billing";
import { Alert } from "@/components/Alert";
import { SubscribeButton } from "./BillingClient";
import type { Payment, PlanSettings } from "@/lib/types";

export const metadata = { title: "구독·결제" };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "-");

export default async function BillingPage({ searchParams }: PageProps<"/studio/billing">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const sub = await getSubscription(profile.id);
  const supabase = await createClient();
  const [{ data: plan }, { data: payments }] = await Promise.all([
    supabase.from("plan_settings").select("*").eq("id", 1).single(),
    supabase.from("payments").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(24),
  ]);
  const p = plan as PlanSettings;
  const active = sub?.status === "active";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">구독·결제</h1>
        <p className="mt-1 text-sm text-muted">월 정액 구독으로 5종 제작실을 모두 사용합니다. 매달 결제일에 크레딧이 {p.monthly_credits}으로 새로 채워집니다.</p>
      </div>

      {sp.ok && <Alert kind="success">구독이 시작되었습니다. 크레딧 {p.monthly_credits}이 지급되었습니다.</Alert>}
      {sp.canceled && <Alert kind="info">구독이 해지되었습니다. 남은 크레딧은 계속 쓸 수 있고, 다음 결제는 진행되지 않습니다.</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}

      <section className="card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="text-3xl font-black mt-1">
              {p.price_krw.toLocaleString()}<span className="text-base font-medium text-muted">원 / 월</span>
            </p>
            <p className="text-sm text-muted mt-1">월 {p.monthly_credits} 크레딧 · 문서·뉴스레터·카드뉴스·홍보영상·뮤직비디오</p>
          </div>
          <span className={`badge ${active ? "bg-brand-soft text-brand-deep" : sub?.status === "past_due" ? "bg-danger-soft text-danger" : "bg-gray-100 text-muted"}`}>
            {active ? "구독 중" : sub?.status === "past_due" ? "결제 실패" : sub?.status === "canceled" ? "해지됨" : "미구독"}
          </span>
        </div>

        {active || sub?.status === "past_due" ? (
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><p className="text-muted">등록 카드</p><p className="font-medium">{sub?.card_company ?? "-"} {sub?.card_number_masked ?? ""}</p></div>
            <div><p className="text-muted">시작일</p><p className="font-medium">{fmtDate(sub?.started_at ?? null)}</p></div>
            <div><p className="text-muted">다음 결제일</p><p className="font-medium">{fmtDate(sub?.next_billing_at ?? null)}</p></div>
          </div>
        ) : null}

        {sub?.status === "past_due" && (
          <Alert kind="warn">최근 자동결제에 실패했습니다. 카드를 다시 등록하면 즉시 결제되고 구독이 재개됩니다.</Alert>
        )}

        {!active && (
          <SubscribeButton customerKey={customerKeyFor(profile.id)} email={profile.email} name={profile.name ?? ""} priceKrw={p.price_krw} planName={p.name} />
        )}
        {active && (
          <form action="/api/billing/cancel" method="post">
            <button type="submit" className="btn-danger">구독 해지</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">결제 내역</h2>
        {(payments as Payment[] | null)?.length ? (
          <table className="w-full text-sm">
            <thead className="text-muted text-left"><tr><th className="py-1.5">일시</th><th>주문번호</th><th>금액</th><th>상태</th></tr></thead>
            <tbody>
              {(payments as Payment[]).map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="py-2">{new Date(x.created_at).toLocaleString("ko-KR")}</td>
                  <td className="font-mono text-xs">{x.order_id}</td>
                  <td>{x.amount.toLocaleString()}원</td>
                  <td>{x.status === "DONE" ? "완료" : x.status === "FAILED" ? "실패" : x.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">아직 결제 내역이 없습니다.</p>
        )}
      </section>
    </div>
  );
}

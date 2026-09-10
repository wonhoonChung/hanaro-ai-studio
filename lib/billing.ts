import { adminClient } from "@/lib/supabase/admin";
import { chargeBillingKey, issueBillingKey } from "@/lib/providers/toss";
import { setCredits } from "@/lib/credits";
import type { PlanSettings, Profile, Subscription } from "@/lib/types";

/** 한 달 뒤, 말일 보정 (1/31 → 2/28) */
export function nextBillingDate(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export const makeOrderId = (userId: string) => `sub_${userId.replace(/-/g, "").slice(0, 8)}_${Date.now()}`;
export const customerKeyFor = (userId: string) => `cust_${userId}`;

async function loadPlan(): Promise<PlanSettings> {
  const { data, error } = await adminClient().from("plan_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as PlanSettings;
}

/** 결제창에서 카드 등록 완료(authKey) → 빌링키 발급 → 첫 결제 → 구독 활성화 + 크레딧 지급 */
export async function activateSubscription(userId: string, authKey: string) {
  const db = adminClient();
  const customerKey = customerKeyFor(userId);
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).single();
  const plan = await loadPlan();
  const bk = await issueBillingKey(authKey, customerKey);
  const orderId = makeOrderId(userId);
  const pay = await chargeBillingKey({
    billingKey: bk.billingKey,
    customerKey,
    amount: plan.price_krw,
    orderId,
    orderName: plan.name,
    customerEmail: (profile as Profile).email,
    customerName: (profile as Profile).name ?? undefined,
  });
  const now = new Date();
  const { data: sub, error } = await db
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        status: "active",
        customer_key: customerKey,
        billing_key: bk.billingKey,
        card_company: bk.card?.company ?? null,
        card_number_masked: bk.card?.number ?? null,
        started_at: now.toISOString(),
        next_billing_at: nextBillingDate(now).toISOString(),
        canceled_at: null,
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  await db.from("payments").insert({
    user_id: userId,
    subscription_id: sub.id,
    order_id: orderId,
    amount: plan.price_krw,
    status: pay.status,
    toss_payment_key: pay.paymentKey,
    raw: pay,
    paid_at: now.toISOString(),
  });
  await setCredits(userId, plan.monthly_credits, "subscription_start");
}

type DueRow = Subscription & { profiles: { email: string; name: string | null } | null };

/** Cron: 결제일이 지난 활성 구독을 청구하고 크레딧을 월 크레딧으로 재설정 */
export async function runMonthlyBilling() {
  const db = adminClient();
  const plan = await loadPlan();
  const { data: due, error } = await db
    .from("subscriptions")
    .select("*, profiles(email,name)")
    .eq("status", "active")
    .lte("next_billing_at", new Date().toISOString());
  if (error) throw error;

  const results: { user_id: string; ok: boolean; error?: string }[] = [];
  for (const s of (due ?? []) as DueRow[]) {
    const orderId = makeOrderId(s.user_id);
    try {
      if (!s.billing_key) throw new Error("빌링키 없음");
      const pay = await chargeBillingKey({
        billingKey: s.billing_key,
        customerKey: s.customer_key,
        amount: plan.price_krw,
        orderId,
        orderName: plan.name,
        customerEmail: s.profiles?.email,
        customerName: s.profiles?.name ?? undefined,
      });
      const now = new Date();
      await db.from("payments").insert({
        user_id: s.user_id,
        subscription_id: s.id,
        order_id: orderId,
        amount: plan.price_krw,
        status: pay.status,
        toss_payment_key: pay.paymentKey,
        raw: pay,
        paid_at: now.toISOString(),
      });
      await db
        .from("subscriptions")
        .update({ next_billing_at: nextBillingDate(new Date(s.next_billing_at ?? now)).toISOString() })
        .eq("id", s.id);
      await setCredits(s.user_id, plan.monthly_credits, "subscription_renewal");
      results.push({ user_id: s.user_id, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from("payments").insert({
        user_id: s.user_id,
        subscription_id: s.id,
        order_id: orderId,
        amount: plan.price_krw,
        status: "FAILED",
        raw: { message },
      });
      await db.from("subscriptions").update({ status: "past_due" }).eq("id", s.id);
      results.push({ user_id: s.user_id, ok: false, error: message });
    }
  }
  return results;
}

export async function cancelSubscription(userId: string) {
  const { error } = await adminClient()
    .from("subscriptions")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

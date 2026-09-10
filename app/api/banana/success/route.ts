import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { confirmPayment } from "@/lib/providers/toss";

export const maxDuration = 60;

/** 토스 결제창 성공 리다이렉트 (?paymentKey=&orderId=&amount=) → 서버 승인 → ro 충전 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const paymentKey = searchParams.get("paymentKey");
  const orderId = searchParams.get("orderId");
  const amount = Number(searchParams.get("amount"));
  const fail = (msg: string) => NextResponse.redirect(`${origin}/studio/billing?error=${encodeURIComponent(msg)}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/studio/billing`);
  if (!paymentKey || !orderId || !Number.isFinite(amount)) return fail("결제 정보가 올바르지 않습니다.");

  const db = adminClient();
  const { data: order } = await db.from("banana_purchases").select("*").eq("order_id", orderId).eq("user_id", user.id).maybeSingle();
  if (!order) return fail("주문을 찾을 수 없습니다.");
  if (order.status === "paid") return NextResponse.redirect(`${origin}/studio/billing?charged=${order.bananas}`);
  if (order.amount !== amount) {
    await db.from("banana_purchases").update({ status: "failed", raw: { message: "금액 불일치", amount } }).eq("id", order.id);
    return fail("결제 금액이 주문과 다릅니다.");
  }

  try {
    const pay = await confirmPayment({ paymentKey, orderId, amount });
    const { error } = await db.rpc("confirm_banana_purchase", { p_order_id: orderId, p_payment_key: pay.paymentKey, p_raw: pay });
    if (error) throw error;
  } catch (e) {
    await db.from("banana_purchases").update({ status: "failed", raw: { message: String(e) } }).eq("id", order.id);
    return fail(e instanceof Error ? e.message : "결제 승인에 실패했습니다.");
  }
  return NextResponse.redirect(`${origin}/studio/billing?charged=${order.bananas}`);
}

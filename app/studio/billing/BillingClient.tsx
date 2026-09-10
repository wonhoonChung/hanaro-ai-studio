"use client";
import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

type Props = { customerKey: string; email: string; name: string; priceKrw: number; planName: string };

export function SubscribeButton({ customerKey, email, name, priceKrw, planName }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) throw new Error("결제 설정(NEXT_PUBLIC_TOSS_CLIENT_KEY)이 없습니다. 관리자에게 문의하세요.");
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });
      const origin = window.location.origin;
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/api/billing/success`,
        failUrl: `${origin}/studio/billing?error=${encodeURIComponent("카드 등록이 취소되었거나 실패했습니다.")}`,
        customerEmail: email,
        customerName: name || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제창을 열 수 없습니다.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={start} disabled={loading} className="btn-primary w-full text-base">
        {loading ? "결제창 여는 중…" : `${planName} 시작하기 · 월 ${priceKrw.toLocaleString()}원`}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="hint">카드 정보는 토스페이먼츠 결제창에서만 입력되며, 이 사이트에는 저장되지 않습니다.</p>
    </div>
  );
}

import { NextResponse } from "next/server";
import { runMonthlyBilling } from "@/lib/billing";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Vercel Cron (vercel.json) — 매일 KST 03:00. 결제일 지난 활성 구독을 청구. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runMonthlyBilling();
  return NextResponse.json({ ran_at: new Date().toISOString(), count: results.length, results });
}

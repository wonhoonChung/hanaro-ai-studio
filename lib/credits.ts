import type { JobType } from "@/lib/types";
import { adminClient } from "@/lib/supabase/admin";

export const DEFAULT_COSTS: Record<string, number> = {
  document: 1,
  newsletter: 2,
  cardnews_page: 1,
  promo_video: 20,
  music_video: 30,
};

export const COST_LABEL: Record<string, string> = {
  document: "문서(HWP) 1건",
  newsletter: "뉴스레터 1건 (원고+이미지)",
  cardnews_page: "카드뉴스 1장",
  promo_video: "홍보영상 30초",
  music_video: "뮤직비디오 1분",
};

/** 작업 종류·옵션에 따른 크레딧 단가 (순수 함수) */
export function costFor(type: JobType, costs: Record<string, number>, opts: { pages?: number } = {}): number {
  if (type === "cardnews") {
    const per = costs.cardnews_page ?? DEFAULT_COSTS.cardnews_page;
    return per * Math.max(1, opts.pages ?? 1);
  }
  return costs[type] ?? DEFAULT_COSTS[type];
}

export async function getCosts(): Promise<Record<string, number>> {
  const { data } = await adminClient().from("plan_settings").select("credit_costs").eq("id", 1).single();
  return { ...DEFAULT_COSTS, ...((data?.credit_costs as Record<string, number> | undefined) ?? {}) };
}

export class InsufficientCredits extends Error {
  constructor() {
    super("크레딧이 부족합니다. 구독 상태와 잔여 크레딧을 확인해 주세요.");
    this.name = "InsufficientCredits";
  }
}

export async function deductCredits(userId: string, amount: number, reason: string, jobId: string | null) {
  const { data, error } = await adminClient().rpc("deduct_credits", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
    p_job: jobId,
  });
  if (error) {
    if (error.message.includes("INSUFFICIENT_CREDITS")) throw new InsufficientCredits();
    throw error;
  }
  return data as number;
}

export async function addCredits(userId: string, amount: number, reason: string, jobId: string | null) {
  const { data, error } = await adminClient().rpc("add_credits", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
    p_job: jobId,
  });
  if (error) throw error;
  return data as number;
}

export async function setCredits(userId: string, amount: number, reason: string) {
  const { data, error } = await adminClient().rpc("set_credits", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw error;
  return data as number;
}

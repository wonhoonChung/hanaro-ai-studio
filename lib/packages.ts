import { adminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/auth";

export type BananaPackage = {
  id: string;
  name: string;
  bananas: number;
  price_krw: number;
  list_price_krw: number;
  description: string | null;
  sort: number;
  active: boolean;
};

/** 지니젠 벤치마크 패키지 (DB 없을 때 기본값) */
export const DEFAULT_PACKAGES: BananaPackage[] = [
  { id: "basic", name: "베이직", bananas: 120, price_krw: 10000, list_price_krw: 12000, description: "가장 인기 있는 패키지", sort: 1, active: true },
  { id: "value", name: "밸류", bananas: 625, price_krw: 50000, list_price_krw: 62500, description: "정기 사용자 추천", sort: 2, active: true },
  { id: "pro", name: "프로", bananas: 1300, price_krw: 100000, list_price_krw: 130000, description: "전문가용 바나나 패키지", sort: 3, active: true },
  { id: "business", name: "비즈니스", bananas: 6750, price_krw: 500000, list_price_krw: 675000, description: "기업·조합 단위 대용량", sort: 4, active: true },
  { id: "enterprise", name: "엔터프라이즈", bananas: 14300, price_krw: 1000000, list_price_krw: 1430000, description: "최상위 기업용", sort: 5, active: true },
];

export const perBanana = (p: BananaPackage) => Math.round(p.price_krw / p.bananas);
export const discountPct = (p: BananaPackage) => Math.round((1 - p.price_krw / p.list_price_krw) * 100);

export async function getPackages(): Promise<BananaPackage[]> {
  if (!supabaseConfigured()) return DEFAULT_PACKAGES;
  const { data } = await adminClient().from("banana_packages").select("*").eq("active", true).order("sort");
  return data && data.length ? (data as BananaPackage[]) : DEFAULT_PACKAGES;
}

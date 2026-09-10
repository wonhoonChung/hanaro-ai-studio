import { describe, it, expect } from "vitest";
import { DEFAULT_PACKAGES, perBanana, discountPct } from "@/lib/packages";
import { BANANA_KRW, DEFAULT_COSTS, totalBananas } from "@/lib/credits";

describe("ro 패키지 (지니젠 벤치마크)", () => {
  it("정가 1ro 100원", () => {
    expect(BANANA_KRW).toBe(100);
    for (const p of DEFAULT_PACKAGES) expect(p.list_price_krw).toBe(p.bananas * BANANA_KRW);
  });
  it("ro당 단가와 할인율이 벤치마크와 일치", () => {
    const table = { basic: [83, 17], value: [80, 20], pro: [77, 23], business: [74, 26], enterprise: [70, 30] } as const;
    for (const p of DEFAULT_PACKAGES) {
      const [per, pct] = table[p.id as keyof typeof table];
      expect(perBanana(p)).toBe(per);
      expect(discountPct(p)).toBe(pct);
    }
  });
  it("베이직 120B로 뉴스레터 15건, 프로 1,300B로 홍보영상 23편", () => {
    expect(Math.floor(120 / DEFAULT_COSTS.newsletter)).toBe(15);
    expect(Math.floor(1300 / DEFAULT_COSTS.promo_video)).toBe(23);
    expect(Math.floor(1300 / DEFAULT_COSTS.music_video)).toBe(11);
  });
  it("총 잔여 = 월 지급분 + 충전분", () => {
    expect(totalBananas({ credits: 100, banana_purchased: 30 })).toBe(130);
  });
});

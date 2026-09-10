import { describe, it, expect } from "vitest";
import { costFor, DEFAULT_COSTS } from "@/lib/credits";

describe("costFor", () => {
  it("단일 작업 단가", () => {
    expect(costFor("document", DEFAULT_COSTS)).toBe(3);
    expect(costFor("newsletter", DEFAULT_COSTS)).toBe(8);
    expect(costFor("promo_video", DEFAULT_COSTS)).toBe(55);
    expect(costFor("music_video", DEFAULT_COSTS)).toBe(110);
  });

  it("카드뉴스는 장수 배수", () => {
    expect(costFor("cardnews", DEFAULT_COSTS, { pages: 4 })).toBe(20);
    expect(costFor("cardnews", DEFAULT_COSTS)).toBe(5);
    expect(costFor("cardnews", DEFAULT_COSTS, { pages: 0 })).toBe(5);
  });

  it("관리자 단가 덮어쓰기", () => {
    expect(costFor("newsletter", { ...DEFAULT_COSTS, newsletter: 5 })).toBe(5);
    expect(costFor("cardnews", { ...DEFAULT_COSTS, cardnews_page: 2 }, { pages: 3 })).toBe(6);
  });

  it("단가가 빠져 있으면 기본값", () => {
    expect(costFor("promo_video", {})).toBe(55);
  });
});

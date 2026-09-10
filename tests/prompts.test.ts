import { describe, it, expect } from "vitest";
import { newsletterImagePrompt, newsletterUserPrompt, newsletterOutputSchema } from "@/lib/prompts/newsletter";
import { cardnewsImagePrompt, CARD_STYLES, cardnewsUserPrompt } from "@/lib/prompts/cardnews";
import { documentUserPrompt, documentOutputSchema } from "@/lib/prompts/document";
import type { Project } from "@/lib/types";

const project: Project = {
  id: "p1", user_id: "u1", name: "추석", what: "안성배 추석 선물세트 예약", when_text: "9월 20일까지",
  where_text: "하나로마트 본점", audience: "60대 조합원", cta: "031-000-0000 전화 예약", photos: [], created_at: "",
};

describe("newsletter prompts", () => {
  it("이미지 프롬프트에 농협 초록·3:4·한글 정확 조건과 문구가 들어간다", () => {
    const p = newsletterImagePrompt({ headline: "추석 선물세트", lines: ["안성배 5kg", "조합원 10% 할인", "9월 20일까지"], footer: "☎ 031-000-0000", scene: "golden pear orchard" }, "안성농협");
    expect(p).toContain("#0B6B3A");
    expect(p).toContain("3:4");
    expect(p).toContain('"추석 선물세트"');
    expect(p).toContain("안성배 5kg");
    expect(p).toContain("안성농협");
    expect(p).toMatch(/정확히/);
  });
  it("원고 프롬프트에 CTA 목적이 들어간다", () => {
    const p = newsletterUserPrompt({ tone: "warm" }, project, "안성농협");
    expect(p).toContain("031-000-0000 전화 예약");
    expect(p).toContain("5섹션");
  });
  it("출력 스키마가 5섹션을 요구한다", () => {
    const r = newsletterOutputSchema.safeParse({ titles: ["a"], sections: { greeting: "g", main: "m", info: [], story: "s", cta: "c" }, image: { headline: "h", lines: [], footer: "f", scene: "s" } });
    expect(r.success).toBe(true);
    expect(newsletterOutputSchema.safeParse({ titles: [] }).success).toBe(false);
  });
});

describe("cardnews prompts", () => {
  it("스타일 사전 5종", () => {
    expect(Object.keys(CARD_STYLES)).toEqual(["poster", "film", "watercolor", "flat", "product"]);
  });
  it("장별 프롬프트에 페이지 번호·스타일·문구가 들어간다", () => {
    const p = cardnewsImagePrompt({ headline: "올해 배는 답니다", body: ["첫 수확 완료"], scene: "pear on tree" }, 0, 4, "film", null);
    expect(p).toContain("1/4");
    expect(p).toContain(CARD_STYLES.film.say);
    expect(p).toContain("올해 배는 답니다");
    expect(p).not.toContain("좌하단");
  });
  it("장수 조건이 프롬프트에 반영된다", () => {
    expect(cardnewsUserPrompt({ pages: 5, style: "poster" }, project, "안성농협")).toContain("정확히 5장");
  });
});

describe("document prompts", () => {
  it("공문 프롬프트에 수신·붙임·끝 규칙이 들어간다", () => {
    const p = documentUserPrompt({ docType: "official", title: "협조 요청", brief: "행사 안내", to: "각 지점장", attachments: "명단 1부" }, project, "안성농협");
    expect(p).toContain("수신: 각 지점장");
    expect(p).toContain("끝.");
    expect(p).toContain("붙임: 명단 1부");
  });
  it("출력 스키마가 블록 유니온을 검증한다", () => {
    const ok = documentOutputSchema.safeParse({ title: "t", summary: "s", meta: { to: null, from: null, date: null }, blocks: [{ type: "heading", text: "1." }, { type: "table", table: { header: ["a"], rows: [["1"]] } }], attachments: [], closing: "끝." });
    expect(ok.success).toBe(true);
    expect(documentOutputSchema.safeParse({ title: "t", blocks: [{ type: "image" }] }).success).toBe(false);
  });
});

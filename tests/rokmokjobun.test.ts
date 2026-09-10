import { describe, it, expect } from "vitest";
import { buildPrompt, projectContext, COMMON_RULES } from "@/lib/prompts/rokmokjobun";
import type { Project } from "@/lib/types";

const project: Project = {
  id: "p1", user_id: "u1", name: "추석", what: "안성배 추석 선물세트 예약", when_text: "9월 20일까지",
  where_text: "하나로마트 본점", audience: "60대 조합원", cta: "031-000-0000 전화 예약", photos: [], created_at: "",
};

describe("buildPrompt", () => {
  it("다섯 칸이 순서대로 들어간다", () => {
    const p = buildPrompt({ role: "편집장", context: ["소재: 배"], goal: "전화 예약", conditions: ["25자"], format: "600자" });
    const idx = ["[役 역할]", "[關 관련정보]", "[目 목적]", "[條 조건]", "[分 분량·형식]"].map((k) => p.indexOf(k));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it("공통 수칙(개인정보·과장 금지)이 항상 포함된다", () => {
    const p = buildPrompt({ role: "r", context: [], goal: "g", conditions: [], format: "f" });
    for (const rule of COMMON_RULES) expect(p).toContain(rule);
  });
  it("관련정보가 비어 있으면 關 칸을 생략한다", () => {
    const p = buildPrompt({ role: "r", context: ["  "], goal: "g", conditions: [], format: "f" });
    expect(p).not.toContain("[關 관련정보]");
  });
});

describe("projectContext", () => {
  it("워크시트 5칸을 문장으로", () => {
    const c = projectContext(project, "안성농협");
    expect(c[0]).toBe("우리 조합: 안성농협");
    expect(c).toContain("소재(무엇을): 안성배 추석 선물세트 예약");
    expect(c).toContain("원하는 행동(CTA): 031-000-0000 전화 예약");
    expect(c).toHaveLength(6);
  });
  it("프로젝트가 없으면 조합명만", () => {
    expect(projectContext(null, "안성농협")).toEqual(["우리 조합: 안성농협"]);
  });
});

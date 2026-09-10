import type { Project } from "@/lib/types";

/**
 * 역관목조분(役關目條分) — 강의안의 프롬프트 다섯 칸.
 *  役 역할: 누구로서?   關 관련정보: 무엇에 대해?   目 목적: 왜?
 *  條 조건: 어떤 규칙으로?   分 분량: 얼마나, 어떤 형식으로?
 */
export type FiveBox = {
  role: string;
  context: string[];
  goal: string;
  conditions: string[];
  format: string;
};

export const COMMON_RULES = [
  "존댓말, 쉬운 우리말. 한자어와 어려운 용어는 풀어 쓴다.",
  "과장·재촉 표현 금지(예: 마감임박, 파격, 역대급).",
  "조합원 개인정보(이름·계좌·개인 연락처)는 만들어내지 않는다. 사람은 '조합원'으로만 부른다.",
  "특정 후보·정치적 표현 금지. 사업과 서비스를 말하고 사람의 공으로 돌리지 않는다.",
  "날짜·금액·연락처는 입력받은 값만 쓰고 지어내지 않는다. 모르면 빈칸(____)으로 둔다.",
];

export function buildPrompt(box: FiveBox): string {
  const lines: string[] = [];
  lines.push(`[役 역할] ${box.role.trim()}`);
  const ctx = box.context.map((s) => s.trim()).filter(Boolean);
  if (ctx.length) lines.push(`[關 관련정보]\n${ctx.map((c) => `- ${c}`).join("\n")}`);
  lines.push(`[目 목적] ${box.goal.trim()}`);
  const cond = [...box.conditions, ...COMMON_RULES].map((s) => s.trim()).filter(Boolean);
  lines.push(`[條 조건]\n${cond.map((c) => `- ${c}`).join("\n")}`);
  lines.push(`[分 분량·형식] ${box.format.trim()}`);
  return lines.join("\n\n");
}

/** 프로젝트(소재 워크시트)를 關 관련정보 문장들로 변환 */
export function projectContext(p: Project | null | undefined, orgName?: string | null): string[] {
  const out: string[] = [];
  if (orgName) out.push(`우리 조합: ${orgName}`);
  if (!p) return out;
  out.push(`소재(무엇을): ${p.what}`);
  if (p.when_text) out.push(`언제: ${p.when_text}`);
  if (p.where_text) out.push(`어디서: ${p.where_text}`);
  if (p.audience) out.push(`대상: ${p.audience}`);
  if (p.cta) out.push(`원하는 행동(CTA): ${p.cta}`);
  return out;
}

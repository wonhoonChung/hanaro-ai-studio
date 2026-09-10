import { z } from "zod";
import { buildPrompt, projectContext } from "./rokmokjobun";
import type { Project } from "@/lib/types";

export const DOC_TYPES = {
  plan: { label: "기획서", desc: "사업·행사·홍보 기획서 (배경-목표-내용-일정-예산-기대효과)" },
  official: { label: "공문", desc: "수신처가 있는 협조·안내 공문 (관련-목적-내용-협조사항, 붙임, 끝.)" },
  report: { label: "보고서", desc: "내부 보고용 (개요-현황-문제점-개선방안-향후계획)" },
  press: { label: "보도자료", desc: "지역 언론 배포용 (제목-리드-본문-인용-문의처)" },
} as const;
export type DocType = keyof typeof DOC_TYPES;

export const documentInputSchema = z.object({
  docType: z.enum(["plan", "official", "report", "press"]),
  title: z.string().trim().min(2).max(120),
  brief: z.string().trim().min(5).max(3000),
  to: z.string().trim().max(120).optional(),
  from: z.string().trim().max(120).optional(),
  date: z.string().trim().max(40).optional(),
  attachments: z.string().trim().max(500).optional(),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;

export const documentOutputSchema = z.object({
  title: z.string(),
  summary: z.string().describe("문서 핵심을 2문장으로"),
  meta: z.object({
    to: z.string().nullable(),
    from: z.string().nullable(),
    date: z.string().nullable().describe("형식 2026. 9. 10."),
  }),
  blocks: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("heading"), text: z.string() }),
      z.object({ type: z.literal("paragraph"), text: z.string() }),
      z.object({ type: z.literal("bullets"), items: z.array(z.string()) }),
      z.object({ type: z.literal("table"), table: z.object({ header: z.array(z.string()), rows: z.array(z.array(z.string())) }) }),
    ]),
  ),
  attachments: z.array(z.string()),
  closing: z.string().describe("공문·보고서는 '끝.', 보도자료·기획서는 빈 문자열"),
});
export type DocumentOutput = z.infer<typeof documentOutputSchema>;

const STRUCTURE: Record<DocType, string> = {
  plan: "heading 순서: 1. 추진 배경 → 2. 목표 → 3. 주요 내용(세부 항목은 bullets) → 4. 추진 일정(table: 구분/일정/담당) → 5. 소요 예산(table: 항목/금액/비고, 금액을 모르면 '____') → 6. 기대 효과. closing은 빈 문자열.",
  official: "본문은 공문 항목 체계로 heading 없이 paragraph로 '1. 관련: …', '2. …하오니 …하여 주시기 바랍니다.' 형식. 세부 항목은 bullets에 '가. 일시: …', '나. 장소: …', '다. 대상: …', '라. 내용: …' 순서로. attachments에 붙임 목록. closing은 '끝.'.",
  report: "heading 순서: 1. 개요 → 2. 현황(가능하면 table) → 3. 문제점 → 4. 개선 방안(bullets) → 5. 향후 계획. closing은 '끝.'.",
  press: "첫 paragraph는 리드문(누가·무엇을·언제·어디서 한 문단). 이어서 본문 paragraph 2~3개, 관계자 인용 paragraph 1개('○○농협 관계자는 \"…\"라고 말했다.'), 마지막 heading '문의'와 paragraph에 연락처(입력값 없으면 '____'). closing은 빈 문자열.",
};

export function documentSystemPrompt() {
  return [
    "너는 농축협 현장 문서를 20년간 작성한 사무 담당자다. 행정안전부 행정업무운영 편람의 공문서 작성 원칙(정확·용이·성실·경제)을 따른다.",
    "출력은 반드시 지정된 JSON 스키마로만 한다. 날짜는 '2026. 9. 10.' 형식(월·일 앞 0 생략), 금액은 '45,000원' 형식.",
    "항목 기호는 1. 가. 1) 가) 순서. 표는 3~6열 이내로 간결하게. 문장은 짧고 명확하게, 한 문장 60자 이내.",
  ].join("\n");
}

export function documentUserPrompt(input: DocumentInput, project: Project | null, orgName: string | null) {
  const t = DOC_TYPES[input.docType];
  return buildPrompt({
    role: `농축협 ${t.label} 작성 담당자`,
    context: [
      ...projectContext(project, orgName),
      `문서 유형: ${t.label} — ${t.desc}`,
      `제목: ${input.title}`,
      `핵심 내용(작성자 메모): ${input.brief}`,
      input.to ? `수신: ${input.to}` : "",
      input.from ? `발신: ${input.from ?? orgName ?? ""}` : "",
      input.date ? `시행일: ${input.date}` : "",
      input.attachments ? `붙임: ${input.attachments}` : "",
    ],
    goal: `결재자와 수신처가 한 번 읽고 바로 이해·실행할 수 있는 ${t.label}를 완성한다.`,
    conditions: [STRUCTURE[input.docType], "메모에 없는 사실·수치·날짜는 지어내지 말고 '____'로 비워 둔다."],
    format: "JSON 스키마대로. blocks 8~20개, 전체 A4 1~2장 분량.",
  });
}

import { z } from "zod";
import { buildPrompt, projectContext } from "./rokmokjobun";
import type { Project } from "@/lib/types";

export const newsletterInputSchema = z.object({
  tone: z.enum(["warm", "trust", "lively"]).default("warm"),
  season: z.string().trim().max(60).optional(),
  extra: z.string().trim().max(1500).optional(),
  phone: z.string().trim().max(40).optional(),
});
export type NewsletterInput = z.infer<typeof newsletterInputSchema>;

export const TONES = {
  warm: { label: "따뜻하게", desc: "옆집 언니처럼 말 걸듯" },
  trust: { label: "믿음직하게", desc: "차분하고 정확하게" },
  lively: { label: "활기차게", desc: "밝고 경쾌하게" },
} as const;

export const newsletterOutputSchema = z.object({
  titles: z.array(z.string()).describe("제목 후보 3개, 각 20자 이내"),
  sections: z.object({
    greeting: z.string().describe("인사: 계절 1문장 + 조합 소식 1문장, 말 걸기"),
    main: z.string().describe("메인 기사: 이번 호의 단 하나, 3~5문장"),
    info: z.array(z.string()).describe("알짜 정보: 시세·일정·영농정보 짧은 목록 2~4개"),
    story: z.string().describe("조합원 이야기: 누가→무엇을→한마디 인용, 3문장 (실명 금지, '○○ 조합원')"),
    cta: z.string().describe("행동 유도: 딱 한 가지 행동, 기한과 이득을 숫자로"),
  }),
  image: z.object({
    headline: z.string().describe("이미지 맨 위 큰 제목, 12자 이내"),
    lines: z.array(z.string()).describe("핵심 내용 3줄, 각 16자 이내"),
    footer: z.string().describe("맨 아래 연락처와 기한 한 줄"),
    scene: z.string().describe("배경 장면 묘사(영문 40단어 이내, 사람 얼굴 없이)"),
  }),
});
export type NewsletterOutput = z.infer<typeof newsletterOutputSchema>;

export function newsletterSystemPrompt() {
  return [
    "너는 농축협 소식지를 10년 만든 편집장이다. 카톡 단톡방으로 보내는 뉴스레터를 쓴다.",
    "문장 5원칙: 한 문장 25자 이내 · 한 문단 3문장 이내 · 숫자는 굵게 읽히게 구체적으로 · 공문 서두('안녕하십니까, ○○농협입니다') 금지 · 마지막은 행동으로 끝맺기.",
    "출력은 지정된 JSON 스키마로만.",
  ].join("\n");
}

export function newsletterUserPrompt(input: NewsletterInput, project: Project, orgName: string | null) {
  return buildPrompt({
    role: "농축협 소식지 편집장",
    context: [
      ...projectContext(project, orgName),
      input.season ? `계절·시기: ${input.season}` : `발행 시기: ${new Date().getMonth() + 1}월`,
      input.extra ? `추가 정보: ${input.extra}` : "",
      input.phone ? `대표 연락처: ${input.phone}` : "",
      `말투: ${TONES[input.tone].label} — ${TONES[input.tone].desc}`,
    ],
    goal: `이 글을 읽은 조합원이 '${project.cta || "매장 방문 또는 전화 문의"}' 행동을 하게 만든다.`,
    conditions: ["5섹션 구조(인사→메인→알짜정보→조합원 이야기→행동 유도) 순서 엄수.", "메인 기사는 소재 한 가지만 다룬다."],
    format: "전체 600자 이내. 제목 후보 3개. image 필드는 카톡용 이미지 1장에 들어갈 문구(짧게).",
  });
}

/** gpt-image 프롬프트 — 강의안 '카톡 뉴스레터 1장' 프롬프트를 그대로 제품화 */
export function newsletterImagePrompt(img: NewsletterOutput["image"], orgName: string | null) {
  return [
    "카카오톡으로 전송하는 세로형(3:4) 농협 뉴스레터 포스터. 큰 제목이 있는 깔끔한 포스터 스타일.",
    "색상: 농협 초록(#0B6B3A) + 흰색 + 가을 골드(#C9A227). 밝고 신뢰감 있는 분위기.",
    `구성: 맨 위에 큰 제목 "${img.headline}" → 가운데 핵심 내용 3줄 "${img.lines.join('" / "')}" → 맨 아래 작은 글씨로 "${img.footer}".`,
    orgName ? `우상단에 작은 글씨로 "${orgName}".` : "",
    `배경 장면: ${img.scene}. 사람 얼굴은 넣지 않는다.`,
    "규격·조건: 글자는 멀리서도 읽히게 크고 또렷하게. 한글 문구는 위에 적힌 그대로 정확히 렌더링하고 오타·추가 문구 금지. 과장 문구 금지. 로고·브랜드 마크 금지.",
  ]
    .filter(Boolean)
    .join("\n");
}

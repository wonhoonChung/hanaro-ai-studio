import { z } from "zod";
import { buildPrompt, projectContext } from "./rokmokjobun";
import type { Project } from "@/lib/types";

/** 강의안 '스타일 사전' 5종 */
export const CARD_STYLES = {
  poster: { label: "포스터풍", say: "큰 제목이 있는 깔끔한 포스터 스타일, 밝고 신뢰감 있는", use: "행사 안내 · 카톡 뉴스레터 ★" },
  film: { label: "필름 사진", say: "따뜻한 필름 사진 스타일, 정겹고 따뜻한", use: "조합원 이야기 · 인물 코너" },
  watercolor: { label: "밝은 수채화", say: "밝은 수채화 스타일, 포근하고 계절감 있는", use: "계절 인사 · 명절 카드" },
  flat: { label: "플랫 일러스트", say: "깔끔한 플랫 일러스트, 명확하고 친근한", use: "정보 안내 · 인포그래픽" },
  product: { label: "실사 제품컷", say: "스튜디오 제품 사진처럼, 신선하고 고급스러운", use: "특산물 · 선물세트 홍보" },
} as const;
export type CardStyle = keyof typeof CARD_STYLES;

export const cardnewsInputSchema = z.object({
  pages: z.coerce.number().int().min(3).max(6).default(4),
  style: z.enum(["poster", "film", "watercolor", "flat", "product"]).default("poster"),
  extra: z.string().trim().max(1500).optional(),
});
export type CardnewsInput = z.infer<typeof cardnewsInputSchema>;

export const cardnewsOutputSchema = z.object({
  pages: z.array(
    z.object({
      headline: z.string().describe("장 제목, 12자 이내"),
      body: z.array(z.string()).describe("본문 1~2줄, 각 18자 이내"),
      scene: z.string().describe("이 장의 배경 장면 묘사(영문 40단어 이내, 사람 얼굴 없이)"),
    }),
  ),
});
export type CardnewsOutput = z.infer<typeof cardnewsOutputSchema>;

export function cardnewsSystemPrompt() {
  return [
    "너는 농축협 SNS 카드뉴스를 만드는 콘텐츠 기획자다.",
    "카드뉴스 구조: 1장 후크(궁금하게) → 중간 장들 핵심 정보(한 장에 한 메시지) → 마지막 장 행동 유도(기한·연락처).",
    "문장은 짧게. 손가락을 멈추게 하는 첫 장, 행동으로 끝나는 마지막 장. 출력은 지정된 JSON 스키마로만.",
  ].join("\n");
}

export function cardnewsUserPrompt(input: CardnewsInput, project: Project, orgName: string | null) {
  return buildPrompt({
    role: "농축협 카드뉴스 기획자",
    context: [...projectContext(project, orgName), input.extra ? `추가 정보: ${input.extra}` : "", `스타일: ${CARD_STYLES[input.style].label}`],
    goal: `카드뉴스를 끝까지 넘겨 본 사람이 '${project.cta || "매장 방문 또는 전화 문의"}' 행동을 하게 만든다.`,
    conditions: [`정확히 ${input.pages}장. 1장은 후크, 마지막 장은 행동 유도(기한·연락처 포함).`],
    format: `pages 배열 ${input.pages}개. headline 12자 이내, body 1~2줄 각 18자 이내.`,
  });
}

export function cardnewsImagePrompt(page: CardnewsOutput["pages"][number], index: number, total: number, style: CardStyle, orgName: string | null) {
  const s = CARD_STYLES[style];
  return [
    `SNS 카드뉴스 ${index + 1}/${total}장, 세로형(3:4). ${s.say} 스타일. 시리즈 전체가 같은 색감·레이아웃으로 이어지도록 일관되게.`,
    "색상 톤: 농협 초록(#0B6B3A)과 흰색을 기본으로, 가을 골드(#C9A227) 포인트.",
    `구성: 위쪽에 큰 제목 "${page.headline}", 아래에 본문 "${page.body.join('" / "')}".`,
    `우하단에 작은 페이지 표시 "${index + 1}/${total}"${orgName ? `, 좌하단에 작은 글씨 "${orgName}"` : ""}.`,
    `배경 장면: ${page.scene}. 사람 얼굴은 넣지 않는다.`,
    "조건: 한글 문구는 위에 적힌 그대로 정확히, 오타·추가 문구 금지. 글자는 크고 또렷하게. 로고·브랜드 마크 금지.",
  ].join("\n");
}

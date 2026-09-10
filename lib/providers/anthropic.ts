import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Claude 호출 래퍼 — 기획·원고·가사·장면 설계 담당.
 * - 모델: claude-opus-5, 적응형 사고, 구조화 출력(zod 스키마)
 * - 서버측 폴백(fallbacks: "default")을 기본 적용해 분류기 거부 시 자동으로 대체 모델이 이어받는다.
 */
export const CLAUDE_MODEL = "claude-opus-5";

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export class ClaudeRefusal extends Error {
  constructor(detail?: string) {
    super(`AI가 이 요청을 처리하지 않았습니다.${detail ? ` (${detail})` : ""} 소재 문구를 바꿔 다시 시도해 주세요.`);
    this.name = "ClaudeRefusal";
  }
}

export type Effort = "low" | "medium" | "high" | "xhigh";

export async function generateJSON<S extends z.ZodType>(
  schema: S,
  opts: { system: string; user: string; effort?: Effort; maxTokens?: number },
): Promise<z.infer<S>> {
  const res = await client().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  if (res.stop_reason === "refusal") {
    const cat = res.stop_details && "category" in res.stop_details ? String(res.stop_details.category ?? "") : "";
    throw new ClaudeRefusal(cat || undefined);
  }
  if (res.stop_reason === "max_tokens") throw new Error("AI 응답이 너무 길어 잘렸습니다. 분량을 줄여 다시 시도해 주세요.");
  if (!res.parsed_output) throw new Error("AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.");
  return res.parsed_output;
}

export async function generateText(opts: { system: string; user: string; effort?: Effort; maxTokens?: number }): Promise<string> {
  const res = await client().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium" },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  if (res.stop_reason === "refusal") throw new ClaudeRefusal();
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
}

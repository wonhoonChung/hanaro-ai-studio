/**
 * ElevenLabs Music — 응원송 음원 생성
 * POST https://api.elevenlabs.io/v1/music  (헤더 xi-api-key) → 오디오 바이트(MP3)
 * composition_plan: 섹션별 스타일·길이·가사(lines)로 정밀 제어
 */
const BASE = "https://api.elevenlabs.io/v1";
export const MUSIC_MODEL = process.env.ELEVENLABS_MUSIC_MODEL ?? "music_v2";

export type CompositionSection = {
  section_name: string;
  positive_local_styles: string[];
  negative_local_styles: string[];
  duration_ms: number; // 3000~120000
  lines: string[]; // 가사, 최대 30줄·200자
};

export type CompositionPlan = {
  positive_global_styles: string[];
  negative_global_styles: string[];
  sections: CompositionSection[];
};

export async function composeMusic(plan: CompositionPlan): Promise<Buffer> {
  const r = await fetch(`${BASE}/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ composition_plan: plan, model_id: MUSIC_MODEL }),
    cache: "no-store",
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = (await r.json()) as { detail?: { message?: string } | string };
      msg = typeof j.detail === "string" ? j.detail : j.detail?.message ?? msg;
    } catch {}
    throw new Error(`음원 생성 실패: ${msg}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new Error("음원 생성 결과가 비어 있습니다.");
  return buf;
}

export const planDurationMs = (plan: CompositionPlan) => plan.sections.reduce((a, s) => a + s.duration_ms, 0);

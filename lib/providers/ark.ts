/**
 * BytePlus ModelArk — Seedance 영상 생성 (비동기 task)
 * 문서: https://docs.byteplus.com/en/docs/ModelArk/Video_Generation_API
 *  POST /api/v3/contents/generations/tasks  → { id }
 *  GET  /api/v3/contents/generations/tasks/{id} → { status: queued|running|succeeded|failed, content: { video_url } }
 */
const BASE = process.env.ARK_BASE_URL ?? "https://ark.ap-southeast.bytepluses.com/api/v3";
export const SEEDANCE_MODEL = process.env.ARK_VIDEO_MODEL ?? "dreamina-seedance-2-5-260628";

export type VideoRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
export type VideoTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";

export type CreateVideoTaskInput = {
  prompt: string;
  duration: number; // 4~30초
  ratio: VideoRatio;
  resolution?: "480p" | "720p" | "1080p";
  generateAudio?: boolean;
  /** 참조 이미지(우리 조합 사진 등) 공개 URL */
  referenceImageUrls?: string[];
  /** 첫 프레임 이미지 URL (image-to-video) */
  firstFrameUrl?: string;
  seed?: number;
};

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role?: "first_frame" | "last_frame" | "reference_image" };

const headers = () => ({ Authorization: `Bearer ${process.env.ARK_API_KEY}`, "Content-Type": "application/json" });

export async function createVideoTask(input: CreateVideoTaskInput): Promise<{ id: string }> {
  const content: ContentItem[] = [{ type: "text", text: input.prompt }];
  if (input.firstFrameUrl) content.push({ type: "image_url", image_url: { url: input.firstFrameUrl }, role: "first_frame" });
  for (const url of input.referenceImageUrls ?? []) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });

  const body = {
    model: SEEDANCE_MODEL,
    content,
    duration: Math.max(4, Math.min(30, Math.round(input.duration))),
    ratio: input.ratio,
    resolution: input.resolution ?? "720p",
    generate_audio: input.generateAudio ?? false,
    watermark: false,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };
  const r = await fetch(`${BASE}/contents/generations/tasks`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
  const j = (await r.json()) as { id?: string; error?: { message?: string; code?: string }; message?: string };
  if (!r.ok || !j.id) throw new Error(`영상 생성 요청 실패: ${j.error?.message ?? j.message ?? r.statusText}`);
  return { id: j.id };
}

export async function getVideoTask(id: string): Promise<{ status: VideoTaskStatus; videoUrl?: string; error?: string }> {
  const r = await fetch(`${BASE}/contents/generations/tasks/${encodeURIComponent(id)}`, { headers: headers(), cache: "no-store" });
  const j = (await r.json()) as { status?: VideoTaskStatus; content?: { video_url?: string }; error?: { message?: string }; message?: string };
  if (!r.ok) throw new Error(`영상 상태 조회 실패: ${j.error?.message ?? j.message ?? r.statusText}`);
  return { status: j.status ?? "queued", videoUrl: j.content?.video_url, error: j.error?.message };
}

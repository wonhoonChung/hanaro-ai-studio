import path from "node:path";
import fs from "node:fs/promises";
import type { JobContext } from "@/lib/jobs";
import { createVideoTask, getVideoTask, type VideoRatio } from "@/lib/providers/ark";
import { adminClient } from "@/lib/supabase/admin";
import { downloadTo } from "@/lib/video/ffmpeg";

export type ClipSpec = { key: string; prompt: string; seconds: number };

/** 프로젝트 사진을 서명 URL로 만들어 Seedance 참조 이미지로 넘긴다 */
export async function referenceUrls(ctx: JobContext, max = 1): Promise<string[]> {
  const photos = ctx.project?.photos ?? [];
  if (!photos.length) return [];
  const db = adminClient();
  const urls: string[] = [];
  for (const p of photos.slice(0, max)) {
    const { data } = await db.storage.from("uploads").createSignedUrl(p, 60 * 60);
    if (data?.signedUrl) urls.push(data.signedUrl);
  }
  return urls;
}

/** 클립 생성 요청을 모두 보내고 task id를 job에 저장 */
export async function startClips(ctx: JobContext, clips: ClipSpec[], ratio: VideoRatio, refs: string[]) {
  const ids: Record<string, string> = {};
  for (const c of clips) {
    const { id } = await createVideoTask({ prompt: c.prompt, duration: c.seconds, ratio, resolution: "720p", generateAudio: false, referenceImageUrls: refs });
    ids[c.key] = id;
  }
  await ctx.update({ provider_task_ids: ids, output: { clip_assets: {} } });
}

/**
 * 모든 클립 task 상태 확인. 완료된 클립은 outputs에 저장. 전부 끝나면 true.
 * 실패한 task가 있으면 예외.
 */
export async function waitClips(ctx: JobContext, keys: string[], tmp: string): Promise<boolean> {
  const saved = { ...((ctx.job.output.clip_assets as Record<string, string> | undefined) ?? {}) };
  let allDone = true;
  for (const key of keys) {
    if (saved[key]) continue;
    const taskId = ctx.job.provider_task_ids[key];
    if (!taskId) throw new Error(`클립 ${key}의 작업 ID가 없습니다.`);
    const t = await getVideoTask(taskId);
    if (t.status === "succeeded" && t.videoUrl) {
      const file = path.join(tmp, `${key}.mp4`);
      await downloadTo(t.videoUrl, file);
      const data = await fs.readFile(file);
      const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: `클립_${key}.mp4`, clip: key, intermediate: true } });
      saved[key] = asset.id;
      await ctx.update({ output: { clip_assets: saved } });
    } else if (t.status === "failed" || t.status === "cancelled" || t.status === "expired") {
      throw new Error(`영상 클립(${key}) 생성 실패: ${t.error ?? t.status}`);
    } else {
      allDone = false;
    }
  }
  return allDone;
}

/** 저장된 클립 자산을 임시 폴더로 내려받아 경로를 돌려준다 */
export async function fetchClipFiles(ctx: JobContext, keys: string[], tmp: string): Promise<Record<string, string>> {
  const db = adminClient();
  const saved = (ctx.job.output.clip_assets as Record<string, string> | undefined) ?? {};
  const files: Record<string, string> = {};
  for (const key of keys) {
    const { data: asset } = await db.from("assets").select("storage_path").eq("id", saved[key]).single();
    if (!asset) throw new Error(`클립 ${key} 파일을 찾을 수 없습니다.`);
    const { data } = await db.storage.from("outputs").download(asset.storage_path);
    if (!data) throw new Error(`클립 ${key} 다운로드 실패`);
    const file = path.join(tmp, `${key}.mp4`);
    await fs.writeFile(file, Buffer.from(await data.arrayBuffer()));
    files[key] = file;
  }
  return files;
}

export async function fetchAssetFile(assetId: string, tmp: string, name: string): Promise<string> {
  const db = adminClient();
  const { data: asset } = await db.from("assets").select("storage_path").eq("id", assetId).single();
  if (!asset) throw new Error("파일을 찾을 수 없습니다.");
  const { data } = await db.storage.from("outputs").download(asset.storage_path);
  if (!data) throw new Error("파일 다운로드 실패");
  const file = path.join(tmp, name);
  await fs.writeFile(file, Buffer.from(await data.arrayBuffer()));
  return file;
}

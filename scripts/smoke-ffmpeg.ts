/**
 * ffmpeg 합성 파이프라인 스모크 테스트 (외부 API 불필요)
 *  npx tsx scripts/smoke-ffmpeg.ts
 * 색상 클립 2개 + 정지 이미지 1개 → 정규화 → concat → 자막 번인 → out/smoke.mp4
 */
import path from "node:path";
import fs from "node:fs/promises";
import { run, normalizeClip, imageToClip, concatClips, finalize, tmpDir, SIZE_169, cleanup } from "../lib/video/ffmpeg";
import { cuesFromSegments } from "../lib/video/subtitles";

async function main() {
  const tmp = await tmpDir("smoke-");
  const a = path.join(tmp, "a.mp4");
  const b = path.join(tmp, "b.mp4");
  const img = path.join(tmp, "poster.png");
  await run(["-f", "lavfi", "-i", "color=c=0x0B6B3A:s=1280x720:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", a]);
  await run(["-f", "lavfi", "-i", "color=c=0xC9A227:s=1280x720:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", b]);
  await run(["-f", "lavfi", "-i", "color=c=white:s=1536x864:d=1", "-frames:v", "1", img]);

  const na = path.join(tmp, "na.mp4");
  const nb = path.join(tmp, "nb.mp4");
  const nc = path.join(tmp, "nc.mp4");
  await normalizeClip(a, na, SIZE_169, 3, { fadeIn: true });
  await normalizeClip(b, nb, SIZE_169, 3);
  await imageToClip(img, nc, SIZE_169, 2);
  const joined = path.join(tmp, "joined.mp4");
  await concatClips([na, nb, nc], joined, tmp);

  await fs.mkdir("out", { recursive: true });
  const out = path.resolve("out/smoke.mp4");
  await finalize(joined, out, {
    cues: cuesFromSegments([{ seconds: 3, text: "이 사과, 어제까지 나무에 있었습니다" }, { seconds: 3, text: "추석 선물세트, 예약 접수 중: 10% 할인" }, { seconds: 2, text: "9월 20일까지 ☎ 031-000-0000" }]),
    size: SIZE_169,
    totalSeconds: 8,
    fadeOut: true,
  });
  const st = await fs.stat(out);
  console.log(`OK ${out} (${Math.round(st.size / 1024)} KB)`);
  await cleanup(tmp);
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});

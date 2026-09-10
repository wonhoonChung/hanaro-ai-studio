# 하나로AI스튜디오 3단계(홍보영상 30초 · 뮤직비디오 1분) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seedance 2.5(영상)·ElevenLabs Music(음원)·GPT Image(포스터 컷)·ffmpeg(합성)를 연결해 홍보영상 30초와 뮤직비디오 1분 제작실을 완성한다.

**Architecture:** 2단계의 job 상태 머신을 그대로 사용한다. 영상 생성은 비동기 task이므로 `provider_task_ids`에 task id를 저장하고, 폴링 단계(`wait:*`)에서 상태를 확인해 완료된 클립을 outputs에 저장한다. 합성은 `ffmpeg-static` 바이너리를 `spawn`으로 실행하며 임시 파일은 `os.tmpdir()`에 둔다. 자막은 Noto Sans KR Bold(OFL, `assets/fonts`)로 번인한다.

**Tech Stack:** BytePlus ModelArk REST(`dreamina-seedance-2-5-260628`), ElevenLabs `POST /v1/music`(`music_v2`, composition_plan), ffmpeg-static, Claude 구조화 출력.

---

## 파일 구조

```
lib/providers/ark.ts            createVideoTask({prompt, duration, ratio, resolution, images?}) / getVideoTask(id)
lib/providers/elevenlabs.ts     composeMusic(plan) → Buffer(mp3)
lib/video/ffmpeg.ts             run(args), concatClips, burnSubtitles(drawtext), imageToClip, muxAudio, downloadToTmp
lib/video/subtitles.ts          자막 큐 → drawtext 필터 문자열 (순수 함수, 테스트)
lib/prompts/promo.ts            3컷 설계 스키마·프롬프트 (후크 3초·메시지 20초·CTA 7초)
lib/prompts/mv.ts               가사·장면 4개·composition_plan 스키마·프롬프트, 장르 5종
lib/pipelines/promo_video.ts    plan → video:start → video:wait → poster → compose
lib/pipelines/music_video.ts    plan → music → video:start → video:wait → compose
app/studio/promo-video/page.tsx + PromoClient.tsx
app/studio/music-video/page.tsx + MvClient.tsx
tests/subtitles.test.ts, tests/prompts-video.test.ts
```

## 단계 상세

### 홍보영상 (크레딧 20)
1. `plan`: Claude → `{cuts:[{kind:'hook'|'message'|'cta', seconds, caption, videoPrompt(영문), sceneKo}], poster:{headline, lines, footer, scene}}`. 컷1 후크 3초는 Seedance 5초 클립의 앞 3초를 사용, 컷2 메시지 20초는 Seedance 10초 클립 2개(메시지A·B), 컷3 CTA 7초는 gpt-image 포스터 정지 컷.
2. `video:start`: Seedance task 3개 생성(5초·10초·10초, ratio 16:9 또는 9:16, 720p, generate_audio false, 프로젝트 사진 있으면 reference_image 1장). task id 저장.
3. `video:wait`: 각 task 상태 조회. 모두 succeeded면 video_url 다운로드 → outputs 저장(asset video, meta.cut). 하나라도 failed면 실패. 아직이면 `{next:'video:wait'}` 반환(폴링 지속).
4. `poster`: gpt-image 포스터(16:9 1536x864 / 9:16 864x1536) → asset image.
5. `compose`: ffmpeg — 컷1 trim 3초, 컷2 A+B 20초, 컷3 포스터 7초(loop) → concat → 자막 drawtext(각 컷 caption, 하단 반투명 띠) → 1080p scale → mp4(h264, yuv420p, faststart) → asset video(최종). 음원 없음(무음 시청 대응, 자막 포함).

### 뮤직비디오 (크레딧 30)
1. `plan`: Claude → `{title, lyrics:{verse1[], chorus[], verse2[], chorus2[]}, styleWords[], compositionPlan{positive_global_styles, negative_global_styles, sections[{section_name, positive_local_styles, negative_local_styles, duration_ms, lines}]}, scenes:[{seconds:15, videoPrompt, captionKo}] × 4}`. 총 60초.
2. `music`: ElevenLabs composeMusic(compositionPlan, music_v2) → mp3 → asset audio.
3. `video:start`: Seedance 15초 클립 4개(16:9, 720p, 무음).
4. `video:wait`: 위와 동일.
5. `compose`: concat 4클립(60초) → 음원 mux(-shortest) → 후렴 자막(각 장면 captionKo) → 마지막 2초 조합명 카드 페이드 → 1080p mp4.

## 검증
- `tests/subtitles.test.ts`: drawtext 이스케이프(콜론·따옴표·백슬래시), 시간 구간 enable 식, 폰트 경로 포함.
- `tests/prompts-video.test.ts`: 3컷 초 합계 30, 장면 4개 합계 60, composition_plan 섹션 duration 합계 60000.
- ffmpeg 실제 실행 스모크: `npm run smoke:ffmpeg` (색상 클립 2개 생성·concat·자막 번인 → 파일 존재 확인).

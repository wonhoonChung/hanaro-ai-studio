# 하나로AI스튜디오 2단계(문서 HWPX · 뉴스레터 · 카드뉴스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude(기획·원고)와 GPT Image(이미지)를 연결해 문서(HWPX)·뉴스레터·카드뉴스 3개 제작실을 완성하고, 작업(job) 상태 머신·크레딧 차감·보관함을 갖춘다.

**Architecture:** `lib/providers/*`가 외부 API를 감싸고, `lib/pipelines/*`가 작업 종류별 단계(step) 실행기를 제공한다. `POST /api/jobs`가 크레딧 선차감 후 job을 만들고 첫 단계를 실행, `GET /api/jobs/[id]`가 폴링 시 다음 단계를 진행한다. 결과 파일은 Supabase Storage `outputs/{userId}/…`에 저장하고 `assets`에 기록한다.

**Tech Stack:** @anthropic-ai/sdk (`claude-opus-5`, beta.messages.parse + betaZodOutputFormat, fallbacks "default"), openai (`gpt-image-2.5-sunburst`), jszip (HWPX), zod, Vitest.

---

## 파일 구조

```
lib/providers/anthropic.ts      generateJSON(schema, {system,user,effort}) → 타입 안전 결과 (refusal 처리)
lib/providers/openai-image.ts   generateImage({prompt,size,quality}) → Buffer / editImage(refs)
lib/prompts/rokmokjobun.ts      역관목조분 5칸 프롬프트 빌더 (순수 함수, 테스트)
lib/prompts/document.ts         문서 유형별 system/user 프롬프트 + zod 스키마
lib/prompts/newsletter.ts       5섹션 원고 스키마 + 이미지 프롬프트 빌더
lib/prompts/cardnews.ts         장별 문구 스키마 + 스타일 사전 + 이미지 프롬프트 빌더
lib/hwpx/build.ts               DocumentJSON → HWPX Buffer (blank.hwpx 기반, header.xml에 charPr/paraPr 주입)
lib/jobs.ts                     createJob / advanceJob / failJob(환불) / storage 업로드 / asset 기록
lib/pipelines/index.ts          type → pipeline 매핑
lib/pipelines/document.ts       steps: plan → build
lib/pipelines/newsletter.ts     steps: plan → image
lib/pipelines/cardnews.ts       steps: plan → image:0..N-1
app/api/jobs/route.ts           POST 작업 생성
app/api/jobs/[id]/route.ts      GET 상태 + 다음 단계 진행
app/api/assets/[id]/route.ts    GET 서명 URL로 리다이렉트 (다운로드)
components/JobRunner.tsx        생성 버튼 → 폴링 → 결과 표시 (클라이언트)
components/ProjectPicker.tsx    프로젝트 선택 select
app/studio/document/page.tsx, newsletter/page.tsx, cardnews/page.tsx, library/page.tsx
tests/rokmokjobun.test.ts, tests/hwpx.test.ts, tests/prompts.test.ts
```

## 작업 상태 머신

- `POST /api/jobs` `{type, projectId, input}` → 구독 확인 → 비용 계산 → `deduct_credits` → jobs insert(status running, step 첫 단계) → 첫 단계 실행 → 응답 `{jobId}`
- `GET /api/jobs/[id]` → 소유자 확인 → status running이고 `lock_until`이 과거이면 `lock_until = now+120s` 설정 후 현재 step 실행 → 다음 step 또는 succeeded → job 반환
- 실패: status failed, error 한국어, `add_credits` 환불 사유 `refund:{type}`

## 단계 요약

- 문서: `plan`(Claude → DocumentJSON) → `build`(HWPX 조립 → outputs 업로드 → asset hwpx)
- 뉴스레터: `plan`(Claude → 5섹션·제목 3개·이미지 문구) → `image`(gpt-image 1024x1360 → asset image)
- 카드뉴스: `plan`(Claude → pages[]) → `image:i` 장별 생성 → 마지막에 ZIP asset 추가

## 검증

- `tests/rokmokjobun.test.ts`: 5칸이 순서대로, 비어있는 칸은 생략, 개인정보 금지 문구 포함.
- `tests/hwpx.test.ts`: buildHwpx 결과 ZIP에 `mimetype`(첫 항목, STORE), `Contents/section0.xml`에 제목·본문·표 텍스트 포함, header.xml itemCnt 증가, XML이 잘 닫힘(간단한 파서로 태그 균형 확인).
- `tests/prompts.test.ts`: 뉴스레터 이미지 프롬프트에 농협 초록·3:4·한글 정확 조건 포함, 카드뉴스 스타일 5종 매핑.
- `npm run build`, `npm run lint`.

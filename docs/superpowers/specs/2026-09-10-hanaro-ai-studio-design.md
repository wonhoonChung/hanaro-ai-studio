# 하나로AI스튜디오 설계서

작성일: 2026-09-10
상태: 승인됨 (사용자 승인 2026-09-10)

## 1. 목적

농축협 디지털 프로젝트과정(2026-09-09 ~ 09-11, Ten AI × 농협 안성교육원) 강의안에서 다루는
산출물 5종을 한 사이트에서 최고 품질의 상용 API로 생성하는 정액 구독형 웹 서비스.

강의안의 핵심 원칙을 제품 구조로 옮긴다.

- 소재 1개 → 산출물 N개 ("기획 1번, 출력 3번"). 소재는 **프로젝트** 엔티티로 저장한다.
- 프롬프트는 역관목조분 5칸(役 역할·關 관련정보·目 목적·條 조건·分 분량)으로 서버가 조립한다. 사용자는 빈칸만 채운다.
- 절대 수칙: 개인정보 입력 금지, AI 결과는 초안(사람 검토), 저작권·초상권 확인. 화면과 검증 로직에 반영한다.

## 2. 사용자와 역할

| 역할 | 권한 |
|---|---|
| 비회원 | 랜딩, 요금 안내, 결과물 갤러리 열람 |
| 구독회원 | 프로젝트 생성, 5종 제작실 사용, 보관함, 구독 관리 |
| 관리자 | 회원·구독 조회, 크레딧 수동 조정, 요금·크레딧 단가 설정, 작업 로그·실패 현황 |

관리자는 `profiles.role = 'admin'`으로 지정한다. 최초 관리자는 SQL 시드로 부여한다.

## 3. 요금제와 크레딧

- 요금제 1개(월 정액). 가격·월 크레딧은 `plan_settings` 테이블에서 관리자가 수정.
- 크레딧 단가(기본값, 관리자 수정 가능)

| 작업 | 크레딧 |
|---|---|
| 문서(HWPX) 1건 | 1 |
| 뉴스레터(원고+이미지 1장) | 2 |
| 카드뉴스 1장 | 1 |
| 홍보영상 30초 | 20 |
| 뮤직비디오 1분 | 30 |

- 작업 생성 시 선차감, 실패 시 자동 환불. `credit_ledger`에 모든 증감 기록.
- 구독 결제일마다 잔여 크레딧은 월 크레딧으로 재설정(이월 없음).

## 4. 기술 구조

- Next.js 15 (App Router, TypeScript, Tailwind CSS), Vercel 배포.
- Supabase: Auth(이메일+비밀번호, 구글 OAuth), Postgres(RLS), Storage(버킷 `uploads`, `outputs`).
- 서버 로직은 Route Handler(`app/api/**`)와 Server Action. 외부 API 키는 서버에서만 사용.
- 비동기 작업: `jobs` 테이블 + 클라이언트 5초 폴링. 서버는 폴링 요청 시 공급자 상태를 동기화한다. 별도 워커·큐 없음.
- 영상 합성: `ffmpeg-static` + `fluent-ffmpeg`를 쓰는 Route Handler, `export const maxDuration = 300`.
- 결제 스케줄: Vercel Cron(매일 03:00 KST)이 `next_billing_at <= now` 구독을 청구.

### 4.1 외부 API 사양 (2026-09 조사)

| 용도 | 공급자 | 사양 |
|---|---|---|
| 기획·원고·가사·설계 | Anthropic Messages API | `@anthropic-ai/sdk`, 모델 `claude-opus-5`, `thinking: {type:"adaptive"}`, 구조화 출력 `output_config.format`, 스트리밍, 서버측 폴백 `betas:["server-side-fallback-2026-07-01"], fallbacks:"default"` |
| 이미지 | OpenAI Images | `openai` SDK, 모델 `gpt-image-2.5-sunburst`, `quality:"high"`, `output_format:"png"`, 응답 `b64_json`. 크기는 16의 배수 자유 규격(카드뉴스·뉴스레터 3:4 = `1024x1360`, 포스터 16:9 = `1536x864`, 9:16 = `864x1536`) |
| 영상 | BytePlus ModelArk | `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`, `Authorization: Bearer $ARK_API_KEY`, 모델 `dreamina-seedance-2-5-260628` (4~30초, 480p/720p, `generate_audio`, `ratio`, `duration`, content 배열에 `text`와 `image_url`(role: `reference_image`/`first_frame`)). 조회 `GET .../tasks/{id}` → `status` (queued/running/succeeded/failed), `content.video_url` |
| 음악 | ElevenLabs Music | `POST https://api.elevenlabs.io/v1/music`, 헤더 `xi-api-key`, `model_id:"music_v2"`, `composition_plan` (positive/negative_global_styles, sections[] 각 section_name·positive/negative_local_styles·duration_ms·lines[] 가사), 응답 MP3 바이트 |
| 결제 | 토스페이먼츠 v2 | 클라이언트 `@tosspayments/tosspayments-sdk` `loadTossPayments(clientKey)` → `payment({customerKey}).requestBillingAuth({method:"CARD", successUrl, failUrl, customerEmail, customerName})` → successUrl 쿼리 `authKey`, `customerKey` → 서버 `POST https://api.tosspayments.com/v1/billing/authorizations/issue` `{authKey, customerKey}` (Basic base64(`secretKey:`)) → `billingKey` 저장 → 청구 `POST /v1/billing/{billingKey}` `{customerKey, amount, orderId, orderName, customerEmail, customerName}` |

카드번호·비밀번호는 서비스가 절대 다루지 않는다(결제창 방식만 사용).

### 4.2 환경 변수 (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ARK_API_KEY=
ELEVENLABS_API_KEY=
NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=
```

## 5. 데이터 모델 (Supabase Postgres)

```
profiles          id(uuid, auth.users), email, name, org_name, role('member'|'admin'), created_at
plan_settings     id=1, name, price_krw, monthly_credits, credit_costs(jsonb), updated_at
subscriptions     id, user_id, status('active'|'past_due'|'canceled'|'none'), customer_key,
                  billing_key, card_company, card_number_masked, started_at, next_billing_at, canceled_at
payments          id, user_id, subscription_id, order_id, amount, status, toss_payment_key, raw(jsonb), paid_at
credit_ledger     id, user_id, delta, balance_after, reason, job_id, created_at
projects          id, user_id, name, what, when_text, where_text, audience, cta, photos(jsonb: storage paths), created_at
jobs              id, user_id, project_id, type('document'|'newsletter'|'cardnews'|'promo_video'|'music_video'),
                  status('queued'|'running'|'succeeded'|'failed'), step(text), input(jsonb), output(jsonb),
                  error(text), credits, provider_task_ids(jsonb), lock_until, created_at, updated_at, finished_at
assets            id, user_id, job_id, kind('image'|'video'|'audio'|'hwpx'|'zip'), storage_path, mime, size, meta(jsonb), is_public, created_at
```

RLS: 사용자는 자신의 행만 읽기/쓰기, 관리자는 전체 읽기. 크레딧 차감·구독 갱신은 서비스 롤로 서버에서만 수행.

## 6. 화면 구성

- `/` 랜딩: 5종 소개, 요금, 갤러리(관리자가 공개 지정한 결과물), CTA.
- `/login`, `/signup`, `/pricing`
- `/studio` 대시보드: 잔여 크레딧, 프로젝트 목록, 최근 작업.
- `/studio/projects/new` 소재 워크시트(무엇을·언제·어디서·대상·행동·사진 2~3장). 개인정보 금지 안내 + 정규식 경고(전화번호·주민번호·계좌 패턴).
- 제작실 5개: `/studio/document`, `/studio/newsletter`, `/studio/cardnews`, `/studio/promo-video`, `/studio/music-video`. 공통 레이아웃: 프로젝트 선택 → 입력 → 생성 중(단계 표시) → 결과(미리보기·다운로드·재생성).
- `/studio/library` 보관함, `/studio/billing` 구독·카드·결제내역.
- `/admin` 회원/구독, `/admin/credits`, `/admin/settings`, `/admin/jobs`.

## 7. 산출물별 파이프라인

### 7.1 문서 (HWPX)
1. 유형 선택: 기획서, 공문, 보고서, 보도자료. 제목·핵심 내용·수신처·기한 입력.
2. Claude → 구조화 JSON(제목, 개요, 섹션[제목, 문단[], 표(optional)], 수신·발신·시행일).
3. 서버가 HWPX(ZIP+OWPML XML)를 Node에서 직접 조립. 양식: 농협 공문 스타일(제목 굵게, 1. 2. 3. 항목, 표, 맺음 "끝.").
4. `assets`에 저장 후 다운로드. 한글 2014 이상에서 열림.

### 7.2 뉴스레터
1. 프로젝트 소재 + 원하는 톤 → Claude 5섹션 원고(인사·메인·알짜정보·조합원 이야기·CTA) + 제목 후보 3개. 문장 25자 이내, 600자 이내.
2. 사용자 원고 편집 가능.
3. gpt-image로 카톡용 세로 3:4 포스터풍 이미지 1장(농협 초록+흰색+골드, 큰 제목, 핵심 3줄, 하단 연락처·기한, 한글 정확). 크레딧 2.
4. 결과: 원고 텍스트 복사, 이미지 다운로드.

### 7.3 카드뉴스
1. 장수(3~6), 스타일(필름사진·수채화·플랫일러스트·제품컷·포스터풍) 선택.
2. Claude → 장별 헤드라인·본문 2줄·이미지 묘사.
3. gpt-image 장별 3:4 생성(동일 스타일 문자열로 일관성). 장당 크레딧 1.
4. 결과: 장별 미리보기, 개별/ZIP 다운로드.

### 7.4 홍보영상 30초
1. 비율(16:9/9:16), 사진 선택(옵션).
2. Claude → 3컷 설계(후크 3초·메시지 20초·CTA 7초: 화면 묘사·자막·Seedance 프롬프트).
3. 컷1·컷2: Seedance 2.5 각 10초, 720p, generate_audio false, 사진 있으면 reference_image.
4. 컷3: gpt-image 포스터(선물세트+매장, 연락처·기한) 7초 정지 컷.
5. ffmpeg: 클립 이어붙이기, 자막 번인(drawtext, 노토산스 한글 폰트 포함), 1080p 업스케일, mp4 저장. 크레딧 20.

### 7.5 뮤직비디오 1분
1. 장르(트로트·포크·동요풍·댄스·발라드), 조합명·특산물 입력.
2. Claude → 가사(1절·후렴·2절·후렴, 약 200자) + 장면 4개 설계(각 15초 Seedance 프롬프트) + ElevenLabs composition_plan.
3. ElevenLabs Music 60초 음원(MP3).
4. Seedance 2.5 15초 클립 4개(오디오 없음).
5. ffmpeg: 클립 연결 + 음원 합성 + 후렴 자막 + 마지막 조합명 로고 카드. 크레딧 30.

## 8. 작업 상태 머신

`queued → running(step: plan|image|video|music|compose) → succeeded | failed`
- 생성 API 호출은 즉시 job 생성 후 첫 단계를 수행하고 응답. 이후 단계는 `GET /api/jobs/[id]` 폴링 시 진행(공급자 상태 확인 → 다음 단계 실행). 단계 실행은 job 행의 `lock_until`로 중복 실행 방지.
- 실패 시 `error`에 한국어 메시지, 크레딧 환불 ledger 기록.

## 9. 오류 처리·보안

- 모든 외부 호출 타임아웃·재시도(2회) 후 실패 처리.
- 업로드 이미지 10MB 이하, jpg/png만. 서명 URL로 Seedance에 전달.
- 개인정보 패턴 감지 시 저장 거부(주민번호), 경고(전화번호는 CTA 용도라 허용, 계좌번호 경고).
- Cron 라우트는 `CRON_SECRET` 검사.

## 10. 테스트

- Vitest 단위 테스트: 프롬프트 빌더(역관목조분), 크레딧 차감/환불, HWPX XML 생성(zip 열어 필수 파트 확인), ffmpeg 필터 문자열 생성, 개인정보 패턴 검사, 토스 결제 금액 검증.
- 외부 API는 모듈 경계(`lib/providers/*`)에서 모킹. 실제 키가 있을 때 `npm run smoke`로 각 공급자 1회 호출.

## 11. 구현 단계

1. 기반: 스캐폴드, Supabase 스키마·RLS, 인증, 프로필, 요금제 설정, 토스 빌링 등록·청구·크론, 크레딧, 관리자 화면.
2. 텍스트·이미지 제작실: providers(anthropic, openai), 문서 HWPX, 뉴스레터, 카드뉴스, 보관함.
3. 영상·음악 제작실: providers(ark, elevenlabs), ffmpeg 합성, 홍보영상, 뮤직비디오.
4. 랜딩·갤러리·QA·배포 문서(README, .env.example).

각 단계는 별도 구현 계획 문서로 진행한다.

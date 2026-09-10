# 하나로AI스튜디오

농축협 디지털 프로젝트과정 강의안의 산출물(문서 HWP · 뉴스레터 · 카드뉴스 · 홍보영상 30초 · 뮤직비디오 1분)을
한 곳에서 최고 품질 API로 만드는 **정액 구독형 웹 서비스**입니다.

| 제작실 | 흐름 | ro(기본) |
|---|---|---|
| 문서 · HWP | Claude 구조화 초안 → HWPX(한글 2014+) 조립 | 3 |
| 뉴스레터 | Claude 5섹션 원고 → GPT Image 카톡용 3:4 이미지 | 8 |
| 카드뉴스 | Claude 장별 문구 → GPT Image 3~6장 → ZIP | 장당 5 |
| 홍보영상 30초 | Claude 3컷 설계 → Seedance 클립 3개 + CTA 포스터 → ffmpeg 자막·합성 | 55 |
| 뮤직비디오 1분 | Claude 가사·장면 → ElevenLabs 음원 → Seedance 4장면 → ffmpeg 합성 | 110 |

| 역할 | API |
|---|---|
| 기획·원고·가사·장면 설계 | Anthropic Claude `claude-opus-5` (구조화 출력, 서버측 폴백) |
| 이미지 | OpenAI Images `gpt-image-2.5-sunburst` |
| 영상 | BytePlus ModelArk Seedance `dreamina-seedance-2-5-260628` |
| 음악 | ElevenLabs Music `music_v2` (composition_plan) |
| 결제 | 토스페이먼츠 자동결제(빌링키) + Vercel Cron 월 청구 |
| 회원·DB·파일 | Supabase (Auth · Postgres · Storage) |

설계서: `docs/superpowers/specs/2026-09-10-hanaro-ai-studio-design.md` · 단계별 계획: `docs/superpowers/plans/`

## 1. 준비물

- Node.js 20 이상 (Node 24에서 검증), npm
- Supabase 프로젝트 1개
- API 키: Anthropic, OpenAI, BytePlus ModelArk(`ARK_API_KEY`), ElevenLabs
- 토스페이먼츠 개발자센터 키 (자동결제는 계약 후 실결제, 테스트 키로 개발 가능)
- ffmpeg는 `ffmpeg-static`으로 자동 포함(별도 설치 불필요)

## 2. 설치·실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

```bash
npm test               # 단위 테스트 (Vitest, 외부 API 없이 동작)
npm run smoke:ffmpeg   # ffmpeg 합성·한글 자막 번인 스모크 (out/smoke.mp4)
npm run lint
npm run build
```

환경변수가 없어도 랜딩·요금 페이지는 열리므로 화면만 먼저 확인할 수 있습니다.

## 3. Supabase 설정

1. Supabase 대시보드 → **SQL Editor** → `supabase/migrations/0001_init.sql`, 이어서 `0002_banana.sql`을 붙여넣고 실행.
   테이블·RLS·크레딧 함수(`deduct_credits`/`add_credits`/`set_credits`)·Storage 버킷(`uploads`, `outputs`)이 만들어집니다.
2. **Authentication → Providers**: Email 활성화. 구글 로그인은 Google 제공자에 OAuth 클라이언트 등록 후
   Redirect URL에 `https://<프로젝트>.supabase.co/auth/v1/callback` 추가.
3. **Authentication → URL Configuration**: Site URL과 Redirect URLs에 `NEXT_PUBLIC_SITE_URL`(로컬·배포 도메인)을 추가.
4. 가입 후 최초 관리자 지정:

```sql
update profiles set role = 'admin' where email = '관리자이메일@example.com';
```

관리자는 `/admin`에서 회원·구독 상태 변경, 크레딧 조정, 요금·단가 설정, 작업 로그, 갤러리 공개를 관리합니다.
결제 연동 전에 테스트하려면 관리자 화면에서 회원의 구독을 "활성"으로 바꾸고 크레딧을 부여하면 됩니다.

## 4. 토스페이먼츠

- 개발자센터 → API 키의 **클라이언트 키**(`NEXT_PUBLIC_TOSS_CLIENT_KEY`)와 **시크릿 키**(`TOSS_SECRET_KEY`).
- 카드 정보는 토스 결제창에서만 입력됩니다. 서버는 `authKey → billingKey` 발급과 월 청구만 수행합니다.
- 월 청구: Vercel Cron(`vercel.json`, 매일 KST 03:00)이 `/api/cron/billing` 호출. `CRON_SECRET`을 Vercel 환경변수에 등록.
  로컬 테스트: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing`

## 5. 작업(job) 동작 방식

- `POST /api/jobs` — 구독 확인 → 크레딧 선차감 → job 생성 → 첫 단계 실행.
- `GET /api/jobs/[id]` — 화면이 4초마다 폴링. 진행 중이면 다음 단계를 실행하고 상태·결과 파일을 돌려줍니다.
  영상은 Seedance task id를 저장해 두고 `video:wait` 단계에서 완료 여부만 확인합니다.
- 실패 시 `jobs.error`에 한국어 메시지, 크레딧 자동 환불(`credit_ledger` 사유 `refund:*`).
- 결과 파일은 Storage `outputs/{userId}/{jobId}/…`에 저장, `/api/assets/[id]`가 30분 서명 URL로 리다이렉트.

## 6. 배포 (Vercel)

1. GitHub 저장소를 Vercel에 연결.
2. `.env.example`의 모든 변수를 Environment Variables에 등록. `NEXT_PUBLIC_SITE_URL`은 배포 도메인.
3. 영상 합성 라우트는 `maxDuration = 300`이므로 **Pro 플랜** 권장(Hobby는 함수 60초 제한).
4. `next.config.ts`의 `outputFileTracingIncludes`가 `assets/`(HWPX 템플릿·자막 폰트)와 ffmpeg 바이너리를 함수에 포함합니다.

## 7. 폴더 구조

```
app/            페이지·라우트 (랜딩, 인증, studio/*, admin/*, api/*)
lib/providers/  anthropic · openai-image · ark(Seedance) · elevenlabs · toss
lib/prompts/    역관목조분 빌더, 제작실별 프롬프트·zod 스키마
lib/pipelines/  작업 종류별 단계 실행기
lib/hwpx/       HWPX 조립 (assets/hwpx/blank.hwpx 기반)
lib/video/      ffmpeg 실행·자막 필터
lib/jobs.ts     작업 생성·진행·실패(환불)
supabase/       마이그레이션 SQL
tests/          Vitest 단위 테스트
```

## 8. ro 요금정책 (지니젠 벤치마크)

- **1 ro = 정가 100원**. 정책 상세: `docs/superpowers/specs/2026-09-10-banana-pricing.md`
- 충전 패키지: 베이직 120B 10,000원 · 밸류 625B 50,000원 · 프로 1,300B 100,000원 · 비즈니스 6,750B 500,000원 · 엔터프라이즈 14,300B 1,000,000원 (ro당 83→70원)
- 월 정액 99,000원 → 매월 1,300B 지급(이월 없음). 충전분은 무기한. 가입 보너스 30B.
- 소모: 문서 3 · 뉴스레터 8 · 카드뉴스 장당 5 · 홍보영상 30초 55 · 뮤직비디오 1분 110
- 관리자 화면(`/admin/settings`)에서 월 요금·월 지급량·소모량을, `banana_packages` 테이블에서 패키지를 바꿀 수 있습니다.
- 마이그레이션: `0001_init.sql` 다음에 **`0002_banana.sql`**을 실행해야 합니다.
- 충전 결제는 토스 일반결제(결제창)이며 서버가 `/v1/payments/confirm`으로 승인한 뒤 ro를 지급합니다.

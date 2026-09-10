# 하나로AI스튜디오

농축협 디지털 프로젝트과정 강의안의 산출물 5종(문서 HWP · 뉴스레터 · 카드뉴스 · 홍보영상 30초 · 뮤직비디오 1분)을
한 곳에서 최고 품질 API로 만드는 정액 구독형 웹 서비스입니다.

| 산출물 | 사용 API |
|---|---|
| 기획·원고·가사·장면 설계 | Anthropic Claude (`claude-opus-5`) |
| 이미지 (뉴스레터·카드뉴스·포스터) | OpenAI Images (`gpt-image-2.5-sunburst`) |
| 영상 | BytePlus ModelArk Seedance 2.5 |
| 음악 | ElevenLabs Music (`music_v2`) |
| 결제 | 토스페이먼츠 자동결제(빌링) |

설계서: `docs/superpowers/specs/2026-09-10-hanaro-ai-studio-design.md`

## 1. 준비물

- Node.js 20 이상 (개발은 24에서 검증)
- Supabase 프로젝트 1개
- API 키: Anthropic, OpenAI, BytePlus ModelArk(ARK_API_KEY), ElevenLabs
- 토스페이먼츠 개발자센터 키 (자동결제는 계약 후 사용, 테스트 키로 개발 가능)
- 영상 합성용 ffmpeg (`ffmpeg-static` 패키지로 자동 포함, 3단계에서 추가)

## 2. 설치

```bash
npm install
cp .env.example .env.local   # 값 채우기
```

## 3. Supabase 설정

1. Supabase 대시보드 → **SQL Editor** → `supabase/migrations/0001_init.sql` 내용을 붙여넣고 실행합니다.
   테이블, RLS, 크레딧 함수, Storage 버킷(`uploads`, `outputs`)이 만들어집니다.
2. **Authentication → Providers**: Email 활성화. 구글 로그인을 쓰려면 Google 제공자에 OAuth 클라이언트를 등록하고
   Redirect URL에 `https://<프로젝트>.supabase.co/auth/v1/callback`을 추가합니다.
3. **Authentication → URL Configuration**: Site URL과 Redirect URLs에 `NEXT_PUBLIC_SITE_URL` 값(예 `http://localhost:3000`, 배포 도메인)을 넣습니다.
4. 최초 관리자 지정 (가입한 뒤 SQL Editor에서):

```sql
update profiles set role = 'admin' where email = '관리자이메일@example.com';
```

## 4. 토스페이먼츠

- 개발자센터 → API 키에서 **클라이언트 키**(`NEXT_PUBLIC_TOSS_CLIENT_KEY`)와 **시크릿 키**(`TOSS_SECRET_KEY`)를 복사합니다.
- 카드 정보는 토스 결제창에서만 입력됩니다. 이 서버는 `authKey → billingKey` 발급과 월 청구만 수행합니다.
- 월 청구는 Vercel Cron(`vercel.json`, 매일 KST 03:00)이 `/api/cron/billing`을 호출해 처리합니다. `CRON_SECRET`을 Vercel 환경변수에도 넣으세요.
  로컬 테스트: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing`

## 5. 실행

```bash
npm run dev     # http://localhost:3000
npm test        # 단위 테스트 (Vitest)
npm run lint
npm run build
```

## 6. 배포 (Vercel)

1. GitHub 저장소를 Vercel에 연결합니다.
2. `.env.example`의 모든 변수를 Vercel Environment Variables에 등록합니다.
3. `NEXT_PUBLIC_SITE_URL`을 배포 도메인으로 바꾸고, Supabase Redirect URLs에도 추가합니다.

## 7. 요금·크레딧

관리자 화면(`/admin/settings`)에서 월 요금, 월 크레딧, 작업별 단가를 바꿀 수 있습니다.
기본값: 월 99,000원 · 200 크레딧 · 문서 1 / 뉴스레터 2 / 카드뉴스 장당 1 / 홍보영상 20 / 뮤직비디오 30.

# 하나로AI스튜디오 1단계(기반·회원·구독·크레딧·관리자) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js + Supabase 기반 위에 회원가입/로그인, 토스 정기결제 구독, 월 크레딧, 프로젝트(소재) 워크시트, 관리자 화면까지 동작하는 골격을 만든다.

**Architecture:** Next.js 15 App Router 단일 앱. Supabase(Auth·Postgres·Storage)를 `@supabase/ssr`로 연결하고, 크레딧 차감·환불은 Postgres 함수(RPC)로 원자적으로 처리한다. 토스페이먼츠는 결제창에서 카드를 등록하고 서버는 authKey→billingKey 발급, Vercel Cron이 월 청구를 수행한다.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, @supabase/supabase-js, @supabase/ssr, @tosspayments/tosspayments-sdk, zod, Vitest.

---

## 파일 구조

```
app/
  layout.tsx, page.tsx(랜딩 자리), globals.css
  (auth)/login/page.tsx, (auth)/signup/page.tsx, auth/callback/route.ts, auth/actions.ts
  pricing/page.tsx
  studio/layout.tsx, studio/page.tsx
  studio/projects/page.tsx, studio/projects/new/page.tsx, studio/projects/actions.ts
  studio/billing/page.tsx, studio/billing/BillingClient.tsx
  admin/layout.tsx, admin/page.tsx, admin/settings/page.tsx, admin/settings/actions.ts, admin/jobs/page.tsx, admin/credits/actions.ts
  api/billing/success/route.ts, api/billing/cancel/route.ts, api/cron/billing/route.ts
lib/
  supabase/server.ts, client.ts, admin.ts, middleware.ts
  auth.ts            (현재 사용자·관리자 확인 헬퍼)
  credits.ts         (단가 계산 순수 함수 + RPC 래퍼)
  pii.ts             (개인정보 패턴 검사)
  providers/toss.ts  (빌링키 발급·청구)
  billing.ts         (구독 활성화·청구 로직)
  types.ts           (DB row 타입)
supabase/migrations/0001_init.sql
middleware.ts
vitest.config.ts, .env.example, vercel.json
tests/credits.test.ts, tests/pii.test.ts, tests/billing.test.ts
```

---

### Task 1: 프로젝트 스캐폴드

**Files:**
- Create: Next.js 앱 전체, `.env.example`, `vitest.config.ts`, `vercel.json`

- [ ] **Step 1: create-next-app 실행**

```bash
cd C:/project/hanaro
npx --yes create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```
Expected: `package.json`, `app/`, `next.config.ts` 생성.

- [ ] **Step 2: 의존성 설치**

```bash
npm i @supabase/supabase-js @supabase/ssr @tosspayments/tosspayments-sdk zod
npm i -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: vitest 설정 및 스크립트**

`vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```
`package.json` scripts에 추가: `"test": "vitest run"`.

- [ ] **Step 4: .env.example, vercel.json**

`.env.example`
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
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
`vercel.json`
```json
{ "crons": [{ "path": "/api/cron/billing", "schedule": "0 18 * * *" }] }
```
(UTC 18:00 = KST 03:00)

- [ ] **Step 5: 빌드 확인 후 커밋**

Run: `npm run build` → Expected: 성공.
```bash
git add -A && git commit -m "chore: Next.js 스캐폴드 및 기본 설정"
```

---

### Task 2: Supabase 스키마·RLS·크레딧 함수

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  org_name text,
  role text not null default 'member' check (role in ('member','admin')),
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table plan_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default '하나로AI스튜디오 월 정액',
  price_krw integer not null default 99000,
  monthly_credits integer not null default 200,
  credit_costs jsonb not null default '{"document":1,"newsletter":2,"cardnews_page":1,"promo_video":20,"music_video":30}',
  updated_at timestamptz not null default now()
);
insert into plan_settings (id) values (1);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'none' check (status in ('none','active','past_due','canceled')),
  customer_key text not null,
  billing_key text,
  card_company text,
  card_number_masked text,
  started_at timestamptz,
  next_billing_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  order_id text not null unique,
  amount integer not null,
  status text not null,
  toss_payment_key text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table credit_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  job_id uuid,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  what text not null,
  when_text text,
  where_text text,
  audience text,
  cta text,
  photos jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  type text not null check (type in ('document','newsletter','cardnews','promo_video','music_video')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  step text,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error text,
  credits integer not null default 0,
  provider_task_ids jsonb not null default '{}',
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','hwpx','zip')),
  storage_path text not null,
  mime text not null,
  size integer,
  meta jsonb not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- 가입 시 프로필 자동 생성
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();

-- 크레딧 차감 (부족 시 예외)
create or replace function deduct_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer as $$
declare v_balance integer;
begin
  update profiles set credits = credits - p_amount where id = p_user and credits >= p_amount
    returning credits into v_balance;
  if v_balance is null then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id) values (p_user, -p_amount, v_balance, p_reason, p_job);
  return v_balance;
end $$;

-- 크레딧 증가(환불·관리자 조정·월 리셋)
create or replace function add_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer as $$
declare v_balance integer;
begin
  update profiles set credits = credits + p_amount where id = p_user returning credits into v_balance;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id) values (p_user, p_amount, v_balance, p_reason, p_job);
  return v_balance;
end $$;

create or replace function set_credits(p_user uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer as $$
declare v_old integer; v_new integer;
begin
  select credits into v_old from profiles where id = p_user for update;
  update profiles set credits = p_amount where id = p_user returning credits into v_new;
  insert into credit_ledger (user_id, delta, balance_after, reason) values (p_user, v_new - v_old, v_new, p_reason);
  return v_new;
end $$;

create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- RLS
alter table profiles enable row level security;
alter table plan_settings enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table credit_ledger enable row level security;
alter table projects enable row level security;
alter table jobs enable row level security;
alter table assets enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid() or is_admin());
create policy "update own profile" on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy "plan readable" on plan_settings for select using (true);
create policy "own subscription" on subscriptions for select using (user_id = auth.uid() or is_admin());
create policy "own payments" on payments for select using (user_id = auth.uid() or is_admin());
create policy "own ledger" on credit_ledger for select using (user_id = auth.uid() or is_admin());
create policy "own projects" on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin read projects" on projects for select using (is_admin());
create policy "own jobs" on jobs for select using (user_id = auth.uid() or is_admin());
create policy "own assets" on assets for select using (user_id = auth.uid() or is_admin() or is_public);

-- Storage 버킷
insert into storage.buckets (id, name, public) values ('uploads','uploads',false), ('outputs','outputs',false)
  on conflict do nothing;
create policy "own uploads" on storage.objects for all
  using (bucket_id in ('uploads','outputs') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('uploads','outputs') and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: 커밋**
```bash
git add supabase && git commit -m "feat: Supabase 스키마·RLS·크레딧 함수"
```

---

### Task 3: Supabase 클라이언트·미들웨어·인증 헬퍼

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`, `middleware.ts`, `lib/auth.ts`, `lib/types.ts`

- [ ] **Step 1: 클라이언트 3종**

`lib/supabase/server.ts`
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
    },
  });
}
```
`lib/supabase/client.ts`
```ts
import { createBrowserClient } from "@supabase/ssr";
export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```
`lib/supabase/admin.ts`
```ts
import { createClient } from "@supabase/supabase-js";
export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
```

- [ ] **Step 2: 미들웨어 (세션 갱신 + 보호 경로)**

`lib/supabase/middleware.ts`
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && (path.startsWith("/studio") || path.startsWith("/admin"))) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}
```
`middleware.ts`
```ts
import { updateSession } from "@/lib/supabase/middleware";
export const middleware = updateSession;
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"] };
```

- [ ] **Step 3: 인증 헬퍼와 타입**

`lib/types.ts`
```ts
export type Profile = { id: string; email: string; name: string | null; org_name: string | null; role: "member" | "admin"; credits: number; created_at: string };
export type PlanSettings = { id: number; name: string; price_krw: number; monthly_credits: number; credit_costs: Record<string, number>; updated_at: string };
export type Subscription = { id: string; user_id: string; status: "none" | "active" | "past_due" | "canceled"; customer_key: string; billing_key: string | null; card_company: string | null; card_number_masked: string | null; started_at: string | null; next_billing_at: string | null; canceled_at: string | null };
export type Project = { id: string; user_id: string; name: string; what: string; when_text: string | null; where_text: string | null; audience: string | null; cta: string | null; photos: string[]; created_at: string };
export type JobType = "document" | "newsletter" | "cardnews" | "promo_video" | "music_video";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type Job = { id: string; user_id: string; project_id: string | null; type: JobType; status: JobStatus; step: string | null; input: Record<string, unknown>; output: Record<string, unknown>; error: string | null; credits: number; provider_task_ids: Record<string, string>; lock_until: string | null; created_at: string; updated_at: string; finished_at: string | null };
```
`lib/auth.ts`
```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}
export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  return p;
}
export async function requireAdmin(): Promise<Profile> {
  const p = await requireProfile();
  if (p.role !== "admin") redirect("/studio");
  return p;
}
```

- [ ] **Step 4: 빌드 후 커밋**
```bash
npm run build && git add -A && git commit -m "feat: Supabase 클라이언트·미들웨어·인증 헬퍼"
```

---

### Task 4: 로그인·회원가입

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/auth/actions.ts`, `app/auth/callback/route.ts`

- [ ] **Step 1: 서버 액션**

`app/auth/actions.ts`
```ts
"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: String(formData.get("email")), password: String(formData.get("password")) });
  if (error) redirect(`/login?error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}`);
  redirect(String(formData.get("next") || "/studio"));
}
export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")), password: String(formData.get("password")),
    options: { data: { name: String(formData.get("name") || "") }, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=" + encodeURIComponent("가입 완료. 이메일 인증 후 로그인하세요."));
}
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` } });
  if (data.url) redirect(data.url);
}
```
`app/auth/callback/route.ts`
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) { const supabase = await createClient(); await supabase.auth.exchangeCodeForSession(code); }
  return NextResponse.redirect(`${origin}/studio`);
}
```

- [ ] **Step 2: 페이지** — 폼 두 개(이메일·비밀번호·이름), 구글 버튼, `?error`/`?message` 표시. 디자인은 4단계 랜딩과 함께 다듬으므로 여기서는 Tailwind 기본 카드 레이아웃.

- [ ] **Step 3: 빌드 후 커밋** `git commit -m "feat: 로그인·회원가입"`

---

### Task 5: 크레딧 모듈 (TDD)

**Files:**
- Create: `lib/credits.ts`, `tests/credits.test.ts`

- [ ] **Step 1: 실패 테스트**

`tests/credits.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { costFor, DEFAULT_COSTS } from "@/lib/credits";
describe("costFor", () => {
  it("단일 작업 단가", () => {
    expect(costFor("document", DEFAULT_COSTS)).toBe(1);
    expect(costFor("promo_video", DEFAULT_COSTS)).toBe(20);
  });
  it("카드뉴스는 장수 배수", () => {
    expect(costFor("cardnews", DEFAULT_COSTS, { pages: 4 })).toBe(4);
  });
  it("관리자 단가 덮어쓰기", () => {
    expect(costFor("newsletter", { ...DEFAULT_COSTS, newsletter: 5 })).toBe(5);
  });
});
```
Run: `npm test` → FAIL (module not found).

- [ ] **Step 2: 구현**

`lib/credits.ts`
```ts
import type { JobType } from "@/lib/types";
import { adminClient } from "@/lib/supabase/admin";
export const DEFAULT_COSTS: Record<string, number> = { document: 1, newsletter: 2, cardnews_page: 1, promo_video: 20, music_video: 30 };
export function costFor(type: JobType, costs: Record<string, number>, opts: { pages?: number } = {}): number {
  if (type === "cardnews") return (costs.cardnews_page ?? DEFAULT_COSTS.cardnews_page) * Math.max(1, opts.pages ?? 1);
  return costs[type] ?? DEFAULT_COSTS[type];
}
export async function getCosts(): Promise<Record<string, number>> {
  const { data } = await adminClient().from("plan_settings").select("credit_costs").eq("id", 1).single();
  return { ...DEFAULT_COSTS, ...(data?.credit_costs ?? {}) };
}
export class InsufficientCredits extends Error { constructor() { super("크레딧이 부족합니다. 구독을 확인해 주세요."); } }
export async function deductCredits(userId: string, amount: number, reason: string, jobId: string | null) {
  const { data, error } = await adminClient().rpc("deduct_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_job: jobId });
  if (error) { if (error.message.includes("INSUFFICIENT_CREDITS")) throw new InsufficientCredits(); throw error; }
  return data as number;
}
export async function addCredits(userId: string, amount: number, reason: string, jobId: string | null) {
  const { data, error } = await adminClient().rpc("add_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_job: jobId });
  if (error) throw error;
  return data as number;
}
export async function setCredits(userId: string, amount: number, reason: string) {
  const { data, error } = await adminClient().rpc("set_credits", { p_user: userId, p_amount: amount, p_reason: reason });
  if (error) throw error;
  return data as number;
}
```
Run: `npm test` → PASS.

- [ ] **Step 3: 커밋** `git commit -m "feat: 크레딧 모듈"`

---

### Task 6: 개인정보 패턴 검사 (TDD)

**Files:**
- Create: `lib/pii.ts`, `tests/pii.test.ts`

- [ ] **Step 1: 테스트**
```ts
import { describe, it, expect } from "vitest";
import { checkPII } from "@/lib/pii";
describe("checkPII", () => {
  it("주민번호는 차단", () => { expect(checkPII("김OO 900101-1234567").blocked).toBe(true); });
  it("계좌번호 추정은 경고", () => { const r = checkPII("계좌 352-0123-4567-89"); expect(r.blocked).toBe(false); expect(r.warnings.length).toBeGreaterThan(0); });
  it("전화번호는 허용", () => { const r = checkPII("문의 031-123-4567"); expect(r.blocked).toBe(false); expect(r.warnings).toEqual([]); });
  it("깨끗한 문장", () => { expect(checkPII("추석 선물세트 9월 20일까지")).toEqual({ blocked: false, warnings: [] }); });
});
```
- [ ] **Step 2: 구현**
```ts
export type PIIResult = { blocked: boolean; warnings: string[] };
const RRN = /\b\d{6}-?[1-4]\d{6}\b/;
const PHONE = /\b0\d{1,2}-?\d{3,4}-?\d{4}\b/g;
const ACCOUNT = /\b\d{2,6}-\d{2,6}-\d{2,6}(-\d{2,6})?\b/;
export function checkPII(text: string): PIIResult {
  if (RRN.test(text)) return { blocked: true, warnings: ["주민등록번호로 보이는 숫자가 있어 저장할 수 없습니다."] };
  const stripped = text.replace(PHONE, "");
  const warnings: string[] = [];
  if (ACCOUNT.test(stripped)) warnings.push("계좌번호로 보이는 숫자가 있습니다. 조합원 정보는 넣지 마세요.");
  return { blocked: false, warnings };
}
```
- [ ] **Step 3: `npm test` PASS 후 커밋** `git commit -m "feat: 개인정보 패턴 검사"`

---

### Task 7: 토스 결제 모듈 + 구독 로직 (TDD)

**Files:**
- Create: `lib/providers/toss.ts`, `lib/billing.ts`, `tests/billing.test.ts`

- [ ] **Step 1: 테스트 (순수 함수)**
```ts
import { describe, it, expect } from "vitest";
import { nextBillingDate, makeOrderId } from "@/lib/billing";
describe("billing", () => {
  it("다음 결제일은 한 달 뒤", () => {
    expect(nextBillingDate(new Date("2026-01-31T00:00:00Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(nextBillingDate(new Date("2026-09-10T00:00:00Z")).toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });
  it("orderId 형식", () => { expect(makeOrderId("u1")).toMatch(/^sub_u1_\d+$/); });
});
```
- [ ] **Step 2: 구현**

`lib/providers/toss.ts`
```ts
const BASE = "https://api.tosspayments.com/v1";
const auth = () => "Basic " + Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64");
export type BillingKeyResult = { billingKey: string; card?: { company?: string; number?: string; issuerCode?: string } };
export async function issueBillingKey(authKey: string, customerKey: string): Promise<BillingKeyResult> {
  const r = await fetch(`${BASE}/billing/authorizations/issue`, { method: "POST", headers: { Authorization: auth(), "Content-Type": "application/json" }, body: JSON.stringify({ authKey, customerKey }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message ?? "빌링키 발급 실패");
  return j;
}
export async function chargeBillingKey(p: { billingKey: string; customerKey: string; amount: number; orderId: string; orderName: string; customerEmail?: string; customerName?: string }) {
  const { billingKey, ...body } = p;
  const r = await fetch(`${BASE}/billing/${billingKey}`, { method: "POST", headers: { Authorization: auth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message ?? "결제 실패");
  return j as { paymentKey: string; status: string; approvedAt?: string };
}
```
`lib/billing.ts`
```ts
import { adminClient } from "@/lib/supabase/admin";
import { chargeBillingKey, issueBillingKey } from "@/lib/providers/toss";
import { setCredits } from "@/lib/credits";
export function nextBillingDate(from: Date): Date {
  const d = new Date(from); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d;
}
export const makeOrderId = (userId: string) => `sub_${userId}_${Date.now()}`;
export async function activateSubscription(userId: string, authKey: string, customerKey: string) {
  const db = adminClient();
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).single();
  const { data: plan } = await db.from("plan_settings").select("*").eq("id", 1).single();
  const bk = await issueBillingKey(authKey, customerKey);
  const orderId = makeOrderId(userId.slice(0, 8));
  const pay = await chargeBillingKey({ billingKey: bk.billingKey, customerKey, amount: plan.price_krw, orderId, orderName: plan.name, customerEmail: profile.email, customerName: profile.name ?? undefined });
  const now = new Date();
  await db.from("subscriptions").upsert({ user_id: userId, status: "active", customer_key: customerKey, billing_key: bk.billingKey, card_company: bk.card?.company ?? null, card_number_masked: bk.card?.number ?? null, started_at: now.toISOString(), next_billing_at: nextBillingDate(now).toISOString(), canceled_at: null }, { onConflict: "user_id" });
  await db.from("payments").insert({ user_id: userId, order_id: orderId, amount: plan.price_krw, status: pay.status, toss_payment_key: pay.paymentKey, raw: pay, paid_at: now.toISOString() });
  await setCredits(userId, plan.monthly_credits, "subscription_start");
}
export async function runMonthlyBilling() {
  const db = adminClient();
  const { data: plan } = await db.from("plan_settings").select("*").eq("id", 1).single();
  const { data: due } = await db.from("subscriptions").select("*, profiles(email,name)").eq("status", "active").lte("next_billing_at", new Date().toISOString());
  const results: { user_id: string; ok: boolean; error?: string }[] = [];
  for (const s of due ?? []) {
    const orderId = makeOrderId(s.user_id.slice(0, 8));
    try {
      const pay = await chargeBillingKey({ billingKey: s.billing_key, customerKey: s.customer_key, amount: plan.price_krw, orderId, orderName: plan.name, customerEmail: s.profiles?.email, customerName: s.profiles?.name ?? undefined });
      const now = new Date();
      await db.from("payments").insert({ user_id: s.user_id, subscription_id: s.id, order_id: orderId, amount: plan.price_krw, status: pay.status, toss_payment_key: pay.paymentKey, raw: pay, paid_at: now.toISOString() });
      await db.from("subscriptions").update({ next_billing_at: nextBillingDate(new Date(s.next_billing_at)).toISOString() }).eq("id", s.id);
      await setCredits(s.user_id, plan.monthly_credits, "subscription_renewal");
      results.push({ user_id: s.user_id, ok: true });
    } catch (e) {
      await db.from("payments").insert({ user_id: s.user_id, subscription_id: s.id, order_id: orderId, amount: plan.price_krw, status: "FAILED", raw: { message: String(e) } });
      await db.from("subscriptions").update({ status: "past_due" }).eq("id", s.id);
      results.push({ user_id: s.user_id, ok: false, error: String(e) });
    }
  }
  return results;
}
export async function cancelSubscription(userId: string) {
  await adminClient().from("subscriptions").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("user_id", userId);
}
```
- [ ] **Step 3: `npm test` PASS 후 커밋** `git commit -m "feat: 토스 빌링·구독 로직"`

---

### Task 8: 결제 라우트·크론·결제 화면

**Files:**
- Create: `app/api/billing/success/route.ts`, `app/api/billing/cancel/route.ts`, `app/api/cron/billing/route.ts`, `app/studio/billing/page.tsx`, `app/studio/billing/BillingClient.tsx`, `app/pricing/page.tsx`

- [ ] **Step 1: success 라우트** — 로그인 사용자 확인, 쿼리 `customerKey`가 `cust_{userId}`와 일치하는지 검증, `activateSubscription` 호출 후 `/studio/billing?ok=1`로 리다이렉트. 실패 시 `?error=`.
- [ ] **Step 2: cancel 라우트(POST)** — 로그인 사용자 → `cancelSubscription`.
- [ ] **Step 3: cron 라우트** — `Authorization: Bearer ${CRON_SECRET}` 검사 후 `runMonthlyBilling()` 결과 JSON 반환. `export const maxDuration = 300`.
- [ ] **Step 4: BillingClient** — `loadTossPayments(NEXT_PUBLIC_TOSS_CLIENT_KEY)` → `tossPayments.payment({ customerKey })` → 버튼 클릭 시 `payment.requestBillingAuth({ method: "CARD", successUrl: `${origin}/api/billing/success`, failUrl: `${origin}/studio/billing?error=fail`, customerEmail, customerName })`. 활성 구독이면 카드 정보·다음 결제일·해지 버튼, 결제 내역 표를 표시.
- [ ] **Step 5: pricing 페이지** — plan_settings 읽어 가격·크레딧·5종 단가 표시, 로그인 여부에 따라 CTA.
- [ ] **Step 6: 빌드 후 커밋** `git commit -m "feat: 구독 결제 화면·크론"`

---

### Task 9: 스튜디오 레이아웃·대시보드·프로젝트(소재)

**Files:**
- Create: `app/studio/layout.tsx`, `app/studio/page.tsx`, `app/studio/projects/page.tsx`, `app/studio/projects/new/page.tsx`, `app/studio/projects/actions.ts`, `components/StudioNav.tsx`

- [ ] **Step 1: 레이아웃** — 좌측 내비(대시보드·프로젝트·문서·뉴스레터·카드뉴스·홍보영상·뮤직비디오·보관함·구독), 상단에 이름·잔여 크레딧·로그아웃. 구독이 `active`가 아니면 제작실 진입 시 `/studio/billing`로 안내 배너.
- [ ] **Step 2: 프로젝트 생성 액션**
```ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPII } from "@/lib/pii";
const schema = z.object({ name: z.string().min(1).max(60), what: z.string().min(2).max(200), when_text: z.string().max(100).optional(), where_text: z.string().max(100).optional(), audience: z.string().max(100).optional(), cta: z.string().max(100).optional() });
export async function createProject(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/studio/projects/new?error=" + encodeURIComponent("입력값을 확인하세요."));
  const joined = Object.values(parsed.data).filter(Boolean).join(" ");
  const pii = checkPII(joined);
  if (pii.blocked) redirect("/studio/projects/new?error=" + encodeURIComponent(pii.warnings[0]));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const photos: string[] = [];
  for (const f of formData.getAll("photos")) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > 10 * 1024 * 1024 || !["image/jpeg","image/png"].includes(f.type)) continue;
    const path = `${user!.id}/${crypto.randomUUID()}-${f.name}`;
    const { error } = await supabase.storage.from("uploads").upload(path, f, { contentType: f.type });
    if (!error) photos.push(path);
    if (photos.length >= 3) break;
  }
  const { data, error } = await supabase.from("projects").insert({ ...parsed.data, user_id: user!.id, photos }).select("id").single();
  if (error) redirect("/studio/projects/new?error=" + encodeURIComponent(error.message));
  redirect(`/studio?project=${data.id}`);
}
```
- [ ] **Step 3: 워크시트 폼** — 강의안 4칸(채널은 제외): 프로젝트 이름, 무엇을(what), 언제(when), 어디서(where), 대상(audience), 원하는 행동(cta), 사진 최대 3장. 개인정보 금지 안내 문구 상단 고정.
- [ ] **Step 4: 대시보드** — 잔여 크레딧, 구독 상태, 프로젝트 목록(카드), 최근 작업 10건.
- [ ] **Step 5: 빌드 후 커밋** `git commit -m "feat: 스튜디오 레이아웃·프로젝트 워크시트"`

---

### Task 10: 관리자 화면

**Files:**
- Create: `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/settings/page.tsx`, `app/admin/settings/actions.ts`, `app/admin/credits/actions.ts`, `app/admin/jobs/page.tsx`

- [ ] **Step 1: 레이아웃** — `requireAdmin()`.
- [ ] **Step 2: 회원 목록** — profiles + subscriptions 조인, 잔여 크레딧, 크레딧 조정 폼(`adjustCredits(userId, delta, reason)` → `addCredits`), 관리자 승격 토글.
- [ ] **Step 3: 설정** — plan_settings 편집(가격·월 크레딧·단가 5개) 서버 액션, zod 검증.
- [ ] **Step 4: 작업 로그** — jobs 최근 100건, 실패 필터, error 표시.
- [ ] **Step 5: 빌드 후 커밋** `git commit -m "feat: 관리자 화면"`

---

### Task 11: 최종 검증

- [ ] `npm test` 전부 PASS, `npm run build` 성공, `npm run lint` 경고 0.
- [ ] README에 Supabase 마이그레이션 적용 방법(SQL Editor에 0001_init.sql 붙여넣기), 최초 관리자 지정 SQL(`update profiles set role='admin' where email='...'`), 토스 테스트 키 안내 기록.
- [ ] 커밋.

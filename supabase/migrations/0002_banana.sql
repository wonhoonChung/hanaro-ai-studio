-- ro 요금정책 (지니젠 벤치마크) — 0001 적용 후 실행

-- 1) 충전분 잔고 분리: credits = 월 지급(구독, 결제일마다 재설정) / banana_purchased = 충전분(무기한)
alter table profiles add column if not exists banana_purchased integer not null default 0;

-- 2) 단가 기본값 갱신 (ro 단위)
update plan_settings set
  name = '하나로AI스튜디오 월 정액',
  price_krw = 99000,
  monthly_credits = 1300,
  credit_costs = '{"document":3,"newsletter":8,"cardnews_page":5,"promo_video":55,"music_video":110}'::jsonb,
  updated_at = now()
where id = 1;

-- 3) 충전 패키지
create table if not exists banana_packages (
  id text primary key,
  name text not null,
  bananas integer not null,
  price_krw integer not null,
  list_price_krw integer not null,
  description text,
  sort integer not null default 0,
  active boolean not null default true
);
insert into banana_packages (id, name, bananas, price_krw, list_price_krw, description, sort) values
  ('basic',      '베이직',      120,   10000,   12000, '가장 인기 있는 패키지', 1),
  ('value',      '밸류',        625,   50000,   62500, '정기 사용자 추천', 2),
  ('pro',        '프로',        1300,  100000,  130000, '전문가용 ro 패키지', 3),
  ('business',   '비즈니스',    6750,  500000,  675000, '기업·조합 단위 대용량', 4),
  ('enterprise', '엔터프라이즈', 14300, 1000000, 1430000, '최상위 기업용', 5)
on conflict (id) do update set name = excluded.name, bananas = excluded.bananas, price_krw = excluded.price_krw, list_price_krw = excluded.list_price_krw, description = excluded.description, sort = excluded.sort;

alter table banana_packages enable row level security;
drop policy if exists "packages readable" on banana_packages;
create policy "packages readable" on banana_packages for select using (true);

-- 4) 구매 기록 (토스 일반결제)
create table if not exists banana_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  package_id text not null references banana_packages(id),
  order_id text not null unique,
  bananas integer not null,
  amount integer not null,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  toss_payment_key text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table banana_purchases enable row level security;
drop policy if exists "purchases select" on banana_purchases;
create policy "purchases select" on banana_purchases for select using (user_id = auth.uid() or is_admin());

-- 5) 차감: 월 지급분 → 충전분 순서. 부족하면 예외
create or replace function deduct_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_m integer; v_p integer; v_from_m integer; v_from_p integer;
begin
  select credits, banana_purchased into v_m, v_p from profiles where id = p_user for update;
  if v_m is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_m + v_p < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;
  v_from_m := least(v_m, p_amount);
  v_from_p := p_amount - v_from_m;
  update profiles set credits = credits - v_from_m, banana_purchased = banana_purchased - v_from_p where id = p_user;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id)
    values (p_user, -p_amount, (v_m - v_from_m) + (v_p - v_from_p), p_reason, p_job);
  return (v_m - v_from_m) + (v_p - v_from_p);
end $$;

-- 6) 증가: 환불(refund:*)·구매(purchase:*)·보너스는 충전분에, 그 외(관리자 조정 등)는 월 지급분에
create or replace function add_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_m integer; v_p integer;
begin
  if p_reason like 'refund:%' or p_reason like 'purchase:%' or p_reason like 'bonus:%' then
    update profiles set banana_purchased = banana_purchased + p_amount where id = p_user returning credits, banana_purchased into v_m, v_p;
  else
    update profiles set credits = credits + p_amount where id = p_user returning credits, banana_purchased into v_m, v_p;
  end if;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id) values (p_user, p_amount, v_m + v_p, p_reason, p_job);
  return v_m + v_p;
end $$;

-- 7) 월 지급분 재설정 (충전분 보존)
create or replace function set_credits(p_user uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_old integer; v_p integer;
begin
  select credits, banana_purchased into v_old, v_p from profiles where id = p_user for update;
  update profiles set credits = p_amount where id = p_user;
  insert into credit_ledger (user_id, delta, balance_after, reason) values (p_user, p_amount - v_old, p_amount + v_p, p_reason);
  return p_amount + v_p;
end $$;

-- 8) 가입 보너스 30B
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name, banana_purchased)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''), 30)
  on conflict (id) do nothing;
  insert into credit_ledger (user_id, delta, balance_after, reason) values (new.id, 30, 30, 'bonus:signup');
  return new;
end $$;

-- 9) 구매 확정 (멱등): pending → paid + 충전
create or replace function confirm_banana_purchase(p_order_id text, p_payment_key text, p_raw jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare r banana_purchases%rowtype; v_bal integer;
begin
  select * into r from banana_purchases where order_id = p_order_id for update;
  if r.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if r.status = 'paid' then
    select credits + banana_purchased into v_bal from profiles where id = r.user_id; return v_bal;
  end if;
  update banana_purchases set status = 'paid', toss_payment_key = p_payment_key, raw = p_raw, paid_at = now() where id = r.id;
  v_bal := add_credits(r.user_id, r.bananas, 'purchase:' || r.package_id, null);
  return v_bal;
end $$;

-- profiles 보호 트리거에 banana_purchased도 포함
create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
  if new.role <> old.role and not is_admin() and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  if (new.credits <> old.credits or new.banana_purchased <> old.banana_purchased) and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'CREDITS_CHANGE_FORBIDDEN';
  end if;
  return new;
end $$;

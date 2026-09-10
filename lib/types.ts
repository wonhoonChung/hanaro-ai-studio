export type Role = "member" | "admin";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  org_name: string | null;
  role: Role;
  credits: number; // 월 지급분(구독)
  banana_purchased: number; // 충전분(무기한)
  created_at: string;
};

export type PlanSettings = {
  id: number;
  name: string;
  price_krw: number;
  monthly_credits: number;
  credit_costs: Record<string, number>;
  updated_at: string;
};

export type SubscriptionStatus = "none" | "active" | "past_due" | "canceled";

export type Subscription = {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  customer_key: string;
  billing_key: string | null;
  card_company: string | null;
  card_number_masked: string | null;
  started_at: string | null;
  next_billing_at: string | null;
  canceled_at: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  user_id: string;
  subscription_id: string | null;
  order_id: string;
  amount: number;
  status: string;
  toss_payment_key: string | null;
  raw: unknown;
  paid_at: string | null;
  created_at: string;
};

export type CreditLedger = {
  id: number;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  job_id: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  what: string;
  when_text: string | null;
  where_text: string | null;
  audience: string | null;
  cta: string | null;
  photos: string[];
  created_at: string;
};

export type JobType = "document" | "newsletter" | "cardnews" | "promo_video" | "music_video";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type Job = {
  id: string;
  user_id: string;
  project_id: string | null;
  type: JobType;
  status: JobStatus;
  step: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  credits: number;
  provider_task_ids: Record<string, string>;
  lock_until: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type AssetKind = "image" | "video" | "audio" | "hwpx" | "zip";

export type Asset = {
  id: string;
  user_id: string;
  job_id: string | null;
  kind: AssetKind;
  storage_path: string;
  mime: string;
  size: number | null;
  meta: Record<string, unknown>;
  is_public: boolean;
  created_at: string;
};

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  document: "문서(HWP)",
  newsletter: "뉴스레터",
  cardnews: "카드뉴스",
  promo_video: "홍보영상",
  music_video: "뮤직비디오",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "대기",
  running: "생성 중",
  succeeded: "완료",
  failed: "실패",
};

export type BananaPurchase = {
  id: string;
  user_id: string;
  package_id: string;
  order_id: string;
  bananas: number;
  amount: number;
  status: "pending" | "paid" | "failed" | "refunded";
  toss_payment_key: string | null;
  paid_at: string | null;
  created_at: string;
};

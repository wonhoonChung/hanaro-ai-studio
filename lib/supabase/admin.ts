import { createClient } from "@supabase/supabase-js";

/** 서비스 롤 클라이언트 — RLS를 우회하므로 서버에서만, 신중하게 사용 */
export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

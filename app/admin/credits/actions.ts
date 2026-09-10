"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { addCredits } from "@/lib/credits";

export async function adjustCredits(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") ?? "").trim() || "관리자 조정";
  if (!userId || !Number.isInteger(delta) || delta === 0) redirect("/admin?error=" + encodeURIComponent("조정 값을 확인하세요."));
  await addCredits(userId, delta, `admin:${admin.email}:${reason}`, null);
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

export async function setRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role")) === "admin" ? "admin" : "member";
  if (userId === admin.id) redirect("/admin?error=" + encodeURIComponent("본인 권한은 바꿀 수 없습니다."));
  await adminClient().from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

export async function setSubscriptionStatus(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status"));
  if (!["active", "canceled", "past_due", "none"].includes(status)) redirect("/admin");
  const db = adminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "active") {
    const { data: s } = await db.from("subscriptions").select("next_billing_at").eq("user_id", userId).maybeSingle();
    if (!s?.next_billing_at) {
      const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1);
      patch.started_at = new Date().toISOString(); patch.next_billing_at = d.toISOString();
    }
  }
  await db.from("subscriptions").upsert({ user_id: userId, customer_key: `cust_${userId}`, ...patch }, { onConflict: "user_id" });
  revalidatePath("/admin");
  redirect("/admin?ok=1");
}

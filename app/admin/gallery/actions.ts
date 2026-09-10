"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";

/** 결과물을 랜딩 갤러리에 공개/비공개 */
export async function setAssetPublic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("asset_id") ?? "");
  const isPublic = String(formData.get("is_public")) === "1";
  const title = String(formData.get("title") ?? "").trim();
  const db = adminClient();
  const { data: asset } = await db.from("assets").select("meta").eq("id", id).single();
  await db
    .from("assets")
    .update({ is_public: isPublic, meta: { ...((asset?.meta as Record<string, unknown>) ?? {}), gallery_title: title || undefined } })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath("/admin/gallery");
  redirect("/admin/gallery?ok=1");
}

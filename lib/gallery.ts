import { adminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/auth";
import type { Asset, JobType } from "@/lib/types";

export type GalleryItem = { id: string; kind: "image" | "video"; title: string; type: JobType | null; org: string | null };

/** 랜딩 갤러리: 관리자가 공개한 결과물 */
export async function getGallery(limit = 8): Promise<GalleryItem[]> {
  if (!supabaseConfigured()) return [];
  try {
    const { data } = await adminClient()
      .from("assets")
      .select("id, kind, meta, jobs(type, profiles(org_name))")
      .eq("is_public", true)
      .in("kind", ["image", "video"])
      .order("created_at", { ascending: false })
      .limit(limit);
    type Row = Pick<Asset, "id" | "kind" | "meta"> & { jobs: { type: JobType; profiles: { org_name: string | null } | null } | null };
    return ((data ?? []) as unknown as Row[]).map((a) => ({
      id: a.id,
      kind: a.kind as "image" | "video",
      title: (a.meta as { gallery_title?: string; filename?: string }).gallery_title ?? (a.meta as { filename?: string }).filename ?? "",
      type: a.jobs?.type ?? null,
      org: a.jobs?.profiles?.org_name ?? null,
    }));
  } catch {
    return [];
  }
}

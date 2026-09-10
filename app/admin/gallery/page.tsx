import { adminClient } from "@/lib/supabase/admin";
import { Alert } from "@/components/Alert";
import { JOB_TYPE_LABEL, type Asset, type JobType } from "@/lib/types";
import { setAssetPublic } from "./actions";

export const metadata = { title: "관리자 · 갤러리" };
export const dynamic = "force-dynamic";

type Row = Asset & { jobs: { type: JobType; created_at: string; profiles: { name: string | null; org_name: string | null } | null } | null };

export default async function AdminGallery({ searchParams }: PageProps<"/admin/gallery">) {
  const sp = await searchParams;
  const { data } = await adminClient()
    .from("assets")
    .select("*, jobs(type, created_at, profiles(name, org_name))")
    .in("kind", ["image", "video"])
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as Row[]).filter((a) => !(a.meta as { intermediate?: boolean }).intermediate);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">갤러리 공개 관리</h1><p className="mt-1 text-sm text-muted">수강생 결과물 중 랜딩 페이지에 보여줄 것을 고릅니다. 개인정보·초상권이 없는 결과물만 공개하세요.</p></div>
      {sp.ok && <Alert kind="success">반영되었습니다.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => (
          <div key={a.id} className={`card space-y-2 ${a.is_public ? "border-brand" : ""}`}>
            {a.kind === "video" ? (
              <video src={`/api/assets/${a.id}`} controls className="w-full rounded-lg bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${a.id}`} alt="" className="w-full rounded-lg" />
            )}
            <p className="text-xs text-muted">{a.jobs ? JOB_TYPE_LABEL[a.jobs.type] : a.kind} · {a.jobs?.profiles?.org_name || a.jobs?.profiles?.name || ""} · {new Date(a.created_at).toLocaleDateString("ko-KR")}</p>
            <form action={setAssetPublic} className="flex items-center gap-2">
              <input type="hidden" name="asset_id" value={a.id} />
              <input type="hidden" name="is_public" value={a.is_public ? "0" : "1"} />
              <input name="title" defaultValue={(a.meta as { gallery_title?: string }).gallery_title ?? ""} placeholder="갤러리 제목(선택)" className="input py-1 text-xs" />
              <button className={`${a.is_public ? "btn-danger" : "btn-primary"} px-3 py-1 text-xs whitespace-nowrap`}>{a.is_public ? "비공개" : "공개"}</button>
            </form>
          </div>
        ))}
        {rows.length === 0 && <div className="card text-sm text-muted">아직 결과물이 없습니다.</div>}
      </div>
    </div>
  );
}

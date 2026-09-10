import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { deleteProject } from "./actions";

export const metadata = { title: "프로젝트(소재)" };

export default async function ProjectsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("user_id", profile.id).order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">프로젝트(소재)</h1>
          <p className="mt-1 text-sm text-muted">소재 하나로 뉴스레터·영상·뮤직비디오까지. 같은 소재를 끝까지 우려내세요.</p>
        </div>
        <Link href="/studio/projects/new" className="btn-primary">+ 새 프로젝트</Link>
      </div>
      {projects.length === 0 ? (
        <div className="card text-sm text-muted">아직 프로젝트가 없습니다.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="card flex flex-col">
              <h3 className="font-semibold">{p.name}</h3>
              <dl className="mt-2 space-y-1 text-sm">
                <div><dt className="inline text-muted">무엇을 </dt><dd className="inline">{p.what}</dd></div>
                {p.when_text && <div><dt className="inline text-muted">언제 </dt><dd className="inline">{p.when_text}</dd></div>}
                {p.where_text && <div><dt className="inline text-muted">어디서 </dt><dd className="inline">{p.where_text}</dd></div>}
                {p.audience && <div><dt className="inline text-muted">대상 </dt><dd className="inline">{p.audience}</dd></div>}
                {p.cta && <div><dt className="inline text-muted">행동 </dt><dd className="inline">{p.cta}</dd></div>}
              </dl>
              <p className="hint">사진 {p.photos.length}장 · {new Date(p.created_at).toLocaleDateString("ko-KR")}</p>
              <div className="mt-auto flex gap-2 pt-4">
                <Link href={`/studio/newsletter?project=${p.id}`} className="btn-secondary text-xs">뉴스레터</Link>
                <Link href={`/studio/promo-video?project=${p.id}`} className="btn-secondary text-xs">홍보영상</Link>
                <form action={deleteProject} className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs text-muted hover:text-danger">삭제</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

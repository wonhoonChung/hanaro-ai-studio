import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getProfile();
  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-4xl font-black leading-tight">우리 조합 이야기 하나로,<br />뉴스레터·영상·뮤직비디오까지.</h1>
        <p className="mt-4 text-muted">랜딩 페이지는 4단계에서 완성됩니다.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href={profile ? "/studio" : "/signup"} className="btn-primary">{profile ? "스튜디오 열기" : "시작하기"}</Link>
          <Link href="/pricing" className="btn-secondary">요금 안내</Link>
        </div>
      </main>
    </>
  );
}

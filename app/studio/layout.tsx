import Link from "next/link";
import { requireProfile, getSubscription, isSubscribed } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import { Logo } from "@/components/Logo";
import { StudioNav } from "@/components/StudioNav";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const sub = await getSubscription(profile.id);
  const subscribed = isSubscribed(sub);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white p-4 md:flex">
        <div className="mb-6 px-1"><Logo href="/studio" /></div>
        <StudioNav isAdmin={profile.role === "admin"} />
        <div className="mt-auto rounded-lg bg-brand-soft p-3 text-xs text-brand-deep">
          <p className="font-medium">절대 수칙</p>
          <p className="mt-1 leading-relaxed">조합원 이름·계좌·연락처는 입력하지 않기 · AI 결과는 초안, 발송 전 사람이 확인 · 사진은 동의 받은 것만</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
          <div className="md:hidden"><Logo href="/studio" /></div>
          <div className="hidden text-sm text-muted md:block">{profile.org_name ? `${profile.org_name} · ` : ""}{profile.name || profile.email}</div>
          <div className="flex items-center gap-3">
            <Link href="/studio/billing" className="badge bg-gold-soft text-[#7a5d00]">크레딧 {profile.credits}</Link>
            <span className={`badge ${subscribed ? "bg-brand-soft text-brand-deep" : "bg-gray-100 text-muted"}`}>{subscribed ? "구독 중" : "미구독"}</span>
            <form action={signOut}><button className="text-sm text-muted hover:text-foreground">로그아웃</button></form>
          </div>
        </header>

        {!subscribed && (
          <div className="border-b border-gold/40 bg-gold-soft px-6 py-2 text-sm text-[#7a5d00]">
            제작실을 사용하려면 구독이 필요합니다. <Link href="/studio/billing" className="font-semibold underline">구독 시작하기</Link>
          </div>
        )}

        <main className="flex-1 p-6 md:p-8">{children}</main>

        <nav className="flex justify-around border-t border-line bg-white p-2 text-xs md:hidden">
          <Link href="/studio">대시보드</Link><Link href="/studio/projects">프로젝트</Link><Link href="/studio/library">보관함</Link><Link href="/studio/billing">구독</Link>
        </nav>
      </div>
    </div>
  );
}

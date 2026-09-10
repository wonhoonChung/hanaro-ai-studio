import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { Profile } from "@/lib/types";

export function SiteHeader({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/#features" className="px-3 py-2 text-muted hover:text-foreground">제작실</Link>
          <Link href="/pricing" className="px-3 py-2 text-muted hover:text-foreground">요금</Link>
          {profile ? (
            <Link href="/studio" className="btn-primary">스튜디오 열기</Link>
          ) : (
            <>
              <Link href="/login" className="px-3 py-2 text-muted hover:text-foreground">로그인</Link>
              <Link href="/signup" className="btn-primary">시작하기</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

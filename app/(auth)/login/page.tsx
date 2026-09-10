import Link from "next/link";
import { Alert } from "@/components/Alert";
import { signIn, signInWithGoogle } from "@/app/auth/actions";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;
  const next = typeof sp.next === "string" ? sp.next : "/studio";

  return (
    <div className="card space-y-5">
      <div>
        <h1 className="text-2xl font-bold">로그인</h1>
        <p className="mt-1 text-sm text-muted">수강생·이용자 계정으로 스튜디오에 들어갑니다.</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}

      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">비밀번호</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <button type="submit" className="btn-primary w-full">로그인</button>
      </form>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="btn-secondary w-full">구글 계정으로 계속하기</button>
      </form>

      <p className="text-center text-sm text-muted">
        아직 계정이 없나요? <Link href="/signup" className="font-medium text-brand hover:underline">회원가입</Link>
      </p>
    </div>
  );
}

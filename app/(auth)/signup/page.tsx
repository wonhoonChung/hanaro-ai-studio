import Link from "next/link";
import { Alert } from "@/components/Alert";
import { signUp, signInWithGoogle } from "@/app/auth/actions";

export const metadata = { title: "회원가입" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="card space-y-5">
      <div>
        <h1 className="text-2xl font-bold">회원가입</h1>
        <p className="mt-1 text-sm text-muted">가입 후 월 정액 구독을 시작하면 5종 제작실을 모두 쓸 수 있습니다.</p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}

      <form action={signUp} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">이름</label>
          <input id="name" name="name" required className="input" placeholder="홍길동" />
        </div>
        <div>
          <label className="label" htmlFor="org_name">소속 조합·기관 (선택)</label>
          <input id="org_name" name="org_name" className="input" placeholder="예) 안성농협" />
        </div>
        <div>
          <label className="label" htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">비밀번호</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          <p className="hint">8자 이상</p>
        </div>
        <button type="submit" className="btn-primary w-full">가입하기</button>
      </form>

      <form action={signInWithGoogle}>
        <button type="submit" className="btn-secondary w-full">구글 계정으로 가입</button>
      </form>

      <p className="text-center text-sm text-muted">
        이미 계정이 있나요? <Link href="/login" className="font-medium text-brand hover:underline">로그인</Link>
      </p>
    </div>
  );
}

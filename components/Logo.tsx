import Link from "next/link";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-black tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white text-sm">하</span>
      <span className={light ? "text-white" : "text-foreground"}>
        하나로<span className="text-brand">AI</span>스튜디오
      </span>
    </Link>
  );
}

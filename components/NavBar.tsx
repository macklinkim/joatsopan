"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/explore", label: "기업 탐색" },
  { href: "/monthly", label: "이달의 좋소" },
  { href: "/memorial", label: "별이 된 좋소" },
  { href: "/awards", label: "좋소 시상식" },
  { href: "/game", label: "좋소 게임" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-primary/[0.07] bg-surface-paper/85 backdrop-blur">
      <nav className="mx-auto flex max-w-container flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-12">
        <Link href="/" className="shrink-0 font-head text-lg font-bold tracking-[-0.02em]">
          좋소판별기<span className="text-risk-high">.</span>
        </Link>
        <ul className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-sm sm:gap-2">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`rounded-md px-2.5 py-1.5 transition-colors sm:px-3 ${
                    active
                      ? "bg-primary/[0.06] font-semibold text-primary"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

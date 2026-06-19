import { gamePool } from "@/lib/data";
import GuessGame from "@/components/GuessGame";

export const metadata = { title: "좋소 게임 — 좋소판별기" };

export default function GamePage() {
  const pool = gamePool(12);
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">좋소 게임</h1>
      <p className="mt-2 mb-6 text-sm text-on-surface-variant">
        직원 수·연봉·회전율만 보고 좋소(위험도 50+)인지 맞혀보세요.
      </p>
      <GuessGame data={pool} />
    </main>
  );
}

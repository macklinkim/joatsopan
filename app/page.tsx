import SearchBox from "@/components/SearchBox";
import { TOTAL_ACTIVE, DATA_YM } from "@/lib/data";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-container flex-col items-center px-5 md:px-12">
      <section className="flex w-full max-w-2xl flex-1 flex-col justify-center py-20">
        <p className="mb-3 text-sm font-medium text-on-surface-variant">
          공공데이터(국민연금) 기반 · 참고용 · 기준월 {DATA_YM}
        </p>
        <h1 className="font-head text-4xl font-bold tracking-[-0.02em] md:text-5xl">
          좋소판별기
        </h1>
        <p className="mt-3 mb-8 text-base text-on-surface-variant">
          회사명·사업자번호를 검색하면 직원 수·연봉·회전율을 분석해 위험도를 추정합니다.
          전국 가입 사업장 <span className="tnum font-semibold text-primary">{TOTAL_ACTIVE.toLocaleString()}</span>곳 기준.
        </p>
        <SearchBox />
        <p className="mt-6 text-xs text-outline">
          예시 검색: <span className="font-mono">삼성</span> ·{" "}
          <span className="font-mono">소프트</span> ·{" "}
          <span className="font-mono">카카오</span>
        </p>
      </section>
    </main>
  );
}

import SearchBox from "@/components/SearchBox";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-container flex-col items-center px-5 md:px-12">
      <section className="flex w-full max-w-2xl flex-1 flex-col justify-center py-24">
        <p className="mb-3 text-sm font-medium text-on-surface-variant">
          공공데이터(국민연금) 기반 · 참고용
        </p>
        <h1 className="font-head text-4xl font-bold tracking-[-0.02em] md:text-5xl">
          좋소판별기
        </h1>
        <p className="mt-3 mb-8 text-base text-on-surface-variant">
          회사명을 검색하면 직원 수·연봉·회전율을 분석해 위험도를 추정합니다.
        </p>
        <SearchBox />
        <p className="mt-6 text-xs text-outline">
          예시 검색: <span className="font-mono">소프트</span> ·{" "}
          <span className="font-mono">샤이닝</span> ·{" "}
          <span className="font-mono">아나패스</span>
        </p>
      </section>
      <footer className="w-full py-6 text-center text-xs text-outline">
        ※ 본 결과는 공공데이터(국민연금) 기반 추정치이며 참고용입니다.
      </footer>
    </main>
  );
}

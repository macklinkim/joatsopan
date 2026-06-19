import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-primary/[0.07]">
      <div className="mx-auto max-w-container px-5 py-8 md:px-12">
        <p className="text-xs leading-relaxed text-outline">
          ※ 본 결과는 공공데이터(국민연금 가입 사업장 내역) 기반 <b>추정치</b>이며 참고용입니다. 실제와 다를 수 있고,
          특정 기업 비방 목적이 아닙니다.
        </p>
        <nav className="mt-3 flex gap-4 text-xs">
          <Link href="/" className="text-on-surface-variant hover:text-primary">홈</Link>
          <Link href="/about" className="text-on-surface-variant hover:text-primary">이용 안내 · 데이터 출처</Link>
          <a href="https://www.data.go.kr/data/15083277/fileData.do" target="_blank" rel="noopener noreferrer" className="text-on-surface-variant hover:text-primary">원본 데이터</a>
        </nav>
      </div>
    </footer>
  );
}

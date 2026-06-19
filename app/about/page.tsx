import { TOTAL_ACTIVE, DATA_YM } from "@/lib/data";

export const metadata = {
  title: "이용 안내 · 데이터 출처 — 좋소판별기",
  description: "데이터 출처(국민연금 공공데이터), 위험도 추정 방식, 면책 안내.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-head text-xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-on-surface-variant">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:px-12">
      <h1 className="font-head text-3xl font-bold tracking-[-0.01em]">이용 안내</h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        좋소판별기는 공개된 국민연금 공공데이터로 중소기업의 근무 여건 위험도를 <b>추정</b>해 보여주는
        비영리 학습용 서비스입니다. 모든 수치는 추정치이며 참고용입니다.
      </p>

      <Section title="데이터 출처">
        <p>
          국민연금공단 「국민연금 가입 사업장 내역」 (공공데이터포털 data.go.kr, 파일데이터).
          기준월 <b className="tnum">{DATA_YM}</b>, 전국 가입 사업장 약{" "}
          <b className="tnum">{TOTAL_ACTIVE.toLocaleString()}</b>곳(가입자 수 3인 이상 법인 / 10인 이상 개인 기준).
        </p>
        <p>수록 항목: 사업장명·업종·지역(법정동)·가입자수·당월고지금액·신규취득/상실 가입자수 등.</p>
      </Section>

      <Section title="위험도 추정 방식">
        <p>아래 4개 신호를 합산해 0~100 점수로 환산합니다(높을수록 위험 추정).</p>
        <ul className="ml-4 list-disc space-y-1">
          <li><b>직원 수</b>: 100인+ 0점 / 30~99인 8점 / 30인 미만 16점</li>
          <li><b>추정 연봉</b>: 업종 중앙값 대비 낮을수록 최대 35점 (추정 연봉 = 당월고지금액 ÷ 가입자수 ÷ 0.09 × 12)</li>
          <li><b>회전율</b>: (신규+상실)÷가입자수, 약 20%↑부터 가산해 최대 35점</li>
          <li><b>휴·폐업 신호</b>: 가입 상태 이상 시 30점</li>
        </ul>
        <p>등급: 0~19 희귀 중소 · 20~49 보통 · 50+ 좋소 확정.</p>
      </Section>

      <Section title="한계와 면책">
        <p>
          • 추정 연봉은 국민연금 기준소득월액 상한 때문에 고연봉 구간이 과소평가될 수 있습니다.<br />
          • 월별 추이 그래프는 최근월 실측을 기준으로 한 <b>추정 곡선</b>입니다(다개월 실데이터 미적용).<br />
          • 사업자등록번호는 공공데이터 특성상 일부만 표기됩니다.
        </p>
        <p>
          본 결과는 특정 기업을 비방할 목적이 아니며, 실제 사실과 다를 수 있습니다. 채용·투자 등 의사결정의
          근거로 단독 사용하지 마시고 공식 정보로 교차 확인하시기 바랍니다.
        </p>
        <p>
          정보 정정·삭제 요청은 <b>원본 공공데이터(data.go.kr 국민연금공단)</b> 기준이며, 본 서비스는 원본을
          가공해 표시할 뿐 별도 데이터를 보유하지 않습니다.
        </p>
      </Section>
    </main>
  );
}

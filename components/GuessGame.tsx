"use client";

import { useState } from "react";
import Link from "next/link";
import type { Company } from "@/lib/types";
import { won, riskColor, riskTextColor } from "@/lib/format";

export default function GuessGame({ data }: { data: Company[] }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastHit, setLastHit] = useState<boolean | null>(null);

  const c = data[i];
  const isJotso = c.risk_score >= 50; // 정답: 좋소 확정 여부
  const done = i >= data.length;

  const guess = (sayJotso: boolean) => {
    if (revealed) return;
    const hit = sayJotso === isJotso;
    setLastHit(hit);
    setRevealed(true);
    if (hit) {
      setCorrect((v) => v + 1);
      setStreak((v) => v + 1);
    } else {
      setStreak(0);
    }
  };

  const next = () => {
    setRevealed(false);
    setLastHit(null);
    setI((v) => v + 1);
  };

  const restart = () => {
    setI(0);
    setRevealed(false);
    setCorrect(0);
    setStreak(0);
    setLastHit(null);
  };

  if (done) {
    const pct = Math.round((correct / data.length) * 100);
    return (
      <div className="rounded-lg border border-primary/[0.08] bg-surface-white p-8 text-center">
        <p className="text-sm text-on-surface-variant">게임 종료</p>
        <p className="mt-2 font-head text-5xl font-bold tnum">
          {correct}<span className="text-2xl text-outline"> / {data.length}</span>
        </p>
        <p className="mt-2 text-lg font-medium" style={{ color: pct >= 70 ? "#2A8D5C" : pct >= 40 ? "#1A1A1A" : "#D8362A" }}>
          정답률 {pct}% — {pct >= 70 ? "좋소 감별사 인정 🎖️" : pct >= 40 ? "아직 좋소에 당할 수 있어요" : "좋소 자석 체질입니다 🧲"}
        </p>
        <button
          onClick={restart}
          className="mt-6 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-surface-paper hover:opacity-90"
        >
          다시 하기
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 점수판 */}
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-on-surface-variant tnum">
          {i + 1} / {data.length}
        </span>
        <span className="flex gap-4">
          <span className="tnum">정답 <b className="font-semibold">{correct}</b></span>
          <span className="tnum">연속 <b className="font-semibold" style={{ color: streak >= 3 ? "#2A8D5C" : "#1A1A1A" }}>{streak}🔥</b></span>
        </span>
      </div>

      <div className="rounded-lg border border-primary/[0.08] bg-surface-white p-6 md:p-8">
        <p className="text-xs text-on-surface-variant">이 회사, 좋소일까?</p>
        <h2 className="mt-1 truncate font-head text-2xl font-bold md:text-3xl">{c.biz_name}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          {c.sigungu} {c.dong} · {c.industry_name}
        </p>

        {/* 단서 지표 */}
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Clue label="직원 수" value={`${c.cur_members.toLocaleString()}명`} />
          <Clue label="추정 연봉" value={won(c.cur_salary)} />
          <Clue label="회전율" value={`${c.cur_turnover}%`} />
        </dl>

        {!revealed ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => guess(true)}
              className="rounded-lg border-2 border-risk-high/40 py-3 font-semibold text-risk-high hover:bg-risk-high/[0.06]"
            >
              🚩 좋소다
            </button>
            <button
              onClick={() => guess(false)}
              className="rounded-lg border-2 border-risk-safe/40 py-3 font-semibold text-risk-safe hover:bg-risk-safe/[0.06]"
            >
              ✅ 괜찮다
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <div
              className="rounded-lg p-4 text-center"
              style={{ background: `${riskColor(c.risk_score)}12` }}
            >
              <p className="text-sm font-semibold" style={{ color: lastHit ? "#2A8D5C" : "#D8362A" }}>
                {lastHit ? "정답! 🎯" : "땡! ❌"}
              </p>
              <p className="mt-1 tnum text-3xl font-bold" style={{ color: riskTextColor(c.risk_score) }}>
                {c.risk_score} <span className="text-base font-medium">{c.risk_label}</span>
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <Link
                href={`/company/${c.id}`}
                className="flex-1 rounded-lg border border-primary/15 py-2.5 text-center text-sm font-medium hover:bg-surface-paper"
              >
                상세 보기
              </Link>
              <button
                onClick={next}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-surface-paper hover:opacity-90"
              >
                다음 문제 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Clue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-paper px-2 py-3">
      <div className="text-[11px] text-on-surface-variant">{label}</div>
      <div className="tnum mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

export function won(manwon: number): string {
  // 만원 단위 → 보기 좋은 한글 금액
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const rest = manwon % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${manwon.toLocaleString()}만원`;
}

export function num(n: number): string {
  return n.toLocaleString();
}

export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y.slice(2)}.${m}`;
}

// 트랙/채움/배경용 (노랑 포함)
export function riskColor(score: number): string {
  if (score < 20) return "#2A8D5C"; // safe
  if (score < 50) return "#FEE500"; // warning
  return "#D8362A"; // high
}

// 텍스트/아이콘용 — 노랑(#FEE500)은 흰 배경 대비 미달이라 진한 앰버로 대체
export function riskTextColor(score: number): string {
  if (score < 20) return "#1F7A4D"; // safe (조금 진하게)
  if (score < 50) return "#8A6D00"; // warning → 진한 앰버 (대비 확보)
  return "#C92B20"; // high
}

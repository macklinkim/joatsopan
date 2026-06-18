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

export function riskColor(score: number): string {
  if (score < 20) return "#2A8D5C"; // safe
  if (score < 50) return "#FEE500"; // warning
  return "#D8362A"; // high
}

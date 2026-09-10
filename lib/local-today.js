// "오늘"은 현지 날짜로 — raw 로그 헤더·카드 created·not_before 게이트가 전부 현지
// 날짜로 쓰인다. UTC(toISOString)와 섞으면 KST 자정~9시 사이에 판정이 하루 어긋난다
// (2026-08-30 lastCompiled 실측 → 4c5f27c, 2026-09-09 칸반 6곳 동일 적용 → 개선계획 5-1-5).
function localToday(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = { localToday };

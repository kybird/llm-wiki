// semver-lite 버전 비교 — auto-update(qmd 동반 갱신)와 find-qmd(사본 선택)가
// 공유한다. auto-update.js에서 추출(2026-11-23): find-qmd ↔ auto-update는 이미
// auto-update → find-qmd 방향으로 require가 있어 역방향을 만들면 순환이 된다.
// 같은 비교 규칙을 두 곳에 두는 대신 한 곳에서 뽑아 쓴다.
function compareVersions(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ra = pa[i];
    const rb = pb[i];
    const na = parseInt(ra || '0', 10);
    const nb = parseInt(rb || '0', 10);
    if (na !== nb) return na < nb ? -1 : 1;
    // 접미(예: -rc)는 양쪽 성분이 모두 있을 때만 비교 — 한쪽 부재는 0과 같다(2.9 == 2.9.0).
    if (ra !== undefined && rb !== undefined && ra !== rb) return ra < rb ? -1 : 1;
  }
  return 0;
}

module.exports = { compareVersions };

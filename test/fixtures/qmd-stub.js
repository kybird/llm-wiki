// qmd-stub — 테스트용 상태 저장 qmd CLI 흉내. 테스트가 이 파일을 tmp로 복사한 뒤
// 옆에 qmd-state.json을 심는다(상태 경로 = 복사된 자신의 __dirname). 실측 출력
// 형식(2026-11-07)을 재현한다: collection list는 이름·Pattern·Files·Updated만 노출
// (경로 없음 — 이 갭이 사고의 근원), collection show가 Path: 행을 노출.
// state.zeroIndex=true면 update가 0건만 보고한다(사고 상태 재현).
const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, 'qmd-state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { collections: {} };
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

const countMd = dir => {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.toLowerCase().endsWith('.md')) n++;
    }
  };
  walk(dir);
  return n;
};

const args = process.argv.slice(2);

if (args[0] === 'collection') {
  const sub = args[1];
  if (sub === 'list') {
    const names = Object.keys(state.collections);
    console.log(`Collections (${names.length}):`);
    console.log();
    for (const name of names) {
      const c = state.collections[name];
      console.log(`${name} (qmd://${name}/)`);
      console.log(`  Pattern:  ${c.pattern}`);
      console.log(`  Files:    ${c.files}`);
      console.log(`  Updated:  just now`);
      console.log();
    }
  } else if (sub === 'show') {
    const c = state.collections[args[2]];
    if (!c) {
      console.error(`Unknown collection: ${args[2]}`);
      process.exit(1);
    }
    console.log(`Collection: ${args[2]}`);
    console.log(`  Path:     ${c.path}`);
    console.log(`  Pattern:  ${c.pattern}`);
    console.log('  Include:  yes (default)');
  } else if (sub === 'add') {
    const i = args.indexOf('--name');
    const name = args[i + 1];
    // 실측 qmd와 동일 — 중복 add는 exit 0 + 안내뿐, 기존 등록을 덮어쓰지 않는다.
    // (이 충실도가 "list 파싱 실패 → 매번 add 재시도" 회귀를 테스트로 잡는 그물이다)
    if (state.collections[name]) {
      console.log(`Collection '${name}' already exists`);
    } else {
      state.collections[name] = { path: args[2], pattern: '**/*.md', files: 0 };
      save();
    }
  } else if (sub === 'remove') {
    // 실측 qmd와 동일 — 미등록 이름 remove는 exit 1
    const names = args.slice(2);
    const unknown = names.filter(n => !state.collections[n]);
    if (unknown.length) {
      console.error(`Unknown collection: ${unknown.join(', ')}`);
      process.exit(1);
    }
    for (const name of names) delete state.collections[name];
    save();
  }
  process.exit(0);
}

if (args[0] === 'update') {
  if (!state.zeroIndex) {
    for (const name of Object.keys(state.collections)) {
      state.collections[name].files = countMd(state.collections[name].path);
    }
  }
  save();
  process.exit(0);
}

process.exit(0); // embed 등 — 조용한 성공

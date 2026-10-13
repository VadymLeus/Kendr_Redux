// tools/measure.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name) => (args.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3);
const list = (name) => option(name).split(',').filter(Boolean);
const dry = args.includes('--dry-run');
const tag = option('tag');
const only = list('only');
const skip = list('skip');
const tools = path.dirname(fileURLToPath(import.meta.url));
const home = path.dirname(tools);
const root = path.resolve(option('root') || process.cwd());

if (!tag) {
  console.error('Вкажіть теґ, який вимірюється: node tools/measure.mjs --tag=v1.0');
  process.exit(2);
}
if (!existsSync(path.join(root, 'backend')) || !existsSync(path.join(root, 'frontend'))) {
  console.error(`У ${root} немає backend/ і frontend/. Запускайте з кореня репозиторію або вкажіть --root=<каталог>.`);
  process.exit(2);
}

const raw = path.resolve(option('out') || path.join(home, 'docs', '04-results', tag, 'raw'));
mkdirSync(raw, { recursive: true });

const q = (p) => `"${p}"`;
const matches = (names, id) => names.some((name) => id === name || id.startsWith(`${name}-`));
const selected = (id) => (only.length ? matches(only, id) : true) && !matches(skip, id);
const results = [];
const tail = (text, n = 60) => text.split('\n').slice(-n).join('\n');
const head = (text, n = 6) => text.split('\n').slice(0, n).join('\n');
const jsonOk = (stdout) => { try { JSON.parse(stdout); return ''; } catch { return 'вивід не є коректним JSON'; } };

function step(id, title, cwd, cmd, { okCodes = [0], out = null, check = () => '' } = {}) {
  if (!selected(id)) return;
  console.log(`\n== ${title}\n   ${cmd}`);
  if (dry) return;
  rmSync(path.join(raw, `measure-${id}.log`), { force: true });
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  if (out) writeFileSync(path.join(raw, out), stdout, 'utf8');
  let problem = '';
  if (r.error) problem = `не вдалося запустити: ${r.error.message}`;
  else if (!okCodes.includes(r.status)) problem = `код виходу ${r.status}`;
  else if (out && !stdout.trim()) problem = 'порожній вивід';
  else problem = check(stdout);
  if (problem) {
    const body = `$ ${cmd}\n(у каталозі ${cwd})\nпроблема: ${problem}\n\n--- stderr (хвіст) ---\n${tail(stderr)}\n\n--- stdout (хвіст) ---\n${out ? `(збережено у ${out})` : tail(stdout)}\n`;
    writeFileSync(path.join(raw, `measure-${id}.log`), body, 'utf8');
    console.log(`   ПОМИЛКА: ${problem}`);
    const first = head(stderr || stdout);
    if (first.trim()) console.log(first.split('\n').map((l) => `   | ${l}`).join('\n'));
  } else {
    console.log('   готово');
  }
  results.push({ id, ok: !problem, problem });
}

function installIfNeeded(id, dir) {
  if (!selected(id)) return;
  if (existsSync(path.join(root, dir, 'node_modules'))) {
    console.log(`\n== Залежності ${dir}: node_modules уже є, пропускаю`);
    results.push({ id, ok: true, problem: 'пропущено' });
    return;
  }
  step(id, `Встановлення залежностей ${dir}`, path.join(root, dir), 'npm ci --legacy-peer-deps');
}

function writeEnvironment() {
  if (!selected('environment') || dry) return;
  const run = (command) => {
    const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8' });
    return (r.stdout || r.stderr || '').trim() || 'недоступно';
  };
  const firstLine = (command) => run(command).split('\n')[0];
  const lines = [
    `тег, що вимірюється: ${tag}`,
    `коміт: ${firstLine('git rev-parse HEAD')}`,
    `змінених файлів у робочому каталозі: ${spawnSync('git status --porcelain', { cwd: root, shell: true, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).length}`,
    `node: ${firstLine('node --version')}`,
    `npm: ${firstLine('npm --version')}`,
    `python: ${firstLine('python --version || python3 --version || py -3 --version')}`,
    `дата: ${new Date().toISOString()}`,
  ];
  writeFileSync(path.join(raw, 'environment.txt'), `${lines.join('\n')}\n`, 'utf8');
  console.log('\n== Середовище записано в environment.txt');
}

writeEnvironment();
installIfNeeded('install-frontend', 'frontend');
installIfNeeded('install-backend', 'backend');

step('code-metrics', 'Розмір коду, цикли імпортів, розміри файлів', root,
  `node ${q(path.join(tools, 'code-metrics.mjs'))} --root=${q(root)} --out=${q(raw)}`);

step('api-catalog', 'Каталог API й шари backend', root,
  ['python', 'python3', 'py -3'].map((py) => `${py} ${q(path.join(tools, 'api_catalog.py'))} --root . --json`).join(' || '),
  { out: 'api-catalog.json', check: jsonOk });

const jscpdReport = path.join(raw, 'jscpd', 'jscpd-report.json');
step('jscpd', 'jscpd: дублювання коду (JS і JSX, клон від 8 рядків)', root,
  `npx --yes jscpd backend frontend/src --format "javascript,jsx" --min-lines 8 --ignore "**/node_modules/**,**/tests/**,**/coverage/**,**/dist/**,**/uploads/**" --reporters json --silent --output ${q(path.join(raw, 'jscpd'))}`,
  { check: () => (existsSync(jscpdReport) ? '' : 'не створено jscpd-report.json') });

const madgeOk = (stdout) => (/Processed \d+ files/.test(stdout) ? '' : 'у виводі немає рядка «Processed N files»');
step('madge-backend', 'madge: циклічні залежності backend', root,
  'npx --yes madge@8.0.0 --circular --exclude "(^|[\\\\/])(node_modules|tests|coverage|uploads)([\\\\/]|$)" backend',
  { okCodes: [0, 1], out: 'madge-backend.txt', check: madgeOk });
step('madge-frontend', 'madge: циклічні залежності frontend', root,
  'npx --yes madge@8.0.0 --circular --extensions js,jsx frontend/src',
  { okCodes: [0, 1], out: 'madge-frontend.txt', check: madgeOk });

step('knip-frontend', 'knip: frontend', path.join(root, 'frontend'),
  `npx --yes knip --config ${q(path.join(tools, 'knip-frontend.json'))} --reporter json`,
  { okCodes: [0, 1], out: 'knip-frontend.json', check: jsonOk });
step('knip-backend', 'knip: backend', path.join(root, 'backend'),
  `npx --yes knip --config ${q(path.join(tools, 'knip-backend.json'))} --reporter json`,
  { okCodes: [0, 1], out: 'knip-backend.json', check: jsonOk });

step('eslint-complexity', 'ESLint complexity: frontend/src і backend', root,
  `npx --yes eslint@9 --config ${q(path.join(tools, 'eslint-complexity.config.mjs'))} -f json frontend/src backend`,
  { okCodes: [0, 1], out: 'eslint-complexity.json', check: jsonOk });

const failedTests = (file) => () => {
  if (!existsSync(file)) return 'не створено файл результатів тестів';
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return report.numFailedTests > 0 ? `невдалих тестів: ${report.numFailedTests}` : '';
};

const vitestPackage = path.join(root, 'frontend', 'node_modules', 'vitest', 'package.json');
const vitestVersion = existsSync(vitestPackage) ? JSON.parse(readFileSync(vitestPackage, 'utf8')).version : (dry ? '<версія vitest>' : '');
if (vitestVersion) {
  step('coverage-pkg', 'Пакет покриття frontend (без збереження в package.json)', path.join(root, 'frontend'),
    `npm i --no-save --legacy-peer-deps @vitest/coverage-v8@${vitestVersion}`);
  const frontendResults = path.join(raw, 'tests-frontend.json');
  const frontendSummary = path.join(raw, 'coverage-frontend', 'coverage-summary.json');
  step('tests-frontend', 'Тести й покриття frontend (unit + integration)', path.join(root, 'frontend'),
    `npx vitest run tests/unit tests/integration --reporter=default --reporter=json --outputFile.json=${q(frontendResults)} ` +
    '--coverage.enabled --coverage.provider=v8 --coverage.reportOnFailure=true --coverage.include="src/**/*.{js,jsx}" ' +
    `--coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=${q(path.join(raw, 'coverage-frontend'))}`,
    {
      okCodes: [0, 1], out: 'tests-frontend.txt',
      check: () => (existsSync(frontendSummary) ? failedTests(frontendResults)() : 'не створено coverage-summary.json'),
    });
} else if (selected('tests-frontend')) {
  results.push({ id: 'tests-frontend', ok: false, problem: 'немає frontend/node_modules/vitest (залежності не встановлено)' });
  console.log('\n== Тести frontend: пропущено, немає frontend/node_modules/vitest');
}

const backendResults = path.join(raw, 'tests-backend.json');
const backendSummary = path.join(raw, 'coverage-backend', 'coverage-summary.json');
step('tests-backend', 'Тести й покриття backend (потрібна тестова MySQL: docker compose up -d)', path.join(root, 'backend'),
  `npx vitest run --reporter=default --reporter=json --outputFile.json=${q(backendResults)} ` +
  `--coverage.enabled --coverage.reportOnFailure=true --coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=${q(path.join(raw, 'coverage-backend'))}`,
  {
    okCodes: [0, 1], out: 'tests-backend.txt',
    check: () => (existsSync(backendSummary) ? failedTests(backendResults)() : 'не створено coverage-summary.json'),
  });

const baselineOption = option('baseline');
const defaultBaseline = path.join(home, 'docs', '02-analysis', 'raw', 'metrics-v0.json');
const baseline = baselineOption === 'none' ? '' : (baselineOption || (tag !== 'v0' && existsSync(defaultBaseline) ? path.relative(home, defaultBaseline) : ''));
step('summarize', 'Підсумок: metrics.md і metrics.json', home,
  `node ${q(path.join(tools, 'summarize.mjs'))} --tag=${tag} --raw=${q(raw)} --source-root=${q(root)}${baseline ? ` --baseline=${baseline}` : ''}`);

if (!dry) {
  console.log('\n===== Підсумок =====');
  for (const r of results) console.log(`${r.ok ? 'OK     ' : 'ПОМИЛКА'}  ${r.id}${r.problem ? ` — ${r.problem}` : ''}`);
  if (results.some((r) => !r.ok)) {
    console.log(`\nДеякі кроки не вдалися. Журнали: ${path.join(raw, 'measure-*.log')}`);
    process.exitCode = 1;
  }
}

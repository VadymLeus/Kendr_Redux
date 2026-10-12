#!/usr/bin/env node
/**
 * Замір метрик, яких не вистачає для таблиці «до/після»:
 * невикористаний код (knip), цикломатична складність (ESLint, правило complexity),
 * покриття тестами frontend (Vitest + v8).
 *
 * Запуск з кореня репозиторію (Node 20+, потрібен інтернет для npm):
 *     node tools/measure.mjs                       # усі кроки
 *     node tools/measure.mjs --only=knip-frontend  # один крок (id див. нижче)
 *     node tools/measure.mjs --dry-run             # лише показати команди
 *
 * Кроки: install-frontend, install-backend, knip-frontend, knip-backend,
 *        eslint-complexity, coverage-pkg, coverage-frontend.
 * Результати лежать у docs/02-analysis/raw/. Для кроку, що не вдався, створюється
 * docs/02-analysis/raw/measure-<id>.log з кодом виходу й хвостом stderr/stdout.
 * Залежності встановлюються (npm ci) лише там, де немає node_modules: наявні не чіпаємо.
 * Той самий скрипт запускається на кожному теґі (v0, v1.0, v2.0).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const only = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7) || null;
const root = process.cwd();
if (!existsSync(path.join(root, 'backend')) || !existsSync(path.join(root, 'frontend'))) {
  console.error('Запускайте з кореня репозиторію (де лежать backend/ і frontend/).');
  process.exit(2);
}
const raw = path.join(root, 'docs', '02-analysis', 'raw');
mkdirSync(raw, { recursive: true });
const results = [];

const tail = (text, n = 60) => text.split('\n').slice(-n).join('\n');
const head = (text, n = 6) => text.split('\n').slice(0, n).join('\n');

/**
 * id        — коротке ім'я кроку (для --only і імені журналу);
 * okCodes   — коди виходу, які вважаємо успіхом (knip і ESLint повертають 1, коли є знахідки);
 * out       — файл у raw/, куди пишемо stdout;
 * check     — додаткова перевірка успіху (повертає рядок з причиною невдачі або '').
 */
function step(id, title, cwd, cmd, { okCodes = [0], out = null, check = () => '' } = {}) {
  if (only && only !== id) return;
  console.log(`\n== ${title}\n   ${cmd}`);
  if (dry) return;
  rmSync(path.join(raw, `measure-${id}.log`), { force: true }); // журнал минулої невдалої спроби
  const r = spawnSync(cmd, {
    cwd: path.join(root, cwd), shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  if (out) writeFileSync(path.join(raw, out), stdout, 'utf8');
  let problem = '';
  if (r.error) problem = `не вдалося запустити: ${r.error.message}`;
  else if (!okCodes.includes(r.status)) problem = `код виходу ${r.status}`;
  else if (out && !stdout.trim()) problem = 'порожній вивід';
  else problem = check(stdout);
  if (problem) {
    const body = `$ ${cmd}\n(у каталозі ${cwd})\nпроблема: ${problem}\n\n--- stderr (хвіст) ---\n${tail(stderr)}\n\n--- stdout (хвіст) ---\n${out ? '(збережено у ' + out + ')' : tail(stdout)}\n`;
    writeFileSync(path.join(raw, `measure-${id}.log`), body, 'utf8');
    console.log(`   ПОМИЛКА: ${problem}`);
    const first = head(stderr || stdout);
    if (first.trim()) console.log(first.split('\n').map((l) => '   | ' + l).join('\n'));
  } else {
    console.log('   готово');
  }
  results.push({ id, ok: !problem, problem });
}

function installIfNeeded(id, dir) {
  if (only && only !== id) return;
  if (existsSync(path.join(root, dir, 'node_modules'))) {
    console.log(`\n== Залежності ${dir}: node_modules уже є, пропускаю`);
    results.push({ id, ok: true, problem: 'пропущено' });
    return;
  }
  step(id, `Встановлення залежностей ${dir}`, dir, 'npm ci');
}

installIfNeeded('install-frontend', 'frontend');
installIfNeeded('install-backend', 'backend');

const jsonOk = (stdout) => { try { JSON.parse(stdout); return ''; } catch { return 'вивід не є коректним JSON'; } };
step('knip-frontend', 'knip: frontend', 'frontend',
  'npx --yes knip --config ../tools/knip-frontend.json --reporter json',
  { okCodes: [0, 1], out: 'knip-frontend.json', check: jsonOk });
step('knip-backend', 'knip: backend', 'backend',
  'npx --yes knip --config ../tools/knip-backend.json --reporter json',
  { okCodes: [0, 1], out: 'knip-backend.json', check: jsonOk });
step('eslint-complexity', 'ESLint complexity: frontend/src і backend', '.',
  'npx --yes eslint@9 --config tools/eslint-complexity.config.mjs -f json frontend/src backend',
  { okCodes: [0, 1], out: 'eslint-complexity.json', check: jsonOk });

let vitestVersion = '';
const vp = path.join(root, 'frontend', 'node_modules', 'vitest', 'package.json');
if (existsSync(vp)) vitestVersion = JSON.parse(readFileSync(vp, 'utf8')).version;
if (dry) vitestVersion = '<версія vitest>';
if (vitestVersion) {
  step('coverage-pkg', 'Пакет покриття (без збереження в package.json)', 'frontend',
    `npm i --no-save --legacy-peer-deps @vitest/coverage-v8@${vitestVersion}`);
  const summary = path.join(raw, 'coverage-frontend', 'coverage-summary.json');
  step('coverage-frontend', 'Покриття frontend (unit + integration)', 'frontend',
    'npx vitest run tests/unit tests/integration --coverage.enabled --coverage.provider=v8 ' +
    '--coverage.reportOnFailure=true --coverage.include="src/**/*.{js,jsx}" ' +
    '--coverage.reporter=text --coverage.reporter=json-summary ' +
    '--coverage.reportsDirectory=../docs/02-analysis/raw/coverage-frontend',
    { okCodes: [0, 1], out: 'coverage-frontend.txt', check: () => (existsSync(summary) ? '' : 'не створено coverage-summary.json') });
} else if (!only || only.startsWith('coverage')) {
  results.push({ id: 'coverage', ok: false, problem: 'немає frontend/node_modules/vitest (залежності не встановлено)' });
  console.log('\n== Покриття: пропущено, немає frontend/node_modules/vitest');
}

if (!dry) {
  console.log('\n===== Підсумок =====');
  for (const r of results) console.log(`${r.ok ? 'OK     ' : 'ПОМИЛКА'}  ${r.id}${r.problem ? ' — ' + r.problem : ''}`);
  if (results.some((r) => !r.ok)) {
    console.log('\nДеякі кроки не вдалися. Надішліть файли docs/02-analysis/raw/measure-*.log.');
    process.exitCode = 1;
  }
}

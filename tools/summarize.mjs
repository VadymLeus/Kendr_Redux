// tools/summarize.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3) || fallback;
const root = process.cwd();
const tag = option('tag', 'v1.0');
const raw = path.resolve(root, option('raw', path.join('docs', '04-results', tag, 'raw')));
const outMd = path.resolve(root, option('out', path.join(raw, '..', 'metrics.md')));
const jsonOnly = args.includes('--json-only');
const outJson = outMd.endsWith('.md') ? outMd.replace(/\.md$/, '.json') : outMd;
const sourceRoot = path.resolve(root, option('source-root', '.'));
const baselinePaths = option('baseline', '').split(',').filter(Boolean);
const overlayPath = option('overlay', '');

const readText = (file) => readFileSync(file, 'utf8').replace(/^﻿/, '');
const read = (...parts) => {
  const file = path.join(raw, ...parts);
  return existsSync(file) ? readText(file) : null;
};
const readJson = (...parts) => {
  const text = read(...parts);
  return text === null ? null : JSON.parse(text);
};
const first = (...candidates) => candidates.find((c) => c !== null && c !== undefined) ?? null;

const parseSloc = (text) => {
  if (!text) return null;
  const pick = (label) => Number((text.match(new RegExp(`${label}\\s*:\\s*(\\d+)`)) ?? [])[1] ?? 0);
  return {
    files: pick('Number of files read'), physical: pick('Physical'), source: pick('Source'),
    comment: pick('Comment'), single: pick('Single-line comment'), block: pick('Block comment'),
    mixed: pick('Mixed'), empty: pick('Empty'),
  };
};

const parseCycles = (text) => {
  if (!text) return null;
  const files = Number((text.match(/Processed (\d+) files/) ?? [])[1] ?? 0);
  const list = text.split(/\r?\n/).filter((line) => /^\d+\)\s/.test(line)).map((line) => line.replace(/^\d+\)\s*/, ''));
  return { files, count: list.length, list };
};

const parseSizes = (text) => {
  if (!text) return null;
  const rows = text.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
    const [lines, file] = line.split('","').map((cell) => cell.replace(/"/g, ''));
    return { lines: Number(lines), file: file.replace(/\\/g, '/') };
  });
  const part = (prefix) => {
    const own = rows.filter((r) => r.file.startsWith(prefix)).sort((a, b) => b.lines - a.lines);
    return { files: own.length, over300: own.filter((r) => r.lines > 300).length, over500: own.filter((r) => r.lines > 500).length, largest: own[0] };
  };
  return { backend: part('backend/'), frontend: part('frontend/') };
};

const jscpdSummary = (report) => {
  if (!report) return null;
  const formats = report.statistics.formats;
  const parts = ['javascript', 'jsx'].map((name) => formats[name]).filter(Boolean);
  const sum = (key) => parts.reduce((total, f) => total + f[key], 0);
  const lines = sum('lines');
  const duplicatedLines = sum('duplicatedLines');
  return { lines, clones: sum('clones'), duplicatedLines, percentage: lines ? (duplicatedLines / lines) * 100 : 0 };
};

const knipTotals = (json) => {
  if (!json) return null;
  const sum = (key) => json.issues.reduce((total, issue) => total + (issue[key]?.length ?? 0), 0);
  return { files: sum('files'), dependencies: sum('dependencies'), devDependencies: sum('devDependencies'), exports: sum('exports'), duplicates: sum('duplicates') };
};

const listSources = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return /^(node_modules|tests|coverage|uploads)$/.test(name) ? [] : listSources(full);
    return name.endsWith('.js') ? [full] : [];
  });
};

const verifyBackendExports = (json) => {
  if (!json) return null;
  const files = listSources(path.join(sourceRoot, 'backend')).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  if (files.length === 0) return null;
  const unused = [];
  for (const issue of json.issues) {
    for (const item of issue.exports ?? []) {
      const own = path.resolve(sourceRoot, 'backend', issue.file);
      const name = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const member = new RegExp(`\\.\\s*${name}\\b`);
      const destructured = new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*require\\(`);
      const used = files.some(({ file, text }) => file !== own && (member.test(text) || destructured.test(text)));
      if (!used) unused.push(`${issue.file}: ${item.name}`);
    }
  }
  return unused;
};

const NAME_PATTERNS = [
  /\b(?:exports|module\.exports)\.([A-Za-z_$][\w$]*)\s*=/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
  /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function/,
  /^\s*(?:export\s+default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
];

const guessName = (part, relative, line, base) => {
  const file = path.join(sourceRoot, part === 'frontend' ? path.join('frontend', 'src') : 'backend', relative);
  if (!existsSync(file)) return null;
  const all = readText(file).split(/\r\n|\r|\n/);
  const text = all[line - 1] ?? '';
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  for (let i = line - 2; i >= Math.max(0, line - 40); i -= 1) {
    if (/^\s*export\s+default\b/.test(all[i])) return base;
    const declared = all[i].match(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/);
    if (declared) return declared[1];
  }
  return null;
};

const complexityRows = (json) => {
  if (!json) return null;
  const rows = [];
  for (const file of json) {
    const normal = file.filePath.replace(/\\/g, '/');
    const part = normal.includes('/frontend/src/') ? 'frontend' : (normal.includes('/backend/') ? 'backend' : null);
    if (!part) continue;
    const relative = normal.split(part === 'frontend' ? '/frontend/src/' : '/backend/').pop();
    const base = path.basename(relative).replace(/\.(jsx?|mjs)$/, '');
    for (const message of file.messages) {
      if (message.ruleId !== 'complexity') continue;
      const value = Number(message.message.match(/complexity of (\d+)/)[1]);
      const named = (message.message.match(/'([^']+)'/) ?? [])[1] ?? guessName(part, relative, message.line, base);
      const name = named ? (part === 'backend' && named !== base ? `${base}.${named}` : named) : null;
      rows.push({ part, value, name, where: `${relative}:${message.line}` });
    }
  }
  return rows;
};

const complexitySummary = (rows, part) => {
  const own = part ? rows.filter((r) => r.part === part) : rows;
  if (own.length === 0) return null;
  const values = own.map((r) => r.value).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const top = own.slice().sort((a, b) => b.value - a.value)[0];
  return {
    functions: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, median, max: values[values.length - 1],
    maxName: top.name, maxAt: top.where,
    over10: values.filter((v) => v > 10).length, over20: values.filter((v) => v > 20).length,
  };
};

const coverageTotals = (json) => {
  if (!json) return null;
  const t = json.total;
  const pick = (key) => ({ covered: t[key].covered, total: t[key].total, pct: t[key].total ? (t[key].covered / t[key].total) * 100 : 0 });
  return { lines: pick('lines'), statements: pick('statements'), functions: pick('functions'), branches: pick('branches') };
};

const testTotals = (json) => {
  if (!json) return null;
  return { files: json.testResults?.length ?? 0, tests: json.numTotalTests, passed: json.numPassedTests, failed: json.numFailedTests };
};

const merge = (target, patch) => {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key], value);
    else target[key] = value;
  }
  return target;
};

const metrics = {
  tag,
  sloc: {
    backend: parseSloc(read('sloc-backend.txt')),
    frontend: parseSloc(read('sloc-frontend.txt')),
    testsBackend: parseSloc(read('sloc-tests-backend.txt')),
    testsFrontend: parseSloc(first(read('sloc-tests-frontend.txt'), read('sloc-tests.txt'))),
  },
  jscpd: jscpdSummary(readJson('jscpd', 'jscpd-report.json')),
  cycles: {
    backend: parseCycles(first(read('madge-backend.txt'), read('cycles-backend.txt'))),
    frontend: parseCycles(first(read('madge-frontend.txt'), read('cycles-frontend.txt'))),
  },
  unresolvedImports: (() => { const t = read('unresolved-imports.txt'); return t === null ? null : Number((t.match(/Unresolved: (\d+)/) ?? [])[1] ?? 0); })(),
  api: readJson('api-catalog.json'),
  sizes: parseSizes(read('file-sizes.csv')),
  knip: { frontend: knipTotals(readJson('knip-frontend.json')), backend: knipTotals(readJson('knip-backend.json')) },
  backendUnusedExports: verifyBackendExports(readJson('knip-backend.json')),
  complexity: null,
  coverage: {
    frontend: coverageTotals(first(readJson('coverage-frontend', 'coverage-summary.json'), readJson('coverage-frontend-tests', 'coverage-summary.json'))),
    backend: coverageTotals(readJson('coverage-backend', 'coverage-summary.json')),
  },
  tests: { frontend: testTotals(readJson('tests-frontend.json')), backend: testTotals(readJson('tests-backend.json')) },
};

const rows = complexityRows(readJson('eslint-complexity.json'));
if (rows) {
  const top = (part) => rows.filter((r) => r.part === part).sort((a, b) => b.value - a.value).slice(0, 8);
  metrics.complexity = {
    frontend: complexitySummary(rows, 'frontend'),
    backend: complexitySummary(rows, 'backend'),
    all: complexitySummary(rows, null),
    topBackend: top('backend'),
    topFrontend: top('frontend'),
  };
}

if (overlayPath) merge(metrics, JSON.parse(readText(path.resolve(root, overlayPath))));

const baselines = baselinePaths.map((p) => JSON.parse(readText(path.resolve(root, p))));
const versions = [...baselines, metrics];

const spaced = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const decimal = (n, digits = 2) => n.toFixed(digits).replace('.', ',');
const missing = (n) => n === null || n === undefined || Number.isNaN(n);
const num = (n) => (missing(n) ? '—' : spaced(n));
const pct = (n) => (missing(n) ? '—' : `${decimal(n)} %`);
const dec = (n) => (missing(n) ? '—' : decimal(n));
const get = (object, keyPath) => keyPath.split('.').reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), object);

const change = (before, after, kind) => {
  if (missing(before) || missing(after)) return '—';
  const diff = after - before;
  if (Math.abs(diff) < 1e-9) return '0';
  const sign = diff > 0 ? '+' : '−';
  if (kind === 'pct') return `${sign}${decimal(Math.abs(diff))} п. п.`;
  if (kind === 'dec') return `${sign}${decimal(Math.abs(diff))}`;
  return `${sign}${spaced(Math.abs(diff))}`;
};

const lines = [];
const out = (text = '') => lines.push(text);
const table = (header, body) => {
  out(`| ${header.join(' | ')} |`);
  out(`|${header.map(() => '---').join('|')}|`);
  for (const row of body) out(`| ${row.join(' | ')} |`);
  out();
};
const head = ['Показник', ...versions.map((m) => m.tag), ...(baselines.length ? ['Зміна'] : [])];
const compare = (label, key, kind = 'num') => {
  const format = kind === 'pct' ? pct : (kind === 'dec' ? dec : num);
  const values = versions.map((m) => get(m, key));
  return [label, ...values.map(format), ...(baselines.length ? [change(values[0], values[values.length - 1], kind)] : [])];
};
const relRaw = path.relative(root, raw).split(path.sep).join('/');

out(`# Метрики версії ${tag}`);
out();
out(`Згенеровано \`tools/summarize.mjs\` із сирих даних каталогу \`${relRaw}\`${baselinePaths.length ? `; для порівняння використано ${baselinePaths.map((p) => `\`${p.split(path.sep).join('/')}\``).join(', ')}` : ''}. Значення в таблицях не редагуються вручну. Частки наведено до сотих, роздільник розрядів — пропуск, десяткова ознака — кома.`);
out();

out('## 1. Розмір коду');
out();
table(head, [
  compare('Backend: файлів', 'sloc.backend.files'),
  compare('Backend: фізичних рядків', 'sloc.backend.physical'),
  compare('Backend: рядків коду', 'sloc.backend.source'),
  compare('Backend: рядків коментарів', 'sloc.backend.comment'),
  compare('Frontend (`src`, з CSS): файлів', 'sloc.frontend.files'),
  compare('Frontend: фізичних рядків', 'sloc.frontend.physical'),
  compare('Frontend: рядків коду', 'sloc.frontend.source'),
  compare('Frontend: рядків коментарів', 'sloc.frontend.comment'),
]);
const totals = versions.map((m) => (m.sloc.backend && m.sloc.frontend ? m.sloc.backend.source + m.sloc.frontend.source : null));
table(head, [[
  'Рядків коду разом (продуктовий код)', ...totals.map(num),
  ...(baselines.length ? [change(totals[0], totals[totals.length - 1])] : []),
]]);
const testsLoc = [['backend/tests', metrics.sloc.testsBackend], ['frontend/tests', metrics.sloc.testsFrontend]].filter(([, v]) => v);
if (testsLoc.length) {
  table(['Тестовий код', 'Файлів', 'Рядків коду'], testsLoc.map(([label, v]) => [`\`${label}\``, num(v.files), num(v.source)]));
}

if (metrics.jscpd) {
  out('## 2. Дублювання коду');
  out();
  table(head, [
    compare('Клонів (JS + JSX)', 'jscpd.clones'),
    compare('Дубльованих рядків', 'jscpd.duplicatedLines'),
    compare('Частка дублювання', 'jscpd.percentage', 'pct'),
  ]);
}

out('## 3. Залежності між модулями');
out();
table(head, [
  compare('Циклічних залежностей: backend', 'cycles.backend.count'),
  compare('Циклічних залежностей: frontend', 'cycles.frontend.count'),
  compare('Імпортів на неіснуючі файли (backend і frontend)', 'unresolvedImports'),
]);
for (const part of ['frontend', 'backend']) {
  const cycles = metrics.cycles[part];
  if (cycles && cycles.count > 0) {
    out(`Цикли ${part}:`);
    out();
    cycles.list.forEach((cycle, index) => out(`${index + 1}. \`${cycle}\``));
    out();
  }
}

if (metrics.api) {
  out('## 4. API та шар доступу до даних');
  out();
  table(head, [
    compare('Ендпоінтів', 'api.endpoints'),
    compare('Публічні (`public`)', 'api.access.public'),
    compare('Лише за токеном (`token`)', 'api.access.token'),
    compare('Адмін / модератор', 'api.access.admin'),
    compare('Лише головний адмін', 'api.access.strict-admin'),
    compare('Контролерів', 'api.controllers'),
    compare('Контролерів із прямими SQL-запитами', 'api.controllers_with_sql'),
    compare('Прямих SQL-викликів у контролерах', 'api.sql_calls'),
    compare('Контролерів, що викликають сервіси', 'api.controllers_using_services'),
  ]);
  const layers = metrics.api.layer_files;
  if (layers && Object.keys(layers).length) {
    out('Файли й SQL-виклики за шарами backend (`.query(` і `.execute(`):');
    out();
    const tags = versions.map((m) => m.tag);
    table(['Шар', ...tags.map((t) => `Файлів ${t}`), ...tags.map((t) => `SQL ${t}`)], Object.keys(layers).map((layer) => [
      `\`${layer}\``,
      ...versions.map((m) => num(get(m, `api.layer_files.${layer}`))),
      ...versions.map((m) => num(get(m, `api.layer_sql_calls.${layer}`))),
    ]));
    const sums = versions.map((m) => (m.api?.layer_sql_calls ? Object.values(m.api.layer_sql_calls).reduce((a, b) => a + b, 0) : null));
    table(head, [['SQL-викликів у backend усього', ...sums.map(num), ...(baselines.length ? [change(sums[0], sums[sums.length - 1])] : [])]]);
  }
}

if (metrics.sizes) {
  out('## 5. Розмір файлів');
  out();
  table(head, [
    compare('Backend: файлів понад 300 рядків', 'sizes.backend.over300'),
    compare('Backend: файлів понад 500 рядків', 'sizes.backend.over500'),
    compare('Backend: найбільший файл, рядків', 'sizes.backend.largest.lines'),
    compare('Frontend: файлів понад 300 рядків', 'sizes.frontend.over300'),
    compare('Frontend: файлів понад 500 рядків', 'sizes.frontend.over500'),
    compare('Frontend: найбільший файл, рядків', 'sizes.frontend.largest.lines'),
  ]);
  out(`Найбільші файли ${tag}: backend — \`${metrics.sizes.backend.largest.file.replace(/^backend\//, '')}\` (${metrics.sizes.backend.largest.lines}), frontend — \`${metrics.sizes.frontend.largest.file.replace(/^frontend\/src\//, '')}\` (${metrics.sizes.frontend.largest.lines}). Рахуються файли \`.js\` і \`.jsx\` у backend (без \`tests\`) та \`.js\`, \`.jsx\` і \`.css\` у \`frontend/src\`.`);
  out();
}

if (metrics.knip.frontend || metrics.knip.backend) {
  out('## 6. Невикористаний код і залежності (knip)');
  out();
  const verified = versions.map((m) => (m.backendUnusedExports ? m.backendUnusedExports.length : null));
  table(head, [
    compare('Frontend: невикористаних файлів', 'knip.frontend.files'),
    compare('Frontend: невикористаних `devDependencies`', 'knip.frontend.devDependencies'),
    compare('Frontend: невикористаних експортів', 'knip.frontend.exports'),
    compare('Frontend: експортів і за іменем, і за замовчуванням', 'knip.frontend.duplicates'),
    compare('Backend: невикористаних файлів', 'knip.backend.files'),
    compare('Backend: невикористаних залежностей', 'knip.backend.dependencies'),
    compare('Backend: експортів за звітом knip', 'knip.backend.exports'),
    ['Backend: невикористаних експортів після перевірки звернень', ...verified.map(num), ...(baselines.length ? [change(verified[0], verified[verified.length - 1])] : [])],
  ]);
  if (metrics.backendUnusedExports) {
    out(`Backend, експорти без звернень з інших файлів (${metrics.backendUnusedExports.length}): ${metrics.backendUnusedExports.map((e) => `\`${e}\``).join(', ') || '—'}.`);
    out();
  }
}

if (metrics.complexity) {
  out('## 7. Цикломатична складність (ESLint, правило `complexity`)');
  out();
  table(head, [
    compare('Frontend: функцій', 'complexity.frontend.functions'),
    compare('Frontend: середня складність', 'complexity.frontend.mean', 'dec'),
    compare('Frontend: максимум', 'complexity.frontend.max'),
    compare('Frontend: функцій зі складністю понад 10', 'complexity.frontend.over10'),
    compare('Frontend: функцій зі складністю понад 20', 'complexity.frontend.over20'),
    compare('Backend: функцій', 'complexity.backend.functions'),
    compare('Backend: середня складність', 'complexity.backend.mean', 'dec'),
    compare('Backend: медіана', 'complexity.backend.median', 'dec'),
    compare('Backend: максимум', 'complexity.backend.max'),
    compare('Backend: функцій зі складністю понад 10', 'complexity.backend.over10'),
    compare('Backend: функцій зі складністю понад 20', 'complexity.backend.over20'),
    compare('Разом: функцій зі складністю понад 10', 'complexity.all.over10'),
  ]);
  for (const [label, key] of [['Найскладніші функції backend', 'topBackend'], ['Найскладніші функції frontend', 'topFrontend']]) {
    out(`${label}:`);
    out();
    table(['Складність', 'Функція', 'Розташування'], metrics.complexity[key].slice(0, 6).map((r) => [String(r.value), r.name ? `\`${r.name}\`` : '—', `\`${r.where}\``]));
  }
}

out('## 8. Тести і покриття');
out();
table(head, [
  compare('Frontend: тестів', 'tests.frontend.tests'),
  compare('Frontend: файлів з тестами', 'tests.frontend.files'),
  compare('Backend: тестів', 'tests.backend.tests'),
  compare('Backend: файлів з тестами', 'tests.backend.files'),
  compare('Frontend: покриття рядків', 'coverage.frontend.lines.pct', 'pct'),
  compare('Frontend: покриття операторів', 'coverage.frontend.statements.pct', 'pct'),
  compare('Frontend: покриття функцій', 'coverage.frontend.functions.pct', 'pct'),
  compare('Frontend: покриття гілок', 'coverage.frontend.branches.pct', 'pct'),
  compare('Backend: покриття рядків', 'coverage.backend.lines.pct', 'pct'),
  compare('Backend: покриття операторів', 'coverage.backend.statements.pct', 'pct'),
  compare('Backend: покриття функцій', 'coverage.backend.functions.pct', 'pct'),
  compare('Backend: покриття гілок', 'coverage.backend.branches.pct', 'pct'),
]);
for (const part of ['frontend', 'backend']) {
  const c = metrics.coverage[part];
  if (c && c.lines.total) {
    out(`Покриття ${part} (${tag}): рядків ${num(c.lines.covered)} із ${num(c.lines.total)}, операторів ${num(c.statements.covered)} із ${num(c.statements.total)}, функцій ${num(c.functions.covered)} із ${num(c.functions.total)}, гілок ${num(c.branches.covered)} із ${num(c.branches.total)}.`);
    out();
  }
}

mkdirSync(path.dirname(outJson), { recursive: true });
writeFileSync(outJson, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
if (!jsonOnly) writeFileSync(outMd, `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`, 'utf8');
console.log(`Записано ${path.relative(root, jsonOnly ? outJson : outMd)}${jsonOnly ? '' : ` і ${path.relative(root, outJson)}`}`);

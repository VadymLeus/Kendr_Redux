// tools/code-metrics.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3) || fallback;
const root = path.resolve(option('root', '.'));
const out = path.resolve(root, option('out', path.join('docs', '02-analysis', 'raw')));

if (!existsSync(path.join(root, 'backend')) || !existsSync(path.join(root, 'frontend'))) {
  console.error(`У ${root} немає backend/ і frontend/.`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const SKIP_ALWAYS = new Set(['node_modules', 'coverage', 'dist', 'uploads', '.git']);

const walk = (dir, extensions, { skipTests = false } = {}) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_ALWAYS.has(name) || (skipTests && name === 'tests')) return [];
      return walk(full, extensions, { skipTests });
    }
    return extensions.includes(path.extname(name)) ? [full] : [];
  });
};

const readLines = (file) => {
  const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

const countLines = (files) => {
  const total = { physical: 0, source: 0, comment: 0, single: 0, block: 0, mixed: 0, empty: 0, todo: 0, files: files.length };
  for (const file of files) {
    let inBlock = false;
    for (const line of readLines(file)) {
      total.physical += 1;
      let code = false;
      let single = false;
      let block = false;
      let quote = null;
      let i = 0;
      while (i < line.length) {
        if (inBlock) {
          block = true;
          const end = line.indexOf('*/', i);
          if (end < 0) i = line.length;
          else { inBlock = false; i = end + 2; }
          continue;
        }
        const char = line[i];
        if (quote) {
          code = true;
          if (char === '\\') { i += 2; continue; }
          if (char === quote) quote = null;
          else if (line.startsWith('//', i)) { single = true; break; }
          i += 1;
          continue;
        }
        if (char === '"' || char === "'" || char === '`') { quote = char; code = true; i += 1; continue; }
        if (line.startsWith('//', i)) { single = true; break; }
        if (line.startsWith('/*', i)) { block = true; inBlock = true; i += 2; continue; }
        if (!/\s/.test(char)) code = true;
        i += 1;
      }
      if (!code && !single && !block) { total.empty += 1; continue; }
      if (code) total.source += 1;
      if (single) total.single += 1;
      if (block) total.block += 1;
      if (single || block) {
        total.comment += 1;
        if (code) total.mixed += 1;
        if (/\bTODO\b/i.test(line)) total.todo += 1;
      }
    }
  }
  return total;
};

const slocText = (t) => {
  const row = (label, value) => `${label.padStart(20)} :  ${value}`;
  return [
    '', '---------- Result ------------', '',
    row('Physical', t.physical), row('Source', t.source), row('Comment', t.comment),
    row('Single-line comment', t.single), row('Block comment', t.block), row('Mixed', t.mixed),
    row('Empty block comment', 0), row('Empty', t.empty), row('To Do', t.todo), '',
    `Number of files read :  ${t.files}`, '', '----------------------------', '',
  ].join('\n');
};

const CODE = ['.js', '.jsx', '.css'];
const SCRIPTS = ['.js', '.jsx'];
const TESTS = ['.js', '.jsx', '.mjs'];
const sets = {
  'sloc-backend.txt': walk(path.join(root, 'backend'), ['.js'], { skipTests: true }),
  'sloc-frontend.txt': walk(path.join(root, 'frontend', 'src'), CODE),
  'sloc-tests-backend.txt': walk(path.join(root, 'backend', 'tests'), TESTS),
  'sloc-tests-frontend.txt': walk(path.join(root, 'frontend', 'tests'), TESTS),
};
for (const [name, files] of Object.entries(sets)) {
  if (files.length === 0 && name.startsWith('sloc-tests')) continue;
  writeFileSync(path.join(out, name), slocText(countLines(files)), 'utf8');
  console.log(`${name}: ${files.length} файлів`);
}

const IMPORT_PATTERN = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const SUFFIXES = ['', '.js', '.jsx', '/index.js', '/index.jsx'];

const resolveImport = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  return SUFFIXES.map((suffix) => base + suffix).find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
};

const findCycles = (files) => {
  const graph = new Map();
  for (const file of files) {
    const targets = new Set();
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      const target = resolveImport(file, match[1] || match[2] || match[3] || match[4]);
      if (target && files.includes(target)) targets.add(target);
    }
    graph.set(file, [...targets]);
  }
  const cycles = [];
  const seen = new Set();
  const visit = (start, node, stack, onStack) => {
    for (const next of graph.get(node) ?? []) {
      if (next === start) {
        const smallest = stack.reduce((a, b) => (a < b ? a : b));
        const at = stack.indexOf(smallest);
        const normal = [...stack.slice(at), ...stack.slice(0, at)];
        const key = normal.join('>');
        if (!seen.has(key)) { seen.add(key); cycles.push(normal); }
      } else if (!onStack.has(next) && next > start) {
        onStack.add(next);
        stack.push(next);
        visit(start, next, stack, onStack);
        stack.pop();
        onStack.delete(next);
      }
    }
  };
  for (const file of [...graph.keys()].sort()) visit(file, file, [file], new Set([file]));
  return cycles;
};

const cycleReport = (label, dir, files) => {
  const cycles = findCycles(files);
  const rel = (p) => path.relative(dir, p).split(path.sep).join('/');
  const lines = [`Processed ${files.length} files`, ''];
  if (cycles.length === 0) lines.push('No circular dependency found!');
  cycles.forEach((cycle, index) => lines.push(`${index + 1}) ${cycle.map(rel).join(' > ')}`));
  writeFileSync(path.join(out, `cycles-${label}.txt`), `${lines.join('\n')}\n`, 'utf8');
  console.log(`cycles-${label}.txt: ${files.length} файлів, циклів ${cycles.length}`);
};

const findUnresolved = (files) => {
  const missing = [];
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      const spec = match[1] || match[2] || match[3] || match[4];
      if (spec && spec.startsWith('.') && !resolveImport(file, spec)) missing.push(`${path.relative(root, file).split(path.sep).join('/')} > ${spec}`);
    }
  }
  return missing;
};

const backendDir = path.join(root, 'backend');
const frontendSrc = path.join(root, 'frontend', 'src');
const backendFiles = walk(backendDir, SCRIPTS, { skipTests: true });
const frontendFiles = walk(frontendSrc, SCRIPTS);
cycleReport('backend', backendDir, backendFiles);
cycleReport('frontend', frontendSrc, frontendFiles);

const unresolved = [...findUnresolved(backendFiles), ...findUnresolved(frontendFiles)];
writeFileSync(path.join(out, 'unresolved-imports.txt'), `${[`Unresolved: ${unresolved.length}`, ...unresolved].join('\n')}\n`, 'utf8');
console.log(`unresolved-imports.txt: ${unresolved.length}`);

const sizeRows = [
  ...walk(backendDir, SCRIPTS, { skipTests: true }),
  ...walk(frontendSrc, CODE),
].map((file) => ({ lines: readLines(file).length, file: path.relative(root, file) }))
  .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
const csv = ['"Lines","File"', ...sizeRows.map((r) => `"${r.lines}","${r.file}"`)].join('\n');
writeFileSync(path.join(out, 'file-sizes.csv'), `${csv}\n`, 'utf8');
console.log(`file-sizes.csv: ${sizeRows.length} файлів`);

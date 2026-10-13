// frontend/tests/unit/importCycles.test.js
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const IMPORT_PATTERN = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const SUFFIXES = ['', '.js', '.jsx', '/index.js', '/index.jsx'];

const listSources = (dir) =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return listSources(path);
        return /\.(js|jsx)$/.test(name) ? [path] : [];
    });

const resolveImport = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(from), spec);
    return SUFFIXES.map((suffix) => base + suffix).find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
};

const buildGraph = () => {
    const graph = new Map();
    for (const file of listSources(SRC)) {
        const targets = new Set();
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(IMPORT_PATTERN)) {
            const target = resolveImport(file, match[1] || match[2] || match[3]);
            if (target) targets.add(target);
        }
        graph.set(file, [...targets]);
    }
    return graph;
};

const findCycles = (graph) => {
    const index = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const cycles = [];
    let counter = 0;
    const visit = (node) => {
        index.set(node, counter);
        low.set(node, counter);
        counter += 1;
        stack.push(node);
        onStack.add(node);
        for (const next of graph.get(node) ?? []) {
            if (!index.has(next)) {
                visit(next);
                low.set(node, Math.min(low.get(node), low.get(next)));
            } else if (onStack.has(next)) {
                low.set(node, Math.min(low.get(node), index.get(next)));
            }
        }
        if (low.get(node) === index.get(node)) {
            const component = [];
            let member;
            do {
                member = stack.pop();
                onStack.delete(member);
                component.push(member);
            } while (member !== node);
            if (component.length > 1 || (graph.get(node) ?? []).includes(node)) cycles.push(component);
        }
    };
    for (const node of graph.keys()) {
        if (!index.has(node)) visit(node);
    }
    return cycles;
};

describe('залежності модулів frontend', () => {
    it('у src немає циклів імпорту (статичних і динамічних)', () => {
        const cycles = findCycles(buildGraph()).map((component) => component.map((path) => relative(SRC, path)).sort());
        expect(cycles).toEqual([]);
    });

    it('граф містить модулі реєстру блоків і LayoutBlock', () => {
        const files = [...buildGraph().keys()].map((path) => relative(SRC, path).replace(/\\/g, '/'));
        expect(files).toContain('modules/editor/core/blockRegistry.js');
        expect(files).toContain('modules/editor/blocks/Layout/LayoutBlock.jsx');
    });
});

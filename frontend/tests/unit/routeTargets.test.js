// Контракт навігації (D-CON-02): кожен статичний перехід у коді (navigate('/…'), <Link to="/…">, <Navigate to="/…">)
// має вести на адресу, оголошену в маршрутизації App.jsx. Інакше користувач потрапляє на сторінку 404.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');

const listSources = (dir) =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return listSources(path);
        return /\.(js|jsx)$/.test(name) ? [path] : [];
    });

const routePatterns = () => {
    const app = readFileSync(join(SRC, 'app', 'App.jsx'), 'utf8');
    return [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path !== '*')
        .map((path) => ({ path, pattern: new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`) }));
};

// Підстановки ${…} у шаблонних рядках замінюємо на параметр, який підходить під будь-який сегмент.
const normalize = (target) => target.replace(/\$\{[^}]*\}/g, 'x').split(/[?#]/)[0];

const NAVIGATE_CALL = /\bnavigate\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const TO_ATTRIBUTE = /\bto=(?:"([^"]*)"|'([^']*)'|\{\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3\s*\})/g;

const collectTargets = (source) => {
    const targets = [];
    for (const match of source.matchAll(NAVIGATE_CALL)) targets.push(match[2]);
    for (const match of source.matchAll(TO_ATTRIBUTE)) targets.push(match[1] ?? match[2] ?? match[4]);
    return targets.filter((target) => typeof target === 'string' && target.startsWith('/') && !target.startsWith('//'));
};

describe('цілі навігації відповідають маршрутам App.jsx', () => {
    const routes = routePatterns();

    it('маршрути App.jsx прочитано (є вхід, реєстрація, мої сайти, панель сайту, запрошення)', () => {
        const paths = routes.map((route) => route.path);
        for (const path of ['/', '/login', '/register', '/my-sites', '/dashboard/:site_path', '/invite/:token']) {
            expect(paths).toContain(path);
        }
    });

    it('у коді знайдено цілі навігації (перевірка не порожня)', () => {
        const total = listSources(SRC).reduce((count, file) => count + collectTargets(readFileSync(file, 'utf8')).length, 0);
        expect(total).toBeGreaterThan(20);
    });

    it('жодна ціль не веде на адресу без маршруту', () => {
        const unknown = [];
        for (const file of listSources(SRC)) {
            for (const target of collectTargets(readFileSync(file, 'utf8'))) {
                const path = normalize(target);
                if (!routes.some((route) => route.pattern.test(path))) unknown.push(`${relative(SRC, file)}: ${target}`);
            }
        }
        expect(unknown).toEqual([]);
    });

    it('збирач цілей розпізнає всі форми запису й відсікає чужі адреси', () => {
        const sample = [
            "navigate('/login')",
            'navigate(`/dashboard/${site.site_path}?tab=1`)',
            '<Link to="/catalog">',
            "<Navigate to='/my-sites' replace />",
            'to={`/site/${path}`}',
            'navigate(-1)',
            "navigate('https://example.com')",
        ].join('\n');
        // Спершу виклики navigate, потім атрибути to.
        expect(collectTargets(sample).map(normalize)).toEqual(['/login', '/dashboard/x', '/catalog', '/my-sites', '/site/x']);
    });
});

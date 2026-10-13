// Порівняння з «золотим» файлом (golden master).
// Файл у tests/golden/ фіксує повний вивід функції на v0. Якщо вивід змінився, тест падає
// і показує перший рядок, що розійшовся. Свідоме оновлення: UPDATE_GOLDEN=1 npx vitest run ...
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

const toLf = (text) => text.replace(/\r\n/g, '\n');

// Каталог golden/ шукаємо відносно цього файла, а якщо URL модуля не розпізнано, — відносно робочого каталогу (frontend/).
const candidates = (relPath) => {
    const list = [];
    try {
        list.push(fileURLToPath(new URL(`../golden/${relPath}`, import.meta.url)));
    } catch {
        // URL модуля недоступний: лишається запасний варіант нижче
    }
    list.push(resolve(process.cwd(), 'tests', 'golden', relPath));
    return list;
};

export const expectGolden = (actual, relPath) => {
    const paths = candidates(relPath);
    if (process.env.UPDATE_GOLDEN === '1') {
        mkdirSync(dirname(paths[0]), { recursive: true });
        writeFileSync(paths[0], toLf(actual), 'utf8');
        return;
    }
    const file = paths.find((p) => existsSync(p));
    if (!file) {
        throw new Error(
            `Немає золотого файлу ${relPath}. Шукали:\n  ${paths.join('\n  ')}\n` +
            'Перевірте, що каталог frontend/tests/golden/export розпакований; нове значення створюється командою з UPDATE_GOLDEN=1.'
        );
    }
    const expected = toLf(readFileSync(file, 'utf8'));
    const received = toLf(actual);
    if (expected !== received) {
        const a = expected.split('\n');
        const b = received.split('\n');
        const i = a.findIndex((line, n) => line !== b[n]);
        const at = i === -1 ? Math.min(a.length, b.length) : i;
        throw new Error(
            `Вивід не збігається з ${relPath} (перший рядок, що розійшовся: ${at + 1}).\n` +
            `  очікувалось: ${JSON.stringify(a[at])}\n` +
            `  отримано:    ${JSON.stringify(b[at])}`
        );
    }
    expect(received).toBe(expected);
};

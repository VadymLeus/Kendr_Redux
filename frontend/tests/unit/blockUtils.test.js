// Характеризаційні тести v0: операції над деревом блоків (шляхи виду [0], [1, 'data', 'columns', 0, 2]).
// Ці функції використовує редактор для додавання, видалення й переміщення блоків; після переходу
// на реєстр блоків (v1.0) їхня поведінка не змінюється.
import { describe, it, expect } from 'vitest';
import {
    findBlockByPath,
    updateBlockDataByPath,
    removeBlockByPath,
    addBlockByPath,
    moveBlock,
    handleDrop,
    generateNewId,
    cloneBlockWithNewIds,
} from '../../src/modules/editor/core/blockUtils';

const text = (id, content = id) => ({ type: 'text', block_id: id, data: { content } });
const layout = (id, columns) => ({ type: 'layout', block_id: id, data: { columns } });

// 0: text a; 1: layout з двома колонками [b, c] і [d]; 2: text e
const tree = () => [
    text('a'),
    layout('L', [[text('b'), text('c')], [text('d')]]),
    text('e'),
];
const ids = (list) => list.map((b) => b.block_id);

describe('findBlockByPath', () => {
    it('знаходить блок верхнього рівня', () => {
        expect(findBlockByPath(tree(), [2]).block_id).toBe('e');
    });
    it('знаходить блок усередині колонки макета', () => {
        expect(findBlockByPath(tree(), [1, 'data', 'columns', 0, 1]).block_id).toBe('c');
    });
    it('повертає null для порожнього шляху та неіснуючих елементів', () => {
        expect(findBlockByPath(tree(), null)).toBeNull();
        expect(findBlockByPath(tree(), undefined)).toBeNull();
        expect(findBlockByPath(tree(), [9])).toBeNull();
        expect(findBlockByPath(tree(), [1, 'data', 'columns', 5, 0])).toBeNull();
    });
    it('порожній масив шляху дає null (lodash.get з порожнім рядком)', () => {
        expect(findBlockByPath(tree(), [])).toBeNull();
    });
});

describe('updateBlockDataByPath', () => {
    it('замінює data цілком і не змінює вхідне дерево', () => {
        const before = tree();
        const snapshot = JSON.stringify(before);
        const after = updateBlockDataByPath(before, [0], { content: 'нове' });
        expect(after[0].data).toEqual({ content: 'нове' });
        expect(after[0].block_id).toBe('a');
        expect(JSON.stringify(before)).toBe(snapshot);
    });
    it('працює для вкладеного блока', () => {
        const after = updateBlockDataByPath(tree(), [1, 'data', 'columns', 1, 0], { content: 'D!' });
        expect(findBlockByPath(after, [1, 'data', 'columns', 1, 0]).data.content).toBe('D!');
    });
    it('неіснуючий шлях дерево не змінює', () => {
        const after = updateBlockDataByPath(tree(), [7], { content: 'x' });
        expect(after).toEqual(tree());
    });
});

describe('removeBlockByPath', () => {
    it('видаляє блок верхнього рівня', () => {
        expect(ids(removeBlockByPath(tree(), [0]))).toEqual(['L', 'e']);
    });
    it('видаляє блок усередині колонки', () => {
        const after = removeBlockByPath(tree(), [1, 'data', 'columns', 0, 0]);
        expect(ids(after[1].data.columns[0])).toEqual(['c']);
        expect(ids(after[1].data.columns[1])).toEqual(['d']);
    });
    it('вхідне дерево не змінюється', () => {
        const before = tree();
        const snapshot = JSON.stringify(before);
        removeBlockByPath(before, [1, 'data', 'columns', 0, 0]);
        expect(JSON.stringify(before)).toBe(snapshot);
    });
    it('шлях до неіснуючого контейнера дерево не змінює', () => {
        expect(removeBlockByPath(tree(), [1, 'data', 'columns', 9, 0])).toEqual(tree());
    });
});

describe('addBlockByPath', () => {
    it('вставляє на верхній рівень у вказану позицію', () => {
        const after = addBlockByPath(tree(), text('n'), [1]);
        expect(ids(after)).toEqual(['a', 'n', 'L', 'e']);
    });
    it('вставляє в кінець, якщо індекс дорівнює довжині', () => {
        expect(ids(addBlockByPath(tree(), text('n'), [3]))).toEqual(['a', 'L', 'e', 'n']);
    });
    it('вставляє в колонку макета', () => {
        const after = addBlockByPath(tree(), text('n'), [1, 'data', 'columns', 1, 0]);
        expect(ids(after[1].data.columns[1])).toEqual(['n', 'd']);
    });
    it('вставляє в порожню колонку', () => {
        const withEmpty = [layout('L', [[], []])];
        const after = addBlockByPath(withEmpty, text('n'), [0, 'data', 'columns', 0, 0]);
        expect(ids(after[0].data.columns[0])).toEqual(['n']);
    });
    it('вхідне дерево не змінюється', () => {
        const before = tree();
        const snapshot = JSON.stringify(before);
        addBlockByPath(before, text('n'), [0]);
        expect(JSON.stringify(before)).toBe(snapshot);
    });
});

describe('moveBlock', () => {
    it('переміщує блок у межах верхнього рівня', () => {
        expect(ids(moveBlock(tree(), [0], [2]))).toEqual(['L', 'e', 'a']);
        expect(ids(moveBlock(tree(), [2], [0]))).toEqual(['e', 'a', 'L']);
    });
    it('переміщує з колонки на верхній рівень', () => {
        const after = moveBlock(tree(), [1, 'data', 'columns', 0, 0], [0]);
        expect(ids(after)).toEqual(['b', 'a', 'L', 'e']);
        expect(ids(after[2].data.columns[0])).toEqual(['c']);
    });
    it('переміщує між колонками', () => {
        const after = moveBlock(tree(), [1, 'data', 'columns', 0, 1], [1, 'data', 'columns', 1, 0]);
        expect(ids(after[1].data.columns[0])).toEqual(['b']);
        expect(ids(after[1].data.columns[1])).toEqual(['c', 'd']);
    });
    it('переміщує з верхнього рівня в контейнер, розташований нижче в тому самому списку, якщо блок стоїть після нього', () => {
        // шлях призначення не зсувається, бо видалений елемент стояв після контейнера
        const after = moveBlock(tree(), [2], [1, 'data', 'columns', 0, 0]);
        expect(ids(after)).toEqual(['a', 'L']);
        expect(ids(after[1].data.columns[0])).toEqual(['e', 'b', 'c']);
    });
    it('KNOWN-DEFECT D-BLK-07: перенесення блока з початку списку в контейнер нижче губить блок', () => {
        // Після видалення з індексу 0 усі індекси того самого списку зсуваються на 1, а шлях призначення
        // [1, 'data', 'columns', 0, 0] не коригується: тепер індекс 1 — це текстовий блок "e" без колонок.
        const after = moveBlock(tree(), [0], [1, 'data', 'columns', 0, 0]);
        expect(ids(after)).toEqual(['L', 'e']);
        const everyId = JSON.stringify(after);
        expect(everyId).not.toContain('"block_id":"a"');
    });
    it('KNOWN-DEFECT D-BLK-07: якщо після блока є два макети, він потрапляє не в той макет', () => {
        const two = [text('a'), layout('L1', [[text('b')]]), layout('L2', [[text('c')]])];
        const after = moveBlock(two, [0], [1, 'data', 'columns', 0, 0]);
        expect(ids(after)).toEqual(['L1', 'L2']);
        expect(ids(after[0].data.columns[0])).toEqual(['b']);
        expect(ids(after[1].data.columns[0])).toEqual(['a', 'c']);
    });
    it('некоректні шляхи дерево не змінюють', () => {
        expect(moveBlock(tree(), null, [0])).toEqual(tree());
        expect(moveBlock(tree(), [0], null)).toEqual(tree());
        expect(moveBlock(tree(), 'a', [0])).toEqual(tree());
        expect(moveBlock(tree(), [9], [0])).toEqual(tree());
    });
    it('вхідне дерево не змінюється', () => {
        const before = tree();
        const snapshot = JSON.stringify(before);
        moveBlock(before, [0], [2]);
        expect(JSON.stringify(before)).toBe(snapshot);
    });
});

describe('handleDrop', () => {
    it('скидає блок у кінець указаної колонки', () => {
        const after = handleDrop(tree(), { path: [2] }, [1, 'data', 'columns', 1]);
        expect(ids(after)).toEqual(['a', 'L']);
        expect(ids(after[1].data.columns[1])).toEqual(['d', 'e']);
    });
    it('KNOWN-DEFECT D-BLK-07: скидання блока з початку списку в колонку макета нижче губить блок', () => {
        const after = handleDrop(tree(), { path: [0] }, [1, 'data', 'columns', 1]);
        expect(ids(after)).toEqual(['L', 'e']);
        expect(ids(after[0].data.columns[1])).toEqual(['d']);
        expect(JSON.stringify(after)).not.toContain('"block_id":"a"');
    });
    it('якщо за шляхом не масив, дерево повертається без змін', () => {
        const before = tree();
        expect(handleDrop(before, { path: [0] }, [2, 'data'])).toBe(before);
    });
});

describe('generateNewId', () => {
    it('повертає непорожній рядок, кожного разу інший', () => {
        const a = generateNewId();
        const b = generateNewId();
        expect(typeof a).toBe('string');
        expect(a.length).toBeGreaterThan(0);
        expect(a).not.toBe(b);
    });
});

describe('cloneBlockWithNewIds', () => {
    const source = () => ({
        type: 'features',
        block_id: 'short',
        data: {
            title: 'T',
            items: [
                { id: 'id-1700000000000-abc', title: 'x' },
                { id: 'short', title: 'y' },
                { id: 'a-very-long-identifier-over-20-chars', title: 'z' },
                { id: 42, title: 'w' },
            ],
        },
    });

    it('block_id змінюється завжди', () => {
        expect(cloneBlockWithNewIds(source()).block_id).not.toBe('short');
    });
    it('id змінюється, якщо це рядок, що починається з "id-" або довший за 20 символів', () => {
        const items = cloneBlockWithNewIds(source()).data.items;
        expect(items[0].id).not.toBe('id-1700000000000-abc');
        expect(items[2].id).not.toBe('a-very-long-identifier-over-20-chars');
    });
    it('короткі й нерядкові id лишаються (особливість: ключ id не розрізняє «справжні» ідентифікатори)', () => {
        const items = cloneBlockWithNewIds(source()).data.items;
        expect(items[1].id).toBe('short');
        expect(items[3].id).toBe(42);
    });
    it('решта полів копіюється, вхід не змінюється', () => {
        const input = source();
        const snapshot = JSON.stringify(input);
        const copy = cloneBlockWithNewIds(input);
        expect(copy.data.title).toBe('T');
        expect(copy.data.items[0].title).toBe('x');
        expect(JSON.stringify(input)).toBe(snapshot);
        expect(copy).not.toBe(input);
    });
    it('примітиви й null повертаються як є, масиви обробляються поелементно', () => {
        expect(cloneBlockWithNewIds(null)).toBeNull();
        expect(cloneBlockWithNewIds('x')).toBe('x');
        expect(cloneBlockWithNewIds(5)).toBe(5);
        const list = cloneBlockWithNewIds([{ block_id: 'a' }, { block_id: 'b' }]);
        expect(list).toHaveLength(2);
        expect(list[0].block_id).not.toBe('a');
        expect(list[0].block_id).not.toBe(list[1].block_id);
    });
});

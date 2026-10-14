// frontend/src/modules/editor/core/blockUtils.js
import { produce } from 'immer';
import { get } from 'lodash';

const getPathString = (path) => path.join('.');
export const findBlockByPath = (blocks, path) => {
    if (!path) return null;
    return get(blocks, getPathString(path), null);
};

export const updateBlockDataByPath = (blocks, path, newData) => {
    return produce(blocks, draft => {
        const block = get(draft, getPathString(path));
        if (block) block.data = newData;
    });
};

export const removeBlockByPath = (blocks, path) => {
    return produce(blocks, draft => {
        const parentPath = path.slice(0, -1);
        const index = path[path.length - 1];
        
        if (parentPath.length === 0) {
            draft.splice(index, 1);
        } else {
            const parent = get(draft, getPathString(parentPath));
            if (parent && Array.isArray(parent)) parent.splice(index, 1);
        }
    });
};

export const addBlockByPath = (blocks, newBlock, path) => {
    return produce(blocks, draft => {
        const parentPath = path.slice(0, -1);
        const index = path[path.length - 1];

        if (parentPath.length === 0) {
            draft.splice(index, 0, newBlock);
        } else {
            const parent = get(draft, getPathString(parentPath));
            if (parent && Array.isArray(parent)) parent.splice(index, 0, newBlock);
        }
    });
};

const sameSegment = (a, b) => String(a) === String(b);
const startsWith = (path, prefix) => prefix.length <= path.length && prefix.every((segment, i) => sameSegment(path[i], segment));

// Шлях призначення викликач задає для дерева ще до видалення блока (крім останнього індексу: його він уже вказує
// для списку без блока). Якщо шлях іде через елемент того самого списку, з якого блок прибирають, і цей елемент
// стоїть після блока, то після видалення його індекс на 1 менший (D-BLK-07).
const shiftForRemoval = (dragPath, hoverPath) => {
    const dragParentPath = dragPath.slice(0, -1);
    const dragIndex = Number(dragPath[dragPath.length - 1]);
    const depth = dragParentPath.length;
    if (hoverPath.length > depth + 1 && startsWith(hoverPath, dragParentPath)) {
        const siblingIndex = Number(hoverPath[depth]);
        if (siblingIndex > dragIndex) {
            const shifted = [...hoverPath];
            shifted[depth] = siblingIndex - 1;
            return shifted;
        }
    }
    return hoverPath;
};

// Перенесення блока всередину самого себе (у його колонку) неможливе: після видалення місця призначення вже немає.
const isInsideDragged = (dragPath, hoverPath) => hoverPath.length > dragPath.length && startsWith(hoverPath, dragPath);

export const moveBlock = (blocks, dragPath, hoverPath) => {
    return produce(blocks, draft => {
        if (!dragPath || !hoverPath || !Array.isArray(dragPath) || !Array.isArray(hoverPath)) return;
        const dragBlock = get(draft, getPathString(dragPath));
        if (!dragBlock) {
            return;
        }
        if (isInsideDragged(dragPath, hoverPath)) return;
        const dragParentPath = dragPath.slice(0, -1);
        const dragIndex = dragPath[dragPath.length - 1];
        let parent = draft;
        if (dragParentPath.length > 0) parent = get(draft, getPathString(dragParentPath));
        if (!parent || !Array.isArray(parent) || !parent[dragIndex]) return;
        const targetPath = shiftForRemoval(dragPath, hoverPath);
        const [movedItem] = parent.splice(dragIndex, 1);
        const hoverParentPath = targetPath.slice(0, -1);
        const hoverIndex = targetPath[targetPath.length - 1];
        let hoverParent = draft;
        if (hoverParentPath.length > 0) hoverParent = get(draft, getPathString(hoverParentPath));
        if (hoverParent && Array.isArray(hoverParent)) {
            hoverParent.splice(hoverIndex, 0, movedItem);
        }
    });
};

export const handleDrop = (blocks, dragItem, dropPath) => {
    const dragPath = dragItem.path;
    const targetBlockList = get(blocks, getPathString(dropPath));
    if (Array.isArray(targetBlockList)) {
        const hoverPath = [...dropPath, targetBlockList.length];
        return moveBlock(blocks, dragPath, hoverPath);
    }
    return blocks;
};

export const generateNewId = () => {
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const cloneBlockWithNewIds = (obj) => {
    if (Array.isArray(obj)) {
        return obj.map(item => cloneBlockWithNewIds(item));
    } else if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                if (key === 'block_id' || (key === 'id' && typeof obj[key] === 'string' && (obj[key].startsWith('id-') || obj[key].length > 20))) {
                    newObj[key] = generateNewId();
                } else {
                    newObj[key] = cloneBlockWithNewIds(obj[key]);
                }
            }
        }
        return newObj;
    }
    return obj;
};
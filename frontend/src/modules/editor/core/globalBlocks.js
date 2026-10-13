// frontend/src/modules/editor/core/globalBlocks.js
import { getDefaultBlockData } from './blockRegistry';
import { isHeaderType, isFooterType } from './globalBlockTypes';

const KINDS = [
    {
        type: 'global-header',
        field: 'header_content',
        label: 'Header',
        matches: isHeaderType,
        fillMissing: (data, defaults) => {
            if (!data.nav_items || data.nav_items.length === 0) data.nav_items = defaults.nav_items;
            if (data.site_title === undefined) data.site_title = defaults.site_title;
        }
    },
    {
        type: 'global-footer',
        field: 'footer_content',
        label: 'Footer',
        matches: isFooterType,
        fillMissing: null
    }
];

const kindOf = (type) => KINDS.find((kind) => kind.matches(type));

export const parseGlobalContent = (raw) => (typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}));

export const resolveGlobalData = (raw, type) => {
    const data = parseGlobalContent(raw);
    return Object.keys(data).length === 0 ? getDefaultBlockData(type) : data;
};

export const normalizeGlobalBlocks = (blocks, siteData) =>
    blocks.map((block) => {
        const kind = kindOf(block.type);
        if (!kind) return block;
        return { ...block, type: kind.type, data: resolveGlobalData(siteData[kind.field], kind.type) };
    });

const mergeGlobalContent = (block, raw, kind) => {
    let data = { ...(block.data || {}) };
    if (raw) {
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) {
                const found = parsed.find((item) => kind.matches(item.type));
                if (found?.data) data = { ...data, ...found.data };
            } else if (typeof parsed === 'object' && parsed !== null) {
                if (parsed['0'] && parsed['0'].data) {
                    data = { ...data, ...parsed['0'].data };
                }
                const rootProps = { ...parsed };
                delete rootProps['0']; delete rootProps.type; delete rootProps.block_id;
                data = { ...data, ...rootProps };
            }
        } catch (e) {
            console.error(`${kind.label} parse error`, e);
        }
    }
    const defaults = getDefaultBlockData(kind.type);
    if (Object.keys(data).length === 0) {
        data = defaults;
    } else if (kind.fillMissing) {
        kind.fillMissing(data, defaults);
    }
    return { ...block, type: kind.type, data };
};

export const mergeGlobalBlocks = (blocks, siteData) => {
    if (!Array.isArray(blocks)) return [];
    return blocks.map((block) => {
        const kind = kindOf(block.type);
        if (!kind) return block;
        return mergeGlobalContent(block, siteData[kind.field], kind);
    });
};

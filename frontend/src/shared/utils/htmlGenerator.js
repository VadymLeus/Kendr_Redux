// frontend/src/shared/utils/htmlGenerator.js
import { escapeHTML } from './exportHtml';
import { getBlockHtmlRenderer } from '../../modules/editor/core/blockRegistry';
import { isHeaderType, isFooterType } from '../../modules/editor/core/globalBlockTypes';
import { mergeGlobalBlocks } from '../../modules/editor/core/globalBlocks';

const generateBlockHTML = (block) => {
    if (!block || !block.data) return '';
    const renderBlock = getBlockHtmlRenderer(block.type);
    return renderBlock ? renderBlock(block.data, { renderBlock: generateBlockHTML }) : '';
};

// Дані шапки й підвалу в налаштуваннях сайту бувають масивом блоків (нові сайти, шаблони),
// об'єктом-блоком або самим об'єктом даних (після збереження в редакторі), тому розбирає їх mergeGlobalBlocks.
const hasSiteContent = (raw) => {
    if (!raw) return false;
    if (Array.isArray(raw)) return raw.length > 0;
    if (typeof raw === 'object') return Object.keys(raw).length > 0;
    const text = String(raw).trim();
    return text !== '' && text !== '{}' && text !== '[]';
};

const siteGlobalBlock = (type, siteData) => {
    const [block] = mergeGlobalBlocks([{ type, block_id: `site-${type}`, data: {} }], siteData);
    return type === 'global-header' ? { ...block, data: { ...block.data, ...siteData } } : block;
};

export const generateFullHTML = (siteData, blocks, pageTitle) => {
    const pageBlocks = mergeGlobalBlocks(
        (Array.isArray(blocks) ? blocks : []).filter(block => block && typeof block === 'object'),
        siteData
    );
    const allBlocks = [...pageBlocks];
    if (hasSiteContent(siteData.header_content) && !pageBlocks.some(block => isHeaderType(block.type))) {
        allBlocks.unshift(siteGlobalBlock('global-header', siteData));
    }
    if (hasSiteContent(siteData.footer_content) && !pageBlocks.some(block => isFooterType(block.type))) {
        allBlocks.push(siteGlobalBlock('global-footer', siteData));
    }

    const blocksHTML = allBlocks.map(generateBlockHTML).join('\n');
    return `<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle ? `${escapeHTML(pageTitle)} - ` : ''}${escapeHTML(siteData.title || 'My Website')}</title>
    <meta name="description" content="${escapeHTML(siteData.seo_description || '')}">
    ${siteData.favicon_url ? `<link rel="icon" href="${escapeHTML(siteData.favicon_url)}" type="image/x-icon">` : ''}
    <script src="https://unpkg.com/lucide@latest"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
    <style>
        * { box-sizing: border-box; }
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
    </style>
</head>
<body>
    ${blocksHTML}
    
    <script>
        lucide.createIcons();
    </script>
</body>
</html>`;
};
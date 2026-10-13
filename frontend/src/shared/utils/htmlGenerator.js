// frontend/src/shared/utils/htmlGenerator.js
import { escapeHTML } from './exportHtml';
import { getBlockHtmlRenderer } from '../../modules/editor/core/blockRegistry';

const generateBlockHTML = (block) => {
    if (!block || !block.data) return '';
    const renderBlock = getBlockHtmlRenderer(block.type);
    return renderBlock ? renderBlock(block.data, { renderBlock: generateBlockHTML }) : '';
};

export const generateFullHTML = (siteData, blocks, pageTitle) => {
    let allBlocks = Array.isArray(blocks) ? [...blocks] : [];
    if (siteData.header_content && !allBlocks.find(b => b.type === 'header')) {
        let headerBlock = Array.isArray(siteData.header_content) ? siteData.header_content[0] : siteData.header_content;
        if (headerBlock) {
             headerBlock = {
                 ...headerBlock,
                 data: { ...headerBlock.data, ...siteData } 
             };
             allBlocks.unshift(headerBlock);
        }
    }

    if (siteData.footer_content && !allBlocks.find(b => b.type === 'footer')) {
        const footerBlock = Array.isArray(siteData.footer_content) ? siteData.footer_content[0] : siteData.footer_content;
        if (footerBlock) allBlocks.push(footerBlock);
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
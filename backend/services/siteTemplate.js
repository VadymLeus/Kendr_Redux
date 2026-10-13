// backend/services/siteTemplate.js
const { v4: uuidv4 } = require('uuid');

const regenerateBlockIds = (blocks) => {
    if (!blocks) return [];
    const mapBlock = (block) => {
        const newBlock = { ...block, block_id: uuidv4() };
        if (newBlock.data && newBlock.data.columns && Array.isArray(newBlock.data.columns)) {
            newBlock.data.columns = newBlock.data.columns.map(col => col.map(child => mapBlock(child)));
        }
        if (newBlock.data && newBlock.data.items && Array.isArray(newBlock.data.items)) {
            newBlock.data.items = newBlock.data.items.map(item => ({...item, id: uuidv4()}));
        }
        return newBlock;
    };
    return Array.isArray(blocks) ? blocks.map(mapBlock) : blocks;
};

const parseTemplateContent = (rawContent) => (typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent);

const readTemplate = (template, defaultAccent) => {
    const templateData = parseTemplateContent(template.default_block_content);
    let pages = templateData.pages || [];
    if (!templateData.pages && Array.isArray(templateData)) {
        pages = [{ title: 'Головна', slug: 'home', blocks: templateData }];
    }
    return {
        header: regenerateBlockIds(templateData.header_content || []),
        footer: regenerateBlockIds(templateData.footer_content || []),
        pages,
        themeSettings: templateData.theme_settings || {},
        mode: templateData.site_theme_mode || templateData.theme_settings?.mode || 'light',
        accent: templateData.site_theme_accent || templateData.theme_settings?.accent || defaultAccent
    };
};

module.exports = { regenerateBlockIds, readTemplate, parseTemplateContent };

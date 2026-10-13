// frontend/src/modules/editor/core/globalBlockTypes.js
export const LEGACY_TYPE_ALIASES = {
    header: 'global-header',
    footer: 'global-footer'
};

export const isHeaderType = (type) => type === 'global-header' || type === 'header';

export const isFooterType = (type) => type === 'global-footer' || type === 'footer';

export const isGlobalType = (type) =>
    Boolean(type) && (type.startsWith('global-') || isHeaderType(type) || isFooterType(type));

// frontend/src/modules/editor/core/blockProps.js
import { isEqual } from 'lodash';

export const areBlockPropsEqual = (prev, next) =>
    isEqual(prev.blockData, next.blockData) &&
    prev.isEditorPreview === next.isEditorPreview &&
    prev.siteData?.id === next.siteData?.id;

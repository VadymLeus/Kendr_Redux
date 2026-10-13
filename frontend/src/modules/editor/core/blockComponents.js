// frontend/src/modules/editor/core/blockComponents.js
import { createContext, useContext } from 'react';

export const BlockRendererContext = createContext(null);
export const EditableBlockContext = createContext(null);

export const useBlockRenderer = () => useContext(BlockRendererContext);
export const useEditableBlock = () => useContext(EditableBlockContext);

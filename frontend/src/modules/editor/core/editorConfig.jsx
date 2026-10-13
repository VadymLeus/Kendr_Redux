// frontend/src/modules/editor/core/editorConfig.jsx
import React from 'react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

export { generateBlockId } from './blockId';

export const FONT_LIBRARY = [
    { label: 'Як на сайті (Default)', value: 'global', type: 'sans-serif' },
    
    { label: 'Inter', value: "'Inter', sans-serif", googleFont: 'Inter' },
    { label: 'Roboto', value: "'Roboto', sans-serif", googleFont: 'Roboto' },
    { label: 'Open Sans', value: "'Open Sans', sans-serif", googleFont: 'Open Sans' },
    { label: 'Montserrat', value: "'Montserrat', sans-serif", googleFont: 'Montserrat' },
    { label: 'Lato', value: "'Lato', sans-serif", googleFont: 'Lato' },
    { label: 'Nunito', value: "'Nunito', sans-serif", googleFont: 'Nunito' },
    { label: 'Oswald', value: "'Oswald', sans-serif", googleFont: 'Oswald' },
    { label: 'Raleway', value: "'Raleway', sans-serif", googleFont: 'Raleway' },
    { label: 'Merriweather', value: "'Merriweather', serif", googleFont: 'Merriweather' },
    { label: 'Playfair Display', value: "'Playfair Display', serif", googleFont: 'Playfair Display' },
    { label: 'Lora', value: "'Lora', serif", googleFont: 'Lora' },
    { label: 'PT Serif', value: "'PT Serif', serif", googleFont: 'PT Serif' },
    { label: 'Bitter', value: "'Bitter', serif", googleFont: 'Bitter' },
    { label: 'Comfortaa', value: "'Comfortaa', display", googleFont: 'Comfortaa' },
    { label: 'Russo One', value: "'Russo One', sans-serif", googleFont: 'Russo One' },
    { label: 'Pacifico', value: "'Pacifico', cursive", googleFont: 'Pacifico' },
    { label: 'Lobster', value: "'Lobster', cursive", googleFont: 'Lobster' },
    { label: 'Caveat', value: "'Caveat', cursive", googleFont: 'Caveat' },
    { label: 'Roboto Mono', value: "'Roboto Mono', monospace", googleFont: 'Roboto Mono' },
    { label: 'Ubuntu Mono', value: "'Ubuntu Mono', monospace", googleFont: 'Ubuntu Mono' }
];

export const BLOCK_THEME_OPTIONS = [
    { value: 'auto', label: 'Автоматично (як на сайті)' },
    { value: 'light', label: 'Світла тема' },
    { value: 'dark', label: 'Темна тема' }
];

export const getBlockThemeClass = (blockTheme) => {
    if (blockTheme === 'light') return 'block-theme-light';
    if (blockTheme === 'dark') return 'block-theme-dark';
    return '';
};

export const ALIGNMENT_OPTIONS = [
    { value: 'left', label: 'Ліворуч', icon: <AlignLeft size={16} /> },
    { value: 'center', label: 'По центру', icon: <AlignCenter size={16} /> },
    { value: 'right', label: 'Праворуч', icon: <AlignRight size={16} /> }
];

export const HEIGHT_OPTIONS = [
    { value: 'small', label: 'Мала' },
    { value: 'medium', label: 'Середня' },
    { value: 'large', label: 'Велика' },
    { value: 'fullscreen', label: 'Дуже велика' }
];

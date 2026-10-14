// frontend/src/shared/lib/utils/mediaUtils.js
import { BASE_URL } from '../config';
import { File, Type, Image, Video } from 'lucide-react';

const CLEAN_ROOT_URL = (BASE_URL || '').replace(/\/api\/?$/, '').replace(/\/$/, '');
export const API_URL = CLEAN_ROOT_URL;
export const checkeredStyle = {
    backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
    backgroundColor: '#ffffff'
};

export const getMediaUrl = (file, useThumb = false) => {
    if (!file) return '';
    const targetPath = useThumb && file.path_thumb ? file.path_thumb : (file.path_full || file.file_path);
    if (!targetPath || typeof targetPath !== 'string') return '';
    if (/^(javascript|vbscript):/i.test(targetPath.trim())) {
        return '';
    }

    if (targetPath.startsWith('http') || targetPath.startsWith('data:')) {
        return targetPath;
    }
    const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    return `${API_URL}${cleanPath}`;
};

// Адреса вкладення або аватара з відповіді сервера: відносний шлях добудовується до адреси API зі змінної
// середовища (D-CON-04), абсолютні й blob-адреси лишаються як є, небезпечні схеми відкидаються.
export const getAttachmentUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    if (/^(javascript|vbscript):/i.test(url.trim())) return null;
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    return `${API_URL}${url.startsWith('/') ? url : '/' + url}`;
};

export const getFileExtension = (filename) => {
    if (!filename) return '';
    return filename.split('.').pop().toUpperCase();
};

export const getFileConfig = (file) => {
    let config = {
        IconComponent: File,
        themeColor: '#718096',
        bgColor: 'rgba(113, 128, 150, 0.08)', 
        badgeBg: 'rgba(113, 128, 150, 0.15)',
        type: 'other'
    };
    if (!file) {
        return config;
    }
    const mimeType = file.mime_type || '';
    const ext = getFileExtension(file.original_file_name || '');
    if (mimeType.startsWith('image/')) {
        config.type = 'image';
        config.IconComponent = Image;
        return config;
    }
    if (mimeType.startsWith('video/')) {
        config.type = 'video';
        config.IconComponent = Video;
        return config;
    }
    switch (ext) {
        case 'TTF': case 'OTF': case 'WOFF': case 'WOFF2':
            config.IconComponent = Type;
            config.themeColor = '#38a169';
            config.bgColor = 'rgba(56, 161, 105, 0.08)';
            config.badgeBg = 'rgba(56, 161, 105, 0.15)';
            config.type = 'font';
            break;
        default:
            break;
    }
    return config;
};
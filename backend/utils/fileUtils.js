// backend/utils/fileUtils.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const ensureDirExists = async (dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        console.error(`Помилка під час створення директорії ${dirPath}:`, error);
        throw error;
    }
};

const projectRoot = path.resolve(__dirname, '..');
const uploadsRoot = path.join(projectRoot, 'uploads');
const isInsideUploads = (fullPath) => fullPath.startsWith(uploadsRoot + path.sep);

const resolveUploadPath = (filePath) => {
    if (path.isAbsolute(filePath)) {
        const absolute = path.normalize(filePath);
        if (isInsideUploads(absolute)) return absolute;
    }
    const relative = filePath.replace(/^[\/\\]+/, '');
    const fullPath = path.resolve(projectRoot, relative);
    return isInsideUploads(fullPath) ? fullPath : null;
};

const deleteFile = async (filePath) => {
    if (typeof filePath !== 'string' || filePath === '' || filePath.includes('/default/')) {
        return;
    }
    const fullPath = resolveUploadPath(filePath);
    if (!fullPath) {
        console.warn(`[SECURITY WARNING] Заблоковано видалення файлу поза каталогом uploads: ${filePath}`);
        return;
    }
    try {
        await fs.unlink(fullPath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Критична помилка при видаленні файлу ${fullPath}:`, error);
        }
    }
};

const downloadImage = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const file = fsSync.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to download image: status ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(destPath));
            });
        }).on('error', (err) => {
            fsSync.unlink(destPath, () => {});
            reject(err);
        });
    });
};

module.exports = { ensureDirExists, deleteFile, downloadImage };
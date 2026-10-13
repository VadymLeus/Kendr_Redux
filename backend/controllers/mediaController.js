// backend/controllers/mediaController.js
const path = require('path');
const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const PlanPolicy = require('../services/PlanPolicy');
const normalizeWebPath = (filePath) => {
    if (!filePath) return null;
    let cleanPath = filePath.replace(/\\/g, '/');
    cleanPath = cleanPath.replace(/^\/+/, '');
    return `/${cleanPath}`;
};

exports.getAll = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { search, type, sort, favorite, extension } = req.query;
        let query = 'SELECT * FROM user_media WHERE user_id = ? AND is_system = 0';
        const params = [userId];
        if (search) {
            query += ' AND (display_name LIKE ? OR original_file_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (type && type !== 'all') {
            query += " AND file_type = ?";
            params.push(type);
        }
        if (extension && extension !== 'all') {
            query += " AND original_file_name LIKE ?";
            params.push(`%.${extension}`);
        }
        if (favorite === 'true') {
            query += ' AND is_favorite = 1';
        }
        let orderBy = 'ORDER BY is_favorite DESC, created_at DESC';
        if (sort === 'oldest') orderBy = 'ORDER BY is_favorite DESC, created_at ASC';
        if (sort === 'az') orderBy = 'ORDER BY is_favorite DESC, display_name ASC';
        if (sort === 'size_desc') orderBy = 'ORDER BY is_favorite DESC, file_size_kb DESC';
        query += ` ${orderBy}`;
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        next(error);
    }
};

exports.getMediaLimitsStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userPlan = req.user.plan || 'FREE';
        const limits = PlanPolicy.getLimits(userPlan);
        const [rows] = await db.query('SELECT COUNT(*) as totalFiles FROM user_media WHERE user_id = ? AND is_system = 0', [userId]);
        const currentFiles = rows[0].totalFiles;
        res.json({
            currentFiles: currentFiles,
            maxFiles: limits.maxFiles,
            maxFileSizeMB: limits.maxFileSizeMB,
            maxSites: limits.maxSites,
            maxProducts: limits.maxProducts,
            maxCategories: limits.maxCategories,
            allowedExtensions: limits.allowedExtensions,
            percentageUsed: limits.isUnlimited ? 0 : Math.round((currentFiles / limits.maxFiles) * 100),
            isUnlimited: limits.isUnlimited
        });
    } catch (error) {
        next(error);
    }
};

exports.upload = async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'Файл не завантажено.' });
    const userId = req.user.id;
    const userPlan = req.user.plan || 'FREE';
    const originalName = req.file.originalname; 
    const mimeType = req.file.mimetype;
    const isSystem = req.query.isSystem === 'true' ? 1 : 0;
    const ext = path.extname(originalName).toLowerCase();
    const displayName = originalName.replace(ext, '');
    let fileType = 'other';
    const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];
    if (mimeType.startsWith('image/')) fileType = 'image';
    else if (mimeType.startsWith('video/')) fileType = 'video';
    else if (FONT_EXTENSIONS.includes(ext) || mimeType.includes('font')) fileType = 'font';
    const cloudPublicId = req.file.filename; 
    const resourceType = fileType === 'video' ? 'video' : (fileType === 'image' ? 'image' : 'raw');
    try {
        const limits = PlanPolicy.getLimits(userPlan);
        if (!limits.allowedMimeTypes.includes(mimeType) && !limits.allowedExtensions.includes(ext)) {
            await cloudinary.uploader.destroy(cloudPublicId, { resource_type: resourceType });
            return res.status(200).json({ 
                error: true,
                message: `Ваш тариф не підтримує завантаження цього файлу. Доступні: ${limits.allowedExtensions.join(', ')}`,
                code: 'UNSUPPORTED_TYPE_FOR_TIER'
            });
        }
        const fileSizeMB = req.file.size / (1024 * 1024);
        if (fileSizeMB > limits.maxFileSizeMB) {
            await cloudinary.uploader.destroy(cloudPublicId, { resource_type: resourceType });
            return res.status(200).json({ 
                error: true,
                message: `Розмір файлу перевищує ліміт вашого тарифу (${limits.maxFileSizeMB} МБ). Цей файл: ${fileSizeMB.toFixed(2)} МБ.`,
                code: 'FILE_TOO_LARGE_FOR_TIER'
            });
        }
        if (isSystem === 0 && !limits.isUnlimited) {
            const [rows] = await db.query('SELECT COUNT(*) as totalFiles FROM user_media WHERE user_id = ? AND is_system = 0', [userId]);
            const currentFilesCount = rows[0].totalFiles;
            if (currentFilesCount >= limits.maxFiles) {
                await cloudinary.uploader.destroy(cloudPublicId, { resource_type: resourceType });
                return res.status(200).json({ 
                    error: true,
                    message: `Ви досягли ліміту вашого тарифу (${limits.maxFiles} файлів).`,
                    code: 'MAX_FILES_REACHED',
                    limitInfo: { current: currentFilesCount, max: limits.maxFiles }
                });
            }
        }
        const fileUrl = req.file.path;
        let thumbPath = null;
        if (fileType === 'image') {
            const uploadIndex = fileUrl.indexOf('/upload/') + 8;
            thumbPath = fileUrl.slice(0, uploadIndex) + 'c_fill,w_300,h_300/' + fileUrl.slice(uploadIndex);
        }
        const fileSizeKb = Math.round(req.file.size / 1024);
        const width = req.file.width || null;
        const height = req.file.height || null;
        const [result] = await db.query(
            `INSERT INTO user_media 
            (user_id, path_full, path_thumb, original_file_name, display_name, mime_type, file_size_kb, file_type, width, height, is_system) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, fileUrl, thumbPath, originalName, displayName, mimeType, fileSizeKb, fileType, width, height, isSystem]
        );
        const [newMedia] = await db.query('SELECT * FROM user_media WHERE id = ?', [result.insertId]);
        res.status(201).json({
            ...newMedia[0],
            filePath: fileUrl
        });
    } catch (error) {
        try { await cloudinary.uploader.destroy(cloudPublicId, { resource_type: resourceType }); } catch (e) {} 
        console.error('Upload Error:', error);
        next(error);
    }
};

exports.updateMedia = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { display_name, alt_text, description, is_favorite } = req.body;
        const [check] = await db.query('SELECT id FROM user_media WHERE id = ? AND user_id = ?', [id, userId]);
        if (check.length === 0) return res.status(404).json({ message: 'Файл не знайдено' });
        const updates = [];
        const params = [];
        if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
        if (alt_text !== undefined) { updates.push('alt_text = ?'); params.push(alt_text); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (is_favorite !== undefined) { updates.push('is_favorite = ?'); params.push(is_favorite ? 1 : 0); }
        if (updates.length > 0) {
            const query = `UPDATE user_media SET ${updates.join(', ')} WHERE id = ?`;
            params.push(id);
            await db.query(query, params);
        }
        const [updated] = await db.query('SELECT * FROM user_media WHERE id = ?', [id]);
        res.json(updated[0]);
    } catch (error) {
        next(error);
    }
};

exports.deleteMedia = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const [media] = await db.query('SELECT * FROM user_media WHERE id = ? AND user_id = ?', [id, userId]);
        if (media.length === 0) return res.status(404).json({ message: 'Файл не знайдено' });
        const file = media[0];
        if (file.path_full && file.path_full.includes('cloudinary.com')) {
            try {
                const uploadRegex = /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/;
                const match = file.path_full.match(uploadRegex);
                if (match && match[1]) {
                    const publicId = match[1];
                    const resourceType = file.file_type === 'video' ? 'video' : (file.file_type === 'image' ? 'image' : 'raw');
                    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
                }
            } catch (err) {
                console.error('Cloudinary delete error:', err);
            }
        } else {
            const { deleteFile } = require('../utils/fileUtils');
            const absolutePathFull = path.join(__dirname, '..', file.path_full);
            await deleteFile(absolutePathFull).catch(err => console.log('File missing:', err.message));
            if (file.path_thumb && !file.path_thumb.includes('cloudinary.com')) {
                const absolutePathThumb = path.join(__dirname, '..', file.path_thumb);
                await deleteFile(absolutePathThumb).catch(err => console.log('Thumb missing:', err.message));
            }
        }
        await db.query('DELETE FROM user_media WHERE id = ?', [id]);
        res.json({ message: 'Файл успішно видалено', id });
    } catch (error) {
        next(error);
    }
};
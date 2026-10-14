// backend/controllers/userController.js
const User = require('../models/User');
const SiteRepository = require('../repositories/SiteRepository');
const Warning = require('../models/Warning');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { deleteFile } = require('../utils/fileUtils');
const { signAccessToken } = require('../utils/authTokens');
const { isAllowedAvatarUrl } = require('../utils/avatarUrl');
const db = require('../config/db');
const PlanPolicy = require('../services/PlanPolicy');
const getUserStats = async (userId, plan, role) => {
    try {
        const [[siteRows], [mediaRows], totalViews, warnings] = await Promise.all([
            db.query('SELECT COUNT(id) as count FROM sites WHERE user_id = ?', [userId]),
            db.query('SELECT COUNT(id) as count FROM user_media WHERE user_id = ?', [userId]),
            User.getTotalSiteViews(userId),
            Warning.findForUser(userId)
        ]);
        const limits = PlanPolicy.getLimits(plan);
        return {
            siteCount: siteRows[0].count || 0,
            siteLimit: limits.maxSites,
            mediaCount: mediaRows[0].count || 0,
            mediaLimit: limits.maxFiles,
            totalViews: totalViews || 0,
            warningCount: warnings ? warnings.length : 0
        };
    } catch (err) {
        console.error("Помилка отримання статистики:", err);
        const fallbackLimits = PlanPolicy.getLimits('FREE');
        return { 
            siteCount: 0, 
            siteLimit: fallbackLimits.maxSites, 
            mediaCount: 0, 
            mediaLimit: fallbackLimits.maxFiles,
            totalViews: 0,
            warningCount: 0
        };
    }
};

const sanitizeUser = (user, stats = null) => {
    const sanitized = {
        id: user.id,
        username: user.username,
        slug: user.slug,
        email: user.email,
        phone_number: user.phone_number,
        avatar_url: user.avatar_url,
        role: user.role,
        plan: user.plan || 'FREE',
        platform_theme_mode: user.platform_theme_mode,
        platform_theme_accent: user.platform_theme_accent,
        bio: user.bio,
        social_telegram: user.social_telegram,
        social_instagram: user.social_instagram,
        social_website: user.social_website,
        is_profile_public: user.is_profile_public,
        has_password: user.has_password !== undefined ? user.has_password : !!user.password_hash,
        created_at: user.created_at
    };
    if (stats) {
        sanitized.stats = stats;
    }
    return sanitized;
};

exports.getPublicProfile = async (req, res, next) => {
    try {
        const targetSlug = req.params.slug || req.params.username;
        const [users] = await db.query('SELECT * FROM users WHERE slug = ? OR username = ? LIMIT 1', [targetSlug, targetSlug]);
        const user = users[0];
        if (!user) {
            return res.status(404).json({ message: 'Користувача не знайдено', code: 'USER_NOT_FOUND' });
        }
        if (user.role === 'admin') {
            return res.status(404).json({ message: 'Користувача не знайдено', code: 'USER_NOT_FOUND' });
        }
        const isOwner = req.user && req.user.id === user.id;
        const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');
        if (!user.is_profile_public) {
            if (!isOwner && !isStaff) {
                return res.status(403).json({ message: 'Цей профіль є приватним.', code: 'PROFILE_PRIVATE' });
            }
        }
        const [siteCount, totalViews, warnings] = await Promise.all([
            User.getSiteCount(user.id),
            User.getTotalSiteViews(user.id),
            Warning.findForUser(user.id)
        ]);
        const publicData = {
            id: user.id,
            username: user.username,
            slug: user.slug,
            createdAt: user.created_at,
            created_at: user.created_at,
            siteCount: siteCount,
            totalViews: totalViews,
            avatar_url: user.avatar_url,
            bio: user.bio,
            is_profile_public: user.is_profile_public,
            status: user.status,
            warning_count: warnings?.length || 0,
            socials: {
                telegram: user.social_telegram,
                instagram: user.social_instagram,
                website: user.social_website
            },
            warnings: warnings || []
        };
        if (isStaff || isOwner) {
            publicData.email = user.email;
            publicData.phone_number = user.phone_number;
            publicData.last_login_at = user.last_login_at;
            publicData.role = user.role;
            publicData.plan = user.plan || 'FREE';
        }
        res.json(publicData);
    } catch (error) {
        next(error);
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const allowedFields = [
            'username', 'phone_number', 
            'platform_theme_mode', 'platform_theme_accent', 
            'bio', 'social_telegram', 'social_instagram', 'social_website', 
            'is_profile_public'
        ];
        const updates = {};
        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                updates[key] = req.body[key];
            }
        });
        if (updates.phone_number) {
            const phoneRegex = /^[0-9+\-\(\)\s]*$/;
            if (!phoneRegex.test(updates.phone_number)) {
                return res.status(400).json({ message: 'Некоректний формат телефону. Використовуйте лише цифри та символи + ( ) -' });
            }
        }
        if (updates.bio !== undefined) {
            updates.bio = updates.bio.replace(/[<>]/g, '').trim().substring(0, 300);
        }
        if (updates.social_website !== undefined) {
            updates.social_website = updates.social_website.trim();
            if (updates.social_website && !/^https?:\/\//i.test(updates.social_website)) {
                return res.status(400).json({ message: "Посилання на сайт має починатися з http:// або https://" });
            }
        }
        if (updates.social_telegram !== undefined) {
            updates.social_telegram = updates.social_telegram.replace(/[<>]/g, '').trim();
        }
        if (updates.social_instagram !== undefined) {
            updates.social_instagram = updates.social_instagram.replace(/[<>]/g, '').trim();
        }
        if (updates.username) {
            const currentUser = await User.findById(userId);
            if (updates.username !== currentUser.username) {
                const [rows] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [updates.username, userId]);
                if (rows.length > 0) {
                    return res.status(400).json({ message: 'Це ім\'я користувача вже зайнято.' });
                }
                updates.slug = await User.generateSlug(updates.username);
            }
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'Немає даних для оновлення' });
        }
        const updatedUserRaw = await User.update(userId, updates);
        const hasPwd = await User.hasPassword(userId);
        const stats = await getUserStats(userId, updatedUserRaw.plan, updatedUserRaw.role);
        res.json({ 
            message: 'Профіль успішно оновлено!', 
            user: sanitizeUser({ ...updatedUserRaw, has_password: hasPwd }, stats)
        });
    } catch (error) {
        next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = userRows[0];
        if (user.password_hash) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Введіть поточний пароль для підтвердження.' });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ message: 'Невірний поточний пароль.' });
            }
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await User.changePassword(userId, hashedPassword);
        const updatedUserRaw = await User.findById(userId);
        const stats = await getUserStats(userId, updatedUserRaw.plan, updatedUserRaw.role);
        res.json({ 
            message: user.password_hash ? 'Пароль успішно змінено.' : 'Пароль успішно встановлено.',
            token: signAccessToken(updatedUserRaw),
            user: sanitizeUser({ ...updatedUserRaw, has_password: true }, stats) 
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteAccount = async (req, res, next) => {
    try {
        const { confirmation } = req.body;
        if (confirmation !== 'DELETE') {
            return res.status(400).json({ message: 'Невірне підтвердження.' });
        }
        const userId = req.user.id;
        await db.withTransaction(async (connection) => {
            await User.softDeleteUser(userId, connection);
            await SiteRepository.setAllUserSitesToDraft(userId, connection);
        });
        res.json({ message: 'Акаунт заплановано на видалення. Ви можете відновити його протягом 14 днів.' });
    } catch (error) {
        next(error);
    }
};

exports.restoreAccount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user || user.status !== 'deleted') {
            return res.status(400).json({ message: 'Акаунт не потребує відновлення або не знайдено.' });
        }
        await User.restoreFromSoftDelete(userId);
        const token = signAccessToken(user);
        const stats = await getUserStats(userId, user.plan, user.role);
        res.json({ 
            message: 'Акаунт успішно відновлено!',
            token,
            user: sanitizeUser({ ...user, has_password: await User.hasPassword(userId) }, stats)
        });
    } catch (error) {
        next(error);
    }
};

exports.updateAvatarUrl = async (req, res, next) => {
    const { avatar_url } = req.body;
    const userId = req.user.id;
    if (!isAllowedAvatarUrl(avatar_url)) {
        return res.status(400).json({ message: 'Недопустима адреса аватара.' });
    }
    try {
        const currentUser = await User.findById(userId);
        const oldAvatarUrl = currentUser.avatar_url;
        if (oldAvatarUrl && oldAvatarUrl.includes('/avatars/custom/') && oldAvatarUrl !== avatar_url) {
            await deleteFile(oldAvatarUrl);
        }
        const updatedUserRaw = await User.update(userId, { avatar_url });
        const hasPwd = await User.hasPassword(userId);
        const stats = await getUserStats(userId, updatedUserRaw.plan, updatedUserRaw.role);
        res.json({ 
            message: 'Аватар оновлено!', 
            user: sanitizeUser({ ...updatedUserRaw, has_password: hasPwd }, stats) 
        });
    } catch (error) {
        next(error);
    }
};

exports.getDefaultAvatars = (req, res, next) => {
    const defaultAvatarsDir = path.join(__dirname, '..', 'uploads', 'avatars', 'default');
    if (!fs.existsSync(defaultAvatarsDir)) {
         return res.json([]); 
    }
    const files = fs.readdirSync(defaultAvatarsDir);
    const avatarUrls = files.map(file => `/uploads/avatars/default/${file}`);
    res.json(avatarUrls);
};

exports.uploadAvatar = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Файл не завантажено.' });
    }
    const userId = req.user.id;
    const newAvatarUrl = req.file.path; 
    try {
        const currentUser = await User.findById(userId);
        const oldAvatarUrl = currentUser.avatar_url;
        if (oldAvatarUrl && oldAvatarUrl.includes('/avatars/custom/')) {
            try {
                await deleteFile(oldAvatarUrl);
            } catch(e) {
                console.warn('Не вдалося видалити старий локальний файл аватара', e);
            }
        }
        const updatedUserRaw = await User.update(userId, { avatar_url: newAvatarUrl });
        const hasPwd = await User.hasPassword(userId);
        const stats = await getUserStats(userId, updatedUserRaw.plan, updatedUserRaw.role);
        res.json({ 
            message: 'Аватар завантажено!', 
            user: sanitizeUser({ ...updatedUserRaw, has_password: hasPwd }, stats) 
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteAvatar = async (req, res, next) => {
    try {
        await db.query('UPDATE users SET avatar_url = NULL WHERE id = ?', [req.user.id]);
        const user = await User.findById(req.user.id);
        const stats = await getUserStats(req.user.id, user.plan, user.role);
        res.json({ 
            message: 'Аватар видалено', 
            user: sanitizeUser({ ...user, has_password: await User.hasPassword(req.user.id) }, stats)
        });
    } catch (error) {
        next(error);
    }
};
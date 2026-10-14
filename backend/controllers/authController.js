// backend/controllers/authController.js
const User = require('../models/User');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { signAccessToken } = require('../utils/authTokens');
const { isAllowedAvatarUrl } = require('../utils/avatarUrl');
const AuthPolicy = require('../services/AuthPolicy');
const { sendOtpEmail } = require('../utils/emailService');
const { deleteFile } = require('../utils/fileUtils');
const db = require('../config/db');
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const getGlobalSettings = async () => {
    try {
        const [rows] = await db.query('SELECT registration_enabled, auth_enabled FROM global_settings LIMIT 1');
        if (rows && rows.length > 0) return rows[0];
    } catch (e) {
        console.warn('Таблиця global_settings не знайдена або порожня, використовуються налаштування за замовчуванням.');
    }
    return { registration_enabled: 1, auth_enabled: 1 };
};

exports.register = async (req, res, next) => {
    try {
        const settings = await getGlobalSettings();
        if (!settings.registration_enabled) {
            return res.status(403).json({ message: 'Реєстрація тимчасово призупинена з технічних причин.' });
        }
        const { email, password, avatar_url: selected_avatar_url } = req.body;
        const username = req.body.username.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: 'Пароль занадто слабкий.' });
        }
        if (!req.file && selected_avatar_url && !isAllowedAvatarUrl(selected_avatar_url)) {
            return res.status(400).json({ message: 'Недопустима адреса аватара.' });
        }
        const existingUserByEmail = await User.findByEmail(email);
        if (existingUserByEmail) return res.status(400).json({ message: 'Користувач з таким email вже існує.' });
        const existingUserByUsername = await User.findByUsername(username);
        if (existingUserByUsername) return res.status(400).json({ message: "Це ім'я користувача вже зайняте." });
        let avatar_url = null;
        if (req.file) avatar_url = `/uploads/avatars/custom/${req.file.filename}`;
        else if (selected_avatar_url) avatar_url = selected_avatar_url;
        const slug = await User.generateSlug(username);
        const newUser = await User.create({ 
            username, slug, email, password, avatar_url, is_verified: 0 
        });
        const otpCode = generateOTP();
        const otpExpires = new Date(Date.now() + 60 * 60 * 1000);
        await db.query(
            'UPDATE users SET otp_code = ?, otp_expires = ?, otp_purpose = ? WHERE id = ?',
            [otpCode, otpExpires, 'VERIFY_EMAIL', newUser.id]
        );
        await sendOtpEmail(email, otpCode, 'VERIFY_EMAIL');
        res.status(201).json({ message: 'Акаунт створено! Введіть код з пошти.' });
    } catch (error) {
        next(error);
    }
};

exports.verifyEmail = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ message: 'Email та код обов\'язкові' });
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        if (!user || user.otp_code !== code || user.otp_purpose !== 'VERIFY_EMAIL') {
            return res.status(400).json({ message: 'Недійсний код підтвердження' });
        }
        if (new Date() > new Date(user.otp_expires)) {
            return res.status(400).json({ message: 'Термін дії коду минув' });
        }
        await db.query('UPDATE users SET is_verified = 1, otp_code = NULL, otp_expires = NULL, otp_purpose = NULL WHERE id = ?', [user.id]);
        res.json({ message: 'Email успішно підтверджено! Тепер ви можете увійти.' });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { loginInput, password } = req.body;
        const user = await User.findByLoginInput(loginInput);
        if (!user) return res.status(401).json({ message: 'Невірний логін або пароль.' });
        const settings = await getGlobalSettings();
        if (!settings.auth_enabled && !['admin', 'moderator'].includes(user.role)) {
            return res.status(403).json({ message: 'Авторизація тимчасово призупинена. Ведуться технічні роботи.' });
        }
        if (user.status === 'suspended') return res.status(403).json({ message: 'Ваш акаунт заблоковано назавжди за порушення правил платформи.' });
        if (['admin', 'moderator'].includes(user.role)) {
            return res.status(401).json({ message: 'Невірний логін або пароль.' });
        }
        if (user.status === 'deleted') {
            const deletedAt = new Date(user.deleted_at).getTime();
            const diffDays = (Date.now() - deletedAt) / (1000 * 3600 * 24);
            if (diffDays > 14) {
                if (user.avatar_url && user.avatar_url.includes('/avatars/custom/')) await deleteFile(user.avatar_url).catch(() => {});
                await User.deleteById(user.id);
                return res.status(403).json({ message: 'Акаунт видалено безповоротно.' });
            } else {
                const isMatch = await bcrypt.compare(password, user.password_hash);
                if (!isMatch) return res.status(401).json({ message: 'Невірний логін або пароль.' });
                
                const token = signAccessToken(user, { role: 'RESTORE_ONLY', expiresIn: '1h' });
                return res.json({ 
                    require_restore: true, 
                    message: 'Акаунт в процесі видалення. Відновити?', 
                    token, 
                    user: { id: user.id, username: user.username, email: user.email, status: user.status } 
                });
            }
        }
        if (user.is_verified === 0) {
            return res.status(403).json({ message: 'Ваша пошта не підтверджена.', isNotVerified: true, email: user.email });
        }
        if (!user.password_hash) {
             return res.status(400).json({ message: 'Пароль не встановлено. Увійдіть через Google або відновіть пароль.' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Невірний логін або пароль.' });
        await User.updateLastLogin(user.id);
        const token = signAccessToken(user);
        const hasPassword = !!user.password_hash;
        res.json({
            token,
            user: { 
                id: user.id, username: user.username, slug: user.slug, email: user.email, avatar_url: user.avatar_url,
                role: user.role, plan: user.plan || 'FREE', platform_theme_mode: user.platform_theme_mode,
                platform_theme_accent: user.platform_theme_accent, created_at: user.created_at, has_password: hasPassword,
                status: user.status
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });
        if (user.status === 'suspended') return res.status(403).json({ message: 'Ваш акаунт заблоковано.' });
        if (user.status === 'deleted') {
            const diffDays = (Date.now() - new Date(user.deleted_at).getTime()) / (1000 * 3600 * 24);
            if (diffDays > 14) {
                if (user.avatar_url && user.avatar_url.includes('/avatars/custom/')) await deleteFile(user.avatar_url).catch(() => {});
                await User.deleteById(user.id);
                return res.status(403).json({ message: 'Акаунт видалено безповоротно.' });
            }
            return res.json({ 
                id: user.id, 
                username: user.username, 
                email: user.email,
                status: user.status, 
                require_restore: true, 
                message: 'Акаунт в процесі видалення. Бажаєте відновити?' 
            });
        }
        const hasPassword = await User.hasPassword(req.user.id);
        res.json({
            id: user.id, username: user.username, slug: user.slug, email: user.email, avatar_url: user.avatar_url, role: user.role,
            plan: user.plan || 'FREE', platform_theme_mode: user.platform_theme_mode, platform_theme_accent: user.platform_theme_accent,
            bio: user.bio, social_telegram: user.social_telegram, social_instagram: user.social_instagram, social_website: user.social_website,
            is_profile_public: user.is_profile_public, phone_number: user.phone_number, created_at: user.created_at, 
            last_login_at: user.last_login_at, has_password: hasPassword,
            status: user.status
        });
    } catch (error) {
        next(error);
    }
};

exports.adminLogin = async (req, res, next) => {
    try {
        const { loginInput, password } = req.body;
        const user = await User.findByLoginInput(loginInput);
        if (!user) return res.status(401).json({ message: 'Невірні облікові дані.' });
        if (!['admin', 'moderator'].includes(user.role)) {
            return res.status(403).json({ message: 'Відмовлено у доступі. Зона лише для персоналу.' });
        }
        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Акаунт співробітника неактивний.' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Невірні облікові дані.' });
        const otpCode = generateOTP();
        const expires = new Date(Date.now() + 5 * 60 * 1000); 
        await db.query('UPDATE users SET otp_code = ?, otp_expires = ?, otp_purpose = ? WHERE id = ?', [otpCode, expires, '2FA', user.id]);
        await sendOtpEmail(user.email, otpCode, '2FA');
        return res.json({ success: true, require2FA: true, email: user.email });
    } catch (error) {
        next(error);
    }
};

exports.verify2FA = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ message: 'Email та код обов\'язкові.' });
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        if (!user || user.otp_code !== code || user.otp_purpose !== '2FA' || !AuthPolicy.canCompleteStaffLogin(user)) {
            return res.status(401).json({ message: 'Невірний код підтвердження.' });
        }
        if (new Date() > new Date(user.otp_expires)) {
            await db.query('UPDATE users SET otp_code = NULL, otp_expires = NULL, otp_purpose = NULL WHERE id = ?', [user.id]);
            return res.status(401).json({ message: 'Термін дії коду минув. Увійдіть заново.' });
        }
        await db.query('UPDATE users SET otp_code = NULL, otp_expires = NULL, otp_purpose = NULL WHERE id = ?', [user.id]);
        await User.updateLastLogin(user.id);
        const token = signAccessToken(user);
        const hasPassword = !!user.password_hash;
        res.json({
            message: 'Вхід в панель успішний',
            token, 
            require_restore: user.status === 'deleted',
            user: { 
                id: user.id, username: user.username, slug: user.slug, email: user.email, avatar_url: user.avatar_url,
                role: user.role, plan: user.plan || 'FREE', platform_theme_mode: user.platform_theme_mode,
                platform_theme_accent: user.platform_theme_accent, created_at: user.created_at, has_password: hasPassword,
                status: user.status
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.resendOtp = async (req, res, next) => {
    try {
        const { email, purpose } = req.body;
        if (!AuthPolicy.isResendPurpose(purpose)) {
            return res.status(400).json({ message: 'Невірне призначення коду.' });
        }
        const user = typeof email === 'string' ? await User.findByEmail(email) : null;
        if (AuthPolicy.canReceiveOtp(user, purpose)) {
            const otpCode = generateOTP();
            const expires = new Date(Date.now() + 15 * 60 * 1000);
            await db.query('UPDATE users SET otp_code = ?, otp_expires = ?, otp_purpose = ? WHERE id = ?', [otpCode, expires, purpose, user.id]);
            await sendOtpEmail(email, otpCode, purpose);
        }
        res.json({ message: 'Код успішно відправлено повторно!' });
    } catch (error) {
        next(error);
    }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findByEmail(email);
        const genericMessage = 'Якщо цей email зареєстровано в системі, ми відправили на нього інструкції.';
        if (!AuthPolicy.canReceiveOtp(user, 'RESET_PASSWORD')) {
             return res.json({ message: genericMessage }); 
        }
        const otpCode = generateOTP();
        const expires = new Date(Date.now() + 15 * 60 * 1000);
        await db.query(
            'UPDATE users SET otp_code = ?, otp_expires = ?, otp_purpose = ? WHERE id = ?',
            [otpCode, expires, 'RESET_PASSWORD', user.id]
        );
        await sendOtpEmail(email, otpCode, 'RESET_PASSWORD');
        res.json({ message: genericMessage });
    } catch (error) {
        next(error);
    }
};

exports.verifyResetCode = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        if (!user || user.otp_code !== code || user.otp_purpose !== 'RESET_PASSWORD') {
            return res.status(400).json({ message: 'Недійсний код підтвердження.' });
        }
        if (new Date() > new Date(user.otp_expires)) {
            return res.status(400).json({ message: 'Термін дії коду минув.' });
        }
        res.json({ message: 'Код вірний. Введіть новий пароль.' });
    } catch (error) {
        next(error);
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { email, code, newPassword } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        if (!user || user.otp_code !== code || user.otp_purpose !== 'RESET_PASSWORD') {
            return res.status(400).json({ message: 'Недійсний код підтвердження.' });
        }
        if (new Date() > new Date(user.otp_expires)) {
            return res.status(400).json({ message: 'Термін дії коду минув.' });
        }
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ message: 'Пароль занадто слабкий (мін. 8 символів, цифра, велика літера).' });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        await db.query(
            'UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires = NULL, otp_purpose = NULL, token_version = token_version + 1 WHERE id = ?',
            [passwordHash, user.id]
        );
        res.json({ message: 'Пароль успішно змінено! Тепер ви можете увійти.' });
    } catch (error) {
        next(error);
    }
};

exports.googleCallback = async (req, res) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    if (!req.user) {
        return res.redirect(`${clientUrl}/login?error=auth_failed`);
    }
    const settings = await getGlobalSettings();
    if (!settings.auth_enabled && !['admin', 'moderator'].includes(req.user.role)) {
        return res.redirect(`${clientUrl}/login?error=auth_disabled`);
    }
    if (['admin', 'moderator'].includes(req.user.role)) {
        return res.redirect(`${clientUrl}/login?error=auth_failed`);
    }
    if (req.user.status === 'suspended') {
        return res.redirect(`${clientUrl}/login?error=auth_failed`);
    }
    if (req.user.status === 'deleted') {
        const deletedAt = req.user.deleted_at ? new Date(req.user.deleted_at).getTime() : 0;
        const diffDays = (Date.now() - deletedAt) / (1000 * 3600 * 24);
        if (diffDays > 14) {
            if (req.user.avatar_url && req.user.avatar_url.includes('/avatars/custom/')) {
                await deleteFile(req.user.avatar_url).catch(() => {});
            }
            await User.deleteById(req.user.id);
            return res.redirect(`${clientUrl}/login?error=auth_failed`); 
        } else {
            const token = signAccessToken(req.user, { role: 'RESTORE_ONLY', expiresIn: '1h' });
            return res.redirect(`${clientUrl}/auth/success?token=${token}`);
        }
    }
    await User.updateLastLogin(req.user.id);
    const token = signAccessToken(req.user);
    res.redirect(`${clientUrl}/auth/success?token=${token}`);
};

exports.refreshToken = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });
        if (user.status === 'suspended' || user.status === 'deleted') {
            return res.status(403).json({ message: 'Ваш акаунт заблоковано або видалено.' });
        }
        const token = signAccessToken(user);
        const hasPassword = await User.hasPassword(user.id);
        res.json({
            token,
            user: { 
                id: user.id, username: user.username, slug: user.slug, email: user.email, avatar_url: user.avatar_url,
                role: user.role, plan: user.plan || 'FREE', platform_theme_mode: user.platform_theme_mode,
                platform_theme_accent: user.platform_theme_accent, created_at: user.created_at, has_password: hasPassword,
                status: user.status
            }
        });
    } catch (error) {
        next(error);
    }
};
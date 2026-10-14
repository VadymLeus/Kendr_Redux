// backend/controllers/teamController.js
const db = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { requireSiteAccess, read, write } = require('../services/siteAccess');
const sendServiceError = require('../utils/sendServiceError');
const { ServiceError } = require('../services/ServiceError');

const isPlatformStaff = (user) => user.role === 'admin' || user.role === 'moderator';

exports.heartbeat = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        const userId = req.user.id;
        const [sites] = await db.query('SELECT locked_by_user_id, locked_until FROM sites WHERE id = ?', [siteId]);
        if (!sites.length) return res.status(404).json({ message: 'Сайт не знайдено' });
        await requireSiteAccess(siteId, userId, write(), 'У вас немає прав редагувати цей сайт.');
        const site = sites[0];
        const now = new Date();
        if (site.locked_by_user_id && site.locked_by_user_id !== userId && new Date(site.locked_until) > now) {
            const [locker] = await db.query('SELECT username FROM users WHERE id = ?', [site.locked_by_user_id]);
            return res.status(423).json({ 
                locked: true, 
                lockedBy: locker[0]?.username || 'Інший користувач' 
            });
        }
        await db.query(
            'UPDATE sites SET locked_by_user_id = ?, locked_until = DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE id = ?',
            [userId, siteId]
        );
        res.json({ locked: false });
    } catch (error) {
        if (!(error instanceof ServiceError)) console.error('Помилка heartbeat:', error);
        sendServiceError(error, res, next);
    }
};

exports.releaseLock = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        const userId = req.user.id;
        await db.query(
            'UPDATE sites SET locked_by_user_id = NULL, locked_until = NULL WHERE id = ? AND locked_by_user_id = ?',
            [siteId, userId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Помилка release lock:', error);
        next(error);
    }
};

exports.generateInvite = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        const userId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== userId) {
            return res.status(403).json({ message: 'Тільки власник може запрошувати користувачів.' });
        }
        await db.query('DELETE FROM site_invites WHERE site_id = ?', [siteId]);
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await db.query(
            'INSERT INTO site_invites (token, site_id, created_by, expires_at) VALUES (?, ?, ?, ?)',
            [token, siteId, userId, expiresAt]
        );
        const inviteLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/invite/${token}`;
        res.json({ inviteLink });
    } catch (error) {
        console.error('Помилка генерації інвайту:', error);
        next(error);
    }
};

exports.getActiveInvite = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        const userId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== userId) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }
        const [invites] = await db.query(
            'SELECT token FROM site_invites WHERE site_id = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', 
            [siteId]
        );
        if (invites.length > 0) {
            const inviteLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/invite/${invites[0].token}`;
            return res.json({ inviteLink });
        }
        res.json({ inviteLink: null });
    } catch (error) {
        next(error);
    }
};

exports.deleteInvite = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        const userId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== userId) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }
        await db.query('DELETE FROM site_invites WHERE site_id = ?', [siteId]);
        res.json({ message: 'Запрошення успішно видалено.' });
    } catch (error) {
        next(error);
    }
};

exports.acceptInvite = async (req, res, next) => {
    try {
        const { token } = req.body;
        const userId = req.user.id;
        const [invites] = await db.query('SELECT * FROM site_invites WHERE token = ? AND expires_at > NOW()', [token]);
        if (!invites.length) {
            return res.status(400).json({ message: 'Посилання недійсне або прострочене.' });
        }
        const invite = invites[0];
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [invite.site_id]);
        if (sites[0].user_id === userId) {
            return res.status(400).json({ message: 'Ви вже є власником цього сайту.' });
        }
        const defaultPermissions = JSON.stringify(['editor', 'theme', 'commerce', 'overview']);
        await db.query(
            'INSERT IGNORE INTO site_collaborators (site_id, user_id, role, permissions) VALUES (?, ?, ?, ?)',
            [invite.site_id, userId, invite.role || 'editor', defaultPermissions]
        );
        await db.query('DELETE FROM site_invites WHERE token = ?', [token]);
        res.json({ message: 'Ви успішно приєдналися до проєкту!', siteId: invite.site_id });
    } catch (error) {
        console.error('Помилка прийняття інвайту:', error);
        next(error);
    }
};

exports.getCollaborators = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        if (!isPlatformStaff(req.user)) {
            await requireSiteAccess(siteId, req.user.id, read('settings'), 'Доступ заборонено.');
        }
        const [collabs] = await db.query(`
            SELECT u.id, u.username, u.email, u.avatar_url, sc.role, sc.permissions, sc.created_at
            FROM site_collaborators sc
            JOIN users u ON sc.user_id = u.id
            WHERE sc.site_id = ?
        `, [siteId]);
        const formattedCollabs = collabs.map(c => ({
            ...c,
            permissions: typeof c.permissions === 'string' ? JSON.parse(c.permissions) : (c.permissions || [])
        }));
        
        res.json(formattedCollabs);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.removeCollaborator = async (req, res, next) => {
    try {
        const { id: siteId, userId: targetUserId } = req.params;
        const currentUserId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== currentUserId) {
            if (currentUserId !== parseInt(targetUserId)) {
                return res.status(403).json({ message: 'Недостатньо прав.' });
            }
        }
        await db.query('DELETE FROM site_collaborators WHERE site_id = ? AND user_id = ?', [siteId, targetUserId]);
        res.json({ message: 'Користувача видалено з команди.' });
    } catch (error) {
        next(error);
    }
};

exports.updatePermissions = async (req, res, next) => {
    try {
        const { id: siteId, userId: targetUserId } = req.params;
        const { permissions } = req.body;
        const currentUserId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== currentUserId) {
            return res.status(403).json({ message: 'Тільки власник може змінювати права.' });
        }
        
        await db.query(
            'UPDATE site_collaborators SET permissions = ? WHERE site_id = ? AND user_id = ?', 
            [JSON.stringify(permissions || []), siteId, targetUserId]
        );
        res.json({ message: 'Права доступу успішно оновлено.' });
    } catch (error) {
        next(error);
    }
};

exports.verifyTransfer = async (req, res, next) => {
    try {
        const { id: siteId } = req.params;
        const { newOwnerEmail, password } = req.body;
        const currentOwnerId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== currentOwnerId) {
            return res.status(403).json({ message: 'Тільки поточний власник може передати сайт.' });
        }
        const [newOwners] = await db.query('SELECT id FROM users WHERE email = ?', [newOwnerEmail]);
        if (!newOwners.length) {
            return res.status(404).json({ message: 'Користувача з таким email не знайдено.' });
        }
        if (newOwners[0].id === currentOwnerId) {
            return res.status(400).json({ message: 'Ви не можете передати сайт самому собі.' });
        }
        const [users] = await db.query('SELECT password_hash FROM users WHERE id = ?', [currentOwnerId]);
        const userHash = users[0]?.password_hash;
        if (!userHash) {
            return res.status(400).json({ 
                message: 'Ваш акаунт створено через Google. Для передачі сайту спочатку встановіть пароль у налаштуваннях профілю.' 
            });
        }
        const isValid = await bcrypt.compare(password, userHash);
        if (!isValid) {
            return res.status(403).json({ message: 'Невірний пароль.' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Помилка перевірки перед передачею:', error);
        next(error);
    }
};

exports.transferSite = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        const { id: siteId } = req.params;
        const { newOwnerEmail, password } = req.body;
        const currentOwnerId = req.user.id;
        const [sites] = await db.query('SELECT user_id FROM sites WHERE id = ?', [siteId]);
        if (!sites.length || sites[0].user_id !== currentOwnerId) {
            return res.status(403).json({ message: 'Тільки поточний власник може передати сайт.' });
        }
        const [newOwners] = await db.query('SELECT id FROM users WHERE email = ?', [newOwnerEmail]);
        if (!newOwners.length) return res.status(404).json({ message: 'Користувача з таким email не знайдено.' });
        const newOwnerId = newOwners[0].id;
        if (newOwnerId === currentOwnerId) return res.status(400).json({ message: 'Ви не можете передати сайт самому собі.' });
        const [users] = await db.query('SELECT password_hash FROM users WHERE id = ?', [currentOwnerId]);
        const userHash = users[0]?.password_hash;
        if (!userHash) return res.status(400).json({ message: 'Встановіть пароль у профілі.' });
        const isValid = await bcrypt.compare(password, userHash);
        if (!isValid) return res.status(403).json({ message: 'Невірний пароль.' });
        await connection.beginTransaction();
        await connection.query('UPDATE sites SET user_id = ? WHERE id = ?', [newOwnerId, siteId]);
        await connection.query('DELETE FROM site_collaborators WHERE site_id = ? AND user_id = ?', [siteId, newOwnerId]);
        await connection.query('DELETE FROM site_collaborators WHERE site_id = ? AND user_id = ?', [siteId, currentOwnerId]);
        await connection.query('UPDATE sites SET locked_by_user_id = NULL, locked_until = NULL WHERE id = ?', [siteId]);
        await connection.commit();
        res.json({ message: 'Сайт успішно передано новому власнику!' });
    } catch (error) {
        await connection.rollback();
        console.error('Помилка передачі сайту:', error);
        next(error);
    } finally {
        connection.release();
    }
};
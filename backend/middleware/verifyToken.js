// backend/middleware/verifyToken.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const RESTORE_FLOW = [
    { method: 'GET', path: '/api/auth/me' },
    { method: 'POST', path: '/api/users/me/restore' }
];
const isRestoreFlow = (req) => {
    const pathname = req.originalUrl.split('?')[0];
    return RESTORE_FLOW.some(route => route.method === req.method && route.path === pathname);
};
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Відмовлено у доступі. Токен не надано.' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        const [users] = await db.query('SELECT token_version, status FROM users WHERE id = ?', [decoded.id]);
        const user = users[0];
        if (!user) {
            return res.status(401).json({ message: 'Користувача не знайдено.' });
        }
        if (user.status === 'suspended') {
             return res.status(403).json({ message: 'Доступ заблоковано. Ваш акаунт деактивовано.', code: 'ACCOUNT_SUSPENDED' });
        }
        if (user.status === 'deleted') {
            if (!isRestoreFlow(req)) {
                return res.status(403).json({ 
                    message: 'Акаунт видалено. Необхідно відновити.', 
                    code: 'ACCOUNT_DELETED' 
                });
            }
        }
        if (decoded.token_version === undefined || user.token_version !== decoded.token_version) {
            return res.status(401).json({ message: 'Сесія застаріла через зміну пароля або налаштувань безпеки. Будь ласка, увійдіть знову.' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Час дії сесії минув. Будь ласка, увійдіть знову.' });
        }
        return res.status(401).json({ message: 'Недійсний токен авторизації.' });
    }
};

module.exports = verifyToken;
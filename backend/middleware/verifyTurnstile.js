// backend/middleware/verifyTurnstile.js
const isDisabled = () => process.env.TURNSTILE_DISABLED === 'true' && process.env.NODE_ENV !== 'production';
const verifyTurnstile = async (req, res, next) => {
    if (isDisabled()) {
        return next();
    }
    const token = req.body.turnstileToken;
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!token) {
        return res.status(400).json({ message: 'Перевірка безпеки (Turnstile) обов\'язкова.' });
    }
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(req.ip)}`,
        });
        const data = await response.json();
        if (data.success) {
            next();
        } else {
            console.error('Turnstile verification failed:', data['error-codes']);
            return res.status(403).json({ message: 'Перевірка на робота не пройдена. Спробуйте ще раз.' });
        }
    } catch (error) {
        console.error('Turnstile Error:', error);
        return res.status(500).json({ message: 'Помилка сервера при перевірці безпеки.' });
    }
};

module.exports = verifyTurnstile;
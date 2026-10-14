// backend/server.js
// Точка входу: запускає HTTP-сервер. Сам застосунок створюється в app.js (ADR-005).
require('dotenv').config();
const { getJwtSecret } = require('./config/jwtSecret');

// Без секрету підпису токенів сервер не запускається (D-SEC-09), так само як без ENCRYPTION_KEY.
try {
    getJwtSecret();
} catch (error) {
    console.error(`КРИТИЧНА ПОМИЛКА: ${error.message}`);
    process.exit(1);
}

const app = require('./app');
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
});

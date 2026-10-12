// backend/server.js
// Точка входу: запускає HTTP-сервер. Сам застосунок створюється в app.js (ADR-005).
require('dotenv').config();
const app = require('./app');
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
});

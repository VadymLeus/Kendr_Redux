// backend/app.js
// Створення Express-застосунку без запуску сервера: app.listen винесено в server.js,
// щоб тести (supertest) могли імпортувати застосунок. Поведінка не змінюється (ADR-005).
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const siteRoutes = require('./routes/siteRoutes');
const pageRoutes = require('./routes/pageRoutes');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const tagRoutes = require('./routes/tagRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const supportRoutes = require('./routes/supportRoutes');
const orderRoutes = require('./routes/orderRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const formRoutes = require('./routes/formRoutes');
const publicFormRoutes = require('./routes/publicFormRoutes');
const savedBlockRoutes = require('./routes/savedBlockRoutes');
const userTemplateRoutes = require('./routes/userTemplateRoutes');
const reportRoutes = require('./routes/reportRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const teamRoutes = require('./routes/teamRoutes');
const errorHandler = require('./middleware/errorHandler');
const verifyToken = require('./middleware/verifyToken');
const passport = require('./config/passport');
const { checkMaintenance } = require('./middleware/platformGuards');
const verifyTokenOptional = require('./middleware/verifyTokenOptional');
const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const allowedOrigins = [
    'http://localhost:5173',
    'https://kendr.vercel.app',
    'https://kendr-backend.onrender.com',
    process.env.CLIENT_URL
].filter(Boolean);
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(passport.initialize());
app.use(verifyTokenOptional);
app.use(checkMaintenance);
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/form', verifyToken, formRoutes);
app.use('/api/public/form', publicFormRoutes);
app.use('/api/saved-blocks', savedBlockRoutes);
app.use('/api/user-templates', userTemplateRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/team', verifyToken, teamRoutes);
app.get('/', (req, res) => {
    res.send('Welcome to Kendr API');
});
app.use(errorHandler);

module.exports = app;

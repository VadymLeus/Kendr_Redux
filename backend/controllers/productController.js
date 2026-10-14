// backend/controllers/productController.js
const ProductService = require('../services/ProductService');
const { deleteFile } = require('../utils/fileUtils');
const sendServiceError = require('../utils/sendServiceError');

exports.getProductById = async (req, res, next) => {
    try {
        const product = await ProductService.getPublic(req.params.productId, req.user);
        res.json(product);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getProductsForSite = async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const products = await ProductService.getBySite(siteId, req.user);
        res.json(products);
    } catch (error) {
        next(error);
    }
};

exports.getProducts = async (req, res, next) => {
    try {
        const { ids, category, limit, siteId } = req.query;
        let idList = null;
        if (ids) {
            idList = ids.split(',').filter(id => id.trim() !== '');
        }
        const products = await ProductService.list({
            ids: idList,
            categoryId: category,
            limit: limit,
            siteId: siteId
        }, req.user);
        res.json(products);
    } catch (error) {
        next(error);
    }
};

exports.addProduct = async (req, res, next) => {
    const userId = req.user.id;
    try {
        const newProduct = await ProductService.create(userId, req.body);
        res.status(201).json(newProduct);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.updateProduct = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.user.id;
    try {
        await ProductService.update(productId, userId, req.body);
        res.json({ message: 'Товар успішно оновлено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.deleteProduct = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.user.id;
    try {
        await ProductService.remove(productId, userId);
        res.json({ message: 'Товар успішно видалено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.addToGallery = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const newImagePath = req.file ? req.file.path : null;
    try {
        if (!newImagePath) return res.status(400).json({ message: 'Файл не завантажено.' });
        const updatedGallery = await ProductService.addToGallery(productId, userId, newImagePath);
        res.json({
            message: 'Зображення додано до галереї.',
            image_gallery: updatedGallery
        });
    } catch (error) {
        if (newImagePath) await deleteFile(newImagePath);
        sendServiceError(error, res, next);
    }
};

exports.removeFromGallery = async (req, res, next) => {
    const { productId } = req.params;
    const { imagePath } = req.body;
    const userId = req.user.id;
    try {
        const updatedGallery = await ProductService.removeFromGallery(productId, userId, imagePath);
        res.json({
            message: 'Зображення видалено з галереї.',
            image_gallery: updatedGallery
        });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.getProductReviews = async (req, res, next) => {
    try {
        const reviews = await ProductService.getReviews(req.params.productId);
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

exports.addProductReview = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.user.id;
    try {
        await ProductService.addReview(productId, userId, req.body);
        res.status(201).json({ message: 'Відгук успішно додано.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.replyToReview = async (req, res, next) => {
    const { productId, reviewId } = req.params;
    const { owner_reply } = req.body;
    const userId = req.user.id;
    try {
        await ProductService.replyToReview(productId, reviewId, userId, owner_reply);
        res.json({ message: 'Відповідь збережено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.deleteReview = async (req, res, next) => {
    const { productId, reviewId } = req.params;
    try {
        await ProductService.deleteReview(productId, reviewId, req.user);
        res.json({ message: 'Відгук видалено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.checkPurchaseStatus = async (req, res, next) => {
    const { productId } = req.params;
    const userId = req.user.id;
    try {
        const status = await ProductService.getPurchaseStatus(productId, userId);
        res.json(status);
    } catch (error) {
        next(error);
    }
};

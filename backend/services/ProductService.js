// backend/services/ProductService.js
const ProductRepository = require('../repositories/ProductRepository');
const OrderRepository = require('../repositories/OrderRepository');
const UserRepository = require('../repositories/UserRepository');
const { requireSiteAccess, hasSiteAccess, write } = require('./siteAccess');
const { ServiceError } = require('./ServiceError');
const PlanPolicy = require('./PlanPolicy');
const { readPrice, readSalePercentage, readStock, readType } = require('./productValidation');

class ProductService {
    static async getById(productId) {
        const product = await ProductRepository.findById(productId);
        if (!product) {
            throw new ServiceError(404, 'Товар не знайдено.');
        }
        return product;
    }

    static getBySite(siteId) {
        return ProductRepository.findBySiteId(siteId);
    }

    static list(filters) {
        return ProductRepository.findWithFilters(filters);
    }

    static async getAccessible(productId, userId, forbiddenMessage) {
        const product = await ProductService.getById(productId);
        await requireSiteAccess(product.site_id, userId, write('commerce'), forbiddenMessage);
        return product;
    }

    static async create(userId, body) {
        const { site_id, name, description, price, category_ids, stock_quantity, image_gallery, variants, sale_percentage, type, digital_file_url } = body;
        const site = await requireSiteAccess(site_id, userId, write('commerce'), 'У вас немає прав для додавання товарів на цей сайт.');
        const cleanPrice = readPrice(price);
        const cleanSale = readSalePercentage(sale_percentage);
        const cleanStock = readStock(stock_quantity);
        const cleanType = readType(type);
        PlanPolicy.assertWithinLimit(
            await UserRepository.findPlan(site.user_id),
            'products',
            await ProductRepository.countBySite(site_id)
        );
        let galleryData = [];
        if (Array.isArray(image_gallery)) {
            galleryData = image_gallery;
        } else if (typeof image_gallery === 'string') {
            galleryData = [image_gallery];
        }
        let catIds = [];
        if (category_ids) {
            catIds = Array.isArray(category_ids) ? category_ids : [category_ids];
        }
        return ProductRepository.create({
            site_id,
            name,
            description,
            price: cleanPrice,
            image_path: galleryData.length > 0 ? galleryData[0] : null,
            category_ids: catIds,
            stock_quantity: cleanStock,
            variants,
            sale_percentage: cleanSale,
            image_gallery: galleryData,
            type: cleanType,
            digital_file_url
        });
    }

    static async update(productId, userId, body) {
        const { name, description, price, category_ids, stock_quantity, image_gallery, variants, sale_percentage, type, digital_file_url } = body;
        await ProductService.getAccessible(productId, userId, 'У вас немає прав для зміни цього товару.');
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (price !== undefined) updateData.price = readPrice(price);
        if (sale_percentage !== undefined) updateData.sale_percentage = readSalePercentage(sale_percentage);
        if (stock_quantity !== undefined) updateData.stock_quantity = readStock(stock_quantity);
        const cleanType = readType(type);
        if (cleanType !== undefined) updateData.type = cleanType;
        if (digital_file_url !== undefined) updateData.digital_file_url = digital_file_url || null;
        if (variants !== undefined) updateData.variants = variants;
        if (category_ids !== undefined) {
            updateData.category_ids = Array.isArray(category_ids) ? category_ids : [category_ids];
        }
        if (image_gallery !== undefined) {
            updateData.image_gallery = Array.isArray(image_gallery) ? image_gallery : [image_gallery];
        }
        await ProductRepository.update(productId, updateData);
    }

    static async remove(productId, userId) {
        await ProductService.getAccessible(productId, userId, 'У вас немає прав для видалення товарів на цьому сайті.');
        await ProductRepository.delete(productId);
    }

    static async addToGallery(productId, userId, newImagePath) {
        const product = await ProductService.getAccessible(productId, userId, 'У вас немає прав для зміни цього товару.');
        const currentGallery = product.image_gallery || [];
        const updatedGallery = [...currentGallery, newImagePath];
        await ProductRepository.update(productId, {
            image_gallery: updatedGallery
        });
        return updatedGallery;
    }

    static async removeFromGallery(productId, userId, imagePath) {
        if (!imagePath) {
            throw new ServiceError(400, 'Шлях до зображення не вказано.');
        }
        const product = await ProductService.getAccessible(productId, userId, 'У вас немає прав для зміни цього товару.');
        const currentGallery = product.image_gallery || [];
        const updatedGallery = currentGallery.filter(img => img !== imagePath);
        await ProductRepository.update(productId, {
            image_gallery: updatedGallery
        });
        return updatedGallery;
    }

    static getReviews(productId) {
        return ProductRepository.getReviews(productId);
    }

    static async addReview(productId, userId, { rating, comment }) {
        if (!rating || rating < 1 || rating > 5) {
            throw new ServiceError(400, 'Рейтинг має бути від 1 до 5.');
        }
        if (!comment || comment.trim() === '') {
            throw new ServiceError(400, 'Коментар не може бути порожнім.');
        }
        await ProductService.getById(productId);
        const hasPurchased = await OrderRepository.hasPurchased(userId, productId);
        if (!hasPurchased) {
            throw new ServiceError(403, 'Ви можете залишити відгук лише на товар, який ви придбали.');
        }
        await ProductRepository.addReview(productId, userId, rating, comment);
    }

    static async findReviewOfProduct(productId, reviewId) {
        const review = await ProductRepository.findReviewById(reviewId);
        if (!review || String(review.product_id) !== String(productId)) {
            throw new ServiceError(404, 'Відгук не знайдено.');
        }
        return review;
    }

    static async replyToReview(productId, reviewId, userId, ownerReply) {
        await ProductService.getAccessible(productId, userId, 'У вас немає прав відповідати на відгуки цього магазину.');
        await ProductService.findReviewOfProduct(productId, reviewId);
        await ProductRepository.updateReviewReply(reviewId, ownerReply || null);
    }

    static async deleteReview(productId, reviewId, user) {
        const review = await ProductService.findReviewOfProduct(productId, reviewId);
        const isAuthor = review.user_id === user.id;
        const isPlatformStaff = user.role === 'admin' || user.role === 'moderator';
        let isSiteStaff = false;
        if (!isAuthor && !isPlatformStaff) {
            const product = await ProductRepository.findById(productId);
            if (product) {
                isSiteStaff = await hasSiteAccess(product.site_id, user.id, write('commerce'));
            }
        }
        if (!isAuthor && !isSiteStaff && !isPlatformStaff) {
            throw new ServiceError(403, 'У вас немає прав для видалення цього відгуку.');
        }
        await ProductRepository.deleteReview(reviewId);
    }

    static async getPurchaseStatus(productId, userId) {
        const existingReview = await ProductRepository.getReviewByUser(productId, userId);
        const hasPurchased = await OrderRepository.hasPurchased(userId, productId);
        return {
            hasPurchased,
            hasReviewed: !!existingReview,
            existingReview: existingReview || null
        };
    }
}

module.exports = ProductService;

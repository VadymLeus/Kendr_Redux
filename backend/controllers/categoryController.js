// backend/controllers/categoryController.js
const Category = require('../models/Category');
const UserRepository = require('../repositories/UserRepository');
const { requireSiteAccess, write } = require('../services/siteAccess');
const PlanPolicy = require('../services/PlanPolicy');
const { readDiscount } = require('../services/productValidation');
const sendServiceError = require('../utils/sendServiceError');

exports.getCategoriesForSite = async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const categories = await Category.findBySiteId(siteId);
        res.json(categories);
    } catch (error) {
        next(error);
    }
};

exports.createCategory = async (req, res, next) => {
    try {
        const { siteId, name, discount_percentage, icon } = req.body;
        const userId = req.user.id;

        const site = await requireSiteAccess(siteId, userId, write('commerce'), 'У вас немає прав для додавання категорій на цей сайт.');

        const discount = readDiscount(discount_percentage);
        PlanPolicy.assertWithinLimit(
            await UserRepository.findPlan(site.user_id),
            'categories',
            await Category.countBySiteId(siteId)
        );

        const newCategory = await Category.create(siteId, name, discount, icon);
        res.status(201).json(newCategory);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.updateCategory = async (req, res, next) => {
    try {
        const { categoryId } = req.params;
        const { name, discount_percentage, icon } = req.body;
        const userId = req.user.id;

        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Назва категорії не може бути порожньою.' });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ message: 'Категорію не знайдено.' });
        }

        await requireSiteAccess(category.site_id, userId, write('commerce'), 'У вас немає прав на редагування цієї категорії.');

        await Category.update(categoryId, name.trim(), readDiscount(discount_percentage), icon);
        res.json({ message: 'Категорію оновлено.' });

    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.deleteCategory = async (req, res, next) => {
    try {
        const { categoryId } = req.params;
        const userId = req.user.id;
        
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ message: 'Категорію не знайдено.' });
        }
        await requireSiteAccess(category.site_id, userId, write('commerce'), 'У вас немає прав на видалення цієї категорії.');

        await Category.delete(categoryId);
        res.json({ message: 'Категорію успішно видалено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};
// backend/models/Category.js
const db = require('../config/db');

class Category {
    static async findBySiteId(siteId) {
        try {
            const [rows] = await db.query(
                'SELECT * FROM categories WHERE site_id = ? ORDER BY name ASC',
                [siteId]
            );
            return rows;
        } catch (error) {
            throw new Error(`Помилка під час отримання категорій для сайту ${siteId}: ${error.message}`);
        }
    }

    static async countBySiteId(siteId) {
        const [rows] = await db.query('SELECT COUNT(*) AS count FROM categories WHERE site_id = ?', [siteId]);
        return rows[0].count;
    }

    static async findById(categoryId) {
        try {
            const [rows] = await db.query(
                `SELECT c.*, s.user_id 
                 FROM categories c
                 JOIN sites s ON c.site_id = s.id
                 WHERE c.id = ?`,
                [categoryId]
            );
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Помилка під час пошуку категорії ${categoryId}: ${error.message}`);
        }
    }

    static async create(siteId, name, discount_percentage = 0, icon = 'folder') {
        try {
            if (!name || name.trim().length === 0) {
                throw new Error('Назва категорії не може бути порожньою.');
            }

            const [result] = await db.query(
                'INSERT INTO categories (site_id, name, discount_percentage, icon) VALUES (?, ?, ?, ?)',
                [siteId, name.trim(), discount_percentage, icon]
            );
            return { id: result.insertId, site_id: siteId, name: name.trim(), discount_percentage, icon };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Категорія з такою назвою вже існує для цього сайту.');
            }
            throw new Error(`Помилка під час створення категорії: ${error.message}`);
        }
    }

    static async update(categoryId, name, discount_percentage = 0, icon = 'folder') {
        try {
            if (!name || name.trim().length === 0) {
                throw new Error('Назва категорії не може бути порожньою.');
            }

            const [result] = await db.query(
                'UPDATE categories SET name = ?, discount_percentage = ?, icon = ? WHERE id = ?',
                [name.trim(), discount_percentage, icon, categoryId]
            );
            
            if (result.affectedRows === 0) {
                throw new Error('Категорію не знайдено.');
            }
            
            return result;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Категорія з такою назвою вже існує для цього сайту.');
            }
            throw new Error(`Помилка під час оновлення категорії: ${error.message}`);
        }
    }

    static async delete(categoryId) {
        try {
            const [result] = await db.query(
                'DELETE FROM categories WHERE id = ?',
                [categoryId]
            );
            
            if (result.affectedRows === 0) {
                throw new Error('Категорію не знайдено.');
            }
            
            return result;
        } catch (error) {
            throw new Error(`Помилка під час видалення категорії: ${error.message}`);
        }
    }
}

module.exports = Category;
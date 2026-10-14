// backend/repositories/ProductRepository.js
const db = require('../config/db');
const safeParseGallery = (galleryData) => {
    if (!galleryData) return [];
    if (Array.isArray(galleryData)) return galleryData;
    if (typeof galleryData === 'string') {
        try {
            const parsed = JSON.parse(galleryData);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            if (galleryData.startsWith('/')) {
                return [galleryData];
            }
            return [];
        }
    }
    return [];
};

const safeParseVariants = (variantsData) => {
    if (!variantsData) return null;
    if (typeof variantsData === 'string') {
        try {
            return JSON.parse(variantsData);
        } catch (e) {
            return null;
        }
    }
    return variantsData;
};

const safeParseCategories = (catsData) => {
    if (!catsData) return [];
    if (typeof catsData === 'string') {
        try {
            return JSON.parse(catsData) || [];
        } catch (e) {
            return [];
        }
    }
    return Array.isArray(catsData) ? catsData : [];
};

class ProductRepository {
    static async findById(productId) {
        const [rows] = await db.query(
            `SELECT p.*, 
                    s.user_id, s.site_path,
                    (
                        SELECT JSON_ARRAYAGG(
                            JSON_OBJECT('id', c.id, 'name', c.name, 'discount_percentage', c.discount_percentage, 'icon', c.icon)
                        )
                        FROM product_categories pc
                        JOIN categories c ON pc.category_id = c.id
                        WHERE pc.product_id = p.id
                    ) AS categories,
                    (SELECT AVG(rating) FROM product_reviews WHERE product_id = p.id) as average_rating,
                    (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id) as review_count
             FROM products p
             JOIN sites s ON p.site_id = s.id
             WHERE p.id = ?`,
            [productId]
        );
        if (!rows[0]) return null;
        rows[0].image_gallery = safeParseGallery(rows[0].image_gallery);
        rows[0].variants = safeParseVariants(rows[0].variants);
        rows[0].categories = safeParseCategories(rows[0].categories);
        rows[0].average_rating = parseFloat(rows[0].average_rating) || 0;
        return rows[0];
    }

    static async findBySiteId(siteId) {
        const [rows] = await db.query(`
            SELECT p.*, 
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT('id', c.id, 'name', c.name, 'discount_percentage', c.discount_percentage, 'icon', c.icon)
                    )
                    FROM product_categories pc
                    JOIN categories c ON pc.category_id = c.id
                    WHERE pc.product_id = p.id
                ) AS categories,
                (SELECT AVG(rating) FROM product_reviews WHERE product_id = p.id) as average_rating,
                (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id) as review_count
            FROM products p
            WHERE p.site_id = ?
            ORDER BY p.created_at DESC
        `, [siteId]);
        return rows.map(product => {
            product.image_gallery = safeParseGallery(product.image_gallery);
            product.variants = safeParseVariants(product.variants);
            product.categories = safeParseCategories(product.categories);
            product.average_rating = parseFloat(product.average_rating) || 0;
            return product;
        });
    }

    static async create(productData) {
        const { site_id, name, description, price, image_path, category_ids, stock_quantity, variants, sale_percentage, type, digital_file_url } = productData;
        const image_gallery = image_path ? JSON.stringify([image_path]) : (productData.image_gallery ? JSON.stringify(productData.image_gallery) : null);
        const variantsJson = variants ? JSON.stringify(variants) : null;
        const [result] = await db.query(
            'INSERT INTO products (site_id, name, description, price, image_gallery, stock_quantity, variants, sale_percentage, type, digital_file_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [site_id, name, description, price || 0, image_gallery, stock_quantity || null, variantsJson, sale_percentage || 0, type || 'physical', digital_file_url || null]
        );
        const productId = result.insertId;
        if (Array.isArray(category_ids) && category_ids.length > 0) {
            const values = category_ids.map(cId => [productId, cId]);
            await db.query('INSERT INTO product_categories (product_id, category_id) VALUES ?', [values]);
        }
        return this.findById(productId);
    }

    static async update(productId, productData) {
        const { name, description, price, category_ids, stock_quantity, image_gallery, variants, sale_percentage, type, digital_file_url } = productData;
        let query = 'UPDATE products SET name = ?, description = ?, price = ?, stock_quantity = ?, sale_percentage = ?, type = ?, digital_file_url = ?';
        const params = [name, description, price, stock_quantity, sale_percentage || 0, type || 'physical', digital_file_url || null];
        if ('image_gallery' in productData) {
            query += ', image_gallery = ?';
            params.push(JSON.stringify(image_gallery));
        }
        if ('variants' in productData) {
            query += ', variants = ?';
            params.push(variants ? JSON.stringify(variants) : null);
        }
        query += ' WHERE id = ?';
        params.push(productId);
        await db.query(query, params);
        if (category_ids !== undefined) {
            await db.query('DELETE FROM product_categories WHERE product_id = ?', [productId]);
            if (Array.isArray(category_ids) && category_ids.length > 0) {
                const values = category_ids.map(cId => [productId, cId]);
                await db.query('INSERT INTO product_categories (product_id, category_id) VALUES ?', [values]);
            }
        }
        return true;
    }

    static async delete(productId) {
        const [result] = await db.query(
            'DELETE FROM products WHERE id = ?',
            [productId]
        );
        return result;
    }

    static async findWithFilters({ ids, categoryId, limit, siteId }) {
        let query = `
            SELECT p.*,
                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT('id', c.id, 'name', c.name, 'discount_percentage', c.discount_percentage, 'icon', c.icon)
                    )
                    FROM product_categories pc
                    JOIN categories c ON pc.category_id = c.id
                    WHERE pc.product_id = p.id
                ) AS categories,
                (SELECT AVG(rating) FROM product_reviews WHERE product_id = p.id) as average_rating,
                (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id) as review_count
            FROM products p
            WHERE 1=1
        `;
        const params = [];
        if (siteId) {
            query += ' AND p.site_id = ?';
            params.push(siteId);
        }
        if (ids && ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            query += ` AND p.id IN (${placeholders})`;
            params.push(...ids);
        }
        if (categoryId && categoryId !== 'all') {
            query += ' AND p.id IN (SELECT product_id FROM product_categories WHERE category_id = ?)';
            params.push(categoryId);
        }
        query += ' ORDER BY p.created_at DESC';
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }
        const [rows] = await db.query(query, params);
        return rows.map(product => {
            product.image_gallery = safeParseGallery(product.image_gallery);
            product.variants = safeParseVariants(product.variants);
            product.categories = safeParseCategories(product.categories);
            product.average_rating = parseFloat(product.average_rating) || 0;
            return product;
        });
    }

    static async getReviews(productId) {
        const [rows] = await db.query(`
            SELECT pr.*, u.username, u.avatar_url 
            FROM product_reviews pr
            JOIN users u ON pr.user_id = u.id
            WHERE pr.product_id = ?
            ORDER BY pr.created_at DESC
        `, [productId]);
        return rows;
    }

    static async addReview(productId, userId, rating, comment) {
        const [result] = await db.query(
            'INSERT INTO product_reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)',
            [productId, userId, rating, comment]
        );
        return result;
    }

    static async findReviewById(reviewId) {
        const [rows] = await db.query('SELECT user_id, product_id FROM product_reviews WHERE id = ?', [reviewId]);
        return rows[0] || null;
    }

    static async findForCheckout(productId, siteId, connection) {
        const [products] = await (connection || db).query(
            'SELECT id, name, price, type, digital_file_url, stock_quantity FROM products WHERE id = ? AND site_id = ? AND is_available = 1',
            [productId, siteId]
        );
        return products[0];
    }

    static async findStock(productId) {
        const [products] = await db.query('SELECT stock_quantity, name FROM products WHERE id = ?', [productId]);
        return products[0];
    }

    static async decrementStock(productId, quantity, connection) {
        await (connection || db).query(
            `UPDATE products SET stock_quantity = GREATEST(stock_quantity - ?, 0) WHERE id = ? AND stock_quantity IS NOT NULL`,
            [quantity, productId]
        );
    }

    static async getReviewByUser(productId, userId) {
         const [rows] = await db.query(
            'SELECT * FROM product_reviews WHERE product_id = ? AND user_id = ?',
            [productId, userId]
        );
        return rows[0] || null;
    }

    static async updateReviewReply(reviewId, replyText) {
        const [result] = await db.query(
            'UPDATE product_reviews SET owner_reply = ? WHERE id = ?',
            [replyText, reviewId]
        );
        return result;
    }

    static async deleteReview(reviewId) {
        const [result] = await db.query(
            'DELETE FROM product_reviews WHERE id = ?',
            [reviewId]
        );
        return result;
    }
}

module.exports = ProductRepository;
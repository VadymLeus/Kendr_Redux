// backend/models/FormSubmission.js
const db = require('../config/db');

class FormSubmission {
    static async create(siteId, formData) {
        const [result] = await db.query(
            'INSERT INTO form_submissions (site_id, form_data) VALUES (?, ?)',
            [siteId, JSON.stringify(formData)]
        );
        return result.insertId;
    }

    static async findBySiteId(siteId) {
        const [rows] = await db.query(
            'SELECT * FROM form_submissions WHERE site_id = ? ORDER BY created_at DESC',
            [siteId]
        );
        return rows;
    }

    static async findById(submissionId, siteId) {
        const [rows] = await db.query(
            'SELECT id, form_data FROM form_submissions WHERE id = ? AND site_id = ?',
            [submissionId, siteId]
        );
        return rows[0] || null;
    }

    static async updateFormData(submissionId, siteId, formData) {
        const [result] = await db.query(
            'UPDATE form_submissions SET form_data = ? WHERE id = ? AND site_id = ?',
            [JSON.stringify(formData), submissionId, siteId]
        );
        return result;
    }

    static async markAsRead(submissionId, siteId) {
        const [result] = await db.query(
            'UPDATE form_submissions SET is_read = 1 WHERE id = ? AND site_id = ?',
            [submissionId, siteId]
        );
        return result;
    }

    static async togglePin(submissionId, siteId) {
        await db.query(
            'UPDATE form_submissions SET is_pinned = NOT is_pinned WHERE id = ? AND site_id = ?',
            [submissionId, siteId]
        );
        
        const [rows] = await db.query(
            'SELECT is_pinned FROM form_submissions WHERE id = ? AND site_id = ?', 
            [submissionId, siteId]
        );
        return rows[0] ? !!rows[0].is_pinned : false;
    }

    static async deleteById(submissionId, siteId) {
        const [result] = await db.query(
            'DELETE FROM form_submissions WHERE id = ? AND site_id = ?',
            [submissionId, siteId]
        );
        return result;
    }
}

module.exports = FormSubmission;
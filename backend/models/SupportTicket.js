// backend/models/SupportTicket.js
const db = require('../config/db');
const AuthPolicy = require('../services/AuthPolicy');

class SupportTicket {
    static async create(userId, subject, body, type = 'general', attachments = null) {
        const [result] = await db.query(
            'INSERT INTO support_tickets (user_id, subject, body, type, status, attachments) VALUES (?, ?, ?, ?, "open", ?)',
            [userId, subject, body, type, attachments]
        );
        return { id: result.insertId, subject, body, type, status: 'open' };
    }
    
    static async getLastTicketTime(userId) {
        const [rows] = await db.query(
            'SELECT created_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        return rows[0] ? rows[0].created_at : null;
    }

    static async findAllForUser(userId) {
        const [rows] = await db.query(
            'SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC', 
            [userId]
        );
        return rows;
    }

    static async findAll(statusFilter = 'active') {
        let query = `
            SELECT st.*, u.username, u.email as user_email, u.avatar_url as user_avatar_url
            FROM support_tickets st
            JOIN users u ON st.user_id = u.id
        `;
        const params = [];
        if (statusFilter === 'active') {
            query += " WHERE st.status != 'closed'";
        } else if (statusFilter === 'closed') {
            query += " WHERE st.status = 'closed'";
        }
        query += " ORDER BY st.updated_at DESC";
        const [rows] = await db.query(query, params);
        return rows;
    }

    static async findById(ticketId) {
        const [rows] = await db.query(`
            SELECT st.*, u.username, u.avatar_url 
            FROM support_tickets st
            JOIN users u ON st.user_id = u.id 
            WHERE st.id = ?
        `, [ticketId]);
        return rows[0];
    }

    static async getLastReplies(ticketId, limit = 2) {
        const [rows] = await db.query(
            'SELECT user_id FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at DESC LIMIT ?',
            [ticketId, limit]
        );
        return rows;
    }

    static async addReply(ticketId, userId, body, attachments) {
        const [result] = await db.query(
            'INSERT INTO ticket_replies (ticket_id, user_id, body, attachments) VALUES (?, ?, ?, ?)',
            [ticketId, userId, body, attachments || '[]']
        );
        const [userRows] = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
        const userRole = userRows[0]?.role;
        const newStatus = AuthPolicy.isStaff({ role: userRole }) ? 'answered' : 'open';
        await db.query(
            'UPDATE support_tickets SET status = ?, closed_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
            [newStatus, ticketId]
        );
        return { id: result.insertId };
    }

    static async getReplies(ticketId) {
        const [rows] = await db.query(`
            SELECT tr.*, u.username, u.role, u.avatar_url
            FROM ticket_replies tr
            JOIN users u ON tr.user_id = u.id
            WHERE tr.ticket_id = ?
            ORDER BY tr.created_at ASC
        `, [ticketId]);
        return rows;
    }

    static async updateStatus(ticketId, status, closedBy = null) {
        await db.query(
            'UPDATE support_tickets SET status = ?, closed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
            [status, closedBy, ticketId]
        );
    }
}

module.exports = SupportTicket;
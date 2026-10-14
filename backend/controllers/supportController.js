// backend/controllers/supportController.js
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const db = require('../config/db'); 

exports.createTicket = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        const { subject, body, siteId } = req.body; 
        const userId = req.user.id;
        const attachmentUrls = req.attachmentUrls || [];
        if (!subject || !body) {
            return res.status(400).json({ message: 'Тема та текст звернення є обов\'язковими.' });
        }
        const lastTicketTime = await SupportTicket.getLastTicketTime(userId);
        if (lastTicketTime) {
            const now = new Date();
            const lastTime = new Date(lastTicketTime);
            const timeDiffMinutes = (now - lastTime) / (1000 * 60);

            if (timeDiffMinutes < 20) {
                const remainingMinutes = Math.ceil(20 - timeDiffMinutes);
                return res.status(429).json({ 
                    message: `Ви занадто часто створюєте звернення. Зачекайте ще ${remainingMinutes} хв.` 
                });
            }
        }
        let ticketType = 'general';
        if (siteId) {
            const [sites] = await connection.query('SELECT user_id, status FROM sites WHERE id = ?', [siteId]);
            const site = sites[0];
            if (!site || String(site.user_id) !== String(userId)) {
                return res.status(403).json({ message: 'Апеляцію можна подати лише на власний сайт.' });
            }
            if (site.status !== 'suspended') {
                return res.status(400).json({ message: 'Апеляцію можна подати лише на заблокований сайт.' });
            }
            ticketType = 'appeal';
            const [existingAppeals] = await connection.query(
                'SELECT id FROM site_appeals WHERE site_id = ?', 
                [siteId]
            );
            if (existingAppeals.length > 0) {
                return res.status(400).json({ 
                    message: 'Для цього сайту вже подано апеляцію. Ви не можете створити нову.' 
                });
            }
        }
        const attachmentsJSON = JSON.stringify(attachmentUrls);
        await connection.beginTransaction();
        const [ticketResult] = await connection.query(
            'INSERT INTO support_tickets (user_id, subject, body, type, status, attachments) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, subject, body, ticketType, 'open', attachmentsJSON]
        );
        const ticketId = ticketResult.insertId;
        
        if (siteId) {
            await connection.query(
                'INSERT INTO site_appeals (site_id, user_id, ticket_id, status, created_at) VALUES (?, ?, ?, ?, NOW())',
                [siteId, userId, ticketId, 'pending']
            );
        }
        
        await connection.commit();
        res.status(201).json({ 
            id: ticketId, 
            subject, 
            body, 
            status: 'open',
            type: ticketType,
            message: siteId ? 'Апеляцію подано успішно.' : 'Звернення створено.'
        });
    } catch (error) {
        await connection.rollback();
        next(error);
    } finally {
        connection.release();
    }
};

exports.getUserTickets = async (req, res, next) => {
    try {
        const tickets = await SupportTicket.findAllForUser(req.user.id);
        res.json(tickets);
    } catch (error) { next(error); }
};

exports.getTicketById = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const currentUserId = req.user.id;
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) return res.status(401).json({ message: 'Помилка автентифікації.' });
        const ticket = await SupportTicket.findById(ticketId);
        if (!ticket) return res.status(404).json({ message: 'Звернення не знайдено.' });
        const isOwner = ticket.user_id === currentUserId;
        const isAdmin = currentUser.role === 'admin';
        if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Доступ заборонено.' });
        const replies = await SupportTicket.getReplies(ticketId);
        res.json({ ...ticket, replies });
    } catch (error) {
        next(error);
    }
};

exports.addReply = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const body = req.body.body || ''; 
        const attachmentUrls = req.attachmentUrls || []; 
        const currentUserId = req.user.id;
        if (!body.trim() && attachmentUrls.length === 0) {
            return res.status(400).json({ message: 'Введіть текст або прикріпіть файл.' });
        }
        const ticket = await SupportTicket.findById(ticketId);
        if (!ticket) return res.status(404).json({ message: 'Звернення не знайдено.' });
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) return res.status(401).json({ message: 'Користувач не знайдений.' });
        if (ticket.user_id !== currentUserId && currentUser.role !== 'admin') {
            return res.status(403).json({ message: 'Ви не можете відповідати тут.' });
        }
        if (currentUser.role !== 'admin') {
            const lastReplies = await SupportTicket.getLastReplies(ticketId, 2);
            if (lastReplies.length >= 2) {
                const isSpamming = lastReplies.every(reply => reply.user_id === currentUserId);
                if (isSpamming) {
                    return res.status(429).json({ 
                        message: 'Ви вже відправили два повідомлення поспіль. Будь ласка, дочекайтеся відповіді адміністратора.' 
                    });
                }
            }
        }
        const attachmentsJSON = JSON.stringify(attachmentUrls);
        await SupportTicket.addReply(ticketId, currentUserId, body, attachmentsJSON);
        res.status(201).json({ message: 'Відповідь додано.' });
    } catch (error) {
        next(error);
    }
};

exports.getAdminTickets = async (req, res, next) => {
    try {
        const statusFilter = req.query.status || 'active';
        const tickets = await SupportTicket.findAll(statusFilter);
        res.json(tickets);
    } catch (error) { 
        next(error); 
    }
};

exports.updateTicketStatus = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const { status } = req.body;
        const currentUserId = req.user.id;
        if (!['open', 'answered', 'closed'].includes(status)) {
            return res.status(400).json({ message: 'Невірний статус.' });
        }
        const ticket = await SupportTicket.findById(ticketId);
        if (!ticket) return res.status(404).json({ message: 'Звернення не знайдено.' });
        const currentUser = await User.findById(currentUserId);
        const isAdmin = currentUser.role === 'admin';
        const isOwner = ticket.user_id === currentUserId;
        if (!isAdmin && !isOwner) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }
        if (!isAdmin && status !== 'closed') {
            return res.status(403).json({ message: 'Користувач може лише закривати звернення.' });
        }
        let closedBy = null;
        if (status === 'closed') {
            closedBy = isAdmin ? 'admin' : 'user';
        }
        await SupportTicket.updateStatus(ticketId, status, closedBy);
        res.json({ message: `Статус оновлено.` });
    } catch (error) { 
        next(error); 
    }
};
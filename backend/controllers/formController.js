// backend/controllers/formController.js
const FormSubmission = require('../models/FormSubmission');
const SiteRepository = require('../repositories/SiteRepository');
const User = require('../models/User');
const { sendSubmissionNotification } = require('../utils/emailService');
const db = require('../config/db');

exports.submitForm = async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ message: 'Ім\'я, Email та Повідомлення є обов\'язковими.' });
        }

        const submissionId = await FormSubmission.create(siteId, req.body);

        const [siteRows] = await db.query(
            'SELECT user_id, title FROM sites WHERE id = ?', [siteId]
        );

        if (!siteRows[0]) {
            return res.status(404).json({ message: 'Сайт не знайдено.' });
        }

        const site = siteRows[0];
        const owner = await User.findById(site.user_id);

        if (owner && owner.email) {
            sendSubmissionNotification(owner.email, site.title, req.body);
        }

        res.status(201).json({ message: 'Заявку успішно надіслано.', id: submissionId });

    } catch (error) {
        next(error);
    }
};

exports.getSubmissions = async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const site = await SiteRepository.findByIdAndUserId(siteId, req.user.id);

        if (!site) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }

        const submissions = await FormSubmission.findBySiteId(siteId);
        res.json(submissions);
    } catch (error) {
        next(error);
    }
};

exports.markSubmissionRead = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        const site = await SiteRepository.findByIdAndUserId(siteId, req.user.id);

        if (!site) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }

        await FormSubmission.markAsRead(submissionId, siteId);
        res.json({ message: 'Заявку позначено як прочитану.' });
    } catch (error) {
        next(error);
    }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        const { status } = req.body;
        
        const site = await SiteRepository.findByIdAndUserId(siteId, req.user.id);
        if (!site) return res.status(403).json({ message: 'Доступ заборонено.' });

        const [rows] = await db.query('SELECT form_data FROM form_submissions WHERE id = ?', [submissionId]);
        if (!rows[0]) return res.status(404).json({ message: 'Заявку не знайдено' });

        let formData = rows[0].form_data;
        if (typeof formData === 'string') formData = JSON.parse(formData);

        formData.status = status;

        await db.query(
            'UPDATE form_submissions SET form_data = ? WHERE id = ?', 
            [JSON.stringify(formData), submissionId]
        );

        res.json({ message: 'Статус оновлено' });
    } catch (error) {
        next(error);
    }
};

exports.toggleSubmissionPin = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        
        const site = await SiteRepository.findByIdAndUserId(siteId, req.user.id);
        if (!site) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }

        const newPinState = await FormSubmission.togglePin(submissionId, siteId);
        
        res.json({ 
            message: newPinState ? 'Заявку закріплено' : 'Заявку відкріплено', 
            is_pinned: newPinState 
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteSubmission = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        const site = await SiteRepository.findByIdAndUserId(siteId, req.user.id);

        if (!site) {
            return res.status(403).json({ message: 'Доступ заборонено.' });
        }

        await FormSubmission.deleteById(submissionId, siteId);
        res.json({ message: 'Заявку успішно видалено.' });
    } catch (error) {
        next(error);
    }
};
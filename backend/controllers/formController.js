// backend/controllers/formController.js
const FormSubmission = require('../models/FormSubmission');
const User = require('../models/User');
const { requireSiteAccess, read, write } = require('../services/siteAccess');
const sendServiceError = require('../utils/sendServiceError');
const { sendSubmissionNotification } = require('../utils/emailService');
const db = require('../config/db');

const ACCESS_DENIED = 'Доступ заборонено.';

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
        await requireSiteAccess(siteId, req.user.id, read('overview'), ACCESS_DENIED);

        const submissions = await FormSubmission.findBySiteId(siteId);
        res.json(submissions);
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.markSubmissionRead = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        await requireSiteAccess(siteId, req.user.id, write('overview'), ACCESS_DENIED);

        await FormSubmission.markAsRead(submissionId, siteId);
        res.json({ message: 'Заявку позначено як прочитану.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        const { status } = req.body;

        await requireSiteAccess(siteId, req.user.id, write('overview'), ACCESS_DENIED);

        const submission = await FormSubmission.findById(submissionId, siteId);
        if (!submission) return res.status(404).json({ message: 'Заявку не знайдено' });

        let formData = submission.form_data;
        if (typeof formData === 'string') formData = JSON.parse(formData);

        formData.status = status;

        await FormSubmission.updateFormData(submissionId, siteId, formData);

        res.json({ message: 'Статус оновлено' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.toggleSubmissionPin = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;

        await requireSiteAccess(siteId, req.user.id, write('overview'), ACCESS_DENIED);

        const newPinState = await FormSubmission.togglePin(submissionId, siteId);
        
        res.json({ 
            message: newPinState ? 'Заявку закріплено' : 'Заявку відкріплено', 
            is_pinned: newPinState 
        });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};

exports.deleteSubmission = async (req, res, next) => {
    try {
        const { siteId, submissionId } = req.params;
        await requireSiteAccess(siteId, req.user.id, write('overview'), ACCESS_DENIED);

        await FormSubmission.deleteById(submissionId, siteId);
        res.json({ message: 'Заявку успішно видалено.' });
    } catch (error) {
        sendServiceError(error, res, next);
    }
};
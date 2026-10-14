// backend/tests/helpers/app.js
// Застосунок і його модулі завантажуються рідним require Node (а не трансформацією Vite), бо джерела
// backend написані на CommonJS. Усі тести мають один кеш модулів: підміна властивості
// (наприклад, emailService.sendDigitalGoodsEmail) діє на контролери, які викликають її через об'єкт модуля.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const app = require('../../app');
export const appPool = require('../../config/db');
export const emailService = require('../../utils/emailService');
export const paymentService = require('../../services/PaymentService');
export const SiteRepository = require('../../repositories/SiteRepository');
export const { ServiceError } = require('../../services/ServiceError');
export const { clearSettingsCache } = require('../../middleware/platformGuards');

export async function closeApp() {
  await appPool.end();
}

// backend/tests/helpers/liqpay.js
// Емуляція шлюзу LiqPay: підпис і кодування за тим самим правилом, що в контролерах
// (sha1(private + data + private) у base64; data — base64 від JSON).
import crypto from 'node:crypto';
import request from 'supertest';

export function encodeLiqpay(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decodeLiqpay(data) {
  return JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
}

export function signLiqpay(data, privateKey) {
  return crypto.createHash('sha1').update(privateKey + data + privateKey).digest('base64');
}

// Повертає пару, яку шлюз надсилає на server_url у тілі form-urlencoded.
export function liqpayCallbackBody(payload, privateKey) {
  const data = encodeLiqpay(payload);
  return { data, signature: signLiqpay(data, privateKey) };
}

// Надсилає callback так, як це робить шлюз: POST application/x-www-form-urlencoded з полями data і signature.
export function postLiqpay(app, url, payload, privateKey) {
  return request(app).post(url).type('form').send(liqpayCallbackBody(payload, privateKey));
}

// Ідентифікатор платежу LiqPay для замовлення має вигляд "<orderId>_<час>" (orderController.generateLiqPayData).
export const liqpayOrderId = (orderId) => `${orderId}_${Date.now()}`;

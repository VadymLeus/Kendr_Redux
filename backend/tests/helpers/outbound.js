// backend/tests/helpers/outbound.js
// Перехоплення вихідних HTTP-запитів застосунку: листи Resend і перевірка Cloudflare Turnstile.
//
// Контролери автентифікації імпортують sendOtpEmail деструктуризацією (const { sendOtpEmail } = require(...)),
// тож підмінити функцію у властивостях модуля emailService, як це робиться для sendDigitalGoodsEmail, неможливо.
// Натомість підміняється глобальний fetch: ним користуються і SDK Resend, і middleware verifyTurnstile.
// Запити самих тестів (supertest) ідуть через http і підміни не зачіпають.
import { vi } from 'vitest';

const RESEND_URL = 'https://api.resend.com/emails';
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const urlOf = (input) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

// Виконує дію, не засмічуючи вивід тестів: errorHandler друкує стек кожної необробленої помилки (console.error),
// а тести, що фіксують помилку 500, викликають її навмисно.
export async function quietly(action) {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    return await action();
  } finally {
    spy.mockRestore();
    warn.mockRestore();
  }
}

export function captureOutbound() {
  const emails = [];
  const turnstile = [];
  let verdict = { success: true };
  let turnstileFailure = null;

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = urlOf(input);
    if (url === RESEND_URL) {
      const payload = JSON.parse(init.body);
      emails.push({ from: payload.from, to: [].concat(payload.to)[0], subject: payload.subject, html: payload.html });
      return jsonResponse({ id: `email_${emails.length}` });
    }
    if (url === TURNSTILE_URL) {
      turnstile.push({ method: init.method, form: new URLSearchParams(String(init.body)) });
      if (turnstileFailure) throw turnstileFailure;
      return jsonResponse(verdict);
    }
    throw new Error(`Тест не очікує вихідного запиту: ${url}`);
  });

  return {
    emails,
    turnstile,
    // Відповідь Cloudflare: { success: true } за замовчуванням.
    setTurnstileVerdict(value) { verdict = value; },
    // Мережева помилка під час виклику Cloudflare.
    failTurnstile(error = new Error('мережа недоступна')) { turnstileFailure = error; },
    // Шестицифровий код з останнього листа, надісланого на адресу.
    codeSentTo(address) {
      const mails = emails.filter((mail) => mail.to === address);
      const html = mails.length ? mails[mails.length - 1].html : '';
      const match = html.match(/>\s*(\d{6})\s*</);
      return match ? match[1] : null;
    },
    restore() { spy.mockRestore(); },
  };
}

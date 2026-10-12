// backend/tests/helpers/client.js
// Адреса клієнта для обмежувачів частоти й перевірки Turnstile.
//
// Обмежувачі express-rate-limit ведуть лічильник у пам'яті процесу за req.ip, а маршрути автентифікації мають жорсткі
// ліміти (наприклад, 3 входи до адмін-панелі на годину). Застосунок працює з trust proxy = 1, тому адресу клієнта
// можна задати заголовком X-Forwarded-For: кожен запит тесту йде з власної адреси й не впирається в лічильник попередніх.
// Тести самих обмежувачів, навпаки, шлють усі запити з однієї адреси.
import crypto from 'node:crypto';

// Випадковий початок гарантує, що файли тестів у спільному процесі не отримають однакові адреси.
let counter = crypto.randomInt(1, 1 << 20);

export function freshIp() {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
}

// Надсилає запит з нової адреси (якщо не вказано власну).
export const fromIp = (req, ip = freshIp()) => req.set('X-Forwarded-For', ip);

// Запит з боку публічного домену: verifyTurnstile пропускає перевірку лише для localhost і 127.0.0.1.
export const onPublicHost = (req, host = 'kendr.test') => req.set('Host', host).set('X-Forwarded-Host', host);

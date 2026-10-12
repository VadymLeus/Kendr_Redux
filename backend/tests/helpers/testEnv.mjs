// backend/tests/helpers/testEnv.mjs
// Єдине джерело налаштувань тестового середовища. Значення навмисно відрізняються від робочих:
// тести стирають таблиці, тому вони не повинні досягти БД розробки (порт 3306, база KendrDB).
export const testEnv = {
  NODE_ENV: 'test',
  // Підключення до контейнера з docker-compose.yml
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_USER: 'root',
  DB_PASSWORD: 'kendr_test',
  DB_NAME: 'kendr_test',
  // Секрети лише для тестів
  JWT_SECRET: 'test-jwt-secret',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
  // Ключі платформи LiqPay (оплата тарифу): вигадані, у шлюз не надсилаються
  LIQPAY_PUBLIC_KEY: 'sandbox_platform_public',
  LIQPAY_PRIVATE_KEY: 'platform-private-secret',
  // Заглушки, без яких модулі не завантажуються (ключ Resend, Google OAuth, Cloudinary)
  RESEND_API_KEY: 're_test_dummy',
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/auth/google/callback',
  CLOUDINARY_CLOUD_NAME: 'test',
  CLOUDINARY_API_KEY: 'test',
  CLOUDINARY_API_SECRET: 'test',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  CLIENT_URL: 'http://localhost:5173',
  FRONTEND_URL: 'http://localhost:5173',
  BACKEND_URL: 'http://localhost:5000',
  // Порожнє значення не дає dotenv підставити NGROK_URL з локального .env
  NGROK_URL: '',
};

// Захист: тести викликають DELETE по всіх таблицях, тому працюють лише з тестовою БД.
export function assertTestDatabase(env = process.env) {
  const hostOk = env.DB_HOST === '127.0.0.1' || env.DB_HOST === 'localhost';
  if (!hostOk || String(env.DB_PORT) !== '3307' || env.DB_NAME !== 'kendr_test') {
    throw new Error(
      `Тести відмовляються працювати з БД ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}. ` +
      'Дозволено лише 127.0.0.1:3307/kendr_test (docker compose up -d).'
    );
  }
}

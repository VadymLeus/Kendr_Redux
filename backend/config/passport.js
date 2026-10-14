// backend/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../config/db');
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        if (!profile) {
            return done(new Error('Не удалось получить профиль от Google'), null);
        }
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) {
            return done(new Error('Google не предоставил Email'), null);
        }
        let avatar_url = null;
        if (profile.photos && profile.photos.length > 0) {
            avatar_url = profile.photos[0].value;
        }
        const [existingUser] = await db.query('SELECT * FROM users WHERE google_id = ?', [profile.id]);
        if (existingUser.length > 0) {
            const user = existingUser[0];
            return done(null, user);
        }
        const [userByEmail] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (userByEmail.length > 0) {
            const user = userByEmail[0];
            if (user.status === 'suspended') {
                return done(null, { ...user, google_id: profile.id });
            }
            if (!user.is_verified) {
                return done(null, false);
            }
            await db.query('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, user.id]);
            return done(null, { ...user, google_id: profile.id });
        }
        const baseUsername = profile.displayName.trim().replace(/\s+/g, ' ');
        let uniqueUsername = baseUsername;
        while (true) {
             const [check] = await db.query('SELECT id FROM users WHERE username = ?', [uniqueUsername]);
             if (check.length === 0) break;
             uniqueUsername = `${baseUsername} ${Math.floor(Math.random() * 1000)}`;
        }
        const slug = await User.generateSlug(uniqueUsername);
        const [result] = await db.query(
            'INSERT INTO users (username, slug, email, google_id, avatar_url, is_verified, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uniqueUsername, slug, email, profile.id, avatar_url, 1, null]
        );
        const newUser = {
            id: result.insertId,
            username: uniqueUsername,
            slug: slug,
            email: email,
            role: 'user',
            avatar_url: avatar_url,
            token_version: 0
        };
        return done(null, newUser);
    } catch (err) {
        console.error('Passport Strategy Error:', err);
        return done(err, null);
    }
  }
));

module.exports = passport;
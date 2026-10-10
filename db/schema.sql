CREATE DATABASE IF NOT EXISTS KendrDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
USE KendrDB;

-- ==========================================
-- 1. КОРИСТУВАЧІ
-- ==========================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) UNIQUE NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone_number VARCHAR(25) NULL,
    password_hash VARCHAR(255) NULL,
    google_id VARCHAR(255) UNIQUE NULL,
    role ENUM('user', 'admin', 'moderator') NOT NULL DEFAULT 'user',
    plan ENUM('FREE', 'PLUS', 'ADMIN') NOT NULL DEFAULT 'FREE',
    status ENUM('active', 'suspended', 'deleted') NOT NULL DEFAULT 'active',
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    
    platform_theme_mode ENUM('light', 'dark', 'system') NOT NULL DEFAULT 'system',
    platform_theme_accent VARCHAR(20) NOT NULL DEFAULT 'blue',

    avatar_url VARCHAR(255) DEFAULT NULL,
    bio TEXT DEFAULT NULL,
    social_telegram VARCHAR(255) DEFAULT NULL,
    social_instagram VARCHAR(255) DEFAULT NULL,
    social_website VARCHAR(255) DEFAULT NULL,
    is_profile_public BOOLEAN DEFAULT TRUE,

    is_verified BOOLEAN DEFAULT FALSE,
    otp_code VARCHAR(10) DEFAULT NULL,
    otp_expires TIMESTAMP NULL DEFAULT NULL,
    otp_purpose ENUM('2FA', 'RESET_PASSWORD', 'VERIFY_EMAIL') DEFAULT NULL,
    token_version INT NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL DEFAULT NULL
);

-- ==========================================
-- 2. ТАБЛИЦЯ ШАБЛОНІВ (SYSTEM + USER)
-- ==========================================
CREATE TABLE templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL, 
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) NOT NULL DEFAULT 'Layout',
    thumbnail_url VARCHAR(255),
    default_block_content JSON NOT NULL,
    
    type ENUM('system', 'personal') NOT NULL DEFAULT 'personal',
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    is_ready BOOLEAN NOT NULL DEFAULT FALSE, 
    access_level ENUM('private', 'admin_only', 'public') NOT NULL DEFAULT 'private',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- 3. САЙТИ
-- ==========================================
CREATE TABLE sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    site_path VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    logo_url VARCHAR(255) NOT NULL DEFAULT '/uploads/shops/logos/default/default-logo.webp',
    status ENUM('published', 'maintenance', 'suspended', 'private', 'probation') NOT NULL DEFAULT 'private',
    view_count INT NOT NULL DEFAULT 0,
    is_pinned BOOLEAN NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
    
    site_theme_mode ENUM('light', 'dark') NOT NULL DEFAULT 'light',
    site_theme_accent VARCHAR(20) NOT NULL DEFAULT 'orange',
    theme_settings JSON NULL,
    dashboard_config JSON NULL,
    
    header_content JSON NULL,
    footer_content JSON NULL,
    footer_layout ENUM('simple', 'detailed') NOT NULL DEFAULT 'simple',
    favicon_url VARCHAR(255) DEFAULT NULL,
    site_title_seo VARCHAR(255) DEFAULT NULL,
    
    cover_image VARCHAR(255) DEFAULT NULL,
    cover_layout ENUM('image', 'classic', 'reverse', 'centered', 'centered_reverse', 'minimal', 'logo_only') DEFAULT 'centered',
    cover_logo_size INT NOT NULL DEFAULT 80,
    cover_logo_radius INT NOT NULL DEFAULT 0,
    cover_title_size INT NOT NULL DEFAULT 24,

    is_online_payment_enabled BOOLEAN NOT NULL DEFAULT 1,
    is_cod_enabled BOOLEAN NOT NULL DEFAULT 1,
    liqpay_public_key VARCHAR(255) DEFAULT NULL,
    liqpay_private_key MEDIUMTEXT DEFAULT NULL,

    cookie_banner_enabled BOOLEAN NOT NULL DEFAULT 0,
    cookie_banner_text TEXT NULL,
    cookie_banner_size VARCHAR(20) DEFAULT 'medium',
    cookie_banner_position VARCHAR(50) DEFAULT 'bottom-center',
    cookie_banner_blur BOOLEAN NOT NULL DEFAULT 0,
    
    locked_by_user_id INT NULL DEFAULT NULL,
    locked_until TIMESTAMP NULL DEFAULT NULL,

    deletion_scheduled_for TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE site_collaborators (
    site_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('editor', 'viewer') NOT NULL DEFAULT 'editor',
    permissions JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (site_id, user_id),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE site_invites (
    token VARCHAR(64) PRIMARY KEY,
    site_id INT NOT NULL,
    created_by INT NOT NULL,
    role ENUM('editor', 'viewer') NOT NULL DEFAULT 'editor',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- 4. СТОРІНКИ
-- ==========================================
CREATE TABLE pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    block_content JSON NOT NULL,
    is_homepage BOOLEAN NOT NULL DEFAULT 0,
    seo_title VARCHAR(255) DEFAULT NULL,
    seo_description TEXT DEFAULT NULL,
    seo_keywords VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    UNIQUE KEY uk_site_slug (site_id, slug)
);

-- ==========================================
-- 5. КАТЕГОРІЇ
-- ==========================================
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    discount_percentage INT DEFAULT 0,
    icon VARCHAR(50) DEFAULT 'folder',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    UNIQUE KEY (site_id, name)
);

-- ==========================================
-- 6. ТОВАРИ
-- ==========================================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    category_id INT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type ENUM('physical', 'digital') NOT NULL DEFAULT 'physical',
    digital_file_url TEXT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    stock_quantity INT NULL DEFAULT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    image_gallery JSON NULL,
    variants JSON DEFAULT NULL,
    sale_percentage INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE product_categories (
    product_id INT NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- ==========================================
-- 7. ВІДГУКИ НА ТОВАРИ
-- ==========================================
CREATE TABLE product_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    owner_reply TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_product_user_review (product_id, user_id)
);

-- ==========================================
-- 8. ТЕГИ
-- ==========================================
CREATE TABLE tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE site_tags (
    site_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (site_id, tag_id),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ==========================================
-- 9. МАГАЗИН: ЗАМОВЛЕННЯ ТА ТОВАРИ ЗАМОВЛЕННЯ
-- ==========================================
CREATE TABLE orders (
    id VARCHAR(21) PRIMARY KEY,
    site_id INT NOT NULL,
    customer_id INT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NULL,
    delivery_address TEXT NULL,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'paid', 'shipped', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    payment_method ENUM('online', 'cod') NOT NULL DEFAULT 'online',
    liqpay_order_id VARCHAR(255) UNIQUE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(21) NOT NULL, 
    product_id INT NULL, 
    product_name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    quantity INT NOT NULL DEFAULT 1,
    type ENUM('physical', 'digital') NOT NULL DEFAULT 'physical',
    digital_file_url TEXT DEFAULT NULL,
    options JSON DEFAULT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ==========================================
-- 10. ДОДАТКОВІ ТАБЛИЦІ (SUPPORT, MEDIA, ETC)
-- ==========================================
CREATE TABLE user_favorites (
    user_id INT NOT NULL,
    site_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, site_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    attachments JSON NULL DEFAULT NULL,
    type ENUM('general', 'appeal') NOT NULL DEFAULT 'general',
    status ENUM('open', 'answered', 'closed') NOT NULL DEFAULT 'open',
    closed_by ENUM('user', 'admin') NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE ticket_replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    user_id INT NOT NULL,
    body TEXT NOT NULL,
    attachments JSON NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_warnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    site_id INT NULL, 
    reason_note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
);

CREATE TABLE user_media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    path_full VARCHAR(255) NOT NULL,
    path_thumb VARCHAR(255) NULL,
    original_file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_kb INT DEFAULT 0,
    file_type ENUM('image', 'video', 'document', 'font') NOT NULL DEFAULT 'image',
    is_system BOOLEAN NOT NULL DEFAULT 0,
    width INT DEFAULT NULL,
    height INT DEFAULT NULL,
    display_name VARCHAR(255),
    alt_text VARCHAR(255),
    description TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_media_search ON user_media(user_id, display_name);

CREATE TABLE site_visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    visitor_hash VARCHAR(64) NOT NULL,
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    INDEX idx_visit_check (site_id, visitor_hash, visited_at)
);

CREATE TABLE form_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    form_data JSON NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT 0,
    is_pinned BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE saved_blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    content JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE site_appeals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    user_id INT NOT NULL,
    ticket_id INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    UNIQUE KEY uk_site_appeal (site_id)
);

CREATE TABLE site_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    reporter_id INT NULL,
    reporter_ip VARCHAR(45) NULL,
    reason ENUM('spam', 'scam', 'inappropriate_content', 'copyright', 'other') NOT NULL DEFAULT 'other',
    description TEXT NULL,
    status ENUM('new', 'reviewed', 'dismissed', 'banned') NOT NULL DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ==========================================
-- 11. ТРАНЗАКЦІЇ, ЛОГИ ТА НАЛАШТУВАННЯ
-- ==========================================
CREATE TABLE transactions (
    id VARCHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
    status ENUM('pending', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    provider_id VARCHAR(255) NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

CREATE TABLE admin_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    action_type VARCHAR(50) NOT NULL, 
    target_id INT NULL,                
    target_type VARCHAR(50) NULL,        
    details JSON NULL,                
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_admin_logs ON admin_logs(admin_id, created_at);

CREATE TABLE global_settings (
    id INT PRIMARY KEY DEFAULT 1,
    maintenance_mode BOOLEAN NOT NULL DEFAULT 0,
    editor_locked BOOLEAN NOT NULL DEFAULT 0,
    maintenance_message TEXT NULL,
    registration_enabled BOOLEAN NOT NULL DEFAULT 1,
    auth_enabled BOOLEAN NOT NULL DEFAULT 1,
    site_creation_enabled BOOLEAN NOT NULL DEFAULT 1,
    billing_enabled BOOLEAN NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ==========================================
-- 12. ДАНІ (TEST DATA)
-- ==========================================
INSERT IGNORE INTO global_settings (
    id, maintenance_mode, editor_locked, maintenance_message, 
    registration_enabled, auth_enabled, site_creation_enabled, billing_enabled
) VALUES (1, 0, 0, '', 1, 1, 1, 1);

INSERT INTO users (username, slug, email, password_hash, role, plan, is_verified) 
VALUES 
('admin_01', NULL, 'charleymardler@gmail.com', '$2b$10$RjWcRF39JI.heABjV1yzheSKFWygDyfc.mZfabDr8GeXl8CxcIGqK', 'admin', 'PLUS', 1),
('e2e_tester', 'e2e-tester', 'e2e_test@kendr.com', '$2b$10$RjWcRF39JI.heABjV1yzheSKFWygDyfc.mZfabDr8GeXl8CxcIGqK', 'user', 'PLUS', 1);

INSERT INTO tags (name) VALUES
('Портфоліо'), ('Блог'), ('Мистецтво'), ('Одяг'), ('Магазин'), ('Технології');

INSERT INTO templates (user_id, name, description, icon, thumbnail_url, default_block_content, type, is_ready, access_level) 
VALUES 
(1, 'Modern Shop', 'Популярный шаблон для магазина одежды.', 'ShoppingBag', '/previews/shop.png', '{"theme_settings": {"mode": "light"}, "header_content": [], "pages": []}', 'system', 1, 'public');

-- ==========================================
-- 13. EVENTS (ПЛАНУВАЛЬНИК)
-- ==========================================
CREATE EVENT IF NOT EXISTS auto_clear_old_warnings
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM user_warnings WHERE created_at <= NOW() - INTERVAL 1 YEAR;
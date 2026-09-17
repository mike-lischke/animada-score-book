-- Baseline schema for Animada Score Book
-- Contains the full initial database schema and the migration_history tracking table.
--
-- Engine-specific sections are marked with -- @mysql and -- @postgres.
-- SQL before any marker runs on all engines.

-- @mysql
CREATE TABLE IF NOT EXISTS folders (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    parentid INT UNSIGNED NULL,
    name     VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_folders_parent
        FOREIGN KEY (parentid)
        REFERENCES folders(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS folders (
    id       SERIAL PRIMARY KEY,
    parentid INT NULL REFERENCES folders(id) ON UPDATE CASCADE ON DELETE SET NULL,
    name     VARCHAR(255) NOT NULL
);

-- @mysql
CREATE TABLE IF NOT EXISTS scores (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    folderid INT UNSIGNED NULL,
    name     VARCHAR(255) NOT NULL,
    content  MEDIUMTEXT    NOT NULL,
    notes    TEXT          NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_scores_folder
        FOREIGN KEY (folderid)
        REFERENCES folders(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB, AUTO_INCREMENT = 10000;

-- @postgres
CREATE TABLE IF NOT EXISTS scores (
    id       SERIAL PRIMARY KEY,
    folderid INT NULL REFERENCES folders(id) ON UPDATE CASCADE ON DELETE CASCADE,
    name     VARCHAR(255) NOT NULL,
    content  TEXT NOT NULL,
    notes    TEXT
);

-- @mysql
CREATE TABLE IF NOT EXISTS instruments (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    imageurl      VARCHAR(512),
    articulations JSON NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB, AUTO_INCREMENT = 20000;

-- @postgres
CREATE TABLE IF NOT EXISTS instruments (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    imageurl      VARCHAR(512),
    articulations JSONB NOT NULL
);

-- @mysql
CREATE TABLE IF NOT EXISTS instrument_images (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    instrumentid INT UNSIGNED NOT NULL,
    filepath     VARCHAR(255) NOT NULL,
    alttext      VARCHAR(255) NULL,
    mimetype     VARCHAR(100) NOT NULL,
    width        INT NULL,
    height       INT NULL,
    filesize     INT NULL,
    CONSTRAINT fk_instrument_images_instrument
        FOREIGN KEY (instrumentid) REFERENCES instruments(id)
        ON DELETE CASCADE
) ENGINE=InnoDB, AUTO_INCREMENT = 30000;

-- @postgres
CREATE TABLE IF NOT EXISTS instrument_images (
    id           SERIAL PRIMARY KEY,
    instrumentid INT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    filepath     VARCHAR(255) NOT NULL,
    alttext      VARCHAR(255),
    mimetype     VARCHAR(100) NOT NULL,
    width        INT,
    height       INT,
    filesize     INT
);

-- @mysql
CREATE TABLE IF NOT EXISTS users (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username           VARCHAR(255) NOT NULL,
    password_hash      VARCHAR(512) NOT NULL,
    refresh_token_hash VARCHAR(256) NULL,
    auth_type          VARCHAR(16)  NULL,
    group_id           INT UNSIGNED NULL,
    display_name       VARCHAR(255) NOT NULL,
    last_login    TIMESTAMP    NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS users (
    id                 SERIAL PRIMARY KEY,
    username           VARCHAR(255) NOT NULL UNIQUE,
    password_hash      VARCHAR(512) NOT NULL,
    refresh_token_hash VARCHAR(256),
    auth_type          VARCHAR(16),
    group_id           INT,
    display_name       VARCHAR(255) NOT NULL,
    last_login         TIMESTAMP,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- @mysql
CREATE TABLE IF NOT EXISTS login_audit (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED NOT NULL,
    event      ENUM('login', 'group_login', 'refresh', 'logout') NOT NULL,
    group_id   INT UNSIGNED NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_audit_user_time (user_id, created_at),
    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS login_audit (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event      VARCHAR(16) NOT NULL CHECK (event IN ('login', 'group_login', 'refresh', 'logout')),
    group_id   INT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- @postgres
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON login_audit (user_id, created_at);

-- @mysql
CREATE TABLE IF NOT EXISTS `groups` (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(255) NOT NULL,
    description   TEXT NULL,
    color         VARCHAR(7)   NOT NULL DEFAULT '#808080',
    password_hash VARCHAR(512) NULL,
    admin_id      INT UNSIGNED NULL,
    last_login    TIMESTAMP    NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_groups_name (name),
    CONSTRAINT fk_groups_admin
        FOREIGN KEY (admin_id) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS groups (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    description   TEXT,
    color         VARCHAR(7)   NOT NULL DEFAULT '#808080',
    password_hash VARCHAR(512),
    admin_id      INT REFERENCES users(id) ON DELETE SET NULL,
    last_login    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- @mysql
CREATE TABLE IF NOT EXISTS user_groups (
    user_id  INT UNSIGNED NOT NULL,
    group_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, group_id),
    CONSTRAINT fk_user_groups_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_groups_group
        FOREIGN KEY (group_id) REFERENCES `groups`(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS user_groups (
    user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

-- @mysql
CREATE TABLE IF NOT EXISTS permissions (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    entity_type VARCHAR(32)  NOT NULL,
    entity_id   INT UNSIGNED NULL,
    owner_id    INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_permissions_entity (entity_type, entity_id),
    CONSTRAINT fk_permissions_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL PRIMARY KEY,
    entity_type VARCHAR(32)  NOT NULL,
    entity_id   INT NULL,
    owner_id    INT NULL REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (entity_type, entity_id)
);

-- @mysql
CREATE TABLE IF NOT EXISTS entity_groups (
    entity_type VARCHAR(32)  NOT NULL,
    entity_id   INT UNSIGNED NOT NULL,
    group_id    INT UNSIGNED NOT NULL,
    writable    TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_type, entity_id, group_id),
    CONSTRAINT fk_entity_groups_group
        FOREIGN KEY (group_id) REFERENCES `groups`(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS entity_groups (
    entity_type VARCHAR(32)  NOT NULL,
    entity_id   INT NOT NULL,
    group_id    INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    writable    BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (entity_type, entity_id, group_id)
);

-- @mysql
CREATE TABLE IF NOT EXISTS features (
    `key`   VARCHAR(255) NOT NULL PRIMARY KEY,
    value TEXT         NOT NULL
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS features (
    key   VARCHAR(255) NOT NULL PRIMARY KEY,
    value TEXT         NOT NULL
);

-- @mysql
CREATE TABLE IF NOT EXISTS migration_history (
    filename    VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum    VARCHAR(64)  NOT NULL
) ENGINE=InnoDB;

-- @postgres
CREATE TABLE IF NOT EXISTS migration_history (
    filename    VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum    VARCHAR(64)  NOT NULL
);

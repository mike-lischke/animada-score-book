-- Baseline schema for Animada Score Book
-- Contains the full initial database schema and the migration_history tracking table.
-- Later migrations were squashed into this file; every new change gets its own timestamped file.

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

CREATE TABLE IF NOT EXISTS instruments (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    imageurl      VARCHAR(512),
    articulations JSON NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB, AUTO_INCREMENT = 20000;

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

CREATE TABLE IF NOT EXISTS users (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email              VARCHAR(255) NOT NULL,
    password_hash      VARCHAR(512) NOT NULL,
    email_verified     TINYINT(1)   NOT NULL DEFAULT 0,
    email_verified_at  TIMESTAMP    NULL,
    refresh_token_hash VARCHAR(256) NULL,
    auth_type          VARCHAR(16)  NULL,
    group_id           INT UNSIGNED NULL,
    display_name       VARCHAR(255) NOT NULL,
    last_login    TIMESTAMP    NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_verifications (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255) NOT NULL,
    token_hash    VARCHAR(64)  NOT NULL,
    purpose       VARCHAR(16)  NOT NULL,
    password_hash VARCHAR(512) NULL,
    display_name  VARCHAR(255) NULL,
    group_name    VARCHAR(255) NULL,
    site_origin   VARCHAR(255) NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_email_verifications_token (token_hash),
    UNIQUE KEY uk_email_verifications_email (email)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS features (
    `key`   VARCHAR(255) NOT NULL PRIMARY KEY,
    value TEXT         NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS migration_history (
    filename    VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum    VARCHAR(64)  NOT NULL
) ENGINE=InnoDB;

-- Squashed from 20260806T160000_add_score_locks.sql.
-- Locks a score to a single user while it is being edited.
CREATE TABLE IF NOT EXISTS score_locks (
    score_id   INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    email      VARCHAR(255) NOT NULL,
    lock_token VARCHAR(64)  NOT NULL,
    locked_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (score_id),
    CONSTRAINT fk_score_locks_score
        FOREIGN KEY (score_id) REFERENCES scores(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_score_locks_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- Squashed from 20261101T113400_downgrade_world_write_grants.sql.
-- The World group is read-only by definition. A fresh schema has no such grants; the statement corrects
-- whatever an installation stored before the backend enforced the rule.
UPDATE entity_groups eg
    JOIN `groups` g ON eg.group_id = g.id
SET eg.writable = 0
WHERE g.name = 'World' AND eg.writable = 1;

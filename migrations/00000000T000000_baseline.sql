-- Baseline schema for Animada Score Book
-- Contains the full initial database schema and the migration_history tracking table.
-- The baseline describes the schema of the running version: a schema change is made here instead of in a migration
-- of its own, and an existing database is rebuilt from it rather than converted.
--
-- Every table is utf8mb4, so a VARCHAR(n) holds n characters rather than n bytes and names like "Agogô" or an
-- instrument symbol survive any server default. utf8mb4_unicode_ci is the collation MySQL and MariaDB share
-- (ADR-0022), and its case-insensitive comparison is what makes "Caixa" and "caixa" the same tag name.

CREATE TABLE IF NOT EXISTS scores (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name     VARCHAR(255) NOT NULL,
    content  MEDIUMTEXT    NOT NULL,
    notes    TEXT          NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB, AUTO_INCREMENT = 10000, DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instruments (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    imageurl      VARCHAR(512),
    articulations JSON NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB, AUTO_INCREMENT = 20000, DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB, AUTO_INCREMENT = 30000, DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The group colour is a palette index too.
CREATE TABLE IF NOT EXISTS `groups` (
    id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    name          VARCHAR(255)     NOT NULL,
    description   TEXT             NULL,
    color_index   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    password_hash VARCHAR(512)     NULL,
    admin_id      INT UNSIGNED     NULL,
    last_login    TIMESTAMP        NULL,
    created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_groups_name (name),
    CONSTRAINT fk_groups_admin
        FOREIGN KEY (admin_id) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS entity_groups (
    entity_type VARCHAR(32)  NOT NULL,
    entity_id   INT UNSIGNED NOT NULL,
    group_id    INT UNSIGNED NOT NULL,
    writable    TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (entity_type, entity_id, group_id),
    CONSTRAINT fk_entity_groups_group
        FOREIGN KEY (group_id) REFERENCES `groups`(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A tag belongs either to a group or - with a NULL group_id - to the administrators (a global tag).
-- The generated owner_scope makes the name unique per owner, which a unique key over the nullable group_id
-- would not do for the global tags.
-- The column holds 100 characters while the backend accepts 64: the headroom keeps a name storable when the limit
-- itself grows or when a name arrives from a source that was not checked.
-- color_index points into the fixed palette of src/core/TagPalette.ts.
CREATE TABLE IF NOT EXISTS tags (
    id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)     NOT NULL,
    color_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
    group_id    INT UNSIGNED     NULL,
    owner_scope INT UNSIGNED AS (IFNULL(group_id, 0)) STORED,
    system_key  VARCHAR(32)      NULL,
    created_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tags_owner_name (owner_scope, name),
    UNIQUE KEY uk_tags_system_key (system_key),
    INDEX idx_tags_group (group_id),
    CONSTRAINT fk_tags_group
        FOREIGN KEY (group_id) REFERENCES `groups`(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS score_tags (
    score_id INT UNSIGNED NOT NULL,
    tag_id   INT UNSIGNED NOT NULL,
    PRIMARY KEY (score_id, tag_id),
    INDEX idx_score_tags_tag (tag_id),
    CONSTRAINT fk_score_tags_score
        FOREIGN KEY (score_id) REFERENCES scores(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_score_tags_tag
        FOREIGN KEY (tag_id) REFERENCES tags(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A set list is a named, saved tag combination with its own score order. Scores are not copied into it, only
-- referenced, and the order belongs to the list, not to the score. Access follows the score model: the rows live in
-- permissions and entity_groups under the entity type 'setlist'.
-- filters holds the combination as [ [tagId, ...], ... ]: each inner array is an AND group, the array of groups is
-- OR-ed, and an empty array matches every readable score. A tag that is deleted later leaves the stored id in place:
-- the backend reports the list as invalid instead of dropping a condition.
CREATE TABLE IF NOT EXISTS set_lists (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name       VARCHAR(255) NOT NULL,
    filters    JSON         NOT NULL,
    revision   INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The score order of one list. A row stays when its score stops matching the filter, so that a returning score keeps
-- its place. Both foreign keys clean up after a deleted list or score.
CREATE TABLE IF NOT EXISTS set_list_scores (
    set_list_id INT UNSIGNED NOT NULL,
    score_id    INT UNSIGNED NOT NULL,
    position    INT UNSIGNED NOT NULL,
    PRIMARY KEY (set_list_id, score_id),
    INDEX idx_set_list_scores_order (set_list_id, position),
    CONSTRAINT fk_set_list_scores_list
        FOREIGN KEY (set_list_id) REFERENCES set_lists(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_set_list_scores_score
        FOREIGN KEY (score_id) REFERENCES scores(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System tags: one per instrument type plus the demo catalog marker. Code finds them by system_key, never by name
-- or id, because an administrator may rename them.
-- An instrument tag wears the colour of its InstrumentRole: GroundRhythm (2 = dark-teal), Carpet (0 = flag-red),
-- Voice (1 = vivid-tangerine), HandRhythm (9 = fern). Effect (4 = golden-orange) and Accompaniment (5 = burnt-caramel)
-- have no instrument type yet. The demo tag is dark-cyan (3).
INSERT INTO tags (name, color_index, system_key) VALUES
    ('Agogô 2-Bell', 1, 'instrument:0'),
    ('Agogô 4-Bell', 1, 'instrument:a'),
    ('Chocalho', 1, 'instrument:1'),
    ('Tamborim', 1, 'instrument:2'),
    ('Repinique', 0, 'instrument:3'),
    ('Repinique (Whippy Sticks)', 0, 'instrument:4'),
    ('Caixa', 0, 'instrument:5'),
    ('Timbau', 9, 'instrument:6'),
    ('Surdo Terceira', 2, 'instrument:7'),
    ('Surdo Segunda', 2, 'instrument:8'),
    ('Surdo Primeira', 2, 'instrument:9'),
    ('Demo Score', 3, 'demo');

CREATE TABLE IF NOT EXISTS features (
    `key`   VARCHAR(255) NOT NULL PRIMARY KEY,
    value TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS migration_history (
    filename    VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum    VARCHAR(64)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Squashed from 20261101T113400_downgrade_world_write_grants.sql.
-- The World group is read-only by definition. A fresh schema has no such grants; the statement corrects
-- whatever an installation stored before the backend enforced the rule.
UPDATE entity_groups eg
    JOIN `groups` g ON eg.group_id = g.id
SET eg.writable = 0
WHERE g.name = 'World' AND eg.writable = 1;

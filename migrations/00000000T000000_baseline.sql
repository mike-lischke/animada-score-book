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

-- A tag is owned either by a user or by a group; the two columns exclude each other and both stay NULL only for a
-- system tag, which code finds by its system_key instead of a name or an id. The owners are foreign keys, so a
-- deleted user or group takes the tags it owns with it.
-- The name is unique per owner, and the two scope columns are what makes that work: MySQL and MariaDB treat NULLs
-- in a unique key as distinct, so a name would not collide for a tag without an owner. They mirror the owner
-- columns as plain numbers (0 for no owner) and are written together with them, because MySQL refuses a foreign
-- key on a column that a stored generated column depends on.
-- A member of the owning group inherits every right the group has on the tag, so a group-owned tag is the vocabulary
-- of that group. Sharing a tag with further groups lives in entity_groups under the entity type 'tag' and grants
-- reading only.
-- The column holds 100 characters while the backend accepts 64: the headroom keeps a name storable when the limit
-- itself grows or when a name arrives from a source that was not checked.
-- color_index points into the fixed palette of src/core/TagPalette.ts.
-- A set-list tag is referenced from set_lists.tag_id and carries the user who created the list as its owner: a list
-- and its tag are private until they are shared, and the list's own grants decide who reaches them.
CREATE TABLE IF NOT EXISTS tags (
    id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    name             VARCHAR(100)     NOT NULL,
    color_index      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    system_key       VARCHAR(32)      NULL,
    owner_user_id    INT UNSIGNED     NULL,
    owner_group_id   INT UNSIGNED     NULL,
    name_user_scope  INT UNSIGNED     NOT NULL DEFAULT 0,
    name_group_scope INT UNSIGNED     NOT NULL DEFAULT 0,
    created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tags_name_owner (name, name_user_scope, name_group_scope),
    UNIQUE KEY uk_tags_system_key (system_key),
    INDEX idx_tags_owner_user (owner_user_id),
    INDEX idx_tags_owner_group (owner_group_id),
    CONSTRAINT fk_tags_owner_user
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_tags_owner_group
        FOREIGN KEY (owner_group_id) REFERENCES `groups`(id) ON DELETE CASCADE
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

-- A set list is defined by exactly one tag of the same name: a score belongs to the list when that tag is assigned
-- to it. The tag carries the name and the owner scope - a global tag for the administrators, a group tag for the
-- group whose administrator created the list - so renaming one renames the other and deleting the tag deletes the
-- list. Sharing with further groups lives in entity_groups under the entity type 'setlist' and is always read-only.
CREATE TABLE IF NOT EXISTS set_lists (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tag_id     INT UNSIGNED NOT NULL,
    revision   INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_set_lists_tag (tag_id),
    CONSTRAINT fk_set_lists_tag
        FOREIGN KEY (tag_id) REFERENCES tags(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The saved score order of one list. Membership is the tag assignment, so a row only exists while the score carries
-- the list's tag; the backend deletes it when the tag comes off and appends a new row when it goes back on.
-- The note and the icon belong to the entry, not to the score: the same score may be described differently in two
-- lists. `icon` holds a key of the icon catalogue, so the UI is the only place that knows its appearance.
-- Both foreign keys clean up after a deleted list or score.
CREATE TABLE IF NOT EXISTS set_list_scores (
    set_list_id INT UNSIGNED NOT NULL,
    score_id    INT UNSIGNED NOT NULL,
    position    INT UNSIGNED NOT NULL,
    note        VARCHAR(500) NULL,
    icon        VARCHAR(40) NULL,
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

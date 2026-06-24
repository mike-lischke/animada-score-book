USE <your_database_name>;

CREATE TABLE folders (
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

CREATE TABLE scores (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  folderid INT UNSIGNED NOT NULL,
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

CREATE TABLE instruments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  imageurl    VARCHAR(512),
  articulations JSON NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB, AUTO_INCREMENT = 20000;

CREATE TABLE instrument_images (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instrumentid   INT UNSIGNED NOT NULL,
  filepath       VARCHAR(255) NOT NULL,
  alttext        VARCHAR(255) NULL,
  mimetype       VARCHAR(100) NOT NULL,
  width          INT NULL,
  height         INT NULL,
  filesize       INT NULL,                -- Bytes
  CONSTRAINT fk_instrument_images_instrument
    FOREIGN KEY (instrumentid) REFERENCES instruments(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT AUTO_INCREMENT = 30000;

-- User management tables.

CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(255) NOT NULL,
  password_hash     VARCHAR(512) NOT NULL,
  refresh_token_hash VARCHAR(256) NULL,
  display_name      VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE `groups` (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT NULL,
  color       VARCHAR(7)   NOT NULL DEFAULT '#808080',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_groups_name (name)
) ENGINE=InnoDB;

CREATE TABLE user_groups (
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

CREATE TABLE permissions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(32)  NOT NULL,
  entity_id   INT UNSIGNED NULL,
  owner_id    INT UNSIGNED NULL,
  group_id    INT UNSIGNED NULL,
  perm_bits   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_permissions_entity (entity_type, entity_id),
  CONSTRAINT fk_permissions_owner
    FOREIGN KEY (owner_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_permissions_group
    FOREIGN KEY (group_id) REFERENCES `groups`(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

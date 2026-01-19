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
  filepath       VARCHAR(255) NOT NULL,  -- e.g. /uploads/instruments/abc123.webp
  alttext        VARCHAR(255) NULL,
  mimetype       VARCHAR(100) NOT NULL,
  width          INT NULL,
  height         INT NULL,
  filesize      INT NULL,                -- Bytes
  CONSTRAINT fk_instrument_images_instrument
    FOREIGN KEY (instrumentid) REFERENCES instruments(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT AUTO_INCREMENT = 30000;

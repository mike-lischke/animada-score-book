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

CREATE TABLE snippets (
  id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  folderid INT UNSIGNED NOT NULL,
  name     VARCHAR(255) NOT NULL,
  content  MEDIUMTEXT    NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_snippets_folder
    FOREIGN KEY (folderid)
    REFERENCES folders(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB, AUTO_INCREMENT = 10000;

CREATE TABLE instruments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  articulations JSON NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB, AUTO_INCREMENT = 20000;

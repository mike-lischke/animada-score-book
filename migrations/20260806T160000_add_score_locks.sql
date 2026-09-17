-- Adds score_locks table for collaborative editing.
-- Prevents concurrent edits by locking a score to a single user.

-- @mysql
CREATE TABLE IF NOT EXISTS score_locks (
    score_id   INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    username   VARCHAR(255) NOT NULL,
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

-- @postgres
CREATE TABLE IF NOT EXISTS score_locks (
    score_id   INT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username   VARCHAR(255) NOT NULL,
    lock_token VARCHAR(64)  NOT NULL,
    locked_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (score_id)
);

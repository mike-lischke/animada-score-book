-- The World group is read-only by definition. Write grants stored for it before the backend enforced
-- that rule are downgraded to read access.

-- @mysql
UPDATE entity_groups eg
    JOIN `groups` g ON eg.group_id = g.id
SET eg.writable = 0
WHERE g.name = 'World' AND eg.writable = 1;

-- @postgres
UPDATE entity_groups
SET writable = FALSE
WHERE writable = TRUE AND group_id IN (SELECT id FROM groups WHERE name = 'World');

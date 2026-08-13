-- A node gains the instant it was last modified. Unlike 0001 this is a plain
-- ALTER and not a table rebuild: the column carries a default, which is the one
-- way SQLite will accept a NOT NULL addition to a table that already has rows.
-- The default is a migration device and nothing more — every write names the
-- stamp — so the backfill below immediately spends it: a row that has never
-- been edited was last modified when it was written, and leaving it at the
-- epoch would have the panel claim the whole graph was touched in 1970.
ALTER TABLE `nodes` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `nodes` SET `updated_at` = `created_at` WHERE `updated_at` = 0;

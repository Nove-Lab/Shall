-- The attrs bag becomes the node's own columns. SQLite cannot add a NOT NULL
-- column without a default, so the table is rebuilt rather than altered in
-- place. A row written under the old shape has no short name and no name to
-- recover — the bag never held them — so it keeps its text as the content and
-- arrives with those two blank.
CREATE TABLE `__new_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`short_name` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_nodes`(`id`, `type`, `short_name`, `name`, `content`, `created_at`) SELECT `id`, `type`, '', '', `attrs`, `created_at` FROM `nodes`;
--> statement-breakpoint
DROP TABLE `nodes`;
--> statement-breakpoint
ALTER TABLE `__new_nodes` RENAME TO `nodes`;

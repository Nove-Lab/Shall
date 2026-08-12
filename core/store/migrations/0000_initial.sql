CREATE TABLE `edges` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`attrs` text NOT NULL,
	`created_at` integer NOT NULL
);

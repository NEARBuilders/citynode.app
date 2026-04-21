CREATE TABLE `key_value_store` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`near_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`account_id` text NOT NULL,
	`gateway_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_app_unique` ON `project_apps` (`project_id`,`account_id`,`gateway_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`organization_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_owner_slug_unique` ON `projects` (`owner_id`,`slug`);
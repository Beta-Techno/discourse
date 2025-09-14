-- Initial schema for Discourse AI
-- Created: 2024-01-01

CREATE TABLE IF NOT EXISTS `users` (
  `discord_id` varchar(32) NOT NULL PRIMARY KEY,
  `email` varchar(255) DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `runs` (
  `id` bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `discord_id` varchar(32) NOT NULL,
  `channel_id` varchar(32) NOT NULL,
  `thread_id` varchar(32) DEFAULT NULL,
  `prompt` text NOT NULL,
  `tools_used` json DEFAULT NULL,
  `status` enum('running','ok','blocked','error') NOT NULL,
  `error` text DEFAULT NULL,
  `latency_ms` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_runs_discord_id` (`discord_id`),
  INDEX `idx_runs_channel_id` (`channel_id`),
  INDEX `idx_runs_status` (`status`),
  INDEX `idx_runs_created_at` (`created_at`)
);

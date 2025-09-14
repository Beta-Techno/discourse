-- Initialize database for Discourse AI
-- This script runs when the MySQL container starts for the first time

-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS assistant;

-- Use the database
USE assistant;

-- Create users table
CREATE TABLE IF NOT EXISTS `users` (
  `discord_id` varchar(32) NOT NULL PRIMARY KEY,
  `email` varchar(255) DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Create runs table
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

-- Insert a test user (optional)
INSERT IGNORE INTO `users` (`discord_id`, `email`) VALUES ('test_user_123', 'test@example.com');

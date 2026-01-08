-- Add status_text field to users table for WhatsApp-like status
ALTER TABLE `users` 
ADD COLUMN `status_text` VARCHAR(139) NULL AFTER `status`;

-- Create user_status table for status messages (like WhatsApp Stories/Status)
CREATE TABLE IF NOT EXISTS `user_status` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `status_text` TEXT NULL,
  `status_image` TEXT NULL,
  `status_link` TEXT NULL,
  `status_type` enum('text','image','link','mixed') DEFAULT 'text',
  `expires_at` datetime NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `expires_at` (`expires_at`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `user_status_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Update existing table if it exists (for migrations)
ALTER TABLE `user_status` 
MODIFY COLUMN `status_text` TEXT NULL,
ADD COLUMN IF NOT EXISTS `status_link` TEXT NULL AFTER `status_image`,
MODIFY COLUMN `status_type` enum('text','image','link','mixed') DEFAULT 'text';

-- Create status_views table to track who viewed the status
CREATE TABLE IF NOT EXISTS `status_views` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `status_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `viewed_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_status_user` (`status_id`,`user_id`),
  KEY `status_id` (`status_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `status_views_ibfk_1` FOREIGN KEY (`status_id`) REFERENCES `user_status` (`id`) ON DELETE CASCADE,
  CONSTRAINT `status_views_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Create status_replies table for story replies
CREATE TABLE IF NOT EXISTS `status_replies` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `status_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `reply_text` TEXT NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `status_id` (`status_id`),
  KEY `user_id` (`user_id`),
  KEY `created_at` (`created_at`),
  CONSTRAINT `status_replies_ibfk_1` FOREIGN KEY (`status_id`) REFERENCES `user_status` (`id`) ON DELETE CASCADE,
  CONSTRAINT `status_replies_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

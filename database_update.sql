-- Add description and avatar fields to conversations table
ALTER TABLE `conversations` 
ADD COLUMN `description` TEXT NULL AFTER `title`,
ADD COLUMN `avatar` TEXT NULL AFTER `description`;

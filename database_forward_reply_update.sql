-- Database Update: Add Forward Feature Support
-- This script adds support for forwarding messages

ALTER TABLE `messages` 
ADD COLUMN `forwarded_from_message_id` bigint(20) DEFAULT NULL AFTER `reply_to`,
ADD COLUMN `forwarded_from_conversation_id` bigint(20) DEFAULT NULL AFTER `forwarded_from_message_id`;

-- Add indexes for better performance
ALTER TABLE `messages`
ADD KEY `idx_forwarded_from_msg` (`forwarded_from_message_id`),
ADD KEY `idx_forwarded_from_conv` (`forwarded_from_conversation_id`);

-- Add foreign key constraint
ALTER TABLE `messages`
ADD CONSTRAINT `messages_ibfk_4` FOREIGN KEY (`forwarded_from_message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
ADD CONSTRAINT `messages_ibfk_5` FOREIGN KEY (`forwarded_from_conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL;

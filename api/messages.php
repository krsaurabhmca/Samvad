<?php
require_once __DIR__ . '/../includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        getMessages();
        break;
    case 'send':
        sendMessage();
        break;
    case 'forward':
        forwardMessage();
        break;
    case 'mark_read':
        markAsRead();
        break;
    case 'mark_conversation_read':
        markConversationAsRead();
        break;
    default:
        sendJSON(['error' => 'Invalid action'], 400);
}

function getMessages() {
    global $conn, $user;
    
    $conversation_id = (int)($_GET['conversation_id'] ?? 0);
    $page = (int)($_GET['page'] ?? 1);
    $limit = 50;
    $offset = ($page - 1) * $limit;
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    // Check if user is member
    $check = mysqli_query($conn, "SELECT * FROM conversation_members WHERE conversation_id = $conversation_id AND user_id = {$user['id']}");
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Access denied'], 403);
    }
    
    // Check if forwarded columns exist (they may not if database update hasn't been run)
    $columns_check = @mysqli_query($conn, "SHOW COLUMNS FROM messages LIKE 'forwarded_from_message_id'");
    $has_forwarded_columns = $columns_check && mysqli_num_rows($columns_check) > 0;
    
    $forwarded_fields = $has_forwarded_columns ? 
        ", m.forwarded_from_message_id, m.forwarded_from_conversation_id" : 
        ", NULL as forwarded_from_message_id, NULL as forwarded_from_conversation_id";
    
    // Check if message_stars table exists
    $stars_check = @mysqli_query($conn, "SHOW TABLES LIKE 'message_stars'");
    $has_stars_table = $stars_check && mysqli_num_rows($stars_check) > 0;
    $stars_field = $has_stars_table ? 
        ", (SELECT COUNT(*) FROM message_stars ms WHERE ms.message_id = m.id AND ms.user_id = {$user['id']}) as is_starred" : 
        ", 0 as is_starred";
    
    $query = "SELECT m.*, u.name as sender_name, 
              COALESCE(NULLIF(u.avatar, ''), 'assets/images/default-avatar.png') as sender_avatar,
              (SELECT message FROM messages WHERE id = m.reply_to LIMIT 1) as reply_message,
              (SELECT sender_id FROM messages WHERE id = m.reply_to LIMIT 1) as reply_sender_id,
              (SELECT name FROM users WHERE id = (SELECT sender_id FROM messages WHERE id = m.reply_to LIMIT 1) LIMIT 1) as reply_sender_name
              $forwarded_fields
              $stars_field
              FROM messages m
              INNER JOIN users u ON m.sender_id = u.id
              WHERE m.conversation_id = $conversation_id
              ORDER BY m.created_at DESC
              LIMIT $limit OFFSET $offset";
    
    $result = @mysqli_query($conn, $query);
    
    if (!$result) {
        $error = mysqli_error($conn);
        // If error is due to missing columns, try without them
        if (strpos($error, 'forwarded_from') !== false) {
            $query = "SELECT m.*, u.name as sender_name, 
                      COALESCE(NULLIF(u.avatar, ''), 'assets/images/default-avatar.png') as sender_avatar,
                      (SELECT message FROM messages WHERE id = m.reply_to LIMIT 1) as reply_message,
                      (SELECT sender_id FROM messages WHERE id = m.reply_to LIMIT 1) as reply_sender_id,
                      (SELECT name FROM users WHERE id = (SELECT sender_id FROM messages WHERE id = m.reply_to LIMIT 1) LIMIT 1) as reply_sender_name,
                      NULL as forwarded_from_message_id, NULL as forwarded_from_conversation_id
                      FROM messages m
                      INNER JOIN users u ON m.sender_id = u.id
                      WHERE m.conversation_id = $conversation_id
                      ORDER BY m.created_at DESC
                      LIMIT $limit OFFSET $offset";
            $result = mysqli_query($conn, $query);
        }
        
        if (!$result) {
            sendJSON(['error' => 'Database query failed: ' . mysqli_error($conn)], 500);
            return;
        }
    }
    
    $messages = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Ensure avatar URL is properly formatted
        if (!empty($row['sender_avatar'])) {
            // If it's not a full URL, make it relative to base
            if (strpos($row['sender_avatar'], 'http') !== 0) {
                if (strpos($row['sender_avatar'], 'uploads/') === 0) {
                    $row['sender_avatar'] = BASE_URL . '/' . $row['sender_avatar'];
                } elseif (strpos($row['sender_avatar'], 'assets/') === 0) {
                    $row['sender_avatar'] = BASE_URL . '/' . $row['sender_avatar'];
                } else {
                    $row['sender_avatar'] = BASE_URL . '/' . ltrim($row['sender_avatar'], '/');
                }
            }
        } else {
            $row['sender_avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        // Get attachments
        $attachments_query = "SELECT * FROM attachments WHERE message_id = {$row['id']}";
        $attachments_result = mysqli_query($conn, $attachments_query);
        $row['attachments'] = [];
        while ($attachment = mysqli_fetch_assoc($attachments_result)) {
            $row['attachments'][] = $attachment;
        }
        
        // Get message status for sent messages
        if ($row['sender_id'] == $user['id']) {
            $status_query = "SELECT status, COUNT(*) as count FROM message_status 
                            WHERE message_id = {$row['id']} 
                            GROUP BY status";
            $status_result = mysqli_query($conn, $status_query);
            $statuses = [];
            while ($status = mysqli_fetch_assoc($status_result)) {
                $statuses[$status['status']] = (int)$status['count'];
            }
            
            // Determine overall status: sent < delivered < read
            if (isset($statuses['read']) && $statuses['read'] > 0) {
                $row['message_status'] = 'read';
            } elseif (isset($statuses['delivered']) && $statuses['delivered'] > 0) {
                $row['message_status'] = 'delivered';
            } else {
                $row['message_status'] = 'sent';
            }
        } else {
            // For received messages, check if current user has read it
            $read_query = "SELECT status FROM message_status 
                          WHERE message_id = {$row['id']} AND user_id = {$user['id']}";
            $read_result = mysqli_query($conn, $read_query);
            if ($read_row = mysqli_fetch_assoc($read_result)) {
                $row['is_read_by_me'] = ($read_row['status'] == 'read');
            } else {
                $row['is_read_by_me'] = false;
            }
        }
        
        $messages[] = $row;
    }
    
    $messages = array_reverse($messages);
    
    sendJSON(['success' => true, 'messages' => $messages, 'page' => $page]);
}

function sendMessage() {
    global $conn, $user;
    
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    $message = escape($conn, $_POST['message'] ?? '');
    $message_type = escape($conn, $_POST['message_type'] ?? 'text');
    $reply_to = !empty($_POST['reply_to']) ? (int)$_POST['reply_to'] : null;
    
    // Check if forwarded columns exist before trying to use them
    $columns_check = @mysqli_query($conn, "SHOW COLUMNS FROM messages LIKE 'forwarded_from_message_id'");
    $has_forwarded_columns = $columns_check && mysqli_num_rows($columns_check) > 0;
    $forwarded_from_message_id = $has_forwarded_columns && !empty($_POST['forwarded_from_message_id']) ? (int)$_POST['forwarded_from_message_id'] : null;
    $forwarded_from_conversation_id = $has_forwarded_columns && !empty($_POST['forwarded_from_conversation_id']) ? (int)$_POST['forwarded_from_conversation_id'] : null;
    
    $attachments = json_decode($_POST['attachments'] ?? '[]', true);
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    if (empty($message) && $message_type == 'text' && empty($attachments)) {
        sendJSON(['error' => 'Message or attachment is required'], 400);
    }
    
    // If attachments exist, determine message type from first attachment
    if (!empty($attachments) && $message_type == 'text') {
        $message_type = $attachments[0]['file_type'] ?? 'file';
    }
    
    // Check if user is member
    $check = mysqli_query($conn, "SELECT * FROM conversation_members WHERE conversation_id = $conversation_id AND user_id = {$user['id']}");
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Access denied'], 403);
    }
    
    $uuid = generateUUID();
    $reply_to_sql = $reply_to ? $reply_to : 'NULL';
    
    // Check if forwarded columns exist
    $columns_check = @mysqli_query($conn, "SHOW COLUMNS FROM messages LIKE 'forwarded_from_message_id'");
    $has_forwarded_columns = $columns_check && mysqli_num_rows($columns_check) > 0;
    
    if ($has_forwarded_columns && ($forwarded_from_message_id || $forwarded_from_conversation_id)) {
        $forwarded_from_message_id_sql = $forwarded_from_message_id ? $forwarded_from_message_id : 'NULL';
        $forwarded_from_conversation_id_sql = $forwarded_from_conversation_id ? $forwarded_from_conversation_id : 'NULL';
        $query = "INSERT INTO messages (uuid, conversation_id, sender_id, message_type, message, reply_to, forwarded_from_message_id, forwarded_from_conversation_id) 
                  VALUES ('$uuid', $conversation_id, {$user['id']}, '$message_type', '$message', $reply_to_sql, $forwarded_from_message_id_sql, $forwarded_from_conversation_id_sql)";
    } else {
        // Fallback if columns don't exist yet
        $query = "INSERT INTO messages (uuid, conversation_id, sender_id, message_type, message, reply_to) 
                  VALUES ('$uuid', $conversation_id, {$user['id']}, '$message_type', '$message', $reply_to_sql)";
    }
    
    if (mysqli_query($conn, $query)) {
        $message_id = mysqli_insert_id($conn);
        
        // Get all members except sender
        $members_query = "SELECT user_id FROM conversation_members WHERE conversation_id = $conversation_id AND user_id != {$user['id']}";
        $members_result = mysqli_query($conn, $members_query);
        
        // Create message status for each member (initially 'sent')
        while ($member = mysqli_fetch_assoc($members_result)) {
            $status_query = "INSERT INTO message_status (message_id, user_id, status) 
                           VALUES ($message_id, {$member['user_id']}, 'sent')";
            mysqli_query($conn, $status_query);
        }
        
        // Get the created message with status
        $msg_query = "SELECT m.*, u.name as sender_name, 
                     COALESCE(NULLIF(u.avatar, ''), 'assets/images/default-avatar.png') as sender_avatar 
                     FROM messages m
                     INNER JOIN users u ON m.sender_id = u.id
                     WHERE m.id = $message_id";
        $msg_result = mysqli_query($conn, $msg_query);
        $new_message = mysqli_fetch_assoc($msg_result);
        
        // Ensure avatar URL is properly formatted
        if (!empty($new_message['sender_avatar'])) {
            if (strpos($new_message['sender_avatar'], 'http') !== 0) {
                if (strpos($new_message['sender_avatar'], 'uploads/') === 0) {
                    $new_message['sender_avatar'] = BASE_URL . '/' . $new_message['sender_avatar'];
                } elseif (strpos($new_message['sender_avatar'], 'assets/') === 0) {
                    $new_message['sender_avatar'] = BASE_URL . '/' . $new_message['sender_avatar'];
                } else {
                    $new_message['sender_avatar'] = BASE_URL . '/' . ltrim($new_message['sender_avatar'], '/');
                }
            }
        } else {
            $new_message['sender_avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        // Get message status
        $status_query = "SELECT status, COUNT(*) as count FROM message_status 
                        WHERE message_id = $message_id 
                        GROUP BY status";
        $status_result = mysqli_query($conn, $status_query);
        $statuses = [];
        while ($status = mysqli_fetch_assoc($status_result)) {
            $statuses[$status['status']] = (int)$status['count'];
        }
        
        // Determine overall status
        if (isset($statuses['read']) && $statuses['read'] > 0) {
            $new_message['message_status'] = 'read';
        } elseif (isset($statuses['delivered']) && $statuses['delivered'] > 0) {
            $new_message['message_status'] = 'delivered';
        } else {
            $new_message['message_status'] = 'sent';
        }
        
        // Save attachments
        if (!empty($attachments)) {
            foreach ($attachments as $attachment) {
                $file_name = escape($conn, $attachment['file_name'] ?? '');
                $file_type = escape($conn, $attachment['file_type'] ?? 'file');
                $file_size = (int)($attachment['file_size'] ?? 0);
                $file_url = escape($conn, $attachment['file_url'] ?? '');
                
                $attach_query = "INSERT INTO attachments (message_id, file_name, file_type, file_size, file_url) 
                                VALUES ($message_id, '$file_name', '$file_type', $file_size, '$file_url')";
                mysqli_query($conn, $attach_query);
            }
            
            // Get attachments for response
            $attachments_query = "SELECT * FROM attachments WHERE message_id = $message_id";
            $attachments_result = mysqli_query($conn, $attachments_query);
            $new_message['attachments'] = [];
            while ($attachment = mysqli_fetch_assoc($attachments_result)) {
                // Add mime_type from original upload if available
                foreach ($attachments as $orig_att) {
                    if ($orig_att['file_url'] == $attachment['file_url']) {
                        $attachment['mime_type'] = $orig_att['mime_type'] ?? '';
                        break;
                    }
                }
                $new_message['attachments'][] = $attachment;
            }
        } else {
            $new_message['attachments'] = [];
        }
        
        sendJSON(['success' => true, 'message' => $new_message]);
    } else {
        sendJSON(['error' => 'Failed to send message'], 500);
    }
}

function markAsRead() {
    global $conn, $user;
    
    $message_id = (int)($_POST['message_id'] ?? 0);
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    
    if (!$message_id) {
        sendJSON(['error' => 'Message ID required'], 400);
    }
    
    // Update status to 'read'
    $query = "UPDATE message_status SET status = 'read', updated_at = NOW() 
              WHERE message_id = $message_id AND user_id = {$user['id']}";
    
    if (mysqli_query($conn, $query)) {
        // Get message sender to notify via WebSocket
        $msg_query = "SELECT sender_id FROM messages WHERE id = $message_id";
        $msg_result = mysqli_query($conn, $msg_query);
        
        if ($msg_row = mysqli_fetch_assoc($msg_result)) {
            $sender_id = $msg_row['sender_id'];
            
            // Send read receipt via WebSocket if available
            // This will be handled by the WebSocket server
            
            sendJSON([
                'success' => true, 
                'sender_id' => $sender_id,
                'message_id' => $message_id
            ]);
        } else {
            sendJSON(['success' => true]);
        }
    } else {
        sendJSON(['error' => 'Failed to update status'], 500);
    }
}

// Forward message to another conversation
function forwardMessage() {
    global $conn, $user;
    
    $message_id = (int)($_POST['message_id'] ?? 0);
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    
    if (!$message_id || !$conversation_id) {
        sendJSON(['error' => 'Message ID and Conversation ID required'], 400);
    }
    
    // Check if user has access to the original message
    $check_original = mysqli_query($conn, "SELECT m.* FROM messages m 
                                           INNER JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
                                           WHERE m.id = $message_id AND cm.user_id = {$user['id']}");
    
    if (mysqli_num_rows($check_original) == 0) {
        sendJSON(['error' => 'Access denied to original message'], 403);
    }
    
    $original_message = mysqli_fetch_assoc($check_original);
    
    // Check if user is member of target conversation
    $check_target = mysqli_query($conn, "SELECT * FROM conversation_members WHERE conversation_id = $conversation_id AND user_id = {$user['id']}");
    if (mysqli_num_rows($check_target) == 0) {
        sendJSON(['error' => 'Access denied to target conversation'], 403);
    }
    
    // Create forwarded message
    $uuid = generateUUID();
    $forwarded_from_message_id = $original_message['id'];
    $forwarded_from_conversation_id = $original_message['conversation_id'];
    $message = escape($conn, $original_message['message'] ?? '');
    $message_type = escape($conn, $original_message['message_type'] ?? 'text');
    
    $query = "INSERT INTO messages (uuid, conversation_id, sender_id, message_type, message, forwarded_from_message_id, forwarded_from_conversation_id) 
              VALUES ('$uuid', $conversation_id, {$user['id']}, '$message_type', '$message', $forwarded_from_message_id, $forwarded_from_conversation_id)";
    
    if (mysqli_query($conn, $query)) {
        $new_message_id = mysqli_insert_id($conn);
        
        // Copy attachments if any
        $attachments_query = "SELECT * FROM attachments WHERE message_id = $message_id";
        $attachments_result = mysqli_query($conn, $attachments_query);
        
        while ($attachment = mysqli_fetch_assoc($attachments_result)) {
            $file_name = escape($conn, $attachment['file_name'] ?? '');
            $file_type = escape($conn, $attachment['file_type'] ?? 'file');
            $file_size = (int)($attachment['file_size'] ?? 0);
            $file_url = escape($conn, $attachment['file_url'] ?? '');
            
            $attach_query = "INSERT INTO attachments (message_id, file_name, file_type, file_size, file_url) 
                           VALUES ($new_message_id, '$file_name', '$file_type', $file_size, '$file_url')";
            mysqli_query($conn, $attach_query);
        }
        
        // Get all members except sender
        $members_query = "SELECT user_id FROM conversation_members WHERE conversation_id = $conversation_id AND user_id != {$user['id']}";
        $members_result = mysqli_query($conn, $members_query);
        
        // Create message status for each member
        while ($member = mysqli_fetch_assoc($members_result)) {
            $status_query = "INSERT INTO message_status (message_id, user_id, status) 
                           VALUES ($new_message_id, {$member['user_id']}, 'sent')";
            mysqli_query($conn, $status_query);
        }
        
        // Get the created message
        $msg_query = "SELECT m.*, u.name as sender_name, 
                     COALESCE(NULLIF(u.avatar, ''), 'assets/images/default-avatar.png') as sender_avatar 
                     FROM messages m
                     INNER JOIN users u ON m.sender_id = u.id
                     WHERE m.id = $new_message_id";
        $msg_result = mysqli_query($conn, $msg_query);
        $new_message = mysqli_fetch_assoc($msg_result);
        
        // Format avatar URL
        if (!empty($new_message['sender_avatar'])) {
            if (strpos($new_message['sender_avatar'], 'http') !== 0) {
                if (strpos($new_message['sender_avatar'], 'uploads/') === 0) {
                    $new_message['sender_avatar'] = BASE_URL . '/' . $new_message['sender_avatar'];
                } elseif (strpos($new_message['sender_avatar'], 'assets/') === 0) {
                    $new_message['sender_avatar'] = BASE_URL . '/' . $new_message['sender_avatar'];
                } else {
                    $new_message['sender_avatar'] = BASE_URL . '/' . ltrim($new_message['sender_avatar'], '/');
                }
            }
        } else {
            $new_message['sender_avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        // Get attachments
        $attachments_query = "SELECT * FROM attachments WHERE message_id = $new_message_id";
        $attachments_result = mysqli_query($conn, $attachments_query);
        $new_message['attachments'] = [];
        while ($attachment = mysqli_fetch_assoc($attachments_result)) {
            $new_message['attachments'][] = $attachment;
        }
        
        // Get message status
        $status_query = "SELECT status, COUNT(*) as count FROM message_status 
                        WHERE message_id = $new_message_id 
                        GROUP BY status";
        $status_result = mysqli_query($conn, $status_query);
        $statuses = [];
        while ($status = mysqli_fetch_assoc($status_result)) {
            $statuses[$status['status']] = (int)$status['count'];
        }
        
        // Determine overall status
        if (isset($statuses['read']) && $statuses['read'] > 0) {
            $new_message['message_status'] = 'read';
        } elseif (isset($statuses['delivered']) && $statuses['delivered'] > 0) {
            $new_message['message_status'] = 'delivered';
        } else {
            $new_message['message_status'] = 'sent';
        }
        
        $new_message['forwarded_from_message_id'] = $forwarded_from_message_id;
        $new_message['forwarded_from_conversation_id'] = $forwarded_from_conversation_id;
        
        sendJSON(['success' => true, 'message' => $new_message]);
    } else {
        sendJSON(['error' => 'Failed to forward message'], 500);
    }
}

// Mark all messages in conversation as read
function markConversationAsRead() {
    global $conn, $user;
    
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    // Mark all unread messages in this conversation as read
    $query = "UPDATE message_status ms
              INNER JOIN messages m ON ms.message_id = m.id
              SET ms.status = 'read', ms.updated_at = NOW()
              WHERE m.conversation_id = $conversation_id 
              AND ms.user_id = {$user['id']}
              AND ms.status != 'read'
              AND m.sender_id != {$user['id']}";
    
    if (mysqli_query($conn, $query)) {
        sendJSON(['success' => true, 'updated' => mysqli_affected_rows($conn)]);
    } else {
        sendJSON(['error' => 'Failed to update status'], 500);
    }
}

function deleteMessage() {
    global $conn, $user;
    
    $message_id = (int)($_POST['message_id'] ?? 0);
    
    if (!$message_id) {
        sendJSON(['error' => 'Message ID required'], 400);
        return;
    }
    
    // Get message to verify ownership
    $check_query = "SELECT m.*, c.id as conversation_id 
                    FROM messages m
                    INNER JOIN conversations c ON m.conversation_id = c.id
                    WHERE m.id = $message_id";
    $check_result = mysqli_query($conn, $check_query);
    
    if (!$check_result || mysqli_num_rows($check_result) == 0) {
        sendJSON(['error' => 'Message not found'], 404);
        return;
    }
    
    $message = mysqli_fetch_assoc($check_result);
    
    // Only sender can delete their own message
    if ($message['sender_id'] != $user['id']) {
        sendJSON(['error' => 'You can only delete your own messages'], 403);
        return;
    }
    
    // Delete attachments first
    $attachments_query = "SELECT file_url FROM attachments WHERE message_id = $message_id";
    $attachments_result = mysqli_query($conn, $attachments_query);
    
    if ($attachments_result) {
        while ($attachment = mysqli_fetch_assoc($attachments_result)) {
            if (!empty($attachment['file_url'])) {
                $file_path = UPLOAD_DIR . basename($attachment['file_url']);
                if (file_exists($file_path)) {
                    @unlink($file_path);
                }
            }
        }
    }
    
    // Delete message (cascade will delete attachments, message_status, etc.)
    $delete_query = "DELETE FROM messages WHERE id = $message_id";
    
    if (mysqli_query($conn, $delete_query)) {
        sendJSON(['success' => true, 'message' => 'Message deleted successfully', 'conversation_id' => $message['conversation_id']]);
    } else {
        sendJSON(['error' => 'Failed to delete message: ' . mysqli_error($conn)], 500);
    }
}

function starMessage() {
    global $conn, $user;
    
    $message_id = (int)($_POST['message_id'] ?? 0);
    
    if (!$message_id) {
        sendJSON(['error' => 'Message ID required'], 400);
        return;
    }
    
    // Check if message exists and user has access
    $check_query = "SELECT m.* FROM messages m
                    INNER JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
                    WHERE m.id = $message_id AND cm.user_id = {$user['id']}";
    $check_result = mysqli_query($conn, $check_query);
    
    if (!$check_result || mysqli_num_rows($check_result) == 0) {
        sendJSON(['error' => 'Message not found or access denied'], 404);
        return;
    }
    
    // Check if message_stars table exists
    $stars_check = @mysqli_query($conn, "SHOW TABLES LIKE 'message_stars'");
    $has_stars_table = $stars_check && mysqli_num_rows($stars_check) > 0;
    
    if (!$has_stars_table) {
        sendJSON(['error' => 'Star feature not available. Please run database_message_stars_update.sql'], 500);
        return;
    }
    
    // Check if already starred
    $star_check = mysqli_query($conn, "SELECT * FROM message_stars WHERE message_id = $message_id AND user_id = {$user['id']}");
    
    if (mysqli_num_rows($star_check) > 0) {
        sendJSON(['success' => true, 'message' => 'Message already starred']);
        return;
    }
    
    // Add star
    $star_query = "INSERT INTO message_stars (message_id, user_id) VALUES ($message_id, {$user['id']})";
    
    if (mysqli_query($conn, $star_query)) {
        sendJSON(['success' => true, 'message' => 'Message starred successfully']);
    } else {
        sendJSON(['error' => 'Failed to star message: ' . mysqli_error($conn)], 500);
    }
}

function unstarMessage() {
    global $conn, $user;
    
    $message_id = (int)($_POST['message_id'] ?? 0);
    
    if (!$message_id) {
        sendJSON(['error' => 'Message ID required'], 400);
        return;
    }
    
    // Remove star
    $unstar_query = "DELETE FROM message_stars WHERE message_id = $message_id AND user_id = {$user['id']}";
    
    if (mysqli_query($conn, $unstar_query)) {
        sendJSON(['success' => true, 'message' => 'Message unstarred successfully']);
    } else {
        sendJSON(['error' => 'Failed to unstar message: ' . mysqli_error($conn)], 500);
    }
}
?>

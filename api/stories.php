<?php
require_once __DIR__ . '/../includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        getStories();
        break;
    case 'create':
        createStory();
        break;
    case 'view':
        viewStory();
        break;
    case 'delete':
        deleteStory();
        break;
    case 'my_stories':
        getMyStories();
        break;
    case 'viewers':
        getStoryViewers();
        break;
    case 'reply':
        replyToStory();
        break;
    case 'replies':
        getStoryReplies();
        break;
    default:
        sendJSON(['error' => 'Invalid action'], 400);
}

function getStories() {
    global $conn, $user;
    
    // Get all active stories from contacts (users you have conversations with)
    $query = "SELECT DISTINCT us.*, u.id as user_id, u.name as user_name, u.avatar as user_avatar,
              (SELECT COUNT(*) FROM status_views sv WHERE sv.status_id = us.id) as view_count,
              (SELECT COUNT(*) FROM status_views sv WHERE sv.status_id = us.id AND sv.user_id = {$user['id']}) as is_viewed
              FROM user_status us
              INNER JOIN users u ON us.user_id = u.id
              LEFT JOIN conversations c ON (c.type = 'single' AND (
                  EXISTS (SELECT 1 FROM conversation_members cm1 WHERE cm1.conversation_id = c.id AND cm1.user_id = {$user['id']})
                  AND EXISTS (SELECT 1 FROM conversation_members cm2 WHERE cm2.conversation_id = c.id AND cm2.user_id = us.user_id)
              ))
              WHERE (us.user_id = {$user['id']} 
                     OR EXISTS (
                         SELECT 1 FROM conversation_members cm 
                         INNER JOIN conversations conv ON cm.conversation_id = conv.id
                         WHERE conv.type = 'single' 
                         AND cm.user_id = {$user['id']}
                         AND EXISTS (
                             SELECT 1 FROM conversation_members cm2 
                             WHERE cm2.conversation_id = conv.id AND cm2.user_id = us.user_id
                         )
                     ))
              AND (us.expires_at IS NULL OR us.expires_at > NOW())
              AND u.status = 'active'
              ORDER BY us.created_at DESC";
    
    // Auto-delete expired stories (older than 24 hours)
    mysqli_query($conn, "DELETE FROM user_status WHERE expires_at IS NOT NULL AND expires_at < NOW()");
    
    $result = mysqli_query($conn, $query);
    $stories = [];
    $groupedStories = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format image URL
        if (!empty($row['status_image'])) {
            if (strpos($row['status_image'], 'http') !== 0) {
                $row['status_image'] = BASE_URL . '/' . ltrim($row['status_image'], '/');
            }
        }
        
        // Format avatar URL
        if (!empty($row['user_avatar'])) {
            if (strpos($row['user_avatar'], 'http') !== 0) {
                $row['user_avatar'] = BASE_URL . '/' . ltrim($row['user_avatar'], '/');
            }
        } else {
            $row['user_avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        // Group stories by user
        $user_id = $row['user_id'];
        if (!isset($groupedStories[$user_id])) {
            $groupedStories[$user_id] = [
                'user_id' => $user_id,
                'user_name' => $row['user_name'],
                'user_avatar' => $row['user_avatar'],
                'is_my_story' => ($user_id == $user['id']),
                'stories' => []
            ];
        }
        
        $groupedStories[$user_id]['stories'][] = [
            'id' => $row['id'],
            'status_text' => $row['status_text'],
            'status_image' => $row['status_image'],
            'status_link' => $row['status_link'],
            'status_type' => $row['status_type'],
            'created_at' => $row['created_at'],
            'view_count' => (int)$row['view_count'],
            'is_viewed' => (bool)$row['is_viewed']
        ];
    }
    
    // Convert to array
    $stories = array_values($groupedStories);
    
    sendJSON(['success' => true, 'stories' => $stories]);
}

function getMyStories() {
    global $conn, $user;
    
    $query = "SELECT us.*, 
              (SELECT COUNT(*) FROM status_views sv WHERE sv.status_id = us.id) as view_count
              FROM user_status us
              WHERE us.user_id = {$user['id']}
              AND (us.expires_at IS NULL OR us.expires_at > NOW())
              ORDER BY us.created_at DESC";
    
    $result = mysqli_query($conn, $query);
    $stories = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format image URL
        if (!empty($row['status_image'])) {
            if (strpos($row['status_image'], 'http') !== 0) {
                $row['status_image'] = BASE_URL . '/' . ltrim($row['status_image'], '/');
            }
        }
        
        $stories[] = [
            'id' => $row['id'],
            'status_text' => $row['status_text'],
            'status_image' => $row['status_image'],
            'status_link' => $row['status_link'],
            'status_type' => $row['status_type'],
            'created_at' => $row['created_at'],
            'view_count' => (int)$row['view_count']
        ];
    }
    
    sendJSON(['success' => true, 'stories' => $stories]);
}

function createStory() {
    global $conn, $user;
    
    $status_text = escape($conn, $_POST['status_text'] ?? '');
    $status_link = escape($conn, $_POST['status_link'] ?? '');
    $status_type = escape($conn, $_POST['status_type'] ?? 'text');
    
    // Validate link URL
    if (!empty($status_link)) {
        if (!filter_var($status_link, FILTER_VALIDATE_URL)) {
            // Try adding http:// if no protocol
            if (!preg_match('/^https?:\/\//', $status_link)) {
                $status_link = 'http://' . $status_link;
            }
            if (!filter_var($status_link, FILTER_VALIDATE_URL)) {
                sendJSON(['error' => 'Invalid URL format'], 400);
                return;
            }
        }
    }
    
    // Handle image upload
    $status_image = null;
    if (isset($_FILES['status_image']) && $_FILES['status_image']['error'] == 0) {
        $file = $_FILES['status_image'];
        $allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        $max_size = 10 * 1024 * 1024; // 10MB
        
        if (!in_array($file['type'], $allowed_types)) {
            sendJSON(['error' => 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'], 400);
            return;
        }
        
        if ($file['size'] > $max_size) {
            sendJSON(['error' => 'File size too large. Maximum 10MB allowed.'], 400);
            return;
        }
        
        // Create uploads directory if it doesn't exist
        if (!file_exists(UPLOAD_DIR)) {
            if (!mkdir(UPLOAD_DIR, 0755, true)) {
                sendJSON(['error' => 'Failed to create upload directory'], 500);
                return;
            }
        }
        
        // Generate unique filename
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = 'story_' . $user['id'] . '_' . time() . '_' . uniqid() . '.' . $extension;
        $filepath = UPLOAD_DIR . $filename;
        
        if (move_uploaded_file($file['tmp_name'], $filepath)) {
            $status_image = 'uploads/' . $filename;
        } else {
            sendJSON(['error' => 'Failed to upload image'], 500);
            return;
        }
    }
    
    // Determine status type
    if (!empty($status_image) && !empty($status_text)) {
        $status_type = 'mixed';
    } elseif (!empty($status_image)) {
        $status_type = 'image';
    } elseif (!empty($status_link)) {
        $status_type = 'link';
    } else {
        $status_type = 'text';
    }
    
    // Set expiration (24 hours from now)
    $expires_at = date('Y-m-d H:i:s', strtotime('+24 hours'));
    
    // Build query
    $fields = ['user_id', 'status_type', 'expires_at'];
    $values = [$user['id'], "'$status_type'", "'$expires_at'"];
    
    if (!empty($status_text)) {
        $fields[] = 'status_text';
        $status_text_escaped = escape($conn, $status_text);
        $values[] = "'$status_text_escaped'";
    }
    
    if (!empty($status_image)) {
        $fields[] = 'status_image';
        $status_image_escaped = escape($conn, $status_image);
        $values[] = "'$status_image_escaped'";
    }
    
    if (!empty($status_link)) {
        $fields[] = 'status_link';
        $status_link_escaped = escape($conn, $status_link);
        $values[] = "'$status_link_escaped'";
    }
    
    $query = "INSERT INTO user_status (" . implode(', ', $fields) . ") VALUES (" . implode(', ', $values) . ")";
    
    if (mysqli_query($conn, $query)) {
        $story_id = mysqli_insert_id($conn);
        
        // Get created story
        $get_query = "SELECT * FROM user_status WHERE id = $story_id";
        $result = mysqli_query($conn, $get_query);
        $story = mysqli_fetch_assoc($result);
        
        // Format URLs
        if (!empty($story['status_image'])) {
            if (strpos($story['status_image'], 'http') !== 0) {
                $story['status_image'] = BASE_URL . '/' . ltrim($story['status_image'], '/');
            }
        }
        
        sendJSON([
            'success' => true, 
            'story' => $story,
            'message' => 'Story created successfully'
        ]);
    } else {
        sendJSON(['error' => 'Failed to create story'], 500);
    }
}

function viewStory() {
    global $conn, $user;
    
    $story_id = (int)($_POST['story_id'] ?? 0);
    
    if (!$story_id) {
        sendJSON(['error' => 'Story ID required'], 400);
    }
    
    // Check if already viewed
    $check = mysqli_query($conn, "SELECT * FROM status_views WHERE status_id = $story_id AND user_id = {$user['id']}");
    
    if (mysqli_num_rows($check) == 0) {
        // Mark as viewed
        $insert_query = "INSERT INTO status_views (status_id, user_id) VALUES ($story_id, {$user['id']})";
        mysqli_query($conn, $insert_query);
    }
    
    sendJSON(['success' => true]);
}

function deleteStory() {
    global $conn, $user;
    
    $story_id = (int)($_POST['story_id'] ?? 0);
    
    if (!$story_id) {
        sendJSON(['error' => 'Story ID required'], 400);
    }
    
    // Verify ownership
    $check = mysqli_query($conn, "SELECT * FROM user_status WHERE id = $story_id AND user_id = {$user['id']}");
    
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Story not found or access denied'], 404);
        return;
    }
    
    $story = mysqli_fetch_assoc($check);
    
    // Delete image file if exists
    if (!empty($story['status_image'])) {
        $image_path = UPLOAD_DIR . basename($story['status_image']);
        if (file_exists($image_path)) {
            @unlink($image_path);
        }
    }
    
    // Delete story (cascade will delete views)
    $delete_query = "DELETE FROM user_status WHERE id = $story_id";
    
    if (mysqli_query($conn, $delete_query)) {
        sendJSON(['success' => true, 'message' => 'Story deleted successfully']);
    } else {
        sendJSON(['error' => 'Failed to delete story'], 500);
    }
}

function getStoryViewers() {
    global $conn, $user;
    
    $story_id = (int)($_GET['story_id'] ?? 0);
    
    if (!$story_id) {
        sendJSON(['error' => 'Story ID required'], 400);
        return;
    }
    
    // Verify ownership (only story owner can see viewers)
    $check = mysqli_query($conn, "SELECT user_id FROM user_status WHERE id = $story_id");
    
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Story not found'], 404);
        return;
    }
    
    $story = mysqli_fetch_assoc($check);
    
    if ($story['user_id'] != $user['id']) {
        sendJSON(['error' => 'Only story owner can view viewers'], 403);
        return;
    }
    
    // Get viewers with user info
    $query = "SELECT sv.*, u.id as user_id, u.name, u.avatar, u.status_text
              FROM status_views sv
              INNER JOIN users u ON sv.user_id = u.id
              WHERE sv.status_id = $story_id
              ORDER BY sv.viewed_at DESC";
    
    $result = mysqli_query($conn, $query);
    $viewers = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format avatar URL
        if (!empty($row['avatar'])) {
            if (strpos($row['avatar'], 'http') !== 0) {
                $row['avatar'] = BASE_URL . '/' . ltrim($row['avatar'], '/');
            }
        } else {
            $row['avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        $viewers[] = [
            'id' => $row['user_id'],
            'name' => $row['name'],
            'avatar' => $row['avatar'],
            'status_text' => $row['status_text'],
            'viewed_at' => $row['viewed_at']
        ];
    }
    
    sendJSON(['success' => true, 'viewers' => $viewers]);
}

function replyToStory() {
    global $conn, $user;
    
    $story_id = (int)($_POST['story_id'] ?? 0);
    $reply_text = escape($conn, trim($_POST['reply_text'] ?? ''));
    
    if (!$story_id) {
        sendJSON(['error' => 'Story ID required'], 400);
        return;
    }
    
    if (empty($reply_text)) {
        sendJSON(['error' => 'Reply text is required'], 400);
        return;
    }
    
    // Check if story exists and is active
    $check = mysqli_query($conn, "SELECT * FROM user_status WHERE id = $story_id AND (expires_at IS NULL OR expires_at > NOW())");
    
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Story not found or expired'], 404);
        return;
    }
    
    // Insert reply
    $query = "INSERT INTO status_replies (status_id, user_id, reply_text) VALUES ($story_id, {$user['id']}, '$reply_text')";
    
    if (mysqli_query($conn, $query)) {
        $reply_id = mysqli_insert_id($conn);
        
        // Get created reply with user info
        $get_query = "SELECT sr.*, u.name, u.avatar 
                     FROM status_replies sr
                     INNER JOIN users u ON sr.user_id = u.id
                     WHERE sr.id = $reply_id";
        $result = mysqli_query($conn, $get_query);
        $reply = mysqli_fetch_assoc($result);
        
        // Format avatar URL
        if (!empty($reply['avatar'])) {
            if (strpos($reply['avatar'], 'http') !== 0) {
                $reply['avatar'] = BASE_URL . '/' . ltrim($reply['avatar'], '/');
            }
        } else {
            $reply['avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        // Get story owner to notify via WebSocket
        $story_query = "SELECT user_id FROM user_status WHERE id = $story_id";
        $story_result = mysqli_query($conn, $story_query);
        $story_data = mysqli_fetch_assoc($story_result);
        $story_owner_id = $story_data['user_id'];
        
        // Create or find conversation between reply sender and story owner
        if ($story_owner_id != $user['id']) {
            // Check if conversation exists
            $conv_check = "SELECT c.id FROM conversations c
                          INNER JOIN conversation_members cm1 ON c.id = cm1.conversation_id
                          INNER JOIN conversation_members cm2 ON c.id = cm2.conversation_id
                          WHERE c.type = 'single' 
                          AND cm1.user_id = {$user['id']} 
                          AND cm2.user_id = $story_owner_id";
            $conv_result = mysqli_query($conn, $conv_check);
            
            $conversation_id = null;
            if (mysqli_num_rows($conv_result) > 0) {
                $conv_row = mysqli_fetch_assoc($conv_result);
                $conversation_id = $conv_row['id'];
            } else {
                // Create new conversation
                $uuid = generateUUID();
                $create_conv = "INSERT INTO conversations (uuid, type, created_by) VALUES ('$uuid', 'single', {$user['id']})";
                if (mysqli_query($conn, $create_conv)) {
                    $conversation_id = mysqli_insert_id($conn);
                    // Add both users as members
                    mysqli_query($conn, "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($conversation_id, {$user['id']}, 'admin')");
                    mysqli_query($conn, "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($conversation_id, $story_owner_id)");
                }
            }
            
            // Create message in conversation with story reply
            if ($conversation_id) {
                $message_uuid = generateUUID();
                $message_text = escape($conn, "Replied to story: " . $reply_text);
                $insert_msg = "INSERT INTO messages (uuid, conversation_id, sender_id, message_type, message) 
                              VALUES ('$message_uuid', $conversation_id, {$user['id']}, 'text', '$message_text')";
                
                if (mysqli_query($conn, $insert_msg)) {
                    $message_id = mysqli_insert_id($conn);
                    
                    // Create message status for story owner
                    mysqli_query($conn, "INSERT INTO message_status (message_id, user_id, status) 
                                       VALUES ($message_id, $story_owner_id, 'sent')");
                }
            }
        }
        
        sendJSON([
            'success' => true,
            'reply' => [
                'id' => $reply['id'],
                'status_id' => $reply['status_id'],
                'user_id' => $reply['user_id'],
                'user_name' => $reply['name'],
                'user_avatar' => $reply['avatar'],
                'reply_text' => $reply['reply_text'],
                'created_at' => $reply['created_at']
            ],
            'story_owner_id' => $story_owner_id,
            'message' => 'Reply sent successfully'
        ]);
    } else {
        sendJSON(['error' => 'Failed to send reply: ' . mysqli_error($conn)], 500);
    }
}

function getStoryReplies() {
    global $conn, $user;
    
    $story_id = (int)($_GET['story_id'] ?? 0);
    
    if (!$story_id) {
        sendJSON(['error' => 'Story ID required'], 400);
        return;
    }
    
    // Verify ownership (only story owner can see replies)
    $check = mysqli_query($conn, "SELECT user_id FROM user_status WHERE id = $story_id");
    
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Story not found'], 404);
        return;
    }
    
    $story = mysqli_fetch_assoc($check);
    
    if ($story['user_id'] != $user['id']) {
        sendJSON(['error' => 'Only story owner can view replies'], 403);
        return;
    }
    
    // Get replies with user info
    $query = "SELECT sr.*, u.id as user_id, u.name, u.avatar
              FROM status_replies sr
              INNER JOIN users u ON sr.user_id = u.id
              WHERE sr.status_id = $story_id
              ORDER BY sr.created_at ASC";
    
    $result = mysqli_query($conn, $query);
    $replies = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format avatar URL
        if (!empty($row['avatar'])) {
            if (strpos($row['avatar'], 'http') !== 0) {
                $row['avatar'] = BASE_URL . '/' . ltrim($row['avatar'], '/');
            }
        } else {
            $row['avatar'] = BASE_URL . '/assets/images/default-avatar.png';
        }
        
        $replies[] = [
            'id' => $row['id'],
            'user_id' => $row['user_id'],
            'user_name' => $row['name'],
            'user_avatar' => $row['avatar'],
            'reply_text' => $row['reply_text'],
            'created_at' => $row['created_at']
        ];
    }
    
    sendJSON(['success' => true, 'replies' => $replies]);
}
?>

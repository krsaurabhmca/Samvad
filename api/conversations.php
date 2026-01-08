<?php
require_once __DIR__ . '/../includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        getConversations();
        break;
    case 'create':
        createConversation();
        break;
    case 'get':
        getConversation();
        break;
    case 'members':
        getMembers();
        break;
    case 'update':
        updateConversation();
        break;
    case 'add_members':
        addMembers();
        break;
    case 'remove_member':
        removeMember();
        break;
    default:
        sendJSON(['error' => 'Invalid action'], 400);
}

function getConversations() {
    global $conn, $user;
    
    $user_id = $user['id'];
    
    $query = "SELECT c.*, 
              (SELECT message FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
              (SELECT COUNT(*) FROM messages m 
               INNER JOIN message_status ms ON m.id = ms.message_id 
               WHERE m.conversation_id = c.id AND ms.user_id = $user_id AND ms.status = 'sent') as unread_count
              FROM conversations c
              INNER JOIN conversation_members cm ON c.id = cm.conversation_id
              WHERE cm.user_id = $user_id
              ORDER BY last_message_time DESC, c.created_at DESC";
    
    $result = mysqli_query($conn, $query);
    $conversations = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format group avatar URL
        if ($row['type'] == 'group' && !empty($row['avatar'])) {
            if (strpos($row['avatar'], 'http') !== 0) {
                $row['avatar'] = BASE_URL . '/' . ltrim($row['avatar'], '/');
            }
        }
        
        // Get other members for single chat
        if ($row['type'] == 'single') {
            $member_query = "SELECT u.id, u.uuid, u.name, u.avatar, u.last_seen, u.status, u.status_text 
                           FROM conversation_members cm
                           INNER JOIN users u ON cm.user_id = u.id
                           WHERE cm.conversation_id = {$row['id']} AND cm.user_id != $user_id
                           LIMIT 1";
            $member_result = mysqli_query($conn, $member_query);
            if ($member_row = mysqli_fetch_assoc($member_result)) {
                $row['other_user'] = $member_row;
            }
        }
        
        // Get all members for group chat
        if ($row['type'] == 'group') {
            $members_query = "SELECT u.id, u.uuid, u.name, u.avatar, u.status_text, cm.role 
                            FROM conversation_members cm
                            INNER JOIN users u ON cm.user_id = u.id
                            WHERE cm.conversation_id = {$row['id']}";
            $members_result = mysqli_query($conn, $members_query);
            $row['members'] = [];
            while ($member = mysqli_fetch_assoc($members_result)) {
                $row['members'][] = $member;
            }
        }
        
        $conversations[] = $row;
    }
    
    sendJSON(['success' => true, 'conversations' => $conversations]);
}

function createConversation() {
    global $conn, $user;
    
    $type = escape($conn, $_POST['type'] ?? 'single');
    $user_ids = $_POST['user_ids'] ?? [];
    $title = escape($conn, $_POST['title'] ?? '');
    
    if ($type == 'single' && count($user_ids) != 1) {
        sendJSON(['error' => 'Single conversation requires exactly one other user'], 400);
    }
    
    if ($type == 'group' && (empty($title) || count($user_ids) < 1)) {
        sendJSON(['error' => 'Group conversation requires title and at least one member'], 400);
    }
    
    // Check if single conversation already exists
    if ($type == 'single') {
        $other_user_id = (int)$user_ids[0];
        $check_query = "SELECT c.id FROM conversations c
                        INNER JOIN conversation_members cm1 ON c.id = cm1.conversation_id
                        INNER JOIN conversation_members cm2 ON c.id = cm2.conversation_id
                        WHERE c.type = 'single' 
                        AND cm1.user_id = {$user['id']} 
                        AND cm2.user_id = $other_user_id";
        $check_result = mysqli_query($conn, $check_query);
        
        if (mysqli_num_rows($check_result) > 0) {
            $existing = mysqli_fetch_assoc($check_result);
            sendJSON(['success' => true, 'conversation_id' => $existing['id'], 'exists' => true]);
        }
    }
    
    mysqli_autocommit($conn, false);
    
    try {
        $uuid = generateUUID();
        $query = "INSERT INTO conversations (uuid, type, title, created_by) 
                  VALUES ('$uuid', '$type', " . (!empty($title) ? "'$title'" : 'NULL') . ", {$user['id']})";
        
        if (!mysqli_query($conn, $query)) {
            throw new Exception('Failed to create conversation');
        }
        
        $conversation_id = mysqli_insert_id($conn);
        
        // Add creator as member
        $query = "INSERT INTO conversation_members (conversation_id, user_id, role) 
                  VALUES ($conversation_id, {$user['id']}, 'admin')";
        mysqli_query($conn, $query);
        
        // Add other members
        foreach ($user_ids as $user_id) {
            $user_id = (int)$user_id;
            if ($user_id != $user['id']) {
                $query = "INSERT INTO conversation_members (conversation_id, user_id) 
                          VALUES ($conversation_id, $user_id)";
                mysqli_query($conn, $query);
            }
        }
        
        mysqli_commit($conn);
        sendJSON(['success' => true, 'conversation_id' => $conversation_id]);
        
    } catch (Exception $e) {
        mysqli_rollback($conn);
        sendJSON(['error' => $e->getMessage()], 500);
    }
    
    mysqli_autocommit($conn, true);
}

function getConversation() {
    global $conn, $user;
    
    $conversation_id = (int)($_GET['id'] ?? 0);
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    // Check if user is member
    $check = mysqli_query($conn, "SELECT * FROM conversation_members WHERE conversation_id = $conversation_id AND user_id = {$user['id']}");
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Access denied'], 403);
    }
    
    $query = "SELECT c.*, u.name as creator_name 
              FROM conversations c
              LEFT JOIN users u ON c.created_by = u.id
              WHERE c.id = $conversation_id";
    $result = mysqli_query($conn, $query);
    $conversation = mysqli_fetch_assoc($result);
    
    // Ensure avatar URL is properly formatted
    if (!empty($conversation['avatar'])) {
        if (strpos($conversation['avatar'], 'http') !== 0) {
            if (strpos($conversation['avatar'], 'uploads/') === 0) {
                $conversation['avatar'] = BASE_URL . '/' . $conversation['avatar'];
            } elseif (strpos($conversation['avatar'], 'assets/') === 0) {
                $conversation['avatar'] = BASE_URL . '/' . $conversation['avatar'];
            } else {
                $conversation['avatar'] = BASE_URL . '/' . ltrim($conversation['avatar'], '/');
            }
        }
    } else {
        $conversation['avatar'] = null;
    }
    
    // Get members
    $members_query = "SELECT u.id, u.uuid, u.name, u.avatar, u.last_seen, u.status, u.status_text, cm.role 
                     FROM conversation_members cm
                     INNER JOIN users u ON cm.user_id = u.id
                     WHERE cm.conversation_id = $conversation_id";
    $members_result = mysqli_query($conn, $members_query);
    $conversation['members'] = [];
    while ($member = mysqli_fetch_assoc($members_result)) {
        $conversation['members'][] = $member;
    }
    
    sendJSON(['success' => true, 'conversation' => $conversation]);
}

function getMembers() {
    global $conn, $user;
    
    $conversation_id = (int)($_GET['conversation_id'] ?? 0);
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    $query = "SELECT u.id, u.uuid, u.name, u.avatar, u.last_seen, u.status, u.status_text, cm.role 
             FROM conversation_members cm
             INNER JOIN users u ON cm.user_id = u.id
             WHERE cm.conversation_id = $conversation_id";
    $result = mysqli_query($conn, $query);
    $members = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        $members[] = $row;
    }
    
    sendJSON(['success' => true, 'members' => $members]);
}

function updateConversation() {
    global $conn, $user;
    
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    $title = escape($conn, $_POST['title'] ?? '');
    $description = escape($conn, $_POST['description'] ?? '');
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    // Check if user is admin
    $check = mysqli_query($conn, "SELECT role FROM conversation_members 
                                  WHERE conversation_id = $conversation_id 
                                  AND user_id = {$user['id']} 
                                  AND role = 'admin'");
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Only admins can update group settings'], 403);
    }
    
    $updates = [];
    
    if (!empty($title)) {
        $updates[] = "title = '$title'";
    }
    
    if (isset($_POST['description'])) {
        $updates[] = "description = " . (!empty($description) ? "'$description'" : 'NULL');
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
    }
    
    $update_query = "UPDATE conversations SET " . implode(', ', $updates) . " WHERE id = $conversation_id";
    
    if (mysqli_query($conn, $update_query)) {
        // Get updated conversation
        $query = "SELECT * FROM conversations WHERE id = $conversation_id";
        $result = mysqli_query($conn, $query);
        $conversation = mysqli_fetch_assoc($result);
        
        // Format avatar URL
        if (!empty($conversation['avatar'])) {
            if (strpos($conversation['avatar'], 'http') !== 0) {
                $conversation['avatar'] = BASE_URL . '/' . ltrim($conversation['avatar'], '/');
            }
        }
        
        sendJSON(['success' => true, 'conversation' => $conversation]);
    } else {
        sendJSON(['error' => 'Failed to update group'], 500);
    }
}

function addMembers() {
    global $conn, $user;
    
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    $user_ids = $_POST['user_ids'] ?? [];
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    if (empty($user_ids) || !is_array($user_ids)) {
        sendJSON(['error' => 'User IDs required'], 400);
    }
    
    // Check if user is admin
    $check = mysqli_query($conn, "SELECT role FROM conversation_members 
                                  WHERE conversation_id = $conversation_id 
                                  AND user_id = {$user['id']} 
                                  AND role = 'admin'");
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Only admins can add members'], 403);
    }
    
    // Check if conversation is a group
    $conv_check = mysqli_query($conn, "SELECT type FROM conversations WHERE id = $conversation_id");
    $conv = mysqli_fetch_assoc($conv_check);
    if ($conv['type'] != 'group') {
        sendJSON(['error' => 'Can only add members to groups'], 400);
    }
    
    $added = [];
    $errors = [];
    
    foreach ($user_ids as $user_id) {
        $user_id = (int)$user_id;
        
        if ($user_id == $user['id']) {
            continue; // Skip adding self
        }
        
        // Check if user is already a member
        $member_check = mysqli_query($conn, "SELECT id FROM conversation_members 
                                            WHERE conversation_id = $conversation_id 
                                            AND user_id = $user_id");
        if (mysqli_num_rows($member_check) > 0) {
            $errors[] = "User $user_id is already a member";
            continue;
        }
        
        // Check if user exists
        $user_check = mysqli_query($conn, "SELECT id FROM users WHERE id = $user_id AND status = 'active'");
        if (mysqli_num_rows($user_check) == 0) {
            $errors[] = "User $user_id not found";
            continue;
        }
        
        // Add member
        $query = "INSERT INTO conversation_members (conversation_id, user_id) 
                  VALUES ($conversation_id, $user_id)";
        if (mysqli_query($conn, $query)) {
            $added[] = $user_id;
        } else {
            $errors[] = "Failed to add user $user_id";
        }
    }
    
    if (count($added) > 0) {
        sendJSON([
            'success' => true, 
            'added' => $added,
            'errors' => $errors
        ]);
    } else {
        sendJSON(['error' => 'Failed to add members: ' . implode(', ', $errors)], 400);
    }
}

function removeMember() {
    global $conn, $user;
    
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    $member_id = (int)($_POST['member_id'] ?? 0);
    
    if (!$conversation_id || !$member_id) {
        sendJSON(['error' => 'Conversation ID and Member ID required'], 400);
    }
    
    // Check if user is admin or removing themselves
    $check = mysqli_query($conn, "SELECT role FROM conversation_members 
                                  WHERE conversation_id = $conversation_id 
                                  AND user_id = {$user['id']}");
    $user_member = mysqli_fetch_assoc($check);
    
    if (!$user_member) {
        sendJSON(['error' => 'You are not a member of this group'], 403);
    }
    
    // Can remove if admin or removing self
    if ($user_member['role'] != 'admin' && $member_id != $user['id']) {
        sendJSON(['error' => 'Only admins can remove other members'], 403);
    }
    
    // Cannot remove the creator/admin
    $member_check = mysqli_query($conn, "SELECT role FROM conversation_members 
                                         WHERE conversation_id = $conversation_id 
                                         AND user_id = $member_id");
    $member = mysqli_fetch_assoc($member_check);
    
    if ($member && $member['role'] == 'admin' && $member_id != $user['id']) {
        sendJSON(['error' => 'Cannot remove group admin'], 400);
    }
    
    $query = "DELETE FROM conversation_members 
              WHERE conversation_id = $conversation_id AND user_id = $member_id";
    
    if (mysqli_query($conn, $query)) {
        sendJSON(['success' => true, 'message' => 'Member removed successfully']);
    } else {
        sendJSON(['error' => 'Failed to remove member'], 500);
    }
}
?>

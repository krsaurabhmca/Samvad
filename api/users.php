<?php
require_once __DIR__ . '/../includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'search':
        searchUsers();
        break;
    case 'list':
        listUsers();
        break;
    case 'profile':
        getProfile();
        break;
    case 'update':
        updateProfile();
        break;
    default:
        sendJSON(['error' => 'Invalid action'], 400);
}

function searchUsers() {
    global $conn, $user;
    
    $search = escape($conn, $_GET['q'] ?? '');
    
    if (empty($search)) {
        sendJSON(['error' => 'Search query required'], 400);
    }
    
    $query = "SELECT id, uuid, name, mobile, email, avatar, status, status_text, last_seen 
             FROM users 
             WHERE (name LIKE '%$search%' OR mobile LIKE '%$search%' OR email LIKE '%$search%') 
             AND id != {$user['id']} 
             AND status = 'active'
             LIMIT 20";
    
    $result = mysqli_query($conn, $query);
    $users = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format avatar URL
        if (!empty($row['avatar'])) {
            if (strpos($row['avatar'], 'http') !== 0) {
                $row['avatar'] = BASE_URL . '/' . ltrim($row['avatar'], '/');
            }
        }
        $users[] = $row;
    }
    
    sendJSON(['success' => true, 'users' => $users]);
}

function listUsers() {
    global $conn, $user;
    
    $query = "SELECT id, uuid, name, mobile, email, avatar, status, status_text, last_seen 
             FROM users 
             WHERE id != {$user['id']} 
             AND status = 'active'
             ORDER BY name ASC
             LIMIT 100";
    
    $result = mysqli_query($conn, $query);
    $users = [];
    
    while ($row = mysqli_fetch_assoc($result)) {
        // Format avatar URL
        if (!empty($row['avatar'])) {
            if (strpos($row['avatar'], 'http') !== 0) {
                $row['avatar'] = BASE_URL . '/' . ltrim($row['avatar'], '/');
            }
        }
        $users[] = $row;
    }
    
    sendJSON(['success' => true, 'users' => $users]);
}

function getProfile() {
    global $conn, $user;
    
    $user_id = (int)($_GET['id'] ?? $user['id']);
    
    $query = "SELECT id, uuid, name, mobile, email, avatar, status, status_text, last_seen, created_at 
             FROM users 
             WHERE id = $user_id AND status = 'active'";
    
    $result = mysqli_query($conn, $query);
    
    if ($result && mysqli_num_rows($result) > 0) {
        $profile = mysqli_fetch_assoc($result);
        sendJSON(['success' => true, 'user' => $profile]);
    } else {
        sendJSON(['error' => 'User not found'], 404);
    }
}

function updateProfile() {
    global $conn, $user;
    
    $name = escape($conn, $_POST['name'] ?? '');
    $email = escape($conn, $_POST['email'] ?? '');
    
    $updates = [];
    
    if (!empty($name)) {
        $updates[] = "name = '$name'";
    }
    
    if (!empty($email)) {
        // Check if email already exists for another user
        $check = mysqli_query($conn, "SELECT id FROM users WHERE email = '$email' AND id != {$user['id']}");
        if (mysqli_num_rows($check) > 0) {
            sendJSON(['error' => 'Email already registered to another user'], 400);
            return;
        }
        $updates[] = "email = '$email'";
    }
    
    if (empty($updates)) {
        sendJSON(['error' => 'No fields to update'], 400);
        return;
    }
    
    $update_query = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = {$user['id']}";
    
    if (mysqli_query($conn, $update_query)) {
        // Get updated user
        $query = "SELECT id, uuid, name, mobile, email, avatar, status, status_text, last_seen 
                 FROM users WHERE id = {$user['id']}";
        $result = mysqli_query($conn, $query);
        $updated_user = mysqli_fetch_assoc($result);
        
        sendJSON(['success' => true, 'user' => $updated_user]);
    } else {
        sendJSON(['error' => 'Failed to update profile'], 500);
    }
}
?>

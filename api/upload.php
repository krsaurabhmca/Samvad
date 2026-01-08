<?php
require_once __DIR__ . '/../includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'avatar':
        uploadAvatar();
        break;
    case 'message':
        uploadMessageAttachment();
        break;
    case 'group_avatar':
        uploadGroupAvatar();
        break;
    default:
        sendJSON(['error' => 'Invalid action'], 400);
}

function uploadAvatar() {
    global $conn, $user;
    
    if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] != 0) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['avatar'];
    $allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    $max_size = 5 * 1024 * 1024; // 5MB
    
    if (!in_array($file['type'], $allowed_types)) {
        sendJSON(['error' => 'Invalid file type. Only JPEG, PNG, and GIF are allowed.'], 400);
    }
    
    if ($file['size'] > $max_size) {
        sendJSON(['error' => 'File size too large. Maximum 5MB allowed.'], 400);
    }
    
    // Create uploads directory if it doesn't exist
    if (!file_exists(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'avatar_' . $user['id'] . '_' . time() . '.' . $extension;
    $filepath = UPLOAD_DIR . $filename;
    
    // Delete old avatar if exists
    if (!empty($user['avatar'])) {
        $old_file = basename($user['avatar']);
        if (file_exists(UPLOAD_DIR . $old_file)) {
            @unlink(UPLOAD_DIR . $old_file);
        }
    }
    
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        $avatar_url = UPLOAD_URL . $filename;
        $update_query = "UPDATE users SET avatar = '$avatar_url' WHERE id = {$user['id']}";
        
        if (mysqli_query($conn, $update_query)) {
            sendJSON([
                'success' => true, 
                'avatar_url' => $avatar_url,
                'message' => 'Profile photo updated successfully'
            ]);
        } else {
            @unlink($filepath);
            sendJSON(['error' => 'Failed to update profile photo'], 500);
        }
    } else {
        sendJSON(['error' => 'Failed to upload file'], 500);
    }
}

function uploadMessageAttachment() {
    global $conn, $user;
    
    if (!isset($_FILES['file']) || $_FILES['file']['error'] != 0) {
        sendJSON(['error' => 'No file uploaded or upload error'], 400);
    }
    
    $file = $_FILES['file'];
    $max_size = 25 * 1024 * 1024; // 25MB
    
    if ($file['size'] > $max_size) {
        sendJSON(['error' => 'File size too large. Maximum 25MB allowed.'], 400);
    }
    
    // Create uploads directory if it doesn't exist
    if (!file_exists(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'msg_' . $user['id'] . '_' . time() . '_' . uniqid() . '.' . $extension;
    $filepath = UPLOAD_DIR . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        $file_url = UPLOAD_URL . $filename;
        $file_type = getFileType($file['type'], $extension);
        
        sendJSON([
            'success' => true,
            'file' => [
                'file_name' => $file['name'],
                'file_type' => $file_type,
                'file_size' => $file['size'],
                'file_url' => $file_url,
                'mime_type' => $file['type']
            ]
        ]);
    } else {
        sendJSON(['error' => 'Failed to upload file'], 500);
    }
}

function getFileType($mime_type, $extension) {
    // Determine message type based on file
    if (strpos($mime_type, 'image/') === 0) {
        return 'image';
    } elseif (strpos($mime_type, 'video/') === 0) {
        return 'video';
    } elseif (strpos($mime_type, 'audio/') === 0) {
        return 'audio';
    } else {
        return 'file';
    }
}

function uploadGroupAvatar() {
    global $conn, $user;
    
    $conversation_id = (int)($_POST['conversation_id'] ?? 0);
    
    if (!$conversation_id) {
        sendJSON(['error' => 'Conversation ID required'], 400);
    }
    
    // Check if conversation exists and is a group
    $conv_check = mysqli_query($conn, "SELECT type FROM conversations WHERE id = $conversation_id");
    if (mysqli_num_rows($conv_check) == 0) {
        sendJSON(['error' => 'Conversation not found'], 404);
    }
    $conv = mysqli_fetch_assoc($conv_check);
    if ($conv['type'] != 'group') {
        sendJSON(['error' => 'Can only update group photos'], 400);
    }
    
    // Check if user is admin
    $check = mysqli_query($conn, "SELECT role FROM conversation_members 
                                  WHERE conversation_id = $conversation_id 
                                  AND user_id = {$user['id']} 
                                  AND role = 'admin'");
    if (mysqli_num_rows($check) == 0) {
        sendJSON(['error' => 'Only admins can update group photo'], 403);
    }
    
    if (!isset($_FILES['avatar'])) {
        sendJSON(['error' => 'No file uploaded'], 400);
    }
    
    $file = $_FILES['avatar'];
    
    // Check for upload errors
    if ($file['error'] != UPLOAD_ERR_OK) {
        $error_messages = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            UPLOAD_ERR_EXTENSION => 'File upload stopped by extension'
        ];
        $error_msg = $error_messages[$file['error']] ?? 'Unknown upload error';
        sendJSON(['error' => 'Upload error: ' . $error_msg], 400);
    }
    
    $allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    $max_size = 5 * 1024 * 1024; // 5MB
    
    // Validate file type
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime_type = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mime_type, $allowed_types) && !in_array($file['type'], $allowed_types)) {
        sendJSON(['error' => 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'], 400);
    }
    
    if ($file['size'] > $max_size) {
        sendJSON(['error' => 'File size too large. Maximum 5MB allowed.'], 400);
    }
    
    // Create uploads directory if it doesn't exist
    if (!file_exists(UPLOAD_DIR)) {
        if (!mkdir(UPLOAD_DIR, 0755, true)) {
            sendJSON(['error' => 'Failed to create upload directory'], 500);
        }
    }
    
    // Check if directory is writable
    if (!is_writable(UPLOAD_DIR)) {
        sendJSON(['error' => 'Upload directory is not writable'], 500);
    }
    
    // Get current avatar to delete later
    $current_query = "SELECT avatar FROM conversations WHERE id = $conversation_id";
    $current_result = mysqli_query($conn, $current_query);
    $current = mysqli_fetch_assoc($current_result);
    
    // Generate unique filename
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (empty($extension)) {
        // Try to determine extension from mime type
        $mime_to_ext = [
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp'
        ];
        $extension = $mime_to_ext[$mime_type] ?? 'jpg';
    }
    $filename = 'group_' . $conversation_id . '_' . time() . '_' . uniqid() . '.' . $extension;
    $filepath = UPLOAD_DIR . $filename;
    
    // Delete old avatar if exists
    if (!empty($current['avatar'])) {
        $old_file = basename(parse_url($current['avatar'], PHP_URL_PATH));
        if (!empty($old_file) && file_exists(UPLOAD_DIR . $old_file)) {
            @unlink(UPLOAD_DIR . $old_file);
        }
    }
    
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        // Verify file was uploaded correctly
        if (!file_exists($filepath) || filesize($filepath) == 0) {
            @unlink($filepath);
            sendJSON(['error' => 'File upload failed - file is empty'], 500);
        }
        
        // Store relative path in database
        $avatar_path = 'uploads/' . $filename;
        $avatar_path_escaped = escape($conn, $avatar_path);
        $update_query = "UPDATE conversations SET avatar = '$avatar_path_escaped' WHERE id = $conversation_id";
        
        if (mysqli_query($conn, $update_query)) {
            // Return full URL for frontend
            $avatar_url = UPLOAD_URL . $filename;
            sendJSON([
                'success' => true, 
                'avatar_url' => $avatar_url,
                'message' => 'Group photo updated successfully'
            ]);
        } else {
            @unlink($filepath);
            sendJSON(['error' => 'Failed to update group photo: ' . mysqli_error($conn)], 500);
        }
    } else {
        $error = 'Failed to move uploaded file';
        if (!is_uploaded_file($file['tmp_name'])) {
            $error = 'Invalid file upload';
        }
        sendJSON(['error' => $error], 500);
    }
}
?>

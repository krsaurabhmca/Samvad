<?php
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        register();
        break;
    case 'login':
        login();
        break;
    case 'logout':
        logout();
        break;
    case 'check':
        checkAuth();
        break;
    default:
        sendJSON(['error' => 'Invalid action'], 400);
}

function register() {
    global $conn;
    
    $name = escape($conn, $_POST['name'] ?? '');
    $mobile = escape($conn, $_POST['mobile'] ?? '');
    $email = escape($conn, $_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    
    if (empty($name) || empty($mobile) || empty($password)) {
        sendJSON(['error' => 'Name, mobile, and password are required'], 400);
    }
    
    // Check if mobile already exists
    $check = mysqli_query($conn, "SELECT id FROM users WHERE mobile = '$mobile'");
    if (mysqli_num_rows($check) > 0) {
        sendJSON(['error' => 'Mobile number already registered'], 400);
    }
    
    // Check if email already exists (if provided)
    if (!empty($email)) {
        $check = mysqli_query($conn, "SELECT id FROM users WHERE email = '$email'");
        if (mysqli_num_rows($check) > 0) {
            sendJSON(['error' => 'Email already registered'], 400);
        }
    }
    
    $uuid = generateUUID();
    $hashed_password = password_hash($password, PASSWORD_DEFAULT);
    $email = !empty($email) ? "'$email'" : 'NULL';
    
    $query = "INSERT INTO users (uuid, name, mobile, email, password) 
              VALUES ('$uuid', '$name', '$mobile', $email, '$hashed_password')";
    
    if (mysqli_query($conn, $query)) {
        $user_id = mysqli_insert_id($conn);
        $_SESSION['user_id'] = $user_id;
        
        $user = mysqli_fetch_assoc(mysqli_query($conn, "SELECT id, uuid, name, mobile, email, avatar, status FROM users WHERE id = $user_id"));
        sendJSON(['success' => true, 'user' => $user]);
    } else {
        sendJSON(['error' => 'Registration failed'], 500);
    }
}

function login() {
    global $conn;
    
    $mobile = escape($conn, $_POST['mobile'] ?? '');
    $password = $_POST['password'] ?? '';
    
    if (empty($mobile) || empty($password)) {
        sendJSON(['error' => 'Mobile and password are required'], 400);
    }
    
    $query = "SELECT * FROM users WHERE mobile = '$mobile' AND status = 'active'";
    $result = mysqli_query($conn, $query);
    
    if ($result && mysqli_num_rows($result) > 0) {
        $user = mysqli_fetch_assoc($result);
        
        if (password_verify($password, $user['password'])) {
            $_SESSION['user_id'] = $user['id'];
            
            // Update last seen
            mysqli_query($conn, "UPDATE users SET last_seen = NOW() WHERE id = {$user['id']}");
            
            unset($user['password']);
            sendJSON(['success' => true, 'user' => $user]);
        } else {
            sendJSON(['error' => 'Invalid credentials'], 401);
        }
    } else {
        sendJSON(['error' => 'Invalid credentials'], 401);
    }
}

function logout() {
    session_destroy();
    sendJSON(['success' => true, 'message' => 'Logged out successfully']);
}

function checkAuth() {
    $user = getCurrentUser($GLOBALS['conn']);
    if ($user) {
        unset($user['password']);
        sendJSON(['authenticated' => true, 'user' => $user]);
    } else {
        sendJSON(['authenticated' => false], 401);
    }
}
?>


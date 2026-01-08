<?php
session_start();

// Log activity if user is logged in
if (isset($_SESSION['user_id'])) {
    require_once 'includes/db.php';
    $user_id = (int)$_SESSION['user_id'];
    
    // Update last seen
    mysqli_query($GLOBALS['conn'], "UPDATE users SET last_seen = NOW() WHERE id = $user_id");
    
    // Log activity
    $ip_address = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    mysqli_query($GLOBALS['conn'], "INSERT INTO activity_logs (user_id, action, description, ip_address) 
                                    VALUES ($user_id, 'logout', 'User logged out', '$ip_address')");
}

session_destroy();
header('Location: login.php');
exit;
?>

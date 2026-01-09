<?php
require_once 'includes/db.php';

$user = getCurrentUser($conn);
if ($user) {
    header('Location: index.php');
    exit;
}

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action == 'login') {
        $mobile = escape($conn, $_POST['mobile'] ?? '');
        $password = $_POST['password'] ?? '';
        
        if (!empty($mobile) && !empty($password)) {
            $query = "SELECT * FROM users WHERE mobile = '$mobile' AND status = 'active'";
            $result = mysqli_query($conn, $query);
            
            if ($result && mysqli_num_rows($result) > 0) {
                $user = mysqli_fetch_assoc($result);
                if (password_verify($password, $user['password'])) {
                    $_SESSION['user_id'] = $user['id'];
                    mysqli_query($conn, "UPDATE users SET last_seen = NOW() WHERE id = {$user['id']}");
                    header('Location: index.php');
                    exit;
                } else {
                    $error = 'Invalid credentials';
                }
            } else {
                $error = 'Invalid credentials';
            }
        } else {
            $error = 'Please fill all fields';
        }
    } elseif ($action == 'register') {
        $name = escape($conn, $_POST['name'] ?? '');
        $mobile = escape($conn, $_POST['mobile'] ?? '');
        $email = escape($conn, $_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        
        if (!empty($name) && !empty($mobile) && !empty($password)) {
            $check = mysqli_query($conn, "SELECT id FROM users WHERE mobile = '$mobile'");
            if (mysqli_num_rows($check) > 0) {
                $error = 'Mobile number already registered';
            } else {
                $uuid = generateUUID();
                $hashed_password = password_hash($password, PASSWORD_DEFAULT);
                $email = !empty($email) ? "'$email'" : 'NULL';
                
                $query = "INSERT INTO users (uuid, name, mobile, email, password) 
                         VALUES ('$uuid', '$name', '$mobile', $email, '$hashed_password')";
                
                if (mysqli_query($conn, $query)) {
                    $success = 'Registration successful! Please login.';
                } else {
                    $error = 'Registration failed';
                }
            }
        } else {
            $error = 'Please fill all required fields';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Samvad - Simple Business Chat</title>
    <link rel="icon" type="image/png" href="assets/images/logo.png">
    <link rel="stylesheet" href="assets/css/auth.css">
</head>
<body>
    <div class="auth-container">
        <div class="auth-box">
            <div class="auth-header">
                <img src="assets/images/logo.png" alt="Samvad" class="auth-logo">
                <!-- <h1>Samvad</h1>
                <p class="auth-tagline">Simple Business Chat</p> -->
            </div>
            
            <?php if ($error): ?>
                <div class="alert alert-error"><?php echo htmlspecialchars($error); ?></div>
            <?php endif; ?>
            
            <?php if ($success): ?>
                <div class="alert alert-success"><?php echo htmlspecialchars($success); ?></div>
            <?php endif; ?>
            
            <div class="auth-tabs">
                <button class="tab-btn active" data-tab="login">Login</button>
                <button class="tab-btn" data-tab="register">Register</button>
            </div>
            
            <!-- Login Form -->
            <form id="loginForm" class="auth-form active" method="POST">
                <input type="hidden" name="action" value="login">
                <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="text" name="mobile" required placeholder="Enter mobile number">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required placeholder="Enter password">
                </div>
                <button type="submit" class="btn btn-primary">Login</button>
            </form>
            
            <!-- Register Form -->
            <form id="registerForm" class="auth-form" method="POST" style="display: none;">
                <input type="hidden" name="action" value="register">
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" name="name" required placeholder="Enter your name">
                </div>
                <div class="form-group">
                    <label>Mobile Number</label>
                    <input type="text" name="mobile" required placeholder="Enter mobile number">
                </div>
                <div class="form-group">
                    <label>Email (Optional)</label>
                    <input type="email" name="email" placeholder="Enter email address">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required placeholder="Create password">
                </div>
                <button type="submit" class="btn btn-primary">Register</button>
            </form>
        </div>
    </div>
    
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script>
        $(document).ready(function() {
            $('.tab-btn').on('click', function() {
                $('.tab-btn').removeClass('active');
                $(this).addClass('active');
                
                var tab = $(this).data('tab');
                $('.auth-form').hide();
                $('#' + tab + 'Form').show();
            });
        });
    </script>
</body>
</html>

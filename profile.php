<?php
require_once 'includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    header('Location: login.php');
    exit;
}

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action == 'update_profile') {
        $name = escape($conn, $_POST['name'] ?? '');
        $email = escape($conn, $_POST['email'] ?? '');
        $mobile = escape($conn, $_POST['mobile'] ?? '');
        
        $updates = [];
        
        if (!empty($name)) {
            $updates[] = "name = '$name'";
        }
        
        if (!empty($email)) {
            // Check if email already exists for another user
            $check = mysqli_query($conn, "SELECT id FROM users WHERE email = '$email' AND id != {$user['id']}");
            if (mysqli_num_rows($check) > 0) {
                $error = 'Email already registered to another user';
            } else {
                $updates[] = "email = '$email'";
            }
        }
        
        if (!empty($updates) && empty($error)) {
            $update_query = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = {$user['id']}";
            
            if (mysqli_query($conn, $update_query)) {
                $success = 'Profile updated successfully';
                // Reload user data
                $user = getCurrentUser($conn);
            } else {
                $error = 'Failed to update profile';
            }
        }
    } elseif ($action == 'update_status') {
        $status_text = escape($conn, $_POST['status_text'] ?? '');
        
        if (strlen($status_text) > 139) {
            $error = 'Status text cannot exceed 139 characters';
        } else {
            $update_query = "UPDATE users SET status_text = " . (!empty($status_text) ? "'$status_text'" : 'NULL') . " WHERE id = {$user['id']}";
            
            if (mysqli_query($conn, $update_query)) {
                $success = 'Status updated successfully';
                $user = getCurrentUser($conn);
            } else {
                $error = 'Failed to update status';
            }
        }
    } elseif ($action == 'update_avatar') {
        if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] == 0) {
            $file = $_FILES['avatar'];
            $allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
            $max_size = 5 * 1024 * 1024; // 5MB
            
            if (!in_array($file['type'], $allowed_types)) {
                $error = 'Invalid file type. Only JPEG, PNG, and GIF are allowed.';
            } elseif ($file['size'] > $max_size) {
                $error = 'File size too large. Maximum 5MB allowed.';
            } else {
                // Create uploads directory if it doesn't exist
                if (!file_exists(UPLOAD_DIR)) {
                    mkdir(UPLOAD_DIR, 0755, true);
                }
                
                // Generate unique filename
                $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
                $filename = 'avatar_' . $user['id'] . '_' . time() . '.' . $extension;
                $filepath = UPLOAD_DIR . $filename;
                
                // Delete old avatar if exists
                if (!empty($user['avatar']) && file_exists(UPLOAD_DIR . basename($user['avatar']))) {
                    @unlink(UPLOAD_DIR . basename($user['avatar']));
                }
                
                if (move_uploaded_file($file['tmp_name'], $filepath)) {
                    $avatar_url = UPLOAD_URL . $filename;
                    $update_query = "UPDATE users SET avatar = '$avatar_url' WHERE id = {$user['id']}";
                    
                    if (mysqli_query($conn, $update_query)) {
                        $success = 'Profile photo updated successfully';
                        $user['avatar'] = $avatar_url;
                    } else {
                        $error = 'Failed to update profile photo';
                    }
                } else {
                    $error = 'Failed to upload file';
                }
            }
        } else {
            $error = 'No file uploaded or upload error occurred';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile - Samvad - Simple Business Chat</title>
    <link rel="icon" type="image/png" href="assets/images/logo.png">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/profile.css">
</head>
<body>
    <div class="profile-container">
        <div class="profile-header">
            <a href="index.php" class="back-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
            </a>
            <div class="profile-header-content">
                <h1>Profile</h1>
                <p class="profile-header-tagline">Samvad - Simple Business Chat</p>
            </div>
        </div>
        
        <div class="profile-content">
            <?php if ($error): ?>
                <div class="alert alert-error"><?php echo htmlspecialchars($error); ?></div>
            <?php endif; ?>
            
            <?php if ($success): ?>
                <div class="alert alert-success"><?php echo htmlspecialchars($success); ?></div>
            <?php endif; ?>
            
            <!-- Avatar Section -->
            <div class="profile-section">
                <div class="avatar-section">
                    <div class="avatar-wrapper">
                        <img src="<?php echo htmlspecialchars($user['avatar'] ?: 'assets/images/default-avatar.png'); ?>" 
                             alt="<?php echo htmlspecialchars($user['name']); ?>" 
                             class="profile-avatar"
                             id="avatarPreview">
                        <label for="avatarInput" class="avatar-edit-btn" title="Change Photo">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </label>
                    </div>
                    <form id="avatarForm" method="POST" enctype="multipart/form-data" style="display: none;">
                        <input type="hidden" name="action" value="update_avatar">
                        <input type="file" id="avatarInput" name="avatar" accept="image/jpeg,image/jpg,image/png,image/gif">
                    </form>
                    <h2 class="profile-name"><?php echo htmlspecialchars($user['name']); ?></h2>
                    <div class="status-section">
                        <button class="status-btn" id="statusBtn">
                            <?php if (!empty($user['status_text'])): ?>
                                <span class="status-text-display"><?php echo htmlspecialchars($user['status_text']); ?></span>
                            <?php else: ?>
                                <span class="status-placeholder">Tap to add status</span>
                            <?php endif; ?>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Status Modal -->
            <div class="modal" id="statusModal">
                <div class="modal-content status-modal">
                    <div class="modal-header">
                        <h2>Update Status</h2>
                        <button class="close-btn" id="closeStatusModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="statusForm" method="POST">
                            <input type="hidden" name="action" value="update_status">
                            <div class="form-group">
                                <label>Status</label>
                                <textarea name="status_text" id="statusTextInput" rows="3" maxlength="139" placeholder="What's on your mind?"><?php echo htmlspecialchars($user['status_text'] ?? ''); ?></textarea>
                                <small class="form-hint">
                                    <span id="statusCharCount">0</span>/139 characters
                                </small>
                            </div>
                            <button type="submit" class="btn btn-primary">Update Status</button>
                        </form>
                    </div>
                </div>
            </div>
            
            <!-- Profile Information -->
            <div class="profile-section">
                <h3 class="section-title">Profile Information</h3>
                
                <form method="POST" class="profile-form">
                    <input type="hidden" name="action" value="update_profile">
                    
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" name="name" value="<?php echo htmlspecialchars($user['name']); ?>" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Mobile Number</label>
                        <input type="text" name="mobile" value="<?php echo htmlspecialchars($user['mobile']); ?>" readonly>
                        <small class="form-hint">Mobile number cannot be changed</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="email" value="<?php echo htmlspecialchars($user['email'] ?? ''); ?>">
                    </div>
                    
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </form>
            </div>
            
            <!-- Account Actions -->
            <div class="profile-section">
                <h3 class="section-title">Account</h3>
                
                <div class="account-actions">
                    <a href="logout.php" class="action-item logout-btn">
                        <span>Logout</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                    </a>
                </div>
            </div>
            
            <!-- Account Info -->
            <div class="profile-section">
                <div class="info-item">
                    <span class="info-label">Member since</span>
                    <span class="info-value"><?php echo date('F Y', strtotime($user['created_at'])); ?></span>
                </div>
                <div class="info-item">
                    <span class="info-label">Last seen</span>
                    <span class="info-value"><?php echo $user['last_seen'] ? timeAgo($user['last_seen']) : 'Never'; ?></span>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script>
        $(document).ready(function() {
            // Avatar upload with AJAX
            $('#avatarInput').on('change', function() {
                if (this.files && this.files[0]) {
                    const file = this.files[0];
                    
                    // Validate file type
                    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
                    if (!allowedTypes.includes(file.type)) {
                        alert('Invalid file type. Only JPEG, PNG, and GIF are allowed.');
                        $(this).val('');
                        return;
                    }
                    
                    // Validate file size (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        alert('File size too large. Maximum 5MB allowed.');
                        $(this).val('');
                        return;
                    }
                    
                    // Preview image
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        $('#avatarPreview').attr('src', e.target.result);
                    };
                    reader.readAsDataURL(file);
                    
                    // Upload via AJAX
                    const formData = new FormData();
                    formData.append('avatar', file);
                    
                    $.ajax({
                        url: 'api/upload.php?action=avatar',
                        method: 'POST',
                        data: formData,
                        processData: false,
                        contentType: false,
                        success: function(response) {
                            if (response.success) {
                                // Show success message
                                $('.alert-success').remove();
                                $('.profile-content').prepend(
                                    '<div class="alert alert-success">' + response.message + '</div>'
                                );
                                
                                // Update avatar in sidebar if on same page
                                if (window.opener) {
                                    window.opener.location.reload();
                                }
                            } else {
                                alert(response.error || 'Failed to upload avatar');
                            }
                        },
                        error: function() {
                            alert('Error uploading avatar. Please try again.');
                        }
                    });
                }
            });
            
            // Confirm logout
            $('.logout-btn').on('click', function(e) {
                if (!confirm('Are you sure you want to logout?')) {
                    e.preventDefault();
                }
            });
            
            // Status button
            $('#statusBtn').on('click', function() {
                $('#statusModal').addClass('active');
                $('#statusTextInput').focus();
            });
            
            $('#closeStatusModal').on('click', function() {
                $('#statusModal').removeClass('active');
            });
            
            // Character count
            $('#statusTextInput').on('input', function() {
                const length = $(this).val().length;
                $('#statusCharCount').text(length);
                
                if (length > 139) {
                    $('#statusCharCount').parent().addClass('text-danger');
                } else {
                    $('#statusCharCount').parent().removeClass('text-danger');
                }
            });
            
            // Initialize character count
            $('#statusCharCount').text($('#statusTextInput').val().length);
            
            // Status form submit
            $('#statusForm').on('submit', function(e) {
                e.preventDefault();
                
                const statusText = $('#statusTextInput').val().trim();
                
                if (statusText.length > 139) {
                    alert('Status cannot exceed 139 characters');
                    return;
                }
                
                $.ajax({
                    url: 'profile.php',
                    method: 'POST',
                    data: {
                        action: 'update_status',
                        status_text: statusText
                    },
                    success: function(response) {
                        // Reload page to show updated status
                        window.location.reload();
                    },
                    error: function() {
                        alert('Error updating status. Please try again.');
                    }
                });
            });
            
            // Auto-hide alerts after 5 seconds
            setTimeout(function() {
                $('.alert').fadeOut();
            }, 5000);
        });
    </script>
</body>
</html>

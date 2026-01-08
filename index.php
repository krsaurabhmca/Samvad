<?php
require_once 'includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    header('Location: login.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Clone - Chat</title>
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
    <div class="chat-container">
        <!-- Sidebar -->
        <div class="sidebar">
            <div class="sidebar-header">
                <div class="user-info">
                    <img src="<?php echo htmlspecialchars($user['avatar'] ?: 'assets/images/default-avatar.png'); ?>" 
                         alt="<?php echo htmlspecialchars($user['name']); ?>" class="user-avatar">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span class="user-name"><?php echo htmlspecialchars($user['name']); ?></span>
                        <?php if (!empty($user['status_text'])): ?>
                            <span class="user-status-text" style="font-size: 12px; color: #667781;"><?php echo htmlspecialchars($user['status_text']); ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="sidebar-actions">
                    <button class="icon-btn" id="newChatBtn" title="New Chat">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <a href="profile.php" class="icon-btn" title="Profile">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </a>
                </div>
            </div>
            
            <!-- Stories Section -->
            <div class="stories-section" id="storiesSection">
                <div class="stories-container" id="storiesContainer">
                    <!-- Stories will be loaded here -->
                </div>
            </div>
            
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search or start new chat">
            </div>
            
            <div class="conversations-list" id="conversationsList">
                <!-- Conversations will be loaded here -->
            </div>
        </div>
        
        <!-- Chat Area -->
        <div class="chat-area">
            <div class="empty-chat" id="emptyChat">
                <div class="empty-chat-icon">💬</div>
                <h2>Select a chat to start messaging</h2>
            </div>
            
            <div class="chat-window" id="chatWindow" style="display: none;">
                <div class="chat-header">
                    <div class="chat-user-info">
                        <img id="chatUserAvatar" src="" alt="" class="chat-avatar">
                        <div>
                            <h3 id="chatUserName"></h3>
                            <span id="chatUserStatus" class="user-status"></span>
                        </div>
                    </div>
                    <div class="chat-actions">
                        <button class="icon-btn" id="infoBtn" title="Info">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="messages-container" id="messagesContainer">
                    <!-- Messages will be loaded here -->
                </div>
                
                <div class="typing-indicator" id="typingIndicator" style="display: none;">
                    <span></span>
                </div>
                
                <div class="chat-input-area">
                    <div class="attachments-preview" id="attachmentsPreview"></div>
                    <div class="chat-input-row">
                        <button class="icon-btn" id="attachBtn" title="Attach File">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                            </svg>
                        </button>
                        <input type="file" id="fileInput" multiple style="display: none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar">
                        <input type="text" id="messageInput" placeholder="Type a message">
                        <button class="icon-btn send-btn" id="sendBtn" title="Send">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- New Chat Modal -->
    <div class="modal" id="newChatModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>New Chat</h2>
                <button class="close-btn" id="closeNewChatModal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="chat-type-tabs">
                    <button class="tab-btn active" data-type="single">Single Chat</button>
                    <button class="tab-btn" data-type="group">New Group</button>
                </div>
                <div id="singleChatTab" class="chat-tab active">
                    <input type="text" id="userSearchInput" placeholder="Search users...">
                    <div class="users-list" id="usersList"></div>
                </div>
                <div id="groupChatTab" class="chat-tab">
                    <div class="form-group">
                        <label>Group Name</label>
                        <input type="text" id="groupNameInput" placeholder="Enter group name">
                    </div>
                    <div class="form-group">
                        <label>Add Participants</label>
                        <input type="text" id="groupUserSearchInput" placeholder="Search users to add...">
                        <div class="selected-users" id="selectedUsers"></div>
                    </div>
                    <div class="users-list" id="groupUsersList"></div>
                    <button class="btn btn-primary" id="createGroupBtn" style="width: 100%; margin-top: 16px;">Create Group</button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Group Info Modal -->
    <div class="modal" id="groupInfoModal">
        <div class="modal-content group-info-modal">
            <div class="modal-header">
                <h2>Group Info</h2>
                <button class="close-btn" id="closeGroupInfoModal">&times;</button>
            </div>
            <div class="modal-body" id="groupInfoContent">
                <!-- Group info will be loaded here -->
            </div>
        </div>
    </div>
    
    <!-- Group Settings Modal -->
    <div class="modal" id="groupSettingsModal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Group Settings</h2>
                <button class="close-btn" id="closeGroupSettingsModal">&times;</button>
            </div>
            <div class="modal-body">
                <div id="groupSettingsContent">
                    <!-- Group settings will be loaded here -->
                </div>
            </div>
        </div>
    </div>
    
    <!-- Create Story Modal -->
    <div class="modal" id="createStoryModal">
        <div class="modal-content story-create-modal">
            <div class="modal-header">
                <h2>Create Story</h2>
                <button class="close-btn" id="closeCreateStoryModal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="createStoryForm">
                    <div class="form-group">
                        <label>Add Photo</label>
                        <input type="file" id="storyImageInput" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" style="display: none;">
                        <button type="button" class="btn btn-secondary" id="selectImageBtn" style="width: 100%; margin-bottom: 16px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right: 8px;">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                            </svg>
                            Select Photo
                        </button>
                        <div id="storyImagePreview" style="display: none; margin-bottom: 16px;">
                            <img id="storyImagePreviewImg" src="" alt="Preview" style="max-width: 100%; max-height: 300px; border-radius: 8px;">
                            <button type="button" id="removeImageBtn" class="btn btn-danger" style="margin-top: 8px; width: 100%;">Remove Photo</button>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Text</label>
                        <textarea id="storyTextInput" rows="4" placeholder="What's on your mind?" maxlength="500"></textarea>
                        <small class="form-hint">
                            <span id="storyCharCount">0</span>/500 characters
                        </small>
                    </div>
                    
                    <div class="form-group">
                        <label>Link (Optional)</label>
                        <input type="url" id="storyLinkInput" placeholder="https://example.com">
                    </div>
                    
                    <button type="submit" class="btn btn-primary" style="width: 100%;">Post Story</button>
                </form>
            </div>
        </div>
    </div>
    
    <!-- Story Viewer Modal -->
    <div class="modal" id="storyViewerModal">
        <div class="story-viewer">
            <div class="story-viewer-header">
                <div class="story-viewer-user">
                    <img id="storyViewerAvatar" src="" alt="" class="story-viewer-avatar">
                    <div>
                        <h3 id="storyViewerName"></h3>
                        <span id="storyViewerTime"></span>
                    </div>
                </div>
                <div class="story-viewer-actions">
                    <button class="story-action-btn" id="viewersBtn" title="Viewers" style="display: none;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span id="viewersCount">0</span>
                    </button>
                    <button class="story-action-btn" id="repliesBtn" title="Replies" style="display: none;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span id="repliesCount">0</span>
                    </button>
                    <button class="close-btn" id="closeStoryViewerModal">&times;</button>
                </div>
            </div>
            <div class="story-progress-container" id="storyProgressContainer">
                <!-- Progress bars will be added here -->
            </div>
            <div class="story-viewer-content" id="storyViewerContent">
                <!-- Story content will be loaded here -->
            </div>
            <div class="story-reply-area" id="storyReplyArea" style="display: none;">
                <input type="text" id="storyReplyInput" placeholder="Reply to story..." maxlength="500">
                <button class="story-reply-send" id="storyReplySendBtn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
            <div class="story-viewer-nav">
                <button class="story-nav-btn" id="prevStoryBtn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <button class="story-reply-toggle" id="storyReplyToggle">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </button>
                <button class="story-nav-btn" id="nextStoryBtn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>
        </div>
    </div>
    
    <!-- Story Viewers Modal -->
    <div class="modal" id="storyViewersModal">
        <div class="modal-content story-viewers-modal">
            <div class="modal-header">
                <h2>Viewers</h2>
                <button class="close-btn" id="closeStoryViewersModal">&times;</button>
            </div>
            <div class="modal-body">
                <div id="storyViewersList">
                    <!-- Viewers will be loaded here -->
                </div>
            </div>
        </div>
    </div>
    
    <!-- Story Replies Modal -->
    <div class="modal" id="storyRepliesModal">
        <div class="modal-content story-replies-modal">
            <div class="modal-header">
                <h2>Replies</h2>
                <button class="close-btn" id="closeStoryRepliesModal">&times;</button>
            </div>
            <div class="modal-body">
                <div id="storyRepliesList">
                    <!-- Replies will be loaded here -->
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // WebSocket Configuration
        const WS_HOST = '<?php echo WS_HOST; ?>';
        const WS_PORT = <?php echo WS_PORT; ?>;
    </script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>

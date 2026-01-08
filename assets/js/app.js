const App = {
    ws: null,
    currentUser: null,
    currentConversation: null,
    
    // Toast notification system
    showConfirmDialog: function(message, onConfirm, onCancel = null) {
        // Create a simple confirmation dialog using native confirm for now
        // In a production app, you might want a custom modal
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
    },
    
    showConfirmDialog: function(message, onConfirm, onCancel = null) {
        // Create a simple confirmation dialog using native confirm for now
        // In a production app, you might want a custom modal
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
        }
    },
    
    showToast: function(message, type = 'info', duration = 3000) {
        const toast = $(`
            <div class="toast toast-${type}">
                <div class="toast-content">
                    <div class="toast-icon">
                        ${type === 'success' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : 
                          type === 'error' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' :
                          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'}
                    </div>
                    <div class="toast-message">${this.escapeHtml(message)}</div>
                    <button class="toast-close">&times;</button>
                </div>
            </div>
        `);
        
        $('#toastContainer').append(toast);
        
        // Animate in
        setTimeout(() => toast.addClass('show'), 10);
        
        // Auto remove
        const autoRemove = setTimeout(() => {
            this.removeToast(toast);
        }, duration);
        
        // Manual close
        toast.find('.toast-close').on('click', () => {
            clearTimeout(autoRemove);
            this.removeToast(toast);
        });
    },
    
    removeToast: function($toast) {
        $toast.removeClass('show');
        setTimeout(() => $toast.remove(), 300);
    },
    conversations: [],
    stories: [],
    allStoryGroups: [], // All story groups for auto-advance to next person
    currentStoryGroupIndex: 0, // Index of current story group in allStoryGroups
    currentStoryGroup: null,
    currentStoryIndex: 0,
    currentStory: null,
    storyAutoAdvanceTimer: null,
    storyProgressInterval: null,
    storyStartTime: null,
    storyDuration: 5000, // 5 seconds per story
    isStoryPaused: false,
    pausedElapsed: null,
    typingTimeout: null,
    pendingAttachments: [],
    replyingTo: null, // Message being replied to
    forwardingMessage: null, // Message being forwarded
    
    init: function() {
        this.loadUser();
        this.loadConversations();
        this.loadStories();
        this.bindEvents();
        // WebSocket will be initialized after user loads
    },
    
    loadUser: function() {
        $.ajax({
            url: 'api/auth.php?action=check',
            method: 'GET',
            success: (response) => {
                if (response.authenticated) {
                    this.currentUser = response.user;
                    // Initialize WebSocket after user is loaded
                    this.initWebSocket();
                } else {
                    window.location.href = 'login.php';
                }
            },
            error: () => {
                window.location.href = 'login.php';
            }
        });
    },
    
    loadConversations: function() {
        $.ajax({
            url: 'api/conversations.php?action=list',
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    this.conversations = response.conversations;
                    this.renderConversations();
                }
            }
        });
    },
    
    loadStories: function() {
        $.ajax({
            url: 'api/stories.php?action=list',
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    this.stories = response.stories || [];
                    this.allStoryGroups = this.stories.filter(s => s.stories && s.stories.length > 0);
                    this.renderStories();
                }
            },
            error: () => {
                this.stories = [];
                this.renderStories();
            }
        });
    },
    
    renderStories: function() {
        const $container = $('#storiesContainer');
        $container.empty();
        
        // Add "My Story" option first
        const myStories = this.stories.find(s => s.is_my_story) || { user_id: this.currentUser?.id, user_name: this.currentUser?.name || 'You', user_avatar: this.currentUser?.avatar || 'assets/images/default-avatar.png', stories: [] };
        const hasMyStories = myStories.stories && myStories.stories.length > 0;
        
        const $myStory = $(`
            <div class="story-item ${!hasMyStories ? 'add-story' : ''}" data-user-id="${myStories.user_id}" data-is-my-story="true">
                <div class="story-avatar-wrapper">
                    <img src="${myStories.user_avatar || 'assets/images/default-avatar.png'}" alt="${this.escapeHtml(myStories.user_name)}" class="story-avatar" onerror="this.src='assets/images/default-avatar.png'">
                    ${!hasMyStories ? '<div class="add-story-icon">+</div>' : ''}
                    ${hasMyStories ? '<button class="story-delete-btn" title="Delete Story">&times;</button>' : ''}
                </div>
                <div class="story-name">${this.escapeHtml(myStories.user_name)}</div>
            </div>
        `);
        
        $myStory.on('click', (e) => {
            if ($(e.target).hasClass('story-delete-btn') || $(e.target).closest('.story-delete-btn').length) {
                e.stopPropagation();
                // Use custom confirmation
                this.showConfirmDialog('Are you sure you want to delete your story?', () => {
                    this.deleteStory(myStories.stories[0].id);
                });
            } else if (!hasMyStories) {
                this.openCreateStoryModal();
            } else {
                this.viewStories(myStories);
            }
        });
        
        $container.append($myStory);
        
        // Add other users' stories
        this.stories.forEach(storyGroup => {
            if (!storyGroup.is_my_story && storyGroup.stories && storyGroup.stories.length > 0) {
                const hasUnviewed = storyGroup.stories.some(s => !s.is_viewed);
                const $story = $(`
                    <div class="story-item ${hasUnviewed ? 'unviewed' : ''}" data-user-id="${storyGroup.user_id}">
                        <div class="story-avatar-wrapper">
                            <img src="${storyGroup.user_avatar || 'assets/images/default-avatar.png'}" alt="${this.escapeHtml(storyGroup.user_name)}" class="story-avatar" onerror="this.src='assets/images/default-avatar.png'">
                        </div>
                        <div class="story-name">${this.escapeHtml(storyGroup.user_name)}</div>
                    </div>
                `);
                
                $story.on('click', () => this.viewStories(storyGroup));
                $container.append($story);
            }
        });
    },
    
    openCreateStoryModal: function() {
        $('#createStoryModal').addClass('active');
        $('#storyTextInput').focus();
    },
    
    viewStories: function(storyGroup) {
        if (!storyGroup.stories || storyGroup.stories.length === 0) {
            return;
        }
        
        // Find index of this story group in allStoryGroups
        const groupIndex = this.allStoryGroups.findIndex(sg => sg.user_id == storyGroup.user_id);
        if (groupIndex !== -1) {
            this.currentStoryGroupIndex = groupIndex;
        }
        
        this.currentStoryGroup = storyGroup;
        this.currentStoryIndex = 0;
        this.showStory(0);
        $('#storyViewerModal').addClass('active');
        
        // Mark as viewed
        const currentStory = storyGroup.stories[this.currentStoryIndex];
        if (currentStory && !currentStory.is_viewed && !storyGroup.is_my_story) {
            $.ajax({
                url: 'api/stories.php?action=view',
                method: 'POST',
                data: { story_id: currentStory.id }
            });
        }
    },
    
    showStory: function(index) {
        if (!this.currentStoryGroup || !this.currentStoryGroup.stories) {
            return;
        }
        
        if (index < 0 || index >= this.currentStoryGroup.stories.length) {
            this.closeStoryViewer();
            return;
        }
        
        // Clear previous timers
        this.clearStoryTimers();
        this.isStoryPaused = false;
        this.pausedElapsed = null;
        
        this.currentStoryIndex = index;
        const story = this.currentStoryGroup.stories[index];
        this.currentStory = story;
        
        // Update header
        $('#storyViewerName').text(this.currentStoryGroup.user_name);
        $('#storyViewerAvatar').attr('src', this.currentStoryGroup.user_avatar || 'assets/images/default-avatar.png');
        $('#storyViewerTime').text(this.formatTime(story.created_at));
        
        // Show/hide viewers and replies buttons (only for own stories)
        const isMyStory = this.currentStoryGroup.is_my_story;
        $('#viewersBtn').toggle(isMyStory);
        $('#repliesBtn').toggle(isMyStory);
        
        if (isMyStory) {
            // Load view count and reply count
            this.loadStoryStats(story.id);
        }
        
        // Show/hide reply area (only for others' stories)
        $('#storyReplyArea').toggle(!isMyStory);
        
        // Update content
        const $content = $('#storyViewerContent');
        $content.empty();
        
        let contentHtml = '';
        
        if (story.status_image) {
            contentHtml += `<div class="story-image-container"><img src="${story.status_image}" alt="Story" class="story-image"></div>`;
        }
        
        // Text and link will be shown in footer, not in content
        // Only show image in content area
        
        $content.html(contentHtml);
        
        // Update footer with text and link (transparent badge style)
        const $footer = $('.story-viewer-nav');
        let footerHtml = '';
        
        if (story.status_text || story.status_link) {
            footerHtml = '<div class="story-footer-content">';
            if (story.status_text) {
                footerHtml += `<div class="story-footer-text">${this.escapeHtml(story.status_text)}</div>`;
            }
            if (story.status_link) {
                footerHtml += `<div class="story-footer-link"><a href="${story.status_link}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(story.status_link)}</a></div>`;
            }
            footerHtml += '</div>';
        }
        
        // Add navigation buttons
        footerHtml += `
            <button class="story-nav-btn" id="prevStoryBtn" ${index > 0 ? '' : 'style="display: none;"'}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
            <button class="story-reply-toggle" id="storyReplyToggle" style="display: ${!isMyStory ? 'flex' : 'none'};">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            </button>
            <button class="story-nav-btn" id="nextStoryBtn" ${index < this.currentStoryGroup.stories.length - 1 ? '' : 'style="display: none;"'}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
        `;
        
        $footer.html(footerHtml);
        
        // Re-bind navigation button events
        $('#prevStoryBtn').off('click').on('click', () => {
            if (this.currentStoryIndex > 0) {
                this.showStory(this.currentStoryIndex - 1);
            }
        });
        
        $('#nextStoryBtn').off('click').on('click', () => {
            if (this.currentStoryIndex < this.currentStoryGroup.stories.length - 1) {
                this.showStory(this.currentStoryIndex + 1);
            } else {
                this.advanceToNextPersonStory();
            }
        });
        
        $('#storyReplyToggle').off('click').on('click', (e) => {
            e.stopPropagation();
            $('#storyReplyArea').toggle();
            if ($('#storyReplyArea').is(':visible')) {
                $('#storyReplyInput').focus();
            }
        });
        
        // Create progress bars
        this.createProgressBars();
        
        // Start auto-advance timer
        this.startStoryTimer();
        
        // Mark as viewed
        if (!story.is_viewed && !this.currentStoryGroup.is_my_story) {
            $.ajax({
                url: 'api/stories.php?action=view',
                method: 'POST',
                data: { story_id: story.id }
            });
        }
    },
    
    createProgressBars: function() {
        const $container = $('#storyProgressContainer');
        $container.empty();
        
        if (!this.currentStoryGroup || !this.currentStoryGroup.stories) {
            return;
        }
        
        const totalStories = this.currentStoryGroup.stories.length;
        
        for (let i = 0; i < totalStories; i++) {
            const $bar = $('<div class="story-progress-bar"></div>');
            if (i < this.currentStoryIndex) {
                $bar.addClass('completed');
                if ($bar[0]) $bar[0].style.setProperty('--progress-width', '100%');
            } else if (i === this.currentStoryIndex) {
                $bar.addClass('active');
                if ($bar[0]) $bar[0].style.setProperty('--progress-width', '0%');
            } else {
                if ($bar[0]) $bar[0].style.setProperty('--progress-width', '0%');
            }
            $container.append($bar);
        }
    },
    
    startStoryTimer: function() {
        if (this.isStoryPaused) return;
        
        this.storyStartTime = Date.now();
        const $activeBar = $('#storyProgressContainer .story-progress-bar').eq(this.currentStoryIndex);
        $activeBar.removeClass('paused');
        
        // Update progress every 16ms (~60fps) for smooth animation
        this.storyProgressInterval = setInterval(() => {
            if (!this.currentStory || !this.storyStartTime || this.isStoryPaused) return;
            
            const elapsed = Date.now() - this.storyStartTime;
            const progress = Math.min((elapsed / this.storyDuration) * 100, 100);
            
            // Update the ::after pseudo-element width using CSS variable
            if ($activeBar.length && $activeBar[0]) {
                $activeBar[0].style.setProperty('--progress-width', progress + '%');
            }
            
            if (progress >= 100) {
                this.advanceToNextStory();
            }
        }, 16);
        
        // Auto-advance after duration
        this.storyAutoAdvanceTimer = setTimeout(() => {
            if (!this.isStoryPaused) {
                this.advanceToNextStory();
            }
        }, this.storyDuration);
    },
    
    pauseStory: function() {
        if (!this.currentStory) return;
        
        this.isStoryPaused = true;
        const $activeBar = $('#storyProgressContainer .story-progress-bar').eq(this.currentStoryIndex);
        $activeBar.addClass('paused');
        
        // Save elapsed time
        if (this.storyStartTime) {
            this.pausedElapsed = Date.now() - this.storyStartTime;
        }
        
        this.clearStoryTimers();
    },
    
    resumeStory: function() {
        if (!this.currentStory || !this.isStoryPaused) return;
        
        this.isStoryPaused = false;
        
        // Adjust start time to account for paused duration
        if (this.pausedElapsed) {
            this.storyStartTime = Date.now() - this.pausedElapsed;
            this.pausedElapsed = null;
        }
        
        this.startStoryTimer();
    },
    
    toggleStoryPause: function() {
        if (this.isStoryPaused) {
            this.resumeStory();
        } else {
            this.pauseStory();
        }
    },
    
    clearStoryTimers: function() {
        if (this.storyAutoAdvanceTimer) {
            clearTimeout(this.storyAutoAdvanceTimer);
            this.storyAutoAdvanceTimer = null;
        }
        if (this.storyProgressInterval) {
            clearInterval(this.storyProgressInterval);
            this.storyProgressInterval = null;
        }
        // Don't reset storyStartTime when pausing
        if (!this.isStoryPaused) {
            this.storyStartTime = null;
        }
    },
    
    advanceToNextStory: function() {
        this.clearStoryTimers();
        
        if (this.currentStoryIndex < this.currentStoryGroup.stories.length - 1) {
            // Move to next story in current group
            this.showStory(this.currentStoryIndex + 1);
        } else {
            // Move to next person's stories
            this.advanceToNextPersonStory();
        }
    },
    
    advanceToNextPersonStory: function() {
        // Find next person's story group (skip own stories)
        let nextGroupIndex = this.currentStoryGroupIndex + 1;
        
        // Find next person's stories (skip own stories)
        while (nextGroupIndex < this.allStoryGroups.length) {
            const nextGroup = this.allStoryGroups[nextGroupIndex];
            if (!nextGroup.is_my_story && nextGroup.stories && nextGroup.stories.length > 0) {
                this.currentStoryGroupIndex = nextGroupIndex;
                this.viewStories(nextGroup);
                return;
            }
            nextGroupIndex++;
        }
        
        // No more stories, close viewer
        this.closeStoryViewer();
    },
    
    closeStoryViewer: function() {
        this.clearStoryTimers();
        this.isStoryPaused = false;
        this.pausedElapsed = null;
        $('#storyViewerModal').removeClass('active');
        $('#storyReplyArea').hide();
        $('#storyReplyInput').val('');
        this.currentStory = null;
        this.currentStoryGroup = null;
        this.currentStoryGroupIndex = 0;
        this.currentStoryIndex = 0;
        $('#storyProgressContainer').empty();
        this.loadStories(); // Reload to update view status
    },
    
    loadStoryStats: function(storyId) {
        // Load viewers count
        $.ajax({
            url: `api/stories.php?action=viewers&story_id=${storyId}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    $('#viewersCount').text(response.viewers.length);
                }
            }
        });
        
        // Load replies count
        $.ajax({
            url: `api/stories.php?action=replies&story_id=${storyId}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    $('#repliesCount').text(response.replies.length);
                }
            }
        });
    },
    
    renderConversations: function() {
        const $list = $('#conversationsList');
        $list.empty();
        
        if (this.conversations.length === 0) {
            $list.html('<div style="padding: 20px; text-align: center; color: #667781;">No conversations yet</div>');
            return;
        }
        
        this.conversations.forEach(conv => {
            const otherUser = conv.other_user || {};
            let avatar, name;
            
            if (conv.type === 'group') {
                avatar = conv.avatar || 'assets/images/group-avatar.png';
                name = conv.title || 'Group';
            } else {
                avatar = otherUser.avatar || 'assets/images/default-avatar.png';
                name = otherUser.name || 'Unknown';
            }
            
            const lastMessage = conv.last_message || 'No messages yet';
            const time = conv.last_message_time ? this.formatTime(conv.last_message_time) : '';
            const unread = conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : '';
            const $item = $(`
                <div class="conversation-item" data-id="${conv.id}">
                    <div class="conversation-avatar-wrapper">
                        <img src="${avatar}" alt="${name}" class="conversation-avatar" onerror="this.src='assets/images/default-avatar.png'">
                        ${conv.type === 'group' ? '<div class="group-icon-badge">👥</div>' : ''}
                    </div>
                    <div class="conversation-info">
                        <div class="conversation-header">
                            <span class="conversation-name">${this.escapeHtml(name)}</span>
                            <span class="conversation-time">${time}</span>
                        </div>
                        <div class="conversation-preview">
                            <span class="conversation-message">${this.escapeHtml(lastMessage)}</span>
                            ${unread}
                        </div>
                    </div>
                </div>
            `);
            
            $item.on('click', () => this.openConversation(conv.id));
            $list.append($item);
        });
    },
    
    openConversation: function(conversationId) {
        // Prevent duplicate loading
        if (this.currentConversation == conversationId && $('#chatWindow').is(':visible')) {
            return;
        }
        
        this.currentConversation = conversationId;
        
        // Update UI
        $('.conversation-item').removeClass('active');
        $(`.conversation-item[data-id="${conversationId}"]`).addClass('active');
        
        $('#emptyChat').hide();
        $('#chatWindow').show();
        
        // Clear messages container first
        $('#messagesContainer').empty();
        
        // Load conversation details
        $.ajax({
            url: `api/conversations.php?action=get&id=${conversationId}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    const conv = response.conversation;
                    this.currentConversationData = conv;
                    
                    if (conv.type === 'single') {
                        const otherUser = conv.members.find(m => m.id != this.currentUser.id);
                        if (otherUser) {
                            $('#chatUserAvatar').off('click').attr('src', otherUser.avatar || 'assets/images/default-avatar.png').on('error', function() {
                                $(this).attr('src', 'assets/images/default-avatar.png');
                            });
                            $('#chatUserName').text(otherUser.name);
                            $('#chatUserStatus').text(this.getUserStatus(otherUser));
                        }
                    } else {
                        const groupAvatar = conv.avatar || 'assets/images/group-avatar.png';
                        $('#chatUserAvatar').off('click').attr('src', groupAvatar).on('error', function() {
                            $(this).attr('src', 'assets/images/group-avatar.png');
                        });
                        $('#chatUserName').text(conv.title);
                        $('#chatUserStatus').text(`${conv.members.length} members`);
                    }
                }
            }
        });
        
        this.loadMessages(conversationId);
    },
    
    loadMessages: function(conversationId) {
        $.ajax({
            url: `api/messages.php?action=list&conversation_id=${conversationId}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    this.renderMessages(response.messages || []);
                } else {
                    console.error('Failed to load messages:', response.error);
                }
            },
            error: (xhr, status, error) => {
                console.error('Error loading messages:', status, error);
                console.error('Response:', xhr.responseText);
            }
        });
    },
    
    renderMessages: function(messages) {
        const $container = $('#messagesContainer');
        
        // If container is empty, clear it first (for initial load)
        if (messages.length > 0 && $container.children().length === 0) {
            $container.empty();
        }
        
        const isGroupChat = this.currentConversationData && this.currentConversationData.type === 'group';
        
        // Track existing message IDs to prevent duplicates
        const existingIds = new Set();
        $container.find('.message').each(function() {
            const msgId = $(this).data('message-id');
            if (msgId) {
                existingIds.add(msgId);
            }
        });
        
        messages.forEach(msg => {
            // Skip if message already exists
            if (existingIds.has(msg.id)) {
                return;
            }
            
            existingIds.add(msg.id);
            const isSent = msg.sender_id == this.currentUser.id;
            const time = this.formatTime(msg.created_at);
            
            // Get avatar URL with proper fallback
            let avatarUrl = 'assets/images/default-avatar.png';
            if (!isSent && msg.sender_avatar) {
                avatarUrl = msg.sender_avatar;
            }
            
            // Create avatar HTML for received messages
            const avatar = isSent ? '' : `<img src="${avatarUrl}" class="message-avatar" alt="${this.escapeHtml(msg.sender_name || 'User')}" onerror="this.onerror=null; this.src='assets/images/default-avatar.png'">`;
            
            // Show sender name in group chats for received messages
            const senderName = isGroupChat && !isSent ? `<div class="message-sender-name">${this.escapeHtml(msg.sender_name || 'Unknown')}</div>` : '';
            
            // Get read receipt status for sent messages
            let statusIcon = '';
            if (isSent) {
                const status = msg.message_status || 'sent';
                if (status === 'read') {
                    statusIcon = '<span class="message-status read double-tick"></span>';
                } else if (status === 'delivered') {
                    statusIcon = '<span class="message-status delivered double-tick"></span>';
                } else {
                    statusIcon = '<span class="message-status sent single-tick"></span>';
                }
            }
            
            // Render attachments
            let attachmentsHtml = '';
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    if (att.file_type === 'image') {
                        attachmentsHtml += `
                            <div class="message-attachment">
                                <img src="${att.file_url}" alt="${this.escapeHtml(att.file_name)}" onclick="window.open('${att.file_url}', '_blank')">
                            </div>
                        `;
                    } else if (att.file_type === 'video') {
                        attachmentsHtml += `
                            <div class="message-attachment">
                                <video controls>
                                    <source src="${att.file_url}" type="${att.mime_type || 'video/mp4'}">
                                </video>
                            </div>
                        `;
                    } else {
                        const fileIcon = this.getFileIcon(att.file_name, att.file_type);
                        const fileIconClass = this.getFileIconClass(att.file_name, att.file_type);
                        attachmentsHtml += `
                            <div class="message-attachment">
                                <a href="${att.file_url}" target="_blank" class="file-attachment">
                                    <div class="file-icon-large ${fileIconClass}">${fileIcon}</div>
                                    <div class="file-info">
                                        <div class="file-info-name">${this.escapeHtml(att.file_name)}</div>
                                        <div class="file-info-size">${this.formatFileSize(att.file_size || 0)}</div>
                                    </div>
                                </a>
                            </div>
                        `;
                    }
                });
            }
            
            // Reply preview (if message is a reply) - Clickable to scroll to original
            let replyHtml = '';
            if (msg.reply_to && msg.reply_message) {
                const replySenderId = msg.reply_sender_id;
                const replySenderName = replySenderId == this.currentUser.id ? 'You' : (msg.reply_sender_name || 'Unknown');
                const replyMessageText = msg.reply_message.length > 50 ? msg.reply_message.substring(0, 50) + '...' : msg.reply_message;
                replyHtml = `
                    <div class="message-reply" data-reply-to="${msg.reply_to}" title="Click to view original message">
                        <div class="message-reply-indicator"></div>
                        <div class="message-reply-content">
                            <div class="message-reply-name">${this.escapeHtml(replySenderName)}</div>
                            <div class="message-reply-text">${this.escapeHtml(replyMessageText)}</div>
                        </div>
                    </div>
                `;
            }
            
            // Forwarded indicator (WhatsApp style)
            const forwardedIndicator = (msg.forwarded_from_message_id || msg.forwarded_from_conversation_id) ? `
                <div class="message-forwarded-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <span>Forwarded</span>
                </div>
            ` : '';
            
            const messageText = msg.message ? `<div class="message-text">${this.escapeHtml(msg.message)}</div>` : '';
            
            // Check if message already exists to prevent duplicates
            if ($container.find(`.message[data-message-id="${msg.id}"]`).length > 0) {
                return; // Skip if message already exists
            }
            
            const isStarred = msg.is_starred == 1;
            const starIcon = isStarred ? `
                <svg class="message-star-icon" width="14" height="14" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" stroke-width="2" style="margin-left: 4px;">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            ` : '';
            
            const $message = $(`
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" data-sender-id="${msg.sender_id}" data-is-starred="${isStarred ? 1 : 0}" data-forwarded-from-message-id="${msg.forwarded_from_message_id || ''}" data-forwarded-from-conversation-id="${msg.forwarded_from_conversation_id || ''}">
                    ${!isSent ? avatar : ''}
                    <div class="message-bubble">
                        ${forwardedIndicator}
                        ${replyHtml}
                        ${senderName}
                        ${attachmentsHtml}
                        ${messageText}
                        <div class="message-time">
                            ${time}
                            ${starIcon}
                            ${statusIcon}
                        </div>
                    </div>
                </div>
            `);
            
            $container.append($message);
        });
        
        this.scrollToBottom();
        
        // Mark messages as read when they're displayed
        if (messages.length > 0) {
            this.markMessagesAsRead(messages);
        }
    },
    
    markMessagesAsRead: function(messages) {
        // Get all unread received messages
        const unreadMessages = messages.filter(msg => 
            msg.sender_id != this.currentUser.id && 
            (!msg.is_read_by_me || msg.is_read_by_me === false)
        );
        
        if (unreadMessages.length > 0) {
            // Mark conversation as read
            $.ajax({
                url: 'api/messages.php?action=mark_conversation_read',
                method: 'POST',
                data: {
                    conversation_id: this.currentConversation
                },
                success: (response) => {
                    if (response.success) {
                        // Notify sender via WebSocket
                        unreadMessages.forEach(msg => {
                            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                                this.ws.send(JSON.stringify({
                                    type: 'read',
                                    message_id: msg.id,
                                    conversation_id: this.currentConversation
                                }));
                            }
                        });
                    }
                }
            });
        }
    },
    
    sendMessage: function() {
        const message = $('#messageInput').val().trim();
        const attachments = this.pendingAttachments;
        
        if ((!message && attachments.length === 0) || !this.currentConversation) return;
        
        const replyTo = this.replyingTo ? this.replyingTo.id : null;
        const forwardFromMessageId = this.forwardingMessage ? this.forwardingMessage.id : null;
        const forwardFromConversationId = this.forwardingMessage ? this.forwardingMessage.conversation_id : null;
        
        $.ajax({
            url: 'api/messages.php?action=send',
            method: 'POST',
            data: {
                conversation_id: this.currentConversation,
                message: message,
                message_type: attachments.length > 0 ? (attachments[0].file_type || 'file') : 'text',
                attachments: JSON.stringify(attachments),
                reply_to: replyTo,
                forwarded_from_message_id: forwardFromMessageId,
                forwarded_from_conversation_id: forwardFromConversationId
            },
            success: (response) => {
                if (response.success) {
                    $('#messageInput').val('');
                    this.pendingAttachments = [];
                    this.renderAttachmentsPreview([]);
                    this.clearReply();
                    this.clearForward();
                    
                    // Add status to message
                    response.message.message_status = 'sent';
                    this.renderMessages([response.message]);
                    
                    // Send via WebSocket to notify recipients
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'message',
                            conversation_id: this.currentConversation,
                            message: response.message
                        }));
                    }
                    
                    // Update delivered status after a short delay (simulating delivery)
                    setTimeout(() => {
                        this.updateMessageStatus(response.message.id, 'delivered');
                    }, 500);
                }
            }
        });
    },
    
    initWebSocket: function() {
        // Check if WebSocket config is available
        if (typeof WS_HOST === 'undefined' || typeof WS_PORT === 'undefined') {
            console.error('WebSocket configuration not found. Make sure you are on index.php');
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${WS_HOST}:${WS_PORT}`;
        
        console.log('Attempting to connect to WebSocket:', wsUrl);
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected successfully');
                // Authenticate
                if (this.currentUser) {
                    this.ws.send(JSON.stringify({
                        type: 'auth',
                        user_id: this.currentUser.id
                    }));
                }
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket connection error. Make sure the WebSocket server is running.');
                console.error('Start the server with: php websocket/server.php');
            };
            
            this.ws.onclose = (event) => {
                console.log('WebSocket disconnected', event.code, event.reason);
                // Only reconnect if it wasn't a manual close
                if (event.code !== 1000) {
                    console.log('Attempting to reconnect in 3 seconds...');
                    setTimeout(() => this.initWebSocket(), 3000);
                }
            };
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            console.error('Make sure the WebSocket server is running on', wsUrl);
        }
    },
    
    handleWebSocketMessage: function(data) {
        switch (data.type) {
            case 'new_message':
                if (data.conversation_id == this.currentConversation) {
                    this.renderMessages([data.message]);
                }
                this.loadConversations();
                break;
            case 'typing':
                this.showTypingIndicator(data.is_typing);
                break;
            case 'read_receipt':
                // Update message status to read (blue double tick)
                this.updateMessageStatus(data.message_id, 'read');
                break;
            case 'delivered_receipt':
                // Update message status to delivered (double tick)
                this.updateMessageStatus(data.message_id, 'delivered');
                break;
            case 'message_deleted':
                if (data.conversation_id == this.currentConversation) {
                    $(`.message[data-message-id="${data.message_id}"]`).fadeOut(300, function() {
                        $(this).remove();
                    });
                }
                break;
        }
    },
    
    updateMessageStatus: function(messageId, status) {
        const $message = $(`.message[data-message-id="${messageId}"]`);
        if ($message.length > 0) {
            const $status = $message.find('.message-status');
            $status.removeClass('sent delivered read');
            $status.addClass(status);
            
            // Update icon
            if (status === 'read') {
                $status.removeClass('single-tick').addClass('double-tick');
            } else if (status === 'delivered') {
                $status.removeClass('single-tick').addClass('double-tick');
            } else {
                $status.removeClass('double-tick').addClass('single-tick');
            }
        }
    },
    
    bindEvents: function() {
        // Attach file button
        $('#attachBtn').on('click', () => {
            $('#fileInput').click();
        });
        
        // File input change
        $('#fileInput').on('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                this.uploadFiles(files);
            }
        });
        
        // Paste files (Ctrl+V / Cmd+V)
        $(document).on('paste', '#messageInput', (e) => {
            const clipboardData = e.originalEvent.clipboardData;
            if (!clipboardData || !this.currentConversation) return;
            
            const items = clipboardData.items;
            if (!items) return;
            
            const files = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // Accept all file types, not just images
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        files.push(file);
                    }
                }
            }
            
            if (files.length > 0) {
                e.preventDefault();
                this.uploadFiles(files);
            }
        });
        
        // Drag and drop files
        let dragCounter = 0;
        
        $(document).on('dragenter', '#chatWindow, #messagesContainer, .chat-area', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            if (this.currentConversation) {
                $('.chat-area').addClass('drag-over');
            }
        });
        
        $(document).on('dragover', '#chatWindow, #messagesContainer, .chat-area', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.currentConversation) {
                $('.chat-area').addClass('drag-over');
            }
        });
        
        $(document).on('dragleave', '#chatWindow, #messagesContainer, .chat-area', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter === 0) {
                $('.chat-area').removeClass('drag-over');
            }
        });
        
        $(document).on('drop', '#chatWindow, #messagesContainer, .chat-area', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            $('.chat-area').removeClass('drag-over');
            
            if (!this.currentConversation) {
                this.showToast('Please select a conversation first', 'warning');
                return;
            }
            
            const files = Array.from(e.originalEvent.dataTransfer.files);
            if (files.length > 0) {
                this.uploadFiles(files);
            }
        });
        
        // Send message
        $('#sendBtn').on('click', () => {
            this.sendMessage();
        });
        
        $('#messageInput').on('keypress', (e) => {
            if (e.which === 13 && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // New chat
        $('#newChatBtn').on('click', () => {
            $('#newChatModal').addClass('active');
            this.resetNewChatModal();
        });
        
        $('#closeNewChatModal').on('click', () => {
            $('#newChatModal').removeClass('active');
        });
        
        // Chat type tabs
        $('.chat-type-tabs .tab-btn').on('click', function() {
            $('.chat-type-tabs .tab-btn').removeClass('active');
            $(this).addClass('active');
            
            const type = $(this).data('type');
            $('.chat-tab').removeClass('active');
            if (type === 'single') {
                $('#singleChatTab').addClass('active');
            } else {
                $('#groupChatTab').addClass('active');
            }
        });
        
        // User search for single chat
        $('#userSearchInput').on('input', (e) => {
            const query = $(e.target).val().trim();
            if (query.length > 2) {
                this.searchUsers(query, 'single');
            } else {
                $('#usersList').empty();
            }
        });
        
        // User search for group
        $('#groupUserSearchInput').on('input', (e) => {
            const query = $(e.target).val().trim();
            if (query.length > 2) {
                this.searchUsers(query, 'group');
            } else {
                $('#groupUsersList').empty();
            }
        });
        
        // Create group
        $('#createGroupBtn').on('click', () => {
            this.createGroup();
        });
        
        // Info button - prevent duplicate handlers
        $('#infoBtn').off('click').on('click', (e) => {
            e.stopPropagation();
            if (this.currentConversationData && this.currentConversationData.type === 'group') {
                this.showGroupInfo();
            }
        });
        
        // Chat avatar click - open group info for groups
        $(document).on('click', '#chatUserAvatar', (e) => {
            e.stopPropagation();
            if (this.currentConversationData && this.currentConversationData.type === 'group') {
                this.showGroupInfo();
            }
        });
        
        $('#closeGroupInfoModal').off('click').on('click', (e) => {
            e.stopPropagation();
            $('#groupInfoModal').removeClass('active');
        });
        
        $('#closeGroupSettingsModal').off('click').on('click', (e) => {
            e.stopPropagation();
            $('#groupSettingsModal').removeClass('active');
        });
        
        // Close modal when clicking outside
        $(document).on('click', '.modal', function(e) {
            if ($(e.target).hasClass('modal')) {
                $(this).removeClass('active');
            }
        });
        
        // Story modal events
        $('#closeCreateStoryModal').on('click', () => {
            $('#createStoryModal').removeClass('active');
            this.resetCreateStoryForm();
        });
        
        $('#closeStoryViewerModal').on('click', () => {
            this.closeStoryViewer();
        });
        
        // Pause/resume on story content click
        $(document).on('click', '#storyViewerContent', (e) => {
            // Don't toggle if clicking on a link or its children
            if ($(e.target).is('a') || $(e.target).closest('a').length > 0) return;
            // Don't toggle if clicking on image (allow zoom/view)
            if ($(e.target).is('img')) return;
            this.toggleStoryPause();
        });
        
        // Story viewers modal
        $('#viewersBtn').on('click', (e) => {
            e.stopPropagation();
            if (this.currentStory) {
                this.showStoryViewers(this.currentStory.id);
            }
        });
        
        $('#closeStoryViewersModal').on('click', () => {
            $('#storyViewersModal').removeClass('active');
        });
        
        // Story replies modal
        $('#repliesBtn').on('click', (e) => {
            e.stopPropagation();
            if (this.currentStory) {
                this.showStoryReplies(this.currentStory.id);
            }
        });
        
        $('#closeStoryRepliesModal').on('click', () => {
            $('#storyRepliesModal').removeClass('active');
        });
        
        // Story reply toggle
        $('#storyReplyToggle').on('click', (e) => {
            e.stopPropagation();
            $('#storyReplyArea').toggle();
            if ($('#storyReplyArea').is(':visible')) {
                $('#storyReplyInput').focus();
            }
        });
        
        // Send story reply
        $('#storyReplySendBtn').on('click', () => {
            this.sendStoryReply();
        });
        
        $('#storyReplyInput').on('keypress', (e) => {
            if (e.which === 13 && !e.shiftKey) {
                e.preventDefault();
                this.sendStoryReply();
            }
        });
        
        $('#selectImageBtn').on('click', () => {
            $('#storyImageInput').click();
        });
        
        $('#storyImageInput').on('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const fileArray = Array.from(files);
                
                // Process each file
                fileArray.forEach((file) => {
                    // Check file size (max 10MB per image)
                    if (file.size > 10 * 1024 * 1024) {
                        this.showToast(`File "${file.name}" is too large. Maximum size is 10MB.`, 'error');
                        return;
                    }
                    
                    // Check if it's an image
                    if (!file.type.startsWith('image/')) {
                        this.showToast(`File "${file.name}" is not an image.`, 'error');
                        return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.pendingStoryImages.push({
                            file: file,
                            preview: event.target.result
                        });
                        this.renderStoryImagesPreview();
                    };
                    reader.readAsDataURL(file);
                });
                
                // Reset input to allow selecting same files again
                $('#storyImageInput').val('');
            }
        });
        
        $('#storyTextInput').on('input', (e) => {
            const length = $(e.target).val().length;
            $('#storyCharCount').text(length);
        });
        
        // Story navigation
        $('#prevStoryBtn').on('click', (e) => {
            e.stopPropagation();
            if (this.currentStoryIndex > 0) {
                this.clearStoryTimers();
                this.showStory(this.currentStoryIndex - 1);
            }
        });
        
        $('#nextStoryBtn').on('click', (e) => {
            e.stopPropagation();
            this.advanceToNextStory();
        });
        
        // Story form submission
        $('#createStoryForm').on('submit', (e) => {
            e.preventDefault();
            this.createStory();
        });
        
        // Reply to message
        $(document).on('click', '.message-action-btn[data-action="reply"]', (e) => {
            e.stopPropagation();
            const messageId = $(e.currentTarget).data('message-id');
            this.replyToMessage(messageId);
        });
        
        // Forward message
        $(document).on('click', '.message-action-btn[data-action="forward"]', (e) => {
            e.stopPropagation();
            const messageId = $(e.currentTarget).data('message-id');
            this.forwardMessage(messageId);
        });
        
        // Cancel reply
        $('#cancelReplyBtn').on('click', () => {
            this.clearReply();
        });
        
        // Forward modal events
        $('#closeForwardModal').on('click', () => {
            $('#forwardMessageModal').removeClass('active');
            this.clearForward();
        });
        
        // Forward message button
        $('#forwardMessageBtn').on('click', () => {
            this.executeForward();
        });
        
        // Forward conversation search
        $('#forwardSearchInput').on('input', (e) => {
            const query = $(e.target).val().trim();
            this.searchForwardConversations(query);
        });
        
        // Click on reply to scroll to original message
        $(document).on('click', '.message-reply[data-reply-to]', (e) => {
            e.stopPropagation();
            const replyToId = $(e.currentTarget).data('reply-to');
            this.scrollToMessage(replyToId);
        });
        
        // Right-click context menu
        $(document).on('contextmenu', '.message', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const messageId = $(e.currentTarget).data('message-id');
            const isSent = $(e.currentTarget).hasClass('sent');
            const isStarred = $(e.currentTarget).data('is-starred') == 1;
            
            this.showContextMenu(e.pageX, e.pageY, messageId, isSent, isStarred);
        });
        
        // Close context menu on click outside
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.context-menu, .message').length) {
                this.hideContextMenu();
            }
        });
        
        // Context menu actions
        $(document).on('click', '.context-menu-item[data-action="reply"]', () => {
            const messageId = $('#messageContextMenu').data('message-id');
            this.replyToMessage(messageId);
            this.hideContextMenu();
        });
        
        $(document).on('click', '.context-menu-item[data-action="forward"]', () => {
            const messageId = $('#messageContextMenu').data('message-id');
            this.forwardMessage(messageId);
            this.hideContextMenu();
        });
        
        $(document).on('click', '.context-menu-item[data-action="copy"]', () => {
            const messageId = $('#messageContextMenu').data('message-id');
            this.copyMessage(messageId);
            this.hideContextMenu();
        });
        
        $(document).on('click', '.context-menu-item[data-action="star"]', () => {
            const messageId = $('#messageContextMenu').data('message-id');
            const isStarred = $('#messageContextMenu').data('is-starred');
            if (isStarred) {
                this.unstarMessage(messageId);
            } else {
                this.starMessage(messageId);
            }
            this.hideContextMenu();
        });
        
        $(document).on('click', '.context-menu-item[data-action="delete"]', () => {
            const messageId = $('#messageContextMenu').data('message-id');
            this.deleteMessage(messageId);
            this.hideContextMenu();
        });
        
        // Keyboard navigation for story viewer
        $(document).on('keydown', (e) => {
            if ($('#storyViewerModal').hasClass('active')) {
                // Don't navigate if typing in reply input
                if ($('#storyReplyInput').is(':focus')) {
                    return;
                }
                
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    $('#prevStoryBtn').click();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    $('#nextStoryBtn').click();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeStoryViewer();
                }
            }
        });
        
        // Typing indicator
        $('#messageInput').on('input', () => {
            if (!this.currentConversation) return;
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'typing',
                    conversation_id: this.currentConversation,
                    is_typing: true
                }));
            }
            
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'typing',
                        conversation_id: this.currentConversation,
                        is_typing: false
                    }));
                }
            }, 1000);
        });
    },
    
    selectedGroupMembers: [],
    
    resetNewChatModal: function() {
        $('.chat-type-tabs .tab-btn').first().click();
        $('#userSearchInput').val('');
        $('#groupNameInput').val('');
        $('#groupUserSearchInput').val('');
        $('#usersList').empty();
        $('#groupUsersList').empty();
        this.selectedGroupMembers = [];
        this.renderSelectedUsers();
    },
    
    searchUsers: function(query, type) {
        $.ajax({
            url: `api/users.php?action=search&q=${encodeURIComponent(query)}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    if (type === 'single') {
                        this.renderUsers(response.users);
                    } else {
                        this.renderGroupUsers(response.users);
                    }
                }
            }
        });
    },
    
    renderUsers: function(users) {
        const $list = $('#usersList');
        $list.empty();
        
        users.forEach(user => {
            const $item = $(`
                <div class="user-item" data-id="${user.id}">
                    <img src="${user.avatar || 'assets/images/default-avatar.png'}" 
                         alt="${user.name}" class="user-avatar" onerror="this.src='assets/images/default-avatar.png'">
                    <div>
                        <div class="conversation-name">${this.escapeHtml(user.name)}</div>
                        <div class="conversation-message">${user.mobile || user.email || ''}</div>
                    </div>
                </div>
            `);
            
            $item.on('click', () => this.createConversation(user.id));
            $list.append($item);
        });
    },
    
    renderGroupUsers: function(users) {
        const $list = $('#groupUsersList');
        $list.empty();
        
        // Filter out already selected users
        const selectedIds = this.selectedGroupMembers.map(u => u.id);
        const availableUsers = users.filter(u => !selectedIds.includes(u.id));
        
        if (availableUsers.length === 0) {
            $list.html('<div style="padding: 12px; text-align: center; color: #667781;">No more users to add</div>');
            return;
        }
        
        availableUsers.forEach(user => {
            const $item = $(`
                <div class="user-item" data-id="${user.id}">
                    <img src="${user.avatar || 'assets/images/default-avatar.png'}" 
                         alt="${user.name}" class="user-avatar" onerror="this.src='assets/images/default-avatar.png'">
                    <div>
                        <div class="conversation-name">${this.escapeHtml(user.name)}</div>
                        <div class="conversation-message">${user.mobile || user.email || ''}</div>
                    </div>
                </div>
            `);
            
            $item.on('click', () => {
                this.selectedGroupMembers.push(user);
                this.renderSelectedUsers();
                $('#groupUserSearchInput').val('');
                $('#groupUsersList').empty();
            });
            
            $list.append($item);
        });
    },
    
    renderSelectedUsers: function() {
        const $container = $('#selectedUsers');
        $container.empty();
        
        this.selectedGroupMembers.forEach((user, index) => {
            const $user = $(`
                <div class="selected-user">
                    <span>${this.escapeHtml(user.name)}</span>
                    <button class="selected-user-remove" data-index="${index}">&times;</button>
                </div>
            `);
            
            $user.find('.selected-user-remove').on('click', () => {
                this.selectedGroupMembers.splice(index, 1);
                this.renderSelectedUsers();
            });
            
            $container.append($user);
        });
    },
    
    createConversation: function(userId) {
        $.ajax({
            url: 'api/conversations.php?action=create',
            method: 'POST',
            data: {
                type: 'single',
                user_ids: [userId]
            },
            success: (response) => {
                if (response.success) {
                    $('#newChatModal').removeClass('active');
                    this.loadConversations();
                    setTimeout(() => {
                        this.openConversation(response.conversation_id);
                    }, 500);
                }
            }
        });
    },
    
    createGroup: function() {
        const groupName = $('#groupNameInput').val().trim();
        const memberIds = this.selectedGroupMembers.map(u => u.id);
        
        if (!groupName) {
            this.showToast('Please enter a group name', 'warning');
            return;
        }
        
        if (memberIds.length === 0) {
            this.showToast('Please add at least one member to the group', 'warning');
            return;
        }
        
        $.ajax({
            url: 'api/conversations.php?action=create',
            method: 'POST',
            data: {
                type: 'group',
                title: groupName,
                user_ids: memberIds
            },
            success: (response) => {
                if (response.success) {
                    $('#newChatModal').removeClass('active');
                    this.loadConversations();
                    setTimeout(() => {
                        this.openConversation(response.conversation_id);
                    }, 500);
                } else {
                    this.showToast(response.error || 'Failed to create group', 'error');
                }
            },
            error: () => {
                this.showToast('Error creating group. Please try again.', 'error');
            }
        });
    },
    
    showGroupInfo: function() {
        if (!this.currentConversationData) return;
        
        const conv = this.currentConversationData;
        const members = conv.members || [];
        const isAdmin = members.find(m => m.id == this.currentUser.id && m.role === 'admin');
        const groupAvatar = conv.avatar || 'assets/images/group-avatar.png';
        
        let membersHtml = '';
        members.forEach(member => {
            const memberIsAdmin = member.role === 'admin';
            const canRemove = isAdmin && member.id != this.currentUser.id;
            membersHtml += `
                <div class="group-member-item" data-member-id="${member.id}">
                    <img src="${member.avatar || 'assets/images/default-avatar.png'}" 
                         alt="${member.name}" class="user-avatar" onerror="this.src='assets/images/default-avatar.png'">
                    <div style="flex: 1; min-width: 0;">
                        <div class="conversation-name">${this.escapeHtml(member.name)}</div>
                        <div class="conversation-message">${member.mobile || member.email || ''}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${memberIsAdmin ? '<span class="group-member-role">Admin</span>' : ''}
                        ${canRemove ? `<button class="btn-remove-member" data-id="${member.id}" title="Remove">×</button>` : ''}
                    </div>
                </div>
            `;
        });
        
        const html = `
            <div class="group-info-header">
                <div class="group-avatar-wrapper">
                    ${groupAvatar && groupAvatar !== 'assets/images/group-avatar.png' 
                        ? `<img src="${groupAvatar}" alt="${this.escapeHtml(conv.title)}" class="group-info-avatar-img" onerror="this.src='assets/images/group-avatar.png'">`
                        : `<div class="group-info-avatar">👥</div>`
                    }
                    ${isAdmin ? '<label for="groupAvatarInput" class="group-avatar-edit-btn" title="Change Photo">📷</label>' : ''}
                    <input type="file" id="groupAvatarInput" accept="image/*" style="display: none;">
                </div>
                <div class="group-info-name">${this.escapeHtml(conv.title)}</div>
                <div class="group-info-members-count">${members.length} ${members.length === 1 ? 'member' : 'members'}</div>
                ${conv.description ? `<div class="group-info-description">${this.escapeHtml(conv.description)}</div>` : ''}
            </div>
            <div>
                ${isAdmin ? `
                    <div class="group-info-actions">
                        <div class="group-info-action-item" id="editGroupSettingsBtn">
                            <span class="action-label">Edit Group</span>
                            <span class="action-icon">›</span>
                        </div>
                    </div>
                ` : ''}
                <h3 class="section-title">${members.length} ${members.length === 1 ? 'Participant' : 'Participants'}</h3>
                <div class="group-members-list">
                    ${membersHtml}
                </div>
                ${isAdmin ? `
                    <div class="group-info-actions" style="margin-top: 16px;">
                        <div class="group-info-action-item" id="addMembersBtn">
                            <span class="action-label">Add Participants</span>
                            <span class="action-icon">+</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        $('#groupInfoContent').html(html);
        $('#groupInfoModal').addClass('active');
        
        // Bind events
        if (isAdmin) {
            // Remove any existing handlers to prevent duplicates
            $('#groupAvatarInput').off('change').on('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    // Validate file before upload
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                    
                    if (!allowedTypes.includes(file.type)) {
                        this.showToast('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.', 'error');
                        $(e.target).val('');
                        return;
                    }
                    
                    if (file.size > maxSize) {
                        this.showToast('File size too large. Maximum 5MB allowed.', 'error');
                        $(e.target).val('');
                        return;
                    }
                    
                    this.uploadGroupAvatar(file);
                }
                // Reset input to allow selecting same file again
                $(e.target).val('');
            });
            
            // Remove existing handlers to prevent duplicates
            $(document).off('click', '.group-info-action-item').on('click', '.group-info-action-item', function(e) {
                e.stopPropagation();
                const id = $(this).attr('id');
                if (id === 'editGroupSettingsBtn') {
                    App.showGroupSettings();
                } else if (id === 'addMembersBtn') {
                    App.showAddMembers();
                }
            });
            
            $(document).off('click', '.btn-remove-member').on('click', '.btn-remove-member', function(e) {
                e.stopPropagation();
                const memberId = $(this).data('id');
                // Use custom confirmation
                App.showConfirmDialog('Are you sure you want to remove this member?', () => {
                    App.removeGroupMember(memberId);
                });
            });
        }
    },
    
    uploadGroupAvatar: function(file) {
        if (!file) return;
        
        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('conversation_id', this.currentConversation);
        
        $.ajax({
            url: 'api/upload.php?action=group_avatar',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                if (response.success) {
                    // Update avatar in group info
                    $('.group-info-avatar-img').attr('src', response.avatar_url + '?t=' + Date.now());
                    // Also update in chat header
                    $('#chatUserAvatar').attr('src', response.avatar_url + '?t=' + Date.now());
                    this.loadConversations();
                    
                    this.showToast('Group photo updated successfully', 'success');
                } else {
                    this.showToast(response.error || 'Failed to upload photo', 'error');
                }
            },
            error: (xhr, status, error) => {
                let errorMsg = 'Error uploading photo. Please try again.';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMsg = xhr.responseJSON.error;
                }
                this.showToast(errorMsg, 'error');
                console.error('Upload error:', xhr.responseText);
            }
        });
    },
    
    showGroupSettings: function() {
        if (!this.currentConversationData) return;
        
        const conv = this.currentConversationData;
        
        const html = `
            <div class="group-settings-form">
                <div class="form-group">
                    <label>Group Name</label>
                    <input type="text" id="groupSettingsName" value="${this.escapeHtml(conv.title)}" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="groupSettingsDescription" rows="3" placeholder="Enter group description...">${this.escapeHtml(conv.description || '')}</textarea>
                </div>
                <button class="btn btn-primary" id="saveGroupSettingsBtn">Save Changes</button>
            </div>
        `;
        
        $('#groupSettingsContent').html(html);
        $('#groupInfoModal').removeClass('active');
        $('#groupSettingsModal').addClass('active');
        
        $('#saveGroupSettingsBtn').on('click', () => {
            this.saveGroupSettings();
        });
        
        $('#closeGroupSettingsModal').on('click', () => {
            $('#groupSettingsModal').removeClass('active');
            this.showGroupInfo();
        });
    },
    
    saveGroupSettings: function() {
        const title = $('#groupSettingsName').val().trim();
        const description = $('#groupSettingsDescription').val().trim();
        
        if (!title) {
            this.showToast('Group name is required', 'warning');
            return;
        }
        
        $.ajax({
            url: 'api/conversations.php?action=update',
            method: 'POST',
            data: {
                conversation_id: this.currentConversation,
                title: title,
                description: description
            },
            success: (response) => {
                if (response.success) {
                    $('#groupSettingsModal').removeClass('active');
                    this.loadConversations();
                    this.openConversation(this.currentConversation);
                    this.showGroupInfo();
                    this.showToast('Group settings updated successfully', 'success');
                } else {
                    this.showToast(response.error || 'Failed to update settings', 'error');
                }
            },
            error: () => {
                this.showToast('Error updating settings. Please try again.', 'error');
            }
        });
    },
    
    showAddMembers: function() {
        const html = `
            <div class="add-members-form">
                <div class="form-group">
                    <label>Search Users</label>
                    <input type="text" id="addMemberSearchInput" placeholder="Search users to add...">
                </div>
                <div class="selected-users" id="addMemberSelectedUsers"></div>
                <div class="users-list" id="addMemberUsersList"></div>
                <button class="btn btn-primary" id="confirmAddMembersBtn" style="width: 100%; margin-top: 16px;">Add Selected Members</button>
            </div>
        `;
        
        $('#groupInfoContent').html(html);
        
        this.addMemberSelectedUsers = [];
        this.renderAddMemberSelectedUsers();
        
        $('#addMemberSearchInput').on('input', (e) => {
            const query = $(e.target).val().trim();
            if (query.length > 2) {
                this.searchUsersForAdd(query);
            } else {
                $('#addMemberUsersList').empty();
            }
        });
        
        $('#confirmAddMembersBtn').on('click', () => {
            this.addMembersToGroup();
        });
    },
    
    addMemberSelectedUsers: [],
    
    searchUsersForAdd: function(query) {
        $.ajax({
            url: `api/users.php?action=search&q=${encodeURIComponent(query)}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    this.renderAddMemberUsers(response.users);
                }
            }
        });
    },
    
    renderAddMemberUsers: function(users) {
        const $list = $('#addMemberUsersList');
        $list.empty();
        
        // Filter out already selected and existing members
        const selectedIds = this.addMemberSelectedUsers.map(u => u.id);
        const existingIds = (this.currentConversationData.members || []).map(m => m.id);
        const availableUsers = users.filter(u => !selectedIds.includes(u.id) && !existingIds.includes(u.id));
        
        if (availableUsers.length === 0) {
            $list.html('<div style="padding: 12px; text-align: center; color: #667781;">No users available to add</div>');
            return;
        }
        
        availableUsers.forEach(user => {
            const $item = $(`
                <div class="user-item" data-id="${user.id}">
                    <img src="${user.avatar || 'assets/images/default-avatar.png'}" 
                         alt="${user.name}" class="user-avatar" onerror="this.src='assets/images/default-avatar.png'">
                    <div>
                        <div class="conversation-name">${this.escapeHtml(user.name)}</div>
                        <div class="conversation-message">${user.mobile || user.email || ''}</div>
                    </div>
                </div>
            `);
            
            $item.on('click', () => {
                this.addMemberSelectedUsers.push(user);
                this.renderAddMemberSelectedUsers();
                $('#addMemberSearchInput').val('');
                $('#addMemberUsersList').empty();
            });
            
            $list.append($item);
        });
    },
    
    renderAddMemberSelectedUsers: function() {
        const $container = $('#addMemberSelectedUsers');
        $container.empty();
        
        this.addMemberSelectedUsers.forEach((user, index) => {
            const $user = $(`
                <div class="selected-user">
                    <span>${this.escapeHtml(user.name)}</span>
                    <button class="selected-user-remove" data-index="${index}">&times;</button>
                </div>
            `);
            
            $user.find('.selected-user-remove').on('click', () => {
                this.addMemberSelectedUsers.splice(index, 1);
                this.renderAddMemberSelectedUsers();
            });
            
            $container.append($user);
        });
    },
    
    addMembersToGroup: function() {
        const memberIds = this.addMemberSelectedUsers.map(u => u.id);
        
        if (memberIds.length === 0) {
            this.showToast('Please select at least one member to add', 'warning');
            return;
        }
        
        $.ajax({
            url: 'api/conversations.php?action=add_members',
            method: 'POST',
            data: {
                conversation_id: this.currentConversation,
                user_ids: memberIds
            },
            success: (response) => {
                if (response.success) {
                    this.loadConversations();
                    this.openConversation(this.currentConversation);
                    this.showGroupInfo();
                    this.showToast('Members added successfully', 'success');
                } else {
                    this.showToast(response.error || 'Failed to add members', 'error');
                }
            },
            error: () => {
                this.showToast('Error adding members. Please try again.', 'error');
            }
        });
    },
    
    removeGroupMember: function(memberId) {
        $.ajax({
            url: 'api/conversations.php?action=remove_member',
            method: 'POST',
            data: {
                conversation_id: this.currentConversation,
                member_id: memberId
            },
            success: (response) => {
                if (response.success) {
                    this.loadConversations();
                    this.openConversation(this.currentConversation);
                    this.showGroupInfo();
                    this.showToast('Member removed successfully', 'success');
                } else {
                    this.showToast(response.error || 'Failed to remove member', 'error');
                }
            },
            error: () => {
                this.showToast('Error removing member. Please try again.', 'error');
            }
        });
    },
    
    showTypingIndicator: function(show) {
        if (show) {
            $('#typingIndicator').show().html('<span>Typing...</span>');
        } else {
            $('#typingIndicator').hide();
        }
    },
    
    scrollToBottom: function() {
        const $container = $('#messagesContainer');
        $container.scrollTop($container[0].scrollHeight);
    },
    
    formatTime: function(datetime) {
        const date = new Date(datetime);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
        if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
        
        return date.toLocaleDateString();
    },
    
    getUserStatus: function(user) {
        if (user.status === 'active' && user.last_seen) {
            const lastSeen = new Date(user.last_seen);
            const now = new Date();
            const diff = (now - lastSeen) / 1000;
            
            if (diff < 60) return 'online';
            if (diff < 300) return 'recently';
        }
        return 'offline';
    },
    
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    uploadFiles: function(files) {
        if (!this.currentConversation) {
            this.showToast('Please select a conversation first', 'warning');
            return;
        }
        
        // Blocked executable file extensions
        const blockedExtensions = ['php', 'js', 'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'sh', 'py', 'rb', 'pl', 'jar', 'war', 'ear', 'class', 'dll', 'so', 'dylib', 'bin', 'msi', 'deb', 'rpm', 'app', 'apk', 'ipa'];
        
        // Validate file types and sizes
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 
                             'video/mp4', 'video/avi', 'video/mov', 'video/wmv',
                             'audio/mp3', 'audio/wav', 'audio/ogg',
                             'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                             'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                             'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                             'text/plain', 'application/zip', 'application/x-rar-compressed'];
        const maxSize = 25 * 1024 * 1024; // 25MB
        
        const validFiles = [];
        const invalidFiles = [];
        
        files.forEach(file => {
            // Get file extension
            const fileName = file.name.toLowerCase();
            const extension = fileName.split('.').pop();
            
            // Check for blocked executable extensions
            if (blockedExtensions.includes(extension)) {
                invalidFiles.push(`${file.name}: Executable files (.${extension}) are not allowed for security reasons`);
                return;
            }
            
            // Check file size
            if (file.size > maxSize) {
                invalidFiles.push(`${file.name}: File size exceeds 25MB limit`);
                return;
            }
            
            // Check file type
            const isValidType = allowedTypes.some(type => file.type.startsWith(type.split('/')[0] + '/')) || 
                               allowedTypes.includes(file.type) ||
                               file.type === ''; // Some files may not have MIME type
            
            if (!isValidType && file.type !== '') {
                invalidFiles.push(`${file.name}: File type not supported`);
                return;
            }
            
            validFiles.push(file);
        });
        
        // Show errors for invalid files
        if (invalidFiles.length > 0) {
            this.showToast('Some files could not be uploaded:\n' + invalidFiles.join('\n'), 'error', 5000);
        }
        
        // Upload valid files
        if (validFiles.length === 0) {
            return;
        }
        
        validFiles.forEach(file => {
            const formData = new FormData();
            formData.append('file', file);
            
            $.ajax({
                url: 'api/upload.php?action=message',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: (response) => {
                    if (response.success) {
                        this.pendingAttachments.push(response.file);
                        this.renderAttachmentsPreview(this.pendingAttachments);
                    } else {
                        this.showToast(response.error || `Failed to upload ${file.name}`, 'error');
                    }
                },
                error: (xhr) => {
                    let errorMsg = `Error uploading ${file.name}. Please try again.`;
                    if (xhr.responseJSON && xhr.responseJSON.error) {
                        errorMsg = xhr.responseJSON.error;
                    } else if (xhr.responseText) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            if (response.error) {
                                errorMsg = response.error;
                            }
                        } catch (e) {
                            // Not JSON, use default
                        }
                    }
                    this.showToast(errorMsg, 'error');
                }
            });
        });
        
        // Reset file input
        $('#fileInput').val('');
    },
    
    renderAttachmentsPreview: function(attachments) {
        const $preview = $('#attachmentsPreview');
        $preview.empty();
        
        attachments.forEach((att, index) => {
            let previewHtml = '';
            
            if (att.file_type === 'image') {
                previewHtml = `
                    <div class="attachment-item">
                        <img src="${att.file_url}" alt="${this.escapeHtml(att.file_name)}">
                        <button class="attachment-remove" data-index="${index}">&times;</button>
                    </div>
                `;
            } else {
                const fileIcon = this.getFileIcon(att.file_name, att.file_type);
                const fileIconClass = this.getFileIconClass(att.file_name, att.file_type);
                previewHtml = `
                    <div class="attachment-item">
                        <div class="file-icon ${fileIconClass}">${fileIcon}</div>
                        <div class="file-name">${this.escapeHtml(att.file_name)}</div>
                        <button class="attachment-remove" data-index="${index}">&times;</button>
                    </div>
                `;
            }
            
            const $item = $(previewHtml);
            $item.find('.attachment-remove').on('click', () => {
                this.pendingAttachments.splice(index, 1);
                this.renderAttachmentsPreview(this.pendingAttachments);
            });
            
            $preview.append($item);
        });
    },
    
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },
    
    getFileIcon: function(fileName, fileType) {
        const ext = fileName ? fileName.split('.').pop().toLowerCase() : '';
        
        // PDF icon
        if (ext === 'pdf' || fileType === 'pdf') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                    <line x1="9" y1="16" x2="13" y2="16"/>
                </svg>
            `;
        }
        
        // Word/DOC icon
        if (ext === 'doc' || ext === 'docx' || fileType === 'doc' || fileType === 'docx') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M10 9H8M10 13H8M10 17H8M14 9h2M14 13h2M14 17h2"/>
                </svg>
            `;
        }
        
        // Excel/XLS icon
        if (ext === 'xls' || ext === 'xlsx' || fileType === 'xls' || fileType === 'xlsx') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="12" x2="15" y2="18"/>
                    <line x1="15" y1="12" x2="9" y2="18"/>
                </svg>
            `;
        }
        
        // PowerPoint/PPT icon
        if (ext === 'ppt' || ext === 'pptx' || fileType === 'ppt' || fileType === 'pptx') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <circle cx="15.5" cy="8.5" r="1.5"/>
                    <path d="M12 14v4M8 16h8"/>
                </svg>
            `;
        }
        
        // Text/TXT icon
        if (ext === 'txt' || fileType === 'txt') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="11" x2="16" y2="11"/>
                    <line x1="8" y1="15" x2="16" y2="15"/>
                </svg>
            `;
        }
        
        // ZIP/RAR icon
        if (ext === 'zip' || ext === 'rar' || ext === '7z' || fileType === 'zip' || fileType === 'rar') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
            `;
        }
        
        // Audio icon
        if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || fileType === 'audio') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
            `;
        }
        
        // Video icon
        if (ext === 'mp4' || ext === 'avi' || ext === 'mkv' || fileType === 'video') {
            return `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
            `;
        }
        
        // Default file icon
        return `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
        `;
    },
    
    getFileIconClass: function(fileName, fileType) {
        const ext = fileName ? fileName.split('.').pop().toLowerCase() : '';
        
        if (ext === 'pdf' || fileType === 'pdf') return 'pdf';
        if (ext === 'doc' || ext === 'docx' || fileType === 'doc' || fileType === 'docx') return 'doc';
        if (ext === 'xls' || ext === 'xlsx' || fileType === 'xls' || fileType === 'xlsx') return 'xls';
        if (ext === 'ppt' || ext === 'pptx' || fileType === 'ppt' || fileType === 'pptx') return 'ppt';
        if (ext === 'txt' || fileType === 'txt') return 'txt';
        if (ext === 'zip' || ext === 'rar' || ext === '7z' || fileType === 'zip' || fileType === 'rar') return 'zip';
        if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || fileType === 'audio') return 'audio';
        if (ext === 'mp4' || ext === 'avi' || ext === 'mkv' || fileType === 'video') return 'video';
        
        return 'default';
    },
    
    pendingStoryImages: [],
    
    resetCreateStoryForm: function() {
        $('#createStoryForm')[0].reset();
        $('#storyImagesPreview').hide();
        $('#storyCharCount').text('0');
        $('#storyImageInput').val('');
        $('#storyImageCount').text('0');
        $('#storySubmitCount').text('Story');
        this.pendingStoryImages = [];
        this.renderStoryImagesPreview();
    },
    
    renderStoryImagesPreview: function() {
        const $container = $('#storyImagesList');
        $container.empty();
        
        if (this.pendingStoryImages.length === 0) {
            $('#storyImagesPreview').hide();
            return;
        }
        
        $('#storyImagesPreview').show();
        $('#storyImageCount').text(this.pendingStoryImages.length);
        $('#storySubmitCount').text(this.pendingStoryImages.length > 1 ? `${this.pendingStoryImages.length} Stories` : 'Story');
        
        this.pendingStoryImages.forEach((imageData, index) => {
            const $item = $(`
                <div class="story-image-preview-item" data-index="${index}">
                    <div class="story-image-preview-wrapper">
                        <img src="${imageData.preview}" alt="Preview ${index + 1}">
                        <button type="button" class="story-image-remove" data-index="${index}" title="Remove">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="story-image-number">${index + 1}</div>
                </div>
            `);
            
            $item.find('.story-image-remove').on('click', (e) => {
                e.stopPropagation();
                this.pendingStoryImages.splice(index, 1);
                this.renderStoryImagesPreview();
            });
            
            $container.append($item);
        });
    },
    
    createStory: function() {
        const text = $('#storyTextInput').val().trim();
        const link = $('#storyLinkInput').val().trim();
        const imageCount = this.pendingStoryImages.length;
        
        // Validate input
        if (imageCount === 0 && !text && !link) {
            this.showToast('Please add at least a photo, text, or link', 'warning');
            return;
        }
        
        // Show loading
        const $submitBtn = $('#createStoryForm button[type="submit"]');
        const originalText = $submitBtn.html();
        $submitBtn.prop('disabled', true).html('<span>Posting...</span>');
        
        // Create stories sequentially
        if (imageCount > 0) {
            // Create one story for each image
            this.createMultipleStories(0, text, link, imageCount, $submitBtn, originalText);
        } else {
            // Create single story with text/link only
            this.createSingleStory(null, text, link, $submitBtn, originalText);
        }
    },
    
    createSingleStory: function(imageFile, text, link, $submitBtn, originalText) {
        const formData = new FormData();
        
        if (imageFile) {
            formData.append('status_image', imageFile);
        }
        
        if (text) {
            formData.append('status_text', text);
        }
        
        if (link) {
            formData.append('status_link', link);
        }
        
        $.ajax({
            url: 'api/stories.php?action=create',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                if (response.success) {
                    $('#createStoryModal').removeClass('active');
                    this.resetCreateStoryForm();
                    this.loadStories(); // Reload stories
                    $submitBtn.prop('disabled', false).html(originalText);
                    this.showToast('Story posted successfully!', 'success');
                } else {
                    $submitBtn.prop('disabled', false).html(originalText);
                    this.showToast(response.error || 'Failed to create story', 'error');
                }
            },
            error: () => {
                $submitBtn.prop('disabled', false).html(originalText);
                this.showToast('Error creating story. Please try again.', 'error');
            }
        });
    },
    
    createMultipleStories: function(index, text, link, totalCount, $submitBtn, originalText) {
        if (index >= totalCount) {
            // All stories created successfully
            $('#createStoryModal').removeClass('active');
            this.resetCreateStoryForm();
            this.loadStories(); // Reload stories
            $submitBtn.prop('disabled', false).html(originalText);
            this.showToast(`${totalCount} ${totalCount > 1 ? 'stories' : 'story'} posted successfully!`, 'success');
            return;
        }
        
        // Update progress
        const progress = Math.floor(((index + 1) / totalCount) * 100);
        $submitBtn.html(`<span>Posting ${index + 1}/${totalCount} (${progress}%)</span>`);
        
        const imageData = this.pendingStoryImages[index];
        const formData = new FormData();
        
        formData.append('status_image', imageData.file);
        
        if (text) {
            formData.append('status_text', text);
        }
        
        if (link) {
            formData.append('status_link', link);
        }
        
        $.ajax({
            url: 'api/stories.php?action=create',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: (response) => {
                if (response.success) {
                    // Create next story
                    this.createMultipleStories(index + 1, text, link, totalCount, $submitBtn, originalText);
                } else {
                    $submitBtn.prop('disabled', false).html(originalText);
                    this.showToast(`Failed to create story ${index + 1}: ${response.error || 'Unknown error'}`, 'error');
                }
            },
            error: (xhr) => {
                $submitBtn.prop('disabled', false).html(originalText);
                let errorMsg = 'Error creating story. Please try again.';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMsg = xhr.responseJSON.error;
                }
                this.showToast(`Failed to create story ${index + 1}: ${errorMsg}`, 'error');
            }
        });
    },
    
    showStoryViewers: function(storyId) {
        $.ajax({
            url: `api/stories.php?action=viewers&story_id=${storyId}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    const $list = $('#storyViewersList');
                    $list.empty();
                    
                    if (response.viewers.length === 0) {
                        $list.html('<div style="padding: 20px; text-align: center; color: #667781;">No viewers yet</div>');
                    } else {
                        response.viewers.forEach(viewer => {
                            const $item = $(`
                                <div class="story-viewer-item">
                                    <img src="${viewer.avatar || 'assets/images/default-avatar.png'}" alt="${this.escapeHtml(viewer.name)}" class="story-viewer-avatar" onerror="this.src='assets/images/default-avatar.png'">
                                    <div class="story-viewer-info">
                                        <div class="story-viewer-name">${this.escapeHtml(viewer.name)}</div>
                                        <div class="story-viewer-time">${this.formatTime(viewer.viewed_at)}</div>
                                    </div>
                                </div>
                            `);
                            $list.append($item);
                        });
                    }
                    
                    $('#storyViewersModal').addClass('active');
                }
            },
            error: () => {
                this.showToast('Error loading viewers', 'error');
            }
        });
    },
    
    showStoryReplies: function(storyId) {
        $.ajax({
            url: `api/stories.php?action=replies&story_id=${storyId}`,
            method: 'GET',
            success: (response) => {
                if (response.success) {
                    const $list = $('#storyRepliesList');
                    $list.empty();
                    
                    if (response.replies.length === 0) {
                        $list.html('<div style="padding: 20px; text-align: center; color: #667781;">No replies yet</div>');
                    } else {
                        response.replies.forEach(reply => {
                            const $item = $(`
                                <div class="story-reply-item">
                                    <img src="${reply.user_avatar || 'assets/images/default-avatar.png'}" alt="${this.escapeHtml(reply.user_name)}" class="story-reply-avatar" onerror="this.src='assets/images/default-avatar.png'">
                                    <div class="story-reply-content">
                                        <div class="story-reply-name">${this.escapeHtml(reply.user_name)}</div>
                                        <div class="story-reply-text">${this.escapeHtml(reply.reply_text)}</div>
                                        <div class="story-reply-time">${this.formatTime(reply.created_at)}</div>
                                    </div>
                                </div>
                            `);
                            $list.append($item);
                        });
                    }
                    
                    $('#storyRepliesModal').addClass('active');
                }
            },
            error: () => {
                this.showToast('Error loading replies', 'error');
            }
        });
    },
    
    sendStoryReply: function() {
        if (!this.currentStory) {
            this.showToast('No story selected', 'warning');
            return;
        }
        
        const replyText = $('#storyReplyInput').val().trim();
        
        if (!replyText) {
            this.showToast('Please enter a reply', 'warning');
            return;
        }
        
        // Disable send button to prevent double submission
        const $sendBtn = $('#storyReplySendBtn');
        const originalHtml = $sendBtn.html();
        $sendBtn.prop('disabled', true).html('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>');
        
        $.ajax({
            url: 'api/stories.php?action=reply',
            method: 'POST',
            data: {
                story_id: this.currentStory.id,
                reply_text: replyText
            },
            success: (response) => {
                $sendBtn.prop('disabled', false).html(originalHtml);
                
                if (response && response.success) {
                    $('#storyReplyInput').val('');
                    $('#storyReplyArea').hide();
                    this.showToast('Reply sent successfully!', 'success');
                    // Reload stats if viewing own story
                    if (this.currentStoryGroup && this.currentStoryGroup.is_my_story) {
                        this.loadStoryStats(this.currentStory.id);
                    }
                } else {
                    const errorMsg = (response && response.error) ? response.error : 'Failed to send reply';
                    this.showToast(errorMsg, 'error');
                }
            },
            error: (xhr, status, error) => {
                $sendBtn.prop('disabled', false).html(originalHtml);
                
                let errorMsg = 'Error sending reply. Please try again.';
                
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMsg = xhr.responseJSON.error;
                } else if (xhr.responseText) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.error) {
                            errorMsg = response.error;
                        }
                    } catch (e) {
                        // Not JSON, use default message
                    }
                }
                
                this.showToast(errorMsg, 'error');
                console.error('Reply error:', status, error, xhr);
            }
        });
    },
    
    replyToMessage: function(messageId) {
        // Find the message in the current conversation
        const $message = $(`.message[data-message-id="${messageId}"]`);
        if ($message.length === 0) return;
        
        // Get message data from the DOM
        const messageText = $message.find('.message-text').text() || ($message.find('.message-attachment').length > 0 ? '[Media]' : '');
        const senderName = $message.find('.message-sender-name').text() || ($message.hasClass('sent') ? 'You' : 'Unknown');
        
        // Store reply info
        this.replyingTo = {
            id: messageId,
            message: messageText,
            sender_name: senderName
        };
        
        // Show reply preview
        this.showReplyPreview();
    },
    
    showReplyPreview: function() {
        if (!this.replyingTo) return;
        
        $('#replyPreviewName').text(this.replyingTo.sender_name);
        $('#replyPreviewMessage').text(this.replyingTo.message || '[Media]');
        $('#replyPreview').slideDown(200);
        $('#messageInput').focus();
    },
    
    clearReply: function() {
        this.replyingTo = null;
        $('#replyPreview').slideUp(200);
    },
    
    forwardMessage: function(messageId) {
        // Find the message
        const $message = $(`.message[data-message-id="${messageId}"]`);
        if ($message.length === 0) return;
        
        // Get message data
        const messageText = $message.find('.message-text').text() || '';
        const hasAttachments = $message.find('.message-attachment').length > 0;
        const senderName = $message.find('.message-sender-name').text() || 'Unknown';
        
        // Store forward info
        this.forwardingMessage = {
            id: messageId,
            message: messageText,
            sender_name: senderName,
            has_attachments: hasAttachments,
            conversation_id: this.currentConversation
        };
        
        // Show forward modal
        this.showForwardModal();
    },
    
    showForwardModal: function() {
        if (!this.forwardingMessage) return;
        
        // Show modal first
        $('#forwardMessageModal').addClass('active');
        
        // Show message preview with better formatting
        const msg = this.forwardingMessage;
        let previewText = msg.message || '';
        if (msg.has_attachments || (msg.attachments && msg.attachments.length > 0)) {
            previewText = previewText || '[Media]';
        }
        
        const previewHtml = `
            <div style="font-size: 11px; color: #667781; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Forwarding:</div>
            <div style="font-size: 14px; color: #111b21; line-height: 1.4; word-wrap: break-word;">${this.escapeHtml(previewText.substring(0, 100))}${previewText.length > 100 ? '...' : ''}</div>
        `;
        $('#forwardMessagePreview').html(previewHtml).show();
        
        // Load conversations
        this.loadForwardConversations();
        
        // Focus search input
        $('#forwardSearchInput').focus();
    },
    
    loadForwardConversations: function() {
        const $list = $('#forwardConversationsList');
        $list.empty();
        
        if (!this.conversations || this.conversations.length === 0) {
            $list.html('<div style="padding: 20px; text-align: center; color: #667781;">No conversations found</div>');
            return;
        }
        
        // Filter out current conversation
        const filteredConversations = this.conversations.filter(conv => conv.id != this.currentConversation);
        
        if (filteredConversations.length === 0) {
            $list.html('<div style="padding: 20px; text-align: center; color: #667781;">No other conversations available</div>');
            return;
        }
        
        filteredConversations.forEach(conv => {
            const otherUser = conv.other_user || {};
            let avatar, name, status;
            
            if (conv.type === 'group') {
                avatar = conv.avatar || 'assets/images/default-group.png';
                name = conv.title || 'Group';
                status = `${conv.member_count || 0} members`;
            } else {
                avatar = otherUser.avatar || 'assets/images/default-avatar.png';
                name = otherUser.name || 'Unknown';
                status = this.getUserStatus(otherUser);
            }
            
            const $item = $(`
                <div class="user-item" data-conversation-id="${conv.id}">
                    <img src="${avatar}" alt="${this.escapeHtml(name)}" onerror="this.src='assets/images/default-avatar.png'">
                    <div class="user-info">
                        <div class="user-name">${this.escapeHtml(name)}</div>
                        <div class="user-status">${this.escapeHtml(status)}</div>
                    </div>
                </div>
            `);
            
            $item.on('click', () => {
                // Toggle selection for multiple selection
                $item.toggleClass('selected');
                this.updateForwardButtonCount();
            });
            
            $list.append($item);
        });
        
        this.updateForwardButtonCount();
    },
    
    updateForwardButtonCount: function() {
        const count = $('#forwardConversationsList .user-item.selected').length;
        $('#forwardSelectedCount').text(count);
    },
    
    searchForwardConversations: function(query) {
        const $items = $('#forwardConversationsList .user-item');
        
        if (!query || query.trim() === '') {
            $items.show();
            this.updateForwardButtonCount();
            return;
        }
        
        const lowerQuery = query.toLowerCase();
        $items.each(function() {
            const name = $(this).find('.user-name').text().toLowerCase();
            if (name.includes(lowerQuery)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
        this.updateForwardButtonCount();
    },
    
    executeForward: function() {
        if (!this.forwardingMessage) return;
        
        const $selected = $('#forwardConversationsList .user-item.selected');
        if ($selected.length === 0) {
            this.showToast('Please select at least one conversation to forward the message to', 'warning');
            return;
        }
        
        const targetConversationIds = [];
        $selected.each(function() {
            targetConversationIds.push($(this).data('conversation-id'));
        });
        
        // Show loading
        const $btn = $('#forwardMessageBtn');
        const originalText = $btn.text();
        $btn.prop('disabled', true).text(`Forwarding to ${targetConversationIds.length} conversation(s)...`);
        
        // Forward to multiple conversations
        let successCount = 0;
        let failCount = 0;
        let completed = 0;
        
        targetConversationIds.forEach((conversationId, index) => {
            $.ajax({
                url: 'api/messages.php?action=forward',
                method: 'POST',
                data: {
                    message_id: this.forwardingMessage.id,
                    conversation_id: conversationId
                },
                success: (response) => {
                    completed++;
                    if (response.success && response.message) {
                        successCount++;
                        
                        // Send via WebSocket to notify all members of the target conversation
                        // The message object already contains all forwarded fields
                        if (this.ws && this.ws.readyState === WebSocket.OPEN && response.message) {
                            // Ensure message has all required fields for WebSocket
                            const wsMessage = {
                                ...response.message,
                                conversation_id: response.message.conversation_id
                            };
                            this.ws.send(JSON.stringify({
                                type: 'message',
                                conversation_id: response.message.conversation_id,
                                message: wsMessage
                            }));
                        }
                        
                        // If forwarding to current conversation, show the message
                        if (response.message.conversation_id == this.currentConversation) {
                            response.message.message_status = 'sent';
                            this.renderMessages([response.message]);
                            
                            // Update delivered status
                            setTimeout(() => {
                                this.updateMessageStatus(response.message.id, 'delivered');
                            }, 500);
                        }
                    } else {
                        failCount++;
                        console.error('Forward failed:', response);
                    }
                    
                    // All requests completed
                    if (completed === targetConversationIds.length) {
                        $('#forwardMessageModal').removeClass('active');
                        this.clearForward();
                        this.loadConversations();
                        
                        if (successCount > 0) {
                            this.showToast(`Message forwarded to ${successCount} conversation(s) successfully!`, 'success');
                        }
                        if (failCount > 0) {
                            this.showToast(`Failed to forward to ${failCount} conversation(s)`, 'error');
                        }
                        
                        $btn.prop('disabled', false).text(originalText);
                    }
                },
                error: (xhr) => {
                    completed++;
                    failCount++;
                    
                    if (completed === targetConversationIds.length) {
                        $('#forwardMessageModal').removeClass('active');
                        this.clearForward();
                        this.loadConversations();
                        
                        if (successCount > 0) {
                            this.showToast(`Message forwarded to ${successCount} conversation(s) successfully!`, 'success');
                        }
                        if (failCount > 0) {
                            this.showToast(`Failed to forward to ${failCount} conversation(s)`, 'error');
                        }
                        
                        $btn.prop('disabled', false).text(originalText);
                    }
                }
            });
        });
    },
    
    clearForward: function() {
        this.forwardingMessage = null;
        $('#forwardMessagePreview').hide().empty();
        $('#forwardSearchInput').val('');
        $('#forwardConversationsList').empty();
        $('.user-item').removeClass('selected');
    },
    
    deleteStory: function(storyId) {
        if (!storyId) return;
        
        // Use custom confirmation
        this.showConfirmDialog('Are you sure you want to delete this story?', () => {
            this.deleteStoryConfirmed(storyId);
        });
        return;
    },
    
    deleteStoryConfirmed: function(storyId) {
        if (!storyId) return;
        
        $.ajax({
            url: 'api/stories.php?action=delete',
            method: 'POST',
            data: {
                story_id: storyId
            },
            success: (response) => {
                if (response.success) {
                    // If currently viewing deleted story, close viewer
                    if (this.currentStory && this.currentStory.id == storyId) {
                        this.closeStoryViewer();
                    }
                    // Reload stories to update the UI
                    this.loadStories().then(() => {
                        // If we have other stories, show the first one
                        if (this.allStoryGroups && this.allStoryGroups.length > 0) {
                            // Stories will be reloaded, no need to manually show
                        }
                    });
                } else {
                    this.showToast(response.error || 'Failed to delete story', 'error');
                }
            },
            error: () => {
                this.showToast('Error deleting story. Please try again.', 'error');
            }
        });
    },
    
    scrollToMessage: function(messageId) {
        const $message = $(`.message[data-message-id="${messageId}"]`);
        if ($message.length === 0) {
            this.showToast('Original message not found in current view. Please scroll to find it.', 'warning');
            return;
        }
        
        const $container = $('#messagesContainer');
        const containerHeight = $container.height();
        const messageTop = $message.position().top + $container.scrollTop();
        const messageHeight = $message.outerHeight();
        const scrollPosition = messageTop - (containerHeight / 2) + (messageHeight / 2);
        
        // Highlight message briefly
        $message.addClass('highlighted');
        setTimeout(() => {
            $message.removeClass('highlighted');
        }, 2000);
        
        // Smooth scroll to message
        $container.animate({
            scrollTop: scrollPosition
        }, 500);
    },
    
    showContextMenu: function(x, y, messageId, isSent, isStarred) {
        const $menu = $('#messageContextMenu');
        $menu.data('message-id', messageId);
        $menu.data('is-starred', isStarred);
        
        // Update star button text
        const $starItem = $menu.find('[data-action="star"]');
        if (isStarred) {
            $starItem.addClass('starred');
            $starItem.find('.star-text').text('Unstar');
        } else {
            $starItem.removeClass('starred');
            $starItem.find('.star-text').text('Star');
        }
        
        // Position menu
        $menu.css({
            left: x + 'px',
            top: y + 'px'
        });
        
        // Adjust if menu goes off screen
        setTimeout(() => {
            const menuWidth = $menu.outerWidth();
            const menuHeight = $menu.outerHeight();
            const windowWidth = $(window).width();
            const windowHeight = $(window).height();
            
            if (x + menuWidth > windowWidth) {
                $menu.css('left', (x - menuWidth) + 'px');
            }
            if (y + menuHeight > windowHeight) {
                $menu.css('top', (y - menuHeight) + 'px');
            }
        }, 0);
        
        $menu.addClass('active');
    },
    
    hideContextMenu: function() {
        $('#messageContextMenu').removeClass('active');
    },
    
    copyMessage: function(messageId) {
        const $message = $(`.message[data-message-id="${messageId}"]`);
        if ($message.length === 0) return;
        
        const messageText = $message.find('.message-text').text() || '';
        
        if (!messageText) {
            this.showToast('No text to copy', 'warning');
            return;
        }
        
        // Copy to clipboard using modern API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(messageText).then(() => {
                this.showToast('Message copied to clipboard', 'success');
                // Show visual feedback
                const $msg = $message.find('.message-bubble');
                const originalBg = $msg.css('background-color');
                $msg.css('background-color', '#d9fdd3');
                setTimeout(() => {
                    $msg.css('background-color', originalBg);
                }, 300);
            }).catch(() => {
                // Fallback for older browsers
                this.fallbackCopyText(messageText, $message);
            });
        } else {
            // Fallback for older browsers
            this.fallbackCopyText(messageText, $message);
        }
    },
    
    fallbackCopyText: function(text, $message) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showToast('Message copied to clipboard', 'success');
            // Show visual feedback
            const $msg = $message.find('.message-bubble');
            const originalBg = $msg.css('background-color');
            $msg.css('background-color', '#d9fdd3');
            setTimeout(() => {
                $msg.css('background-color', originalBg);
            }, 300);
        } catch (err) {
            this.showToast('Failed to copy message', 'error');
        }
        
        document.body.removeChild(textarea);
    },
    
    deleteMessage: function(messageId) {
        // Use custom confirmation
        this.showConfirmDialog('Are you sure you want to delete this message? This action cannot be undone.', () => {
            this.deleteMessageConfirmed(messageId);
        });
        return;
    },
    
    deleteMessageConfirmed: function(messageId) {
        
        $.ajax({
            url: 'api/messages.php?action=delete',
            method: 'POST',
            data: {
                message_id: messageId
            },
            success: (response) => {
                if (response.success) {
                    // Remove message from DOM
                    $(`.message[data-message-id="${messageId}"]`).fadeOut(300, function() {
                        $(this).remove();
                    });
                    
                    // Notify via WebSocket
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'message_deleted',
                            message_id: messageId,
                            conversation_id: this.currentConversation
                        }));
                    }
                } else {
                    this.showToast(response.error || 'Failed to delete message', 'error');
                }
            },
            error: () => {
                this.showToast('Error deleting message. Please try again.', 'error');
            }
        });
    },
    
    starMessage: function(messageId) {
        $.ajax({
            url: 'api/messages.php?action=star',
            method: 'POST',
            data: {
                message_id: messageId
            },
            success: (response) => {
                if (response.success) {
                    // Update message in DOM
                    const $message = $(`.message[data-message-id="${messageId}"]`);
                    $message.data('is-starred', 1);
                    const starIcon = `
                        <svg class="message-star-icon" width="14" height="14" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" stroke-width="2" style="margin-left: 4px;">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    `;
                    $message.find('.message-time').prepend(starIcon);
                } else {
                    this.showToast(response.error || 'Failed to star message', 'error');
                }
            },
            error: () => {
                this.showToast('Error starring message. Please try again.', 'error');
            }
        });
    },
    
    unstarMessage: function(messageId) {
        $.ajax({
            url: 'api/messages.php?action=unstar',
            method: 'POST',
            data: {
                message_id: messageId
            },
            success: (response) => {
                if (response.success) {
                    // Update message in DOM
                    const $message = $(`.message[data-message-id="${messageId}"]`);
                    $message.data('is-starred', 0);
                    $message.find('.message-star-icon').remove();
                } else {
                    this.showToast(response.error || 'Failed to unstar message', 'error');
                }
            },
            error: () => {
                this.showToast('Error unstarring message. Please try again.', 'error');
            }
        });
    },
    
};

// WebSocket configuration (defined in index.php)

// Initialize app when DOM is ready
$(document).ready(() => {
    App.init();
    // Don't initialize WebSocket here - wait for user to load
});

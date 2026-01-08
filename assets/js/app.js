const App = {
    ws: null,
    currentUser: null,
    currentConversation: null,
    conversations: [],
    stories: [],
    currentStoryGroup: null,
    currentStoryIndex: 0,
    currentStory: null,
    storyAutoAdvanceTimer: null,
    storyProgressInterval: null,
    storyStartTime: null,
    storyDuration: 5000, // 5 seconds per story
    typingTimeout: null,
    pendingAttachments: [],
    
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
                </div>
                <div class="story-name">${this.escapeHtml(myStories.user_name)}</div>
            </div>
        `);
        
        $myStory.on('click', () => {
            if (!hasMyStories) {
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
        
        if (story.status_text) {
            contentHtml += `<div class="story-text">${this.escapeHtml(story.status_text)}</div>`;
        }
        
        if (story.status_link) {
            contentHtml += `<div class="story-link"><a href="${story.status_link}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(story.status_link)}</a></div>`;
        }
        
        $content.html(contentHtml);
        
        // Update navigation buttons
        $('#prevStoryBtn').toggle(index > 0);
        $('#nextStoryBtn').toggle(index < this.currentStoryGroup.stories.length - 1);
        $('#storyReplyToggle').toggle(!isMyStory);
        
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
            } else if (i === this.currentStoryIndex) {
                $bar.addClass('active');
            }
            $container.append($bar);
        }
    },
    
    startStoryTimer: function() {
        this.storyStartTime = Date.now();
        const $activeBar = $('#storyProgressContainer .story-progress-bar').eq(this.currentStoryIndex);
        
        // Update progress every 50ms for smooth animation
        this.storyProgressInterval = setInterval(() => {
            if (!this.currentStory || !this.storyStartTime) return;
            
            const elapsed = Date.now() - this.storyStartTime;
            const progress = Math.min((elapsed / this.storyDuration) * 100, 100);
            
            $activeBar.css('width', progress + '%');
            
            if (progress >= 100) {
                this.advanceToNextStory();
            }
        }, 50);
        
        // Auto-advance after duration
        this.storyAutoAdvanceTimer = setTimeout(() => {
            this.advanceToNextStory();
        }, this.storyDuration);
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
        this.storyStartTime = null;
    },
    
    advanceToNextStory: function() {
        this.clearStoryTimers();
        
        if (this.currentStoryIndex < this.currentStoryGroup.stories.length - 1) {
            this.showStory(this.currentStoryIndex + 1);
        } else {
            this.closeStoryViewer();
        }
    },
    
    closeStoryViewer: function() {
        this.clearStoryTimers();
        $('#storyViewerModal').removeClass('active');
        $('#storyReplyArea').hide();
        $('#storyReplyInput').val('');
        this.currentStory = null;
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
            const groupIcon = conv.type === 'group' ? '<span style="font-size: 12px; margin-left: 4px;">👥</span>' : '';
            
            const $item = $(`
                <div class="conversation-item" data-id="${conv.id}">
                    <img src="${avatar}" alt="${name}" class="conversation-avatar" onerror="this.src='assets/images/default-avatar.png'">
                    <div class="conversation-info">
                        <div class="conversation-header">
                            <span class="conversation-name">${this.escapeHtml(name)}${groupIcon}</span>
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
                    this.renderMessages(response.messages);
                }
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
                        attachmentsHtml += `
                            <div class="message-attachment">
                                <a href="${att.file_url}" target="_blank" class="file-attachment">
                                    <div class="file-icon-large">📎</div>
                                    <div class="file-info">
                                        <div class="file-info-name">${this.escapeHtml(att.file_name)}</div>
                                        <div class="file-info-size">${this.formatFileSize(att.file_size)}</div>
                                    </div>
                                </a>
                            </div>
                        `;
                    }
                });
            }
            
            const messageText = msg.message ? `<div class="message-text">${this.escapeHtml(msg.message)}</div>` : '';
            
            // Check if message already exists to prevent duplicates
            if ($container.find(`.message[data-message-id="${msg.id}"]`).length > 0) {
                return; // Skip if message already exists
            }
            
            const $message = $(`
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}">
                    ${!isSent ? avatar : ''}
                    <div class="message-bubble">
                        ${senderName}
                        ${attachmentsHtml}
                        ${messageText}
                        <div class="message-time">
                            ${time}
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
        
        $.ajax({
            url: 'api/messages.php?action=send',
            method: 'POST',
            data: {
                conversation_id: this.currentConversation,
                message: message,
                message_type: attachments.length > 0 ? (attachments[0].file_type || 'file') : 'text',
                attachments: JSON.stringify(attachments)
            },
            success: (response) => {
                if (response.success) {
                    $('#messageInput').val('');
                    this.pendingAttachments = [];
                    this.renderAttachmentsPreview([]);
                    
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
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    $('#storyImagePreviewImg').attr('src', event.target.result);
                    $('#storyImagePreview').show();
                };
                reader.readAsDataURL(file);
            }
        });
        
        $('#removeImageBtn').on('click', () => {
            $('#storyImageInput').val('');
            $('#storyImagePreview').hide();
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
            alert('Please enter a group name');
            return;
        }
        
        if (memberIds.length === 0) {
            alert('Please add at least one member to the group');
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
                    alert(response.error || 'Failed to create group');
                }
            },
            error: () => {
                alert('Error creating group. Please try again.');
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
                        alert('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
                        $(e.target).val('');
                        return;
                    }
                    
                    if (file.size > maxSize) {
                        alert('File size too large. Maximum 5MB allowed.');
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
                if (confirm('Are you sure you want to remove this member?')) {
                    App.removeGroupMember(memberId);
                }
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
                    
                    // Show success message
                    const $success = $('<div class="alert alert-success" style="position: fixed; top: 20px; right: 20px; z-index: 10000; padding: 12px 20px; border-radius: 8px;">Group photo updated successfully</div>');
                    $('body').append($success);
                    setTimeout(() => $success.fadeOut(() => $success.remove()), 3000);
                } else {
                    alert(response.error || 'Failed to upload photo');
                }
            },
            error: (xhr, status, error) => {
                let errorMsg = 'Error uploading photo. Please try again.';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMsg = xhr.responseJSON.error;
                }
                alert(errorMsg);
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
            alert('Group name is required');
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
                    alert('Group settings updated successfully');
                } else {
                    alert(response.error || 'Failed to update settings');
                }
            },
            error: () => {
                alert('Error updating settings. Please try again.');
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
            alert('Please select at least one member to add');
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
                    alert('Members added successfully');
                } else {
                    alert(response.error || 'Failed to add members');
                }
            },
            error: () => {
                alert('Error adding members. Please try again.');
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
                    alert('Member removed successfully');
                } else {
                    alert(response.error || 'Failed to remove member');
                }
            },
            error: () => {
                alert('Error removing member. Please try again.');
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
        files.forEach(file => {
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
                        alert(response.error || 'Failed to upload file');
                    }
                },
                error: () => {
                    alert('Error uploading file. Please try again.');
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
                previewHtml = `
                    <div class="attachment-item">
                        <div class="file-icon">📎</div>
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
    
    resetCreateStoryForm: function() {
        $('#createStoryForm')[0].reset();
        $('#storyImagePreview').hide();
        $('#storyCharCount').text('0');
        $('#storyImageInput').val('');
    },
    
    createStory: function() {
        const formData = new FormData();
        const imageFile = $('#storyImageInput')[0].files[0];
        const text = $('#storyTextInput').val().trim();
        const link = $('#storyLinkInput').val().trim();
        
        if (!imageFile && !text && !link) {
            alert('Please add at least a photo, text, or link');
            return;
        }
        
        if (imageFile) {
            formData.append('status_image', imageFile);
        }
        
        if (text) {
            formData.append('status_text', text);
        }
        
        if (link) {
            formData.append('status_link', link);
        }
        
        // Show loading
        const $submitBtn = $('#createStoryForm button[type="submit"]');
        const originalText = $submitBtn.text();
        $submitBtn.prop('disabled', true).text('Posting...');
        
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
                    alert('Story posted successfully!');
                } else {
                    alert(response.error || 'Failed to create story');
                }
            },
            error: () => {
                alert('Error creating story. Please try again.');
            },
            complete: () => {
                $submitBtn.prop('disabled', false).text(originalText);
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
                alert('Error loading viewers');
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
                alert('Error loading replies');
            }
        });
    },
    
    sendStoryReply: function() {
        if (!this.currentStory) {
            alert('No story selected');
            return;
        }
        
        const replyText = $('#storyReplyInput').val().trim();
        
        if (!replyText) {
            alert('Please enter a reply');
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
                    alert('Reply sent successfully!');
                    // Reload stats if viewing own story
                    if (this.currentStoryGroup && this.currentStoryGroup.is_my_story) {
                        this.loadStoryStats(this.currentStory.id);
                    }
                } else {
                    const errorMsg = (response && response.error) ? response.error : 'Failed to send reply';
                    alert(errorMsg);
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
                
                alert(errorMsg);
                console.error('Reply error:', status, error, xhr);
            }
        });
    }
};

// WebSocket configuration (defined in index.php)

// Initialize app when DOM is ready
$(document).ready(() => {
    App.init();
    // Don't initialize WebSocket here - wait for user to load
});

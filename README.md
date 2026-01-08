<div align="center">
  
<img src="assets/images/logo.png" alt="Samvad Logo" width="200"/>

# 💬 Samvad

**Simple Business Chat**

*A modern, real-time chat application - Clone of WhatsApp built with PHP, MySQL, and WebSocket technology*

**Developed by:** [OfferPlant Technologies Pvt Ltd](https://www.offerplant.com)

**Support:** [ask@offerplant.com](mailto:ask@offerplant.com)

[![PHP](https://img.shields.io/badge/PHP-7.4+-777BB4?style=flat-square&logo=php&logoColor=white)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-5.7+-4479A1?style=flat-square&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Ratchet-25d366?style=flat-square)](https://socketo.me/)
[![License](https://img.shields.io/badge/License-Open%20Source-green?style=flat-square)](LICENSE)

---

</div>

---

## 🚀 Features

### Core Features
- ✅ **Real-time Messaging** - Instant message delivery using WebSocket
- ✅ **User Authentication** - Secure login and registration system
- ✅ **One-on-One Chat** - Private conversations between users
- ✅ **Group Chat** - Create and manage group conversations
- ✅ **Read Receipts** - Double-tick indicators showing message status (sent, delivered, read)
- ✅ **Typing Indicators** - See when someone is typing
- ✅ **File Attachments** - Share images, videos, audio, and documents
- ✅ **User Search** - Find and connect with other users
- ✅ **Profile Management** - Customize your profile with photo and status
- ✅ **Last Seen** - View when users were last active

### Story Features (Status Updates)
- 📸 **Photo Stories** - Share photos with your contacts
- 💬 **Text Status** - Update your status message (up to 139 characters)
- 🔗 **Link Sharing** - Share links in your stories
- 📊 **View Analytics** - See who viewed your stories
- 💭 **Story Replies** - Reply to stories with messages
- ⏱️ **Auto-Expiry** - Stories automatically expire after 24 hours
- 🔄 **Auto-Advance** - Stories automatically advance every 5 seconds

### Group Features
- 👥 **Group Creation** - Create groups with multiple participants
- 🎨 **Group Customization** - Set group photo, name, and description
- 👤 **Member Management** - Add or remove members (admin only)
- 🔐 **Admin Controls** - Admins can manage group settings

### UI/UX Features
- 🎨 **Modern Design** - Beautiful, intuitive interface inspired by modern messaging apps
- 📱 **Responsive Layout** - Works on desktop and mobile devices
- ⚡ **Smooth Animations** - Polished transitions and effects
- 🌙 **Clean Interface** - Intuitive and user-friendly design

---

## 📋 Requirements

Before you begin, ensure you have the following installed:

- **PHP** 7.4 or higher
- **MySQL** 5.7+ or **MariaDB** 10.2+
- **Composer** (for dependency management)
- **Web Server** (Apache/Nginx)
- **PHP Extensions**:
  - mysqli
  - pdo_mysql
  - json
  - mbstring
  - openssl

---

## 🛠️ Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/krsaurabhbca/samvad.git
cd samvad
```

### Step 2: Database Setup

1. **Create Database**
   ```sql
   CREATE DATABASE chat;
   ```

2. **Import Database Schema**
   ```bash
   mysql -u root -p chat < chat.sql
   ```

3. **Run Additional Updates** (Required for Stories & Group Features)
   ```bash
   mysql -u root -p chat < database_status_update.sql
   ```

### Step 3: Configuration

Edit `config.php` and update your database credentials:

```php
define('DB_HOST', '127.0.0.1');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'chat');

define('BASE_URL', 'http://localhost/chat');
define('WS_HOST', '127.0.0.1');
define('WS_PORT', 8080);
```

### Step 4: Install Dependencies

```bash
composer install
```

This will install:
- `cboden/ratchet` - WebSocket server library

### Step 5: Create Upload Directories

```bash
mkdir uploads
mkdir assets/images
chmod 755 uploads
chmod 755 assets/images
```

### Step 6: Start WebSocket Server

**Windows:**
```bash
start-websocket.bat
```

**Linux/macOS:**
```bash
chmod +x start-websocket.sh
./start-websocket.sh
```

**Manual Start:**
```bash
php websocket/server.php
```

The WebSocket server will run on `127.0.0.1:8080`

### Step 7: Access the Application

1. Start your web server (Apache/Nginx)
2. Open your browser and navigate to `http://localhost/chat`
3. Register a new account or login with existing credentials

---

## 📁 Project Structure

```
samvad/
│
├── api/                      # API Endpoints
│   ├── auth.php             # Authentication (login, register)
│   ├── conversations.php    # Conversation management
│   ├── messages.php         # Message handling
│   ├── users.php            # User search and profile
│   ├── upload.php           # File uploads (avatars, attachments)
│   └── stories.php          # Story/Status management
│
├── assets/
│   ├── css/
│   │   ├── style.css        # Main stylesheet
│   │   ├── profile.css      # Profile page styles
│   │   └── auth.css         # Login/Register styles
│   ├── js/
│   │   └── app.js           # Main JavaScript application
│   └── images/              # Default avatars and icons
│
├── includes/
│   └── db.php               # Database connection and helpers
│
├── websocket/
│   └── server.php           # WebSocket server (Ratchet)
│
├── uploads/                 # User uploaded files (avatars, attachments, stories)
│
├── config.php               # Application configuration
├── index.php                # Main chat interface
├── login.php                # Login/Register page
├── profile.php              # User profile page
├── logout.php               # Logout handler
│
├── chat.sql                 # Main database schema
├── database_status_update.sql  # Database updates for stories
│
├── composer.json            # PHP dependencies
├── .htaccess               # Apache URL rewriting
│
├── start-websocket.bat      # Windows startup script
├── start-websocket.sh       # Linux/macOS startup script
│
└── README.md               # This file
```

---

## 📡 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `api/auth.php?action=check` | Check authentication status |
| `POST` | `api/auth.php?action=login` | User login |
| `POST` | `api/auth.php?action=register` | User registration |
| `GET` | `logout.php` | User logout |

### Conversation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `api/conversations.php?action=list` | Get all conversations |
| `POST` | `api/conversations.php?action=create` | Create new conversation |
| `GET` | `api/conversations.php?action=get&id={id}` | Get conversation details |
| `GET` | `api/conversations.php?action=members&conversation_id={id}` | Get conversation members |
| `POST` | `api/conversations.php?action=update` | Update group settings (admin only) |
| `POST` | `api/conversations.php?action=add_members` | Add members to group |
| `POST` | `api/conversations.php?action=remove_member` | Remove member from group |

### Message Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `api/messages.php?action=list&conversation_id={id}` | Get messages |
| `POST` | `api/messages.php?action=send` | Send message |
| `POST` | `api/messages.php?action=mark_read` | Mark message as read |
| `POST` | `api/messages.php?action=mark_conversation_read` | Mark all messages in conversation as read |

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `api/users.php?action=search&q={query}` | Search users |
| `GET` | `api/users.php?action=profile&id={id}` | Get user profile |
| `POST` | `api/users.php?action=update` | Update user profile |

### Story Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `api/stories.php?action=list` | Get all active stories |
| `GET` | `api/stories.php?action=my_stories` | Get user's own stories |
| `POST` | `api/stories.php?action=create` | Create new story |
| `POST` | `api/stories.php?action=view` | Mark story as viewed |
| `GET` | `api/stories.php?action=viewers&story_id={id}` | Get story viewers (owner only) |
| `POST` | `api/stories.php?action=reply` | Reply to a story |
| `GET` | `api/stories.php?action=replies&story_id={id}` | Get story replies (owner only) |
| `POST` | `api/stories.php?action=delete` | Delete own story |

### Upload Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `api/upload.php?action=avatar` | Upload user avatar |
| `POST` | `api/upload.php?action=message` | Upload message attachment |
| `POST` | `api/upload.php?action=group_avatar` | Upload group avatar (admin only) |

---

## 🔌 WebSocket Events

### Client to Server

```javascript
// Authenticate
{
  type: "auth",
  user_id: 123,
  token: "session_token"
}

// Send Message
{
  type: "message",
  conversation_id: 456,
  message: "Hello!",
  attachments: []
}

// Typing Indicator
{
  type: "typing",
  conversation_id: 456,
  is_typing: true
}

// Mark as Read
{
  type: "read",
  conversation_id: 456,
  message_ids: [1, 2, 3]
}
```

### Server to Client

```javascript
// New Message
{
  type: "new_message",
  message: { /* message object */ }
}

// Typing Status
{
  type: "typing",
  user_id: 123,
  conversation_id: 456,
  is_typing: true
}

// Read Receipt
{
  type: "read_receipt",
  message_id: 789,
  user_id: 123,
  conversation_id: 456
}
```

---

## 🗄️ Database Schema

### Main Tables

- **users** - User accounts and profiles
- **conversations** - Chat conversations (single/group)
- **conversation_members** - Members of conversations
- **messages** - Chat messages
- **attachments** - Message attachments (files, images)
- **message_status** - Message read receipts
- **user_status** - User stories/status updates
- **status_views** - Story view tracking
- **status_replies** - Story replies
- **notifications** - User notifications
- **blocked_users** - Blocked user list

---

## ⚙️ Configuration

Edit `config.php` to customize:

```php
// Database
define('DB_HOST', '127.0.0.1');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'chat');

// Application
define('BASE_URL', 'http://localhost/chat');
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('UPLOAD_URL', BASE_URL . '/uploads/');

// WebSocket
define('WS_HOST', '127.0.0.1');
define('WS_PORT', 8080);

// Session
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
```

---

## 🎯 Usage

### Starting the Application

1. **Start Web Server**
   - Ensure Apache/Nginx is running
   - Point document root to the project directory

2. **Start WebSocket Server**
   ```bash
   php websocket/server.php
   ```
   Or use the provided scripts:
   - Windows: `start-websocket.bat`
   - Linux/macOS: `./start-websocket.sh`

3. **Access Application**
   - Open browser: `http://localhost/chat`
   - Register or login
   - Start chatting!

### Creating a Story

1. Click on your story icon (with +) in the sidebar
2. Select a photo, add text, or share a link
3. Click "Post Story"
4. Your story will be visible to all your contacts for 24 hours

### Creating a Group

1. Click the "New Chat" button
2. Select "New Group" tab
3. Enter group name
4. Search and add participants
5. Click "Create Group"

---

## 🐛 Troubleshooting

### WebSocket Connection Failed

- **Issue**: Messages not sending in real-time
- **Solution**: 
  1. Ensure WebSocket server is running: `php websocket/server.php`
  2. Check firewall settings for port 8080
  3. Verify `WS_HOST` and `WS_PORT` in `config.php`

### Database Connection Error

- **Issue**: Cannot connect to database
- **Solution**: 
  1. Check database credentials in `config.php`
  2. Ensure MySQL service is running
  3. Verify database `chat` exists

### Upload Directory Permissions

- **Issue**: Cannot upload files
- **Solution**: 
  ```bash
  chmod 755 uploads
  chmod 755 assets/images
  ```

### Session Issues

- **Issue**: Keeps logging out
- **Solution**: Check `session.save_path` in `php.ini` is writable

---

## 🔒 Security Features

- ✅ Password hashing using PHP `password_hash()`
- ✅ SQL injection prevention with `mysqli_real_escape_string()`
- ✅ XSS protection with `htmlspecialchars()`
- ✅ Session-based authentication
- ✅ File upload validation (type, size)
- ✅ CSRF protection (can be enhanced)
- ✅ Secure WebSocket authentication

---

## 🚧 Future Enhancements

- [ ] End-to-end encryption
- [ ] Voice and video calls
- [ ] Message reactions
- [ ] Forward messages
- [ ] Starred messages
- [ ] Media gallery
- [ ] Dark mode
- [ ] Multi-language support
- [ ] Push notifications
- [ ] Desktop notifications

---

## 📝 License

This project is open source and available for educational purposes.

---

## 👨‍💻 Technologies Used

- **Backend**: PHP (Procedural, mysqli_*)
- **Database**: MySQL/MariaDB
- **Real-time**: Ratchet WebSocket
- **Frontend**: HTML5, CSS3, JavaScript (jQuery)
- **Server**: Apache with mod_rewrite

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

For support, email **[ask@offerplant.com](mailto:ask@offerplant.com)** or create an issue in the repository.

---

## 🙏 Acknowledgments

- Built with [Ratchet](https://socketo.me/) WebSocket library
- Icons and UI elements designed for modern user experience
- Modern messaging UI patterns and best practices

---

<div align="center">
  
**Made with ❤️ by [OfferPlant Technologies Pvt Ltd](https://www.offerplant.com)**

⭐ Star this repo if you find it helpful!

**Support:** [ask@offerplant.com](mailto:ask@offerplant.com)

</div>

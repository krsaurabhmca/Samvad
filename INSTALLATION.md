# Installation Guide

## Step-by-Step Installation

### 1. Database Setup

1. Open phpMyAdmin or MySQL command line
2. Create a new database named `chat`
3. Import the `chat.sql` file into the database

### 2. Configure Database Connection

Edit `config.php` and update the database credentials:

```php
define('DB_HOST', '127.0.0.1');
define('DB_USER', 'root');        // Your MySQL username
define('DB_PASS', '');            // Your MySQL password
define('DB_NAME', 'chat');
```

### 3. Install PHP Dependencies

Open terminal/command prompt in the project directory and run:

```bash
composer install
```

This will install Ratchet WebSocket library.

### 4. Create Required Directories

Create the uploads directory:

**Windows:**
```cmd
mkdir uploads
```

**Linux/Mac:**
```bash
mkdir uploads
chmod 755 uploads
```

### 5. Start WebSocket Server

The WebSocket server must be running for real-time messaging to work.

**Windows:**
Double-click `start-websocket.bat` or run:
```cmd
php websocket/server.php
```

**Linux/Mac:**
```bash
chmod +x start-websocket.sh
./start-websocket.sh
```

Or directly:
```bash
php websocket/server.php
```

**Important:** Keep this terminal window open while using the application.

### 6. Access the Application

1. Make sure XAMPP/Apache is running
2. Open your browser
3. Navigate to: `http://localhost/chat`
4. Register a new account or login

## Troubleshooting

### WebSocket Connection Failed

- Make sure the WebSocket server is running (`php websocket/server.php`)
- Check if port 8080 is available and not blocked by firewall
- Verify `WS_HOST` and `WS_PORT` in `config.php` match your setup

### Database Connection Error

- Verify database credentials in `config.php`
- Make sure MySQL/MariaDB is running
- Check if the `chat` database exists and tables are imported

### Composer Not Found

Install Composer from: https://getcomposer.org/

### Permission Denied (Linux/Mac)

```bash
chmod -R 755 uploads/
chmod +x start-websocket.sh
```

## Testing

1. Open two different browsers (or incognito windows)
2. Register/login with two different accounts
3. Start a conversation between them
4. Send messages - they should appear in real-time!

## Production Deployment

For production:

1. Disable error display in `config.php`:
   ```php
   error_reporting(0);
   ini_set('display_errors', 0);
   ```

2. Use a process manager like PM2 or Supervisor to keep WebSocket server running

3. Configure proper file permissions

4. Use HTTPS and WSS for secure connections

5. Set up proper database backups

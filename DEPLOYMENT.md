# Deployment Guide for Ubuntu Server with aaPanel

This guide covers all the changes needed when deploying the chat application to a live Ubuntu server with aaPanel.

## 1. Configuration Changes (`config.php`)

Update the following in `config.php`:

```php
<?php
// Database Configuration
// In aaPanel, MySQL is usually on localhost
define('DB_HOST', 'localhost');  // or '127.0.0.1'
define('DB_USER', 'your_database_user');  // Your MySQL username from aaPanel
define('DB_PASS', 'your_database_password');  // Your MySQL password from aaPanel
define('DB_NAME', 'your_database_name');  // Your database name

// Application Configuration
// Replace with your actual domain
define('BASE_URL', 'https://yourdomain.com');  // or 'https://yourdomain.com/chat' if in subdirectory
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('UPLOAD_URL', BASE_URL . '/uploads/');

// WebSocket Configuration
// For production, use your server's IP or domain
// If using domain, ensure DNS points to your server
define('WS_HOST', 'yourdomain.com');  // or your server IP
define('WS_PORT', 8080);  // Make sure this port is open in firewall

// Session Configuration
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_secure', 1);  // Enable for HTTPS
session_start();

// Timezone - Set to your server's timezone
date_default_timezone_set('Asia/Kolkata');  // Change to your timezone

// Error Reporting - DISABLE in production
error_reporting(0);  // Changed from E_ALL
ini_set('display_errors', 0);  // Changed from 1
?>
```

## 2. File Permissions

Set proper file permissions on Ubuntu:

```bash
# Navigate to your project directory
cd /www/wwwroot/yourdomain.com  # or your aaPanel website root

# Set directory permissions
find . -type d -exec chmod 755 {} \;

# Set file permissions
find . -type f -exec chmod 644 {} \;

# Make uploads directory writable
chmod -R 755 uploads/
chown -R www:www uploads/  # www is usually the web server user in aaPanel

# Make sure websocket directory is executable
chmod +x websocket/server.php
```

## 3. Database Setup

### In aaPanel:
1. Go to **Database** → **MySQL Management**
2. Create a new database
3. Create a new MySQL user
4. Grant all privileges to the user for your database
5. Import your `chat.sql` file:
   - Go to **phpMyAdmin** (usually accessible via aaPanel)
   - Select your database
   - Click **Import**
   - Choose `chat.sql` file
   - Click **Go**

### Run additional SQL files if needed:
- `database_update.sql`
- `database_message_reactions_update.sql`
- `database_message_stars_update.sql`
- `database_status_update.sql`
- `database_forward_reply_update.sql`

## 4. WebSocket Server Setup

### Option A: Using systemd (Recommended for Production)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/chat-websocket.service
```

Add the following content:

```ini
[Unit]
Description=Chat WebSocket Server
After=network.target mysql.service

[Service]
Type=simple
User=www
Group=www
WorkingDirectory=/www/wwwroot/yourdomain.com/websocket
ExecStart=/usr/bin/php /www/wwwroot/yourdomain.com/websocket/server.php
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable chat-websocket
sudo systemctl start chat-websocket
sudo systemctl status chat-websocket  # Check status
```

### Option B: Using Supervisor (Alternative)

Install Supervisor:
```bash
sudo apt-get update
sudo apt-get install supervisor
```

Create supervisor config:
```bash
sudo nano /etc/supervisor/conf.d/chat-websocket.conf
```

Add:
```ini
[program:chat-websocket]
command=/usr/bin/php /www/wwwroot/yourdomain.com/websocket/server.php
directory=/www/wwwroot/yourdomain.com/websocket
autostart=true
autorestart=true
user=www
redirect_stderr=true
stdout_logfile=/var/log/chat-websocket.log
```

Start supervisor:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start chat-websocket
```

## 5. Firewall Configuration

Open the WebSocket port (8080) in your firewall:

```bash
# If using UFW
sudo ufw allow 8080/tcp

# If using firewalld
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# Check if port is open
sudo netstat -tulpn | grep 8080
```

## 6. Nginx Configuration (if using Nginx in aaPanel)

If aaPanel uses Nginx, you may need to add WebSocket proxy configuration.

Go to **Website** → **Your Domain** → **Settings** → **Configuration File**

Add this inside the `server` block:

```nginx
location /websocket {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

Or if WebSocket is on a different port, you might need to configure it differently.

## 7. Apache Configuration (if using Apache in aaPanel)

If using Apache, add to your `.htaccess` or virtual host:

```apache
# Enable WebSocket proxy
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so

<IfModule mod_proxy.c>
    ProxyPreserveHost On
    ProxyRequests Off
    
    # WebSocket proxy
    ProxyPass /ws ws://127.0.0.1:8080/
    ProxyPassReverse /ws ws://127.0.0.1:8080/
</IfModule>
```

## 8. SSL/HTTPS Configuration

### In aaPanel:
1. Go to **Website** → **Your Domain** → **SSL**
2. Enable **Let's Encrypt** SSL certificate
3. Enable **Force HTTPS**

### Update WebSocket connection in `app.js`:
The WebSocket will automatically use `wss://` if the page is loaded via HTTPS.

## 9. PHP Configuration

In aaPanel, go to **App Store** → **PHP** and ensure:
- PHP version 7.4 or higher is installed
- Required extensions are enabled:
  - `mysqli`
  - `mbstring`
  - `json`
  - `openssl`
  - `pdo`
  - `pdo_mysql`

### Increase PHP limits (if needed):
Go to **PHP** → **Settings** → **Configuration File** and adjust:
```ini
upload_max_filesize = 25M
post_max_size = 25M
max_execution_time = 300
memory_limit = 256M
```

## 10. Composer Dependencies

Install Composer dependencies on the server:

```bash
cd /www/wwwroot/yourdomain.com
php composer.phar install
# or if composer is globally installed:
composer install
```

## 11. Environment-Specific Settings

### Update WebSocket URL in `index.php`:
The WebSocket configuration is already dynamic, but ensure `WS_HOST` in `config.php` matches your domain.

### For production, you might want to:
- Use environment variables instead of hardcoded values
- Create a separate `config.production.php` file
- Use `.env` file with a library like `vlucas/phpdotenv`

## 12. Security Checklist

1. **Change default passwords** - Update all default credentials
2. **Disable error display** - Already done in config.php
3. **Enable HTTPS** - Use Let's Encrypt in aaPanel
4. **Set secure session cookies** - Already configured
5. **Restrict file uploads** - Already implemented in code
6. **Use prepared statements** - Already using mysqli_real_escape_string
7. **Set proper file permissions** - See section 2
8. **Regular backups** - Use aaPanel backup feature
9. **Keep software updated** - Update PHP, MySQL, and dependencies regularly

## 13. Testing After Deployment

1. **Test database connection**: Visit your site and try to login
2. **Test file uploads**: Upload an image/file in chat
3. **Test WebSocket**: 
   - Open browser console
   - Check for "WebSocket connected successfully" message
   - Send a message and verify real-time delivery
4. **Test HTTPS**: Ensure all resources load via HTTPS
5. **Test on mobile**: Verify responsive design works

## 14. Monitoring

### Check WebSocket logs:
```bash
# If using systemd
sudo journalctl -u chat-websocket -f

# If using supervisor
sudo tail -f /var/log/chat-websocket.log
```

### Check PHP error logs:
In aaPanel: **Website** → **Your Domain** → **Logs** → **Error Log**

### Monitor system resources:
```bash
# Check if WebSocket process is running
ps aux | grep server.php

# Check port usage
sudo netstat -tulpn | grep 8080

# Monitor system resources
htop
```

## 15. Troubleshooting

### WebSocket not connecting:
1. Check if WebSocket service is running: `sudo systemctl status chat-websocket`
2. Check firewall: `sudo ufw status`
3. Check port: `sudo netstat -tulpn | grep 8080`
4. Check WebSocket logs for errors
5. Verify `WS_HOST` and `WS_PORT` in `config.php` match your server

### Database connection errors:
1. Verify database credentials in `config.php`
2. Check if MySQL is running: `sudo systemctl status mysql`
3. Check database user permissions in aaPanel
4. Verify database exists in phpMyAdmin

### File upload issues:
1. Check `uploads/` directory permissions: `ls -la uploads/`
2. Check PHP upload limits in aaPanel PHP settings
3. Verify `UPLOAD_DIR` path in `config.php` is correct

### SSL/HTTPS issues:
1. Ensure Let's Encrypt certificate is valid in aaPanel
2. Check if all resources (CSS, JS, images) load via HTTPS
3. Clear browser cache and cookies

## 16. Backup Strategy

Set up regular backups in aaPanel:
1. Go to **Backup** → **Backup Settings**
2. Enable automatic backups
3. Configure backup frequency (daily recommended)
4. Include database and files
5. Store backups on external storage or cloud

## Quick Checklist

- [ ] Update `config.php` with production values
- [ ] Set proper file permissions
- [ ] Create and import database
- [ ] Install Composer dependencies
- [ ] Set up WebSocket as systemd service
- [ ] Open firewall port 8080
- [ ] Configure SSL/HTTPS
- [ ] Test all features
- [ ] Set up monitoring and backups
- [ ] Disable error display
- [ ] Update timezone settings

## Notes for aaPanel Specifics

- aaPanel usually uses `/www/wwwroot/` as the web root directory
- Default web server user is usually `www`
- MySQL is accessible via phpMyAdmin in aaPanel
- SSL certificates can be managed directly in aaPanel interface
- File manager is available in aaPanel for easy file editing
- Cron jobs can be set up in aaPanel → **Cron** section

For WebSocket, you might need to run it as a daemon process using one of the methods above (systemd or supervisor) since aaPanel doesn't have built-in WebSocket management.

# Quick Start Guide - WebSocket Server

## Your Setup
- **Base URL**: `https://kprm.co.in/samvad`
- **Project Path**: `/www/wwwroot/kprm.co.in/samvad/`
- **WebSocket Path**: `/www/wwwroot/kprm.co.in/samvad/websocket/server.php`

## Direct Command to Start WebSocket

### Option 1: Direct PHP Command (Manual Start)
```bash
cd /www/wwwroot/kprm.co.in/samvad/websocket && php server.php
```

**IMPORTANT:** The server now binds to `0.0.0.0` to accept connections from all interfaces. Make sure your `config.php` has:
```php
define('WS_HOST', 'kprm.co.in');  // Domain for client connection
define('WS_PORT', 8080);
```

### Quick Fix for WSS Connection Error

**Problem:** Your site uses HTTPS, so browser tries `wss://` but server doesn't have SSL.

**Temporary Solution (Testing Only):**
Update `app.js` line 944 to force WS connection:
```javascript
// Change from:
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// To:
const protocol = 'ws:';  // Force non-secure for testing
```

**Production Solution:** Use Nginx reverse proxy (see WEBSOCKET_TROUBLESHOOTING.md)

### Option 2: Using the Start Script
```bash
# Make script executable (first time only)
chmod +x /www/wwwroot/kprm.co.in/samvad/start-websocket.sh

# Run the script
/www/wwwroot/kprm.co.in/samvad/start-websocket.sh
```

### Option 3: Run in Background (for testing)
```bash
cd /www/wwwroot/kprm.co.in/samvad/websocket
nohup php server.php > /tmp/websocket.log 2>&1 &
```

### Option 4: Using systemd Service (Production - Recommended)
```bash
# Start the service
sudo systemctl start chat-websocket

# Check status
sudo systemctl status chat-websocket

# Enable auto-start on boot
sudo systemctl enable chat-websocket
```

## Configuration Update Required

Update `config.php` with your base URL:

```php
// Application Configuration
define('BASE_URL', 'https://kprm.co.in/samvad');
define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('UPLOAD_URL', BASE_URL . '/uploads/');

// WebSocket Configuration
define('WS_HOST', 'kprm.co.in');  // Your domain
define('WS_PORT', 8080);
```

## Systemd Service File

If using systemd, update `/etc/systemd/system/chat-websocket.service`:

```ini
[Unit]
Description=Chat WebSocket Server
After=network.target mysql.service

[Service]
Type=simple
User=www
Group=www
WorkingDirectory=/www/wwwroot/kprm.co.in/samvad/websocket
ExecStart=/usr/bin/php /www/wwwroot/kprm.co.in/samvad/websocket/server.php
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable chat-websocket
sudo systemctl start chat-websocket
```

## Verify WebSocket is Running

```bash
# Check if process is running
ps aux | grep server.php

# Check if port 8080 is listening
sudo netstat -tulpn | grep 8080

# Test connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://kprm.co.in:8080
```

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 8080
sudo lsof -i :8080

# Kill the process if needed
sudo kill -9 <PID>
```

### Permission Denied
```bash
# Make sure websocket directory is accessible
chmod +x /www/wwwroot/kprm.co.in/samvad/websocket/server.php
chown -R www:www /www/wwwroot/kprm.co.in/samvad/websocket
```

### Check Logs
```bash
# If using systemd
sudo journalctl -u chat-websocket -f

# If running manually, check the output in terminal
```

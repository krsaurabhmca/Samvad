# WebSocket Connection Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: WebSocket Connection Failed (Error 1006)

**Symptoms:**
- Browser console shows: `WebSocket connection to 'wss://kprm.co.in:8080/' failed`
- Error code: 1006 (abnormal closure)

**Solutions:**

#### 1. Check if WebSocket Server is Running

```bash
# Check if process is running
ps aux | grep server.php

# Check if port 8080 is listening
sudo netstat -tulpn | grep 8080
# or
sudo ss -tulpn | grep 8080
```

If not running, start it:
```bash
cd /www/wwwroot/kprm.co.in/samvad/websocket
php server.php
```

#### 2. Verify Firewall Settings

Port 8080 must be open:

```bash
# Check firewall status
sudo ufw status

# Allow port 8080
sudo ufw allow 8080/tcp

# If using firewalld
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

#### 3. WSS (Secure WebSocket) vs WS (Non-Secure)

**Problem:** Your site uses HTTPS, so browser tries to connect via `wss://`, but your WebSocket server doesn't have SSL configured.

**Solution Options:**

**Option A: Use Reverse Proxy with SSL (Recommended for Production)**

Configure Nginx to proxy WebSocket with SSL:

```nginx
# In your Nginx site configuration
location /ws {
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

Then update `config.php`:
```php
define('WS_HOST', 'kprm.co.in');
define('WS_PORT', 443);  // Use HTTPS port, Nginx will proxy to 8080
```

And update `app.js` connection to use `/ws` path instead of port.

**Option B: Use WS (Non-Secure) for Testing**

Update `app.js` to force WS connection even on HTTPS (not recommended for production):

```javascript
// In app.js, around line 944
const protocol = 'ws:';  // Force WS instead of WSS
const wsUrl = `${protocol}//${WS_HOST}:${WS_PORT}`;
```

**Option C: Add SSL Support to WebSocket Server**

This requires SSL certificates and modifying the server code (more complex).

#### 4. Server Binding Issue

The WebSocket server should bind to `0.0.0.0` (all interfaces), not just the domain name.

**Check `websocket/server.php`** - it should have:
```php
$bindHost = '0.0.0.0';  // Bind to all interfaces
```

The `WS_HOST` in config.php is for the client connection URL, but the server binds to `0.0.0.0`.

#### 5. Check Server Logs

```bash
# If using systemd
sudo journalctl -u chat-websocket -f

# If running manually, check terminal output
# Or check supervisor logs
tail -f /www/server/panel/plugin/supervisor/log/chatplus.out.log
```

### Issue 2: Connection Refused

**Symptoms:**
- `WebSocket connection to 'wss://kprm.co.in:8080/' failed: Error in connection establishment`

**Solutions:**

1. **Verify WebSocket server is running and listening:**
   ```bash
   sudo netstat -tulpn | grep 8080
   ```
   Should show: `tcp 0 0 0.0.0.0:8080 0.0.0.0:* LISTEN`

2. **Check if port is accessible from outside:**
   ```bash
   # From another machine or use online tool
   telnet kprm.co.in 8080
   ```

3. **Verify DNS resolution:**
   ```bash
   ping kprm.co.in
   nslookup kprm.co.in
   ```

### Issue 3: Mixed Content (HTTPS page trying WS connection)

**Symptoms:**
- Browser blocks WebSocket connection
- Console shows mixed content warnings

**Solution:**
- Use WSS (secure WebSocket) when page is HTTPS
- Or use reverse proxy (Option A above)

### Issue 4: CORS or Origin Issues

**Symptoms:**
- Connection established but immediately closed
- Origin mismatch errors

**Solution:**
The WebSocket server should accept connections from your domain. Check `websocket/server.php` for origin validation.

## Quick Diagnostic Steps

1. **Test WebSocket server locally:**
   ```bash
   cd /www/wwwroot/kprm.co.in/samvad/websocket
   php server.php
   ```
   Should see: `WebSocket server running on 0.0.0.0:8080`

2. **Test connection from server:**
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://127.0.0.1:8080
   ```

3. **Check browser console:**
   - Open browser DevTools → Console
   - Look for WebSocket connection messages
   - Check Network tab → WS filter for WebSocket connections

4. **Verify config.php:**
   ```php
   define('WS_HOST', 'kprm.co.in');  // Your domain
   define('WS_PORT', 8080);
   ```

5. **Check index.php includes WebSocket config:**
   ```php
   const WS_HOST = '<?php echo WS_HOST; ?>';
   const WS_PORT = <?php echo WS_PORT; ?>;
   ```

## Recommended Production Setup

For production with HTTPS, use **Option A (Reverse Proxy)**:

1. Configure Nginx to proxy WebSocket
2. Use port 443 (HTTPS) for WebSocket connection
3. Nginx handles SSL termination
4. WebSocket server runs on localhost:8080

This is the most secure and reliable solution.

## Testing Commands

```bash
# Check if WebSocket server is running
ps aux | grep server.php

# Check port 8080
sudo netstat -tulpn | grep 8080

# Test local connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://127.0.0.1:8080

# Check firewall
sudo ufw status | grep 8080

# View WebSocket server output (if running manually)
# Or check logs if using systemd/supervisor
```

## Still Having Issues?

1. Verify all configuration files are updated
2. Check server logs for errors
3. Test with a simple WebSocket client tool
4. Verify network connectivity
5. Check if any firewall or security software is blocking the connection

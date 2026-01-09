# Nginx WebSocket Proxy Configuration

This guide shows how to configure Nginx to proxy WebSocket connections with SSL support.

## Problem

When your site uses HTTPS, browsers require `wss://` (secure WebSocket), but your WebSocket server runs on port 8080 without SSL. The solution is to use Nginx as a reverse proxy.

## Solution: Nginx Reverse Proxy

### Step 1: Update Nginx Configuration

In aaPanel:
1. Go to **Website** → **kprm.co.in** → **Settings** → **Configuration File**
2. Add the following inside the `server` block (usually after the main `location /` block):

```nginx
# WebSocket Proxy Configuration
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
    proxy_connect_timeout 7d;
    proxy_send_timeout 7d;
}
```

### Step 2: Update JavaScript Connection

Update `assets/js/app.js` around line 944-945:

**Change from:**
```javascript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${WS_HOST}:${WS_PORT}`;
```

**To:**
```javascript
// Use Nginx proxy path instead of direct port connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${WS_HOST}/ws`;  // Use /ws path, Nginx will proxy
```

### Step 3: Update config.php (Optional)

You can remove or keep `WS_PORT` - it's not needed when using proxy:

```php
define('WS_HOST', 'kprm.co.in');
// WS_PORT not needed when using Nginx proxy, but keep it for backward compatibility
define('WS_PORT', 8080);
```

### Step 4: Reload Nginx

```bash
sudo nginx -t  # Test configuration
sudo systemctl reload nginx  # Reload Nginx
```

## Alternative: Direct Port with SSL

If you prefer to keep using the direct port connection, you'll need to:

1. **Option A:** Use WS (non-secure) - Not recommended for production
   - Update `app.js` to force `ws://` even on HTTPS
   - Browser may show security warnings

2. **Option B:** Add SSL to WebSocket server
   - Requires SSL certificates
   - More complex setup
   - Not recommended - use Nginx proxy instead

## Testing

After configuration:

1. **Check Nginx config:**
   ```bash
   sudo nginx -t
   ```

2. **Reload Nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

3. **Verify WebSocket server is running:**
   ```bash
   ps aux | grep server.php
   sudo netstat -tulpn | grep 8080
   ```

4. **Test connection:**
   - Open browser console
   - Should see: `WebSocket connected successfully`
   - No more `wss://` connection errors

## Full Nginx Configuration Example

Here's a complete `server` block example:

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name kprm.co.in;
    
    # SSL configuration (Let's Encrypt)
    ssl_certificate /www/server/panel/vhost/cert/kprm.co.in/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/kprm.co.in/privkey.pem;
    
    root /www/wwwroot/kprm.co.in/samvad;
    index index.php index.html;
    
    # Main location
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    
    # PHP handling
    location ~ \.php$ {
        fastcgi_pass unix:/tmp/php-cgi-74.sock;  # Adjust PHP version
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
    
    # WebSocket Proxy
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
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
    }
    
    # Redirect HTTP to HTTPS
    if ($server_port !~ 443){
        rewrite ^(/.*)$ https://$host$1 permanent;
    }
}
```

## Benefits of This Approach

1. ✅ **SSL/TLS Support:** Nginx handles SSL termination
2. ✅ **Security:** WebSocket server runs on localhost only
3. ✅ **Standard Ports:** Uses standard 443 (HTTPS) port
4. ✅ **No Firewall Changes:** No need to open port 8080 publicly
5. ✅ **Better Performance:** Nginx handles SSL overhead
6. ✅ **Easier Management:** All traffic through one port

## Troubleshooting

### Connection Still Fails

1. **Check Nginx error logs:**
   ```bash
   tail -f /www/wwwlogs/kprm.co.in.error.log
   ```

2. **Verify WebSocket server is running:**
   ```bash
   ps aux | grep server.php
   ```

3. **Test proxy locally:**
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://kprm.co.in/ws
   ```

4. **Check browser console** for specific error messages

### 502 Bad Gateway

- WebSocket server not running on port 8080
- Check: `sudo netstat -tulpn | grep 8080`

### 404 Not Found

- Nginx location block not configured correctly
- Check Nginx config syntax: `sudo nginx -t`

## Notes

- The `/ws` path is arbitrary - you can use `/websocket`, `/socket`, etc.
- Make sure to update the JavaScript connection URL to match
- WebSocket server still runs on port 8080 locally
- External clients connect via `wss://kprm.co.in/ws` (port 443)

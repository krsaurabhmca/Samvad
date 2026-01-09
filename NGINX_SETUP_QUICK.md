# Quick Nginx WebSocket Proxy Setup for kprm.co.in

## Problem
Your site uses HTTPS, so browser requires `wss://` (secure WebSocket), but your WebSocket server on port 8080 doesn't have SSL.

## Solution: Nginx Reverse Proxy

### Step 1: Add WebSocket Proxy to Nginx Config

In aaPanel:
1. Go to **Website** → **kprm.co.in** → **Settings** → **Configuration File**
2. Find the `server` block for `kprm.co.in`
3. Add this **inside** the `server` block (after the main `location /` block):

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

### Step 2: Test and Reload Nginx

```bash
# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
# or in aaPanel: Website → kprm.co.in → Settings → Reload
```

### Step 3: Verify WebSocket Server is Running

```bash
# Check if WebSocket server is running
ps aux | grep server.php

# If not running, start it:
cd /www/wwwroot/kprm.co.in/samvad/websocket
php server.php
# Or if using systemd:
sudo systemctl start chat-websocket
```

### Step 4: Test Connection

1. Open your browser and go to `https://kprm.co.in/samvad`
2. Open browser console (F12)
3. Should see: `WebSocket connected successfully`
4. No more connection errors!

## How It Works

- Browser connects to: `wss://kprm.co.in/ws` (port 443, SSL)
- Nginx receives the connection and terminates SSL
- Nginx proxies to: `http://127.0.0.1:8080` (your WebSocket server)
- WebSocket server doesn't need SSL - Nginx handles it

## Troubleshooting

### 502 Bad Gateway
- WebSocket server not running on port 8080
- Check: `sudo netstat -tulpn | grep 8080`

### 404 Not Found
- Nginx location block not configured correctly
- Check Nginx config: `sudo nginx -t`

### Still Can't Connect
1. Check Nginx error logs:
   ```bash
   tail -f /www/wwwlogs/kprm.co.in.error.log
   ```

2. Verify WebSocket server is running:
   ```bash
   ps aux | grep server.php
   ```

3. Test proxy locally:
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://kprm.co.in/ws
   ```

## Alternative: Temporary WS Fix (Testing Only)

If you want to test without Nginx proxy first, update `app.js` line 944:

```javascript
// Change from:
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

// To (for testing only - NOT for production):
const protocol = 'ws:';  // Force non-secure WebSocket
```

**Note:** This will show security warnings in browser. Use Nginx proxy for production.

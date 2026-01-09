# Apache WebSocket Configuration Fix

## Your Current Configuration

You have Apache configured, but the WebSocket proxy needs some adjustments.

## Issues to Fix

1. **Trailing slash mismatch**: You're using `/ws/` but app.js connects to `/ws`
2. **Missing WebSocket upgrade headers**: Need proper headers for WebSocket upgrade
3. **Module requirements**: Need to ensure required modules are enabled

## Corrected Apache Configuration

Replace your WebSocket section with this:

```apache
<VirtualHost *:443>
    ServerAdmin webmaster@example.com
    ServerName kprm.co.in
    ServerAlias www.kprm.co.in
    DocumentRoot "/www/wwwroot/kprm.co.in"

    # ===== SSL =====
    SSLEngine On
    SSLCertificateFile /www/server/panel/vhost/cert/kprm.co.in/fullchain.pem
    SSLCertificateKeyFile /www/server/panel/vhost/cert/kprm.co.in/privkey.pem

    # ===== WebSocket Proxy (Ratchet) =====
    # Enable required modules (add these if not already in main config)
    LoadModule proxy_module modules/mod_proxy.so
    LoadModule proxy_http_module modules/mod_proxy_http.so
    LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
    
    ProxyPreserveHost On
    ProxyRequests Off

    # WebSocket Proxy - Use /ws (no trailing slash) to match app.js
    <Location /ws>
        ProxyPass ws://127.0.0.1:8080/
        ProxyPassReverse ws://127.0.0.1:8080/
        ProxyPreserveHost On
    </Location>

    # Pass Authorization header to PHP
    SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1

    # ===== PHP =====
    <FilesMatch \.php$>
        SetHandler "proxy:unix:/tmp/php-cgi-84.sock|fcgi://localhost"
    </FilesMatch>

    <Directory "/www/wwwroot/kprm.co.in">
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog "/www/wwwlogs/kprm.co.in-error_log"
    CustomLog "/www/wwwlogs/kprm.co.in-access_log" combined
</VirtualHost>
```

## Key Changes

1. **Changed from `ProxyPass /ws/` to `<Location /ws>`** - Better for WebSocket
2. **Removed trailing slash from path** - Matches app.js connection
3. **Added Location block** - More reliable for WebSocket connections

## Alternative: If Location Block Doesn't Work

If the `<Location>` block doesn't work, try this simpler version:

```apache
# WebSocket Proxy
ProxyPass /ws ws://127.0.0.1:8080/
ProxyPassReverse /ws ws://127.0.0.1:8080/
```

## Verify Required Modules Are Enabled

In aaPanel or via command line:

```bash
# Check if modules are loaded
apache2ctl -M | grep proxy
# Should show:
# proxy_module
# proxy_http_module
# proxy_wstunnel_module

# If not enabled, enable them:
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo systemctl restart apache2
```

## After Making Changes

1. **Save the configuration file in aaPanel**
2. **Test Apache config:**
   ```bash
   apache2ctl configtest
   # or
   /usr/sbin/apachectl configtest
   ```
3. **Restart Apache:**
   - In aaPanel: Click **Restart** for the website
   - Or via command: `sudo systemctl restart apache2`

## Verify WebSocket Server is Running

```bash
# Check if WebSocket server is running
ps aux | grep server.php

# Check port 8080
sudo netstat -tulpn | grep 8080

# If not running, start it:
cd /www/wwwroot/kprm.co.in/samvad/websocket
php server.php
```

## Test the Connection

1. Open browser: `https://kprm.co.in/samvad`
2. Open browser console (F12)
3. Should see: `WebSocket connected successfully`
4. Connection URL should be: `wss://kprm.co.in/ws`

## Troubleshooting

### 502 Bad Gateway
- WebSocket server not running on port 8080
- Check: `ps aux | grep server.php`

### 404 Not Found
- Path mismatch - verify app.js uses `/ws` (no trailing slash)
- Check Apache error logs: `tail -f /www/wwwlogs/kprm.co.in-error_log`

### Connection Refused
- WebSocket server not running
- Port 8080 not accessible
- Check firewall: `sudo ufw status`

### Module Not Found
- Enable required modules (see above)
- Restart Apache after enabling modules

## Verify app.js Configuration

Make sure `app.js` has:
```javascript
const useProxy = true; // Should be true
const wsUrl = useProxy 
    ? `${protocol}//${WS_HOST}/ws`  // Uses /ws path
    : `${protocol}//${WS_HOST}:${WS_PORT}`;
```

The path `/ws` (no trailing slash) should match your Apache configuration.

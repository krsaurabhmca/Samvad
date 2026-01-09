# WebSocket Proxy Setup - Nginx or Apache

## Check Which Web Server You're Using

```bash
# Check if Nginx is installed
which nginx
# or
systemctl status nginx

# Check if Apache is installed
which apache2
# or
systemctl status apache2
# or
systemctl status httpd
```

## Option A: If Using Nginx

### Via aaPanel (Easiest Method)

1. **Login to aaPanel**
2. Go to **Website** → **kprm.co.in** → **Settings** → **Configuration File**
3. Find the `server` block for your domain
4. Add this **inside** the `server` block (after `location /`):

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

5. Click **Save**
6. In aaPanel, click **Reload** or **Restart** for the website

### Via Command Line (If Nginx is Installed)

```bash
# Find Nginx config file
sudo find /etc -name "kprm.co.in.conf" 2>/dev/null
# or check common locations:
ls /etc/nginx/sites-available/
ls /etc/nginx/conf.d/
ls /www/server/panel/vhost/nginx/

# Edit the config file
sudo nano /path/to/kprm.co.in.conf

# Test config (if nginx command is available)
sudo /usr/sbin/nginx -t
# or
sudo /usr/local/nginx/sbin/nginx -t

# Reload Nginx
sudo /usr/sbin/nginx -s reload
# or via systemctl
sudo systemctl reload nginx
```

## Option B: If Using Apache

### Via aaPanel

1. **Login to aaPanel**
2. Go to **Website** → **kprm.co.in** → **Settings** → **Configuration File**
3. Add this **inside** the `<VirtualHost>` block:

```apache
# Enable required modules (usually already enabled)
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so

# WebSocket Proxy Configuration
<Location /ws>
    ProxyPass ws://127.0.0.1:8080/
    ProxyPassReverse ws://127.0.0.1:8080/
    ProxyPreserveHost On
</Location>
```

4. Click **Save**
5. Restart Apache in aaPanel

### Via Command Line (If Apache is Installed)

```bash
# Find Apache config file
sudo find /etc -name "kprm.co.in.conf" 2>/dev/null
# or check:
ls /etc/apache2/sites-available/
ls /www/server/panel/vhost/apache/

# Edit the config file
sudo nano /path/to/kprm.co.in.conf

# Test Apache config
sudo apache2ctl configtest
# or
sudo /usr/sbin/apachectl configtest

# Restart Apache
sudo systemctl restart apache2
# or
sudo systemctl restart httpd
```

## Option C: Check aaPanel Web Server Type

In aaPanel:
1. Go to **App Store**
2. Check which web server is installed:
   - **Nginx** - Use Option A
   - **Apache** - Use Option B
   - **OpenLiteSpeed** - Different configuration needed

## Quick Test After Configuration

```bash
# Test WebSocket proxy
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://kprm.co.in/ws

# Should return HTTP 101 Switching Protocols if working
```

## If Neither Nginx nor Apache Commands Work

Use aaPanel interface:

1. **Website** → **kprm.co.in** → **Settings** → **Configuration File**
2. Add the appropriate configuration (Nginx or Apache) above
3. Click **Save**
4. Click **Reload** or **Restart** button in aaPanel

## Verify WebSocket Server is Running

```bash
# Check if WebSocket server is running
ps aux | grep server.php

# Check if port 8080 is listening
sudo netstat -tulpn | grep 8080

# If not running, start it:
cd /www/wwwroot/kprm.co.in/samvad/websocket
php server.php
```

## Troubleshooting

### 502 Bad Gateway
- WebSocket server not running
- Check: `ps aux | grep server.php`
- Start WebSocket server

### 404 Not Found
- Location/path not configured correctly
- Check config file syntax
- Verify `/ws` path is correct

### Can't Find Config File
- In aaPanel, use the **Configuration File** editor
- It will show the correct file location
- Or check: `/www/server/panel/vhost/` directory

# Fix: WebSocket Server Binding to 127.0.0.1 Instead of 0.0.0.0

## Problem

Your WebSocket server is showing:
```
WebSocket server running on 127.0.0.1:8080
```

This means it's only accepting connections from localhost, not from external clients.

## Solution

The server needs to bind to `0.0.0.0` to accept connections from all interfaces.

### Step 1: Update server.php on Your Server

SSH into your server and edit the file:

```bash
nano /www/wwwroot/kprm.co.in/samvad/websocket/server.php
```

Find this section (around line 203-215):

```php
// For production, bind to 0.0.0.0 to accept connections from all interfaces
// WS_HOST is used for client connection URL, but server binds to 0.0.0.0
$bindHost = '0.0.0.0';  // Bind to all interfaces - DO NOT CHANGE THIS

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new Chat()
        )
    ),
    WS_PORT,
    $bindHost  // This MUST be 0.0.0.0, not WS_HOST
);
```

**Make sure `$bindHost = '0.0.0.0';` is set correctly.**

### Step 2: Verify the Change

After updating, restart the WebSocket server:

```bash
# Stop current server (Ctrl+C if running in terminal)
# Or kill the process:
pkill -f "server.php"

# Start again
cd /www/wwwroot/kprm.co.in/samvad/websocket
php server.php
```

You should now see:
```
WebSocket server running on 0.0.0.0:8080
Clients should connect to: ws://kprm.co.in:8080 (or wss:// if using HTTPS)
```

### Step 3: Verify It's Listening on All Interfaces

Check that port 8080 is listening on all interfaces:

```bash
sudo netstat -tulpn | grep 8080
```

Should show:
```
tcp  0  0  0.0.0.0:8080  0.0.0.0:*  LISTEN  <PID>/php
```

If it shows `127.0.0.1:8080` instead, the binding is still wrong.

## Quick Fix Command

If you want to quickly verify/fix on the server:

```bash
# Check current binding
grep "bindHost\|IoServer::factory" /www/wwwroot/kprm.co.in/samvad/websocket/server.php

# Should show:
# $bindHost = '0.0.0.0';
# WS_PORT,
# $bindHost

# If it shows WS_HOST instead of $bindHost in IoServer::factory, fix it:
sed -i "s/IoServer::factory(.*WS_PORT.*WS_HOST/IoServer::factory(\n    new HttpServer(\n        new WsServer(\n            new Chat()\n        )\n    ),\n    WS_PORT,\n    '0.0.0.0'/g" /www/wwwroot/kprm.co.in/samvad/websocket/server.php
```

Or manually edit and ensure:
1. `$bindHost = '0.0.0.0';` is set
2. `IoServer::factory()` uses `$bindHost` as the third parameter, not `WS_HOST`

## After Fixing

1. Restart the WebSocket server
2. Verify it shows `0.0.0.0:8080` in the output
3. Test connection from browser - should work now (if using WS, not WSS)

## Still Having Issues?

If after fixing the binding you still can't connect:

1. **Check firewall:**
   ```bash
   sudo ufw allow 8080/tcp
   ```

2. **Check if port is accessible:**
   ```bash
   telnet kprm.co.in 8080
   ```

3. **For WSS (secure WebSocket):** You'll still need to set up Nginx reverse proxy (see NGINX_WEBSOCKET_PROXY.md)

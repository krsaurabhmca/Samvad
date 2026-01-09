# Enabling Apache Modules in aaPanel

## Problem

Standard Apache commands (`apache2ctl`, `a2enmod`) are not found because aaPanel uses a custom Apache installation.

## Solution: Find aaPanel's Apache Commands

### Step 1: Find Apache Installation Path

```bash
# Find Apache binary
which httpd
# or
find /www -name "httpd" -type f 2>/dev/null
find /www -name "apachectl" -type f 2>/dev/null

# Common aaPanel Apache paths:
# /www/server/apache/bin/httpd
# /www/server/apache/bin/apachectl
```

### Step 2: Check Loaded Modules

```bash
# Try these commands:
/www/server/apache/bin/httpd -M | grep proxy
# or
/www/server/apache/bin/apachectl -M | grep proxy
```

### Step 3: Enable Modules via aaPanel (Easiest Method)

**In aaPanel:**
1. Go to **App Store** → **Apache**
2. Look for **Module Management** or **Extensions**
3. Enable:
   - `proxy_module`
   - `proxy_http_module`
   - `proxy_wstunnel_module`
4. Restart Apache

### Step 4: Or Enable Modules Manually

If you found the Apache path, check the modules directory:

```bash
# Find modules directory
ls /www/server/apache/modules/
# or
ls /www/server/apache/libexec/

# Check if proxy modules exist
ls /www/server/apache/modules/ | grep proxy
```

Then add to Apache config (usually in `/www/server/apache/conf/httpd.conf`):

```apache
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
```

### Step 5: Restart Apache via aaPanel

**Easiest way:**
1. In aaPanel: **Website** → **kprm.co.in** → **Settings** → **Restart**
2. Or: **App Store** → **Apache** → **Restart**

## Alternative: Check if Modules Are Already Loaded

Your Apache config might already have the modules loaded. Check your main Apache config:

```bash
# Check main Apache config
grep -i "LoadModule.*proxy" /www/server/apache/conf/httpd.conf
# or
grep -i "LoadModule.*proxy" /etc/httpd/conf/httpd.conf
```

If you see the proxy modules listed, they're already enabled!

## Quick Test: Check Apache Error Log

After configuring WebSocket proxy, check if there are module errors:

```bash
tail -f /www/wwwlogs/kprm.co.in-error_log
```

If you see errors like "module not found", then you need to enable the modules.

## Verify WebSocket Configuration Works

Even without the commands, you can:

1. **Add the WebSocket config to your VirtualHost** (you already did this)
2. **Restart Apache via aaPanel**
3. **Test the connection** in browser

If it works, the modules are already enabled!

## If Modules Are Missing

If the modules don't exist, you may need to:

1. **Reinstall Apache in aaPanel:**
   - App Store → Apache → Reinstall
   
2. **Or compile Apache with WebSocket support** (advanced)

But first, test if your current configuration works - the modules might already be enabled.

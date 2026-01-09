# WebSocket Server Setup for XAMPP

## Why WebSocket Doesn't Work in XAMPP

XAMPP's Apache server **does not support WebSocket connections** by default. WebSocket requires a separate server process that runs independently of Apache.

## Solution

You need to run the WebSocket server **separately** as a PHP CLI (Command Line Interface) script.

## Setup Instructions

### Step 1: Install Composer Dependencies

Make sure you have run:
```bash
composer install
```

This installs the Ratchet WebSocket library.

### Step 2: Start the WebSocket Server

#### For Windows (XAMPP):

1. **Option A: Using the Batch File (Easiest)**
   - Double-click `start-websocket.bat`
   - A command window will open showing "WebSocket server running on 127.0.0.1:8080"
   - **Keep this window open** while using the chat application

2. **Option B: Using Command Prompt**
   - Open Command Prompt
   - Navigate to your project directory:
     ```cmd
     cd C:\xampp\htdocs\chat
     ```
   - Run:
     ```cmd
     php websocket/server.php
     ```

#### For Linux/Mac:

1. Open Terminal
2. Navigate to your project directory:
   ```bash
   cd /path/to/chat
   ```
3. Run:
   ```bash
   php websocket/server.php
   ```
   Or use the shell script:
   ```bash
   chmod +x start-websocket.sh
   ./start-websocket.sh
   ```

### Step 3: Verify the Server is Running

You should see:
```
WebSocket server running on 127.0.0.1:8080
```

### Step 4: Keep the Server Running

**IMPORTANT:** The WebSocket server must remain running while you use the chat application. If you close the command window/terminal, real-time features will stop working.

## Troubleshooting

### Port Already in Use

If you see an error like "Address already in use":
1. Another instance of the WebSocket server might be running
2. Close all command windows running the server
3. Or change the port in `config.php`:
   ```php
   define('WS_PORT', 8081); // Use a different port
   ```

### PHP CLI Not Found

If you get "php is not recognized":
1. Add PHP to your system PATH, or
2. Use the full path to PHP:
   ```cmd
   C:\xampp\php\php.exe websocket/server.php
   ```

### Firewall Issues

Windows Firewall might block the connection:
1. Allow PHP through Windows Firewall
2. Or temporarily disable firewall for testing

### Connection Refused

If the browser console shows "WebSocket connection failed":
1. Make sure the WebSocket server is running
2. Check that the port (8080) matches in `config.php` and `app.js`
3. Verify no firewall is blocking the connection

## Running as a Service (Advanced)

For production, you might want to run the WebSocket server as a Windows service or Linux daemon. This requires additional setup and is beyond the scope of this guide.

## Testing

1. Start the WebSocket server
2. Open the chat application in your browser
3. Open browser console (F12)
4. You should see: "WebSocket connected successfully"
5. Send a message - it should appear in real-time

## Notes

- The WebSocket server runs on port 8080 by default
- It only works on `localhost` or `127.0.0.1` in this setup
- For production, you'll need to configure proper domain and SSL certificates for `wss://` connections

<?php
/**
 * Test script to verify WebSocket server can start
 * Run: php test-websocket.php
 */

echo "Testing WebSocket Server Setup...\n\n";

// Check PHP version
echo "1. Checking PHP version... ";
if (version_compare(PHP_VERSION, '7.4.0', '>=')) {
    echo "OK (" . PHP_VERSION . ")\n";
} else {
    echo "FAILED (PHP 7.4+ required, found " . PHP_VERSION . ")\n";
    exit(1);
}

// Check if vendor directory exists
echo "2. Checking Composer dependencies... ";
if (file_exists(__DIR__ . '/vendor/autoload.php')) {
    echo "OK\n";
} else {
    echo "FAILED\n";
    echo "   Please run: composer install\n";
    exit(1);
}

// Check if Ratchet is installed
echo "3. Checking Ratchet library... ";
try {
    require __DIR__ . '/vendor/autoload.php';
    if (class_exists('Ratchet\Server\IoServer')) {
        echo "OK\n";
    } else {
        echo "FAILED\n";
        echo "   Ratchet library not found. Run: composer install\n";
        exit(1);
    }
} catch (Exception $e) {
    echo "FAILED\n";
    echo "   Error: " . $e->getMessage() . "\n";
    exit(1);
}

// Check database connection
echo "4. Checking database connection... ";
require_once __DIR__ . '/config.php';
$test_conn = @mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($test_conn) {
    echo "OK\n";
    mysqli_close($test_conn);
} else {
    echo "FAILED\n";
    echo "   Error: " . mysqli_connect_error() . "\n";
    echo "   Please check your database credentials in config.php\n";
    exit(1);
}

// Check if port is available
echo "5. Checking if port " . WS_PORT . " is available... ";
$socket = @fsockopen(WS_HOST, WS_PORT, $errno, $errstr, 1);
if ($socket) {
    echo "PORT IN USE\n";
    echo "   Warning: Port " . WS_PORT . " is already in use.\n";
    echo "   Another WebSocket server might be running, or change the port in config.php\n";
    fclose($socket);
} else {
    echo "OK (port is free)\n";
}

// Check WebSocket server file
echo "6. Checking WebSocket server file... ";
if (file_exists(__DIR__ . '/websocket/server.php')) {
    echo "OK\n";
} else {
    echo "FAILED\n";
    exit(1);
}

echo "\n✓ All checks passed! You can start the WebSocket server with:\n";
echo "  php websocket/server.php\n\n";
?>

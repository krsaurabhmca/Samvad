<?php
// Check if vendor directory exists
if (!file_exists(__DIR__ . '/../vendor/autoload.php')) {
    die("ERROR: Composer dependencies not installed!\nPlease run: composer install\n");
}

require __DIR__ . '/../vendor/autoload.php';

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;

// Load config without session
require_once __DIR__ . '/../config.php';

// Database connection (without session)
$conn = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME);

if (!$conn) {
    die("ERROR: Database connection failed: " . mysqli_connect_error() . "\n");
}

mysqli_set_charset($conn, "utf8mb4");

class Chat implements MessageComponentInterface {
    protected $clients;
    protected $users;

    public function __construct() {
        $this->clients = new \SplObjectStorage;
        $this->users = [];
    }

    public function onOpen(ConnectionInterface $conn) {
        $this->clients->attach($conn);
        echo "New connection! ({$conn->resourceId})\n";
    }

    public function onMessage(ConnectionInterface $from, $msg) {
        $data = json_decode($msg, true);
        
        if (!$data) {
            return;
        }
        
        global $conn;
        
        switch ($data['type']) {
            case 'auth':
                $this->handleAuth($from, $data);
                break;
            case 'message':
                $this->handleMessage($from, $data);
                break;
            case 'typing':
                $this->handleTyping($from, $data);
                break;
            case 'read':
                $this->handleRead($from, $data);
                break;
        }
    }

    public function onClose(ConnectionInterface $conn) {
        $this->clients->detach($conn);
        
        // Remove user from users array
        foreach ($this->users as $user_id => $connections) {
            if (($key = array_search($conn, $connections)) !== false) {
                unset($this->users[$user_id][$key]);
                if (empty($this->users[$user_id])) {
                    unset($this->users[$user_id]);
                }
            }
        }
        
        echo "Connection {$conn->resourceId} has disconnected\n";
    }

    public function onError(ConnectionInterface $conn, \Exception $e) {
        echo "An error has occurred: {$e->getMessage()}\n";
        $conn->close();
    }

    protected function handleAuth(ConnectionInterface $conn, $data) {
        $user_id = $data['user_id'] ?? 0;
        
        if ($user_id) {
            if (!isset($this->users[$user_id])) {
                $this->users[$user_id] = [];
            }
            $this->users[$user_id][] = $conn;
            $conn->user_id = $user_id;
            
            echo "User $user_id authenticated\n";
        }
    }

    protected function handleMessage(ConnectionInterface $from, $data) {
        if (!isset($from->user_id)) {
            return;
        }
        
        $conversation_id = $data['conversation_id'] ?? 0;
        $message = $data['message'] ?? '';
        
        // Get conversation members
        global $conn;
        $query = "SELECT user_id FROM conversation_members WHERE conversation_id = $conversation_id";
        $result = mysqli_query($conn, $query);
        
        $recipients = [];
        while ($row = mysqli_fetch_assoc($result)) {
            if ($row['user_id'] != $from->user_id) {
                $recipients[] = $row['user_id'];
            }
        }
        
        // Send to all recipients
        // $data['message'] contains the actual message object
        $message_data = $data['message'] ?? $data;
        
        foreach ($recipients as $user_id) {
            if (isset($this->users[$user_id])) {
                foreach ($this->users[$user_id] as $client) {
                    $client->send(json_encode([
                        'type' => 'new_message',
                        'conversation_id' => $conversation_id,
                        'message' => $message_data
                    ]));
                }
            }
        }
        
        // Update message status to 'delivered' for online users
        // Note: This will be handled when the message is actually saved in the database
        // The delivered status will be updated when recipient receives the message
    }

    protected function handleTyping(ConnectionInterface $from, $data) {
        if (!isset($from->user_id)) {
            return;
        }
        
        $conversation_id = $data['conversation_id'] ?? 0;
        $is_typing = $data['is_typing'] ?? false;
        
        // Get conversation members
        global $conn;
        $query = "SELECT user_id FROM conversation_members WHERE conversation_id = $conversation_id AND user_id != {$from->user_id}";
        $result = mysqli_query($conn, $query);
        
        while ($row = mysqli_fetch_assoc($result)) {
            $user_id = $row['user_id'];
            if (isset($this->users[$user_id])) {
                foreach ($this->users[$user_id] as $client) {
                    $client->send(json_encode([
                        'type' => 'typing',
                        'conversation_id' => $conversation_id,
                        'user_id' => $from->user_id,
                        'is_typing' => $is_typing
                    ]));
                }
            }
        }
    }

    protected function handleRead(ConnectionInterface $from, $data) {
        if (!isset($from->user_id)) {
            return;
        }
        
        $message_id = $data['message_id'] ?? 0;
        $conversation_id = $data['conversation_id'] ?? 0;
        
        // Update message status in database
        global $conn;
        $query = "UPDATE message_status SET status = 'read', updated_at = NOW() 
                 WHERE message_id = $message_id AND user_id = {$from->user_id}";
        mysqli_query($conn, $query);
        
        // Notify sender
        $msg_query = "SELECT sender_id FROM messages WHERE id = $message_id";
        $msg_result = mysqli_query($conn, $msg_query);
        if ($msg_row = mysqli_fetch_assoc($msg_result)) {
            $sender_id = $msg_row['sender_id'];
            if (isset($this->users[$sender_id])) {
                foreach ($this->users[$sender_id] as $client) {
                    $client->send(json_encode([
                        'type' => 'read_receipt',
                        'message_id' => $message_id,
                        'conversation_id' => $conversation_id,
                        'user_id' => $from->user_id
                    ]));
                }
            }
        }
    }
}

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new Chat()
        )
    ),
    WS_PORT,
    WS_HOST
);

echo "WebSocket server running on " . WS_HOST . ":" . WS_PORT . "\n";
$server->run();
?>
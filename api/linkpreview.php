<?php
require_once __DIR__ . '/../includes/db.php';

$user = getCurrentUser($conn);
if (!$user) {
    sendJSON(['error' => 'Unauthorized'], 401);
}

$url = urldecode($_GET['url'] ?? '');

if (empty($url)) {
    sendJSON(['error' => 'URL required'], 400);
}

// Ensure URL has protocol
if (!preg_match('/^https?:\/\//', $url)) {
    $url = 'https://' . $url;
}

// Validate URL
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    sendJSON(['error' => 'Invalid URL'], 400);
}

// Fetch URL content
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);

$html = @curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$html) {
    sendJSON(['error' => 'Failed to fetch URL'], 500);
}

// Parse HTML for Open Graph and meta tags
$preview = [
    'title' => '',
    'description' => '',
    'image' => '',
    'url' => $url,
    'site_name' => ''
];

// Extract title
if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $html, $matches)) {
    $preview['title'] = trim($matches[1]);
}

// Extract Open Graph tags
if (preg_match('/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $matches)) {
    $preview['title'] = trim($matches[1]);
}

if (preg_match('/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $matches)) {
    $preview['description'] = trim($matches[1]);
}

if (preg_match('/<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $matches)) {
    $preview['image'] = trim($matches[1]);
}

if (preg_match('/<meta[^>]*property=["\']og:site_name["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $matches)) {
    $preview['site_name'] = trim($matches[1]);
}

// Fallback to meta description if no OG description
if (empty($preview['description'])) {
    if (preg_match('/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $matches)) {
        $preview['description'] = trim($matches[1]);
    }
}

// Fallback to meta image if no OG image
if (empty($preview['image'])) {
    if (preg_match('/<meta[^>]*property=["\']og:image:secure_url["\'][^>]*content=["\']([^"\']+)["\']/i', $html, $matches)) {
        $preview['image'] = trim($matches[1]);
    }
}

// Make image URL absolute if relative
if (!empty($preview['image']) && !preg_match('/^https?:\/\//', $preview['image'])) {
    $urlParts = parse_url($url);
    $baseUrl = $urlParts['scheme'] . '://' . $urlParts['host'];
    if (isset($urlParts['port'])) {
        $baseUrl .= ':' . $urlParts['port'];
    }
    if (strpos($preview['image'], '/') === 0) {
        $preview['image'] = $baseUrl . $preview['image'];
    } else {
        $path = isset($urlParts['path']) ? dirname($urlParts['path']) : '';
        $preview['image'] = $baseUrl . $path . '/' . $preview['image'];
    }
}

// Extract domain name for site_name if not set
if (empty($preview['site_name'])) {
    $urlParts = parse_url($url);
    $preview['site_name'] = $urlParts['host'] ?? '';
}

// Clean up description
$preview['description'] = html_entity_decode($preview['description'], ENT_QUOTES, 'UTF-8');
$preview['description'] = strip_tags($preview['description']);
$preview['description'] = preg_replace('/\s+/', ' ', $preview['description']);
$preview['description'] = trim($preview['description']);

// Limit description length
if (strlen($preview['description']) > 200) {
    $preview['description'] = substr($preview['description'], 0, 197) . '...';
}

sendJSON(['success' => true, 'preview' => $preview]);
?>

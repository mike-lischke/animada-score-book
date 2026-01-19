<?php
/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

require __DIR__ . '/db.php';

$pdo = getPdo();

// Instrument ID e.g. as query parameter ?instrumentId=123
$instrumentId = isset($_GET['instrumentId']) ? (int)$_GET['instrumentId'] : 0;
if ($instrumentId <= 0) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid instrumentId']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'No file uploaded or upload error']);
    exit;
}

$uploadDir = __DIR__ . '/../public/uploads/instruments/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0775, true);
}

$originalName = $_FILES['file']['name'];
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$allowed = ['jpg', 'jpeg', 'png', 'webp'];

if (!in_array($extension, $allowed, true)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid file type']);
    exit;
}

$mimeType = $_FILES['file']['type'];
$fileSize = (int)$_FILES['file']['size'];

// Unique file name.
$basename = bin2hex(random_bytes(16));
$targetName = $basename . '.' . $extension;
$targetPath = $uploadDir . $targetName;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Failed to move uploaded file']);
    exit;
}

// Optional: read image dimensions (GD or Imagick)
[$width, $height] = @getimagesize($targetPath) ?: [null, null];

// Public path to access the image.
$publicPath = '/uploads/instruments/' . $targetName;

$sql = 'INSERT INTO instrument_images
  (instrument_id, file_path, mime_type, width, height, file_size)
  VALUES (:instrument_id, :file_path, :mime_type, :width, :height, :file_size)';

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':instrument_id' => $instrumentId,
    ':file_path'     => $publicPath,
    ':mime_type'     => $mimeType,
    ':width'         => $width,
    ':height'        => $height,
    ':file_size'     => $fileSize,
]);

$imageId = (int)$pdo->lastInsertId();

header('Content-Type: application/json');
echo json_encode([
    'id'            => $imageId,
    'instrument_id' => $instrumentId,
    'file_path'     => $publicPath,
    'mime_type'     => $mimeType,
    'width'         => $width,
    'height'        => $height,
    'file_size'     => $fileSize,
]);

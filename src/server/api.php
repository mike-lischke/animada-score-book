<?php

/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/php-error.log');

require __DIR__ . '/db.php';

$rootParentId = -1; // The id we use for the (invisble) root folder.

header('Content-Type: application/json; charset=utf-8');

// CORS, might need adjustment based on deployment.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Helper functions.
function send_json($data, int $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function get_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        send_json(['error' => 'Invalid JSON body'], 400);
    }
    return $data;
}

// Determine action.
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? null;

if ($action === null) {
    send_json(['error' => 'Missing action'], 400);
}

$pdo = null; // global

// Dispatcher
switch ($action) {
    case 'listScoreFolderContent':
        listScoreFolderContent();
        break;
    case 'addScoreFolder':
        addScoreFolder();
        break;
    case 'addScore':
        addScore();
        break;
    case 'renameScore':
        renameScore();
        break;
    case 'updateScore':
        updateScore();
        break;
    case 'delete':
        handle_delete();
        break;
    case 'move':
        handle_move();
        break;
    case 'listSoundLib':
        listSoundlib();
        break;
    default:
        send_json(['error' => 'Unknown action'], 400);
}

// ------------------- Handlers -------------------

function listScoreFolderContent(): void {
    global $rootParentId;
    $pdo = getPdo();

    $body = get_json_body();
    $parentId = isset($body['parentid']) ? (int)$body['parentid'] : $rootParentId;
    $dbParent = ($parentId === $rootParentId) ? null : $parentId;

    // Load folders.
    $stmt = $pdo->prepare('
        SELECT
            f.*,
            (
                EXISTS(
                    SELECT 1 FROM folders cf
                    WHERE cf.parentid = f.id
                    LIMIT 1
                )
                OR EXISTS(
                    SELECT 1 FROM scores cs
                    WHERE cs.folderid = f.id
                    LIMIT 1
                )
            ) AS hasChildren
        FROM folders f
        WHERE
            (f.parentid IS NULL AND :parentId1 IS NULL)
            OR f.parentid = :parentId2
        ORDER BY f.name
    ');
    $stmt->execute([':parentId1' => $dbParent, ':parentId2' => $dbParent]);
    $folders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($folders as &$f) {
        if ($f['parentid'] === null) {
            $f['parentid'] = $rootParentId;
        }
        $f['hasChildren'] = (bool)$f['hasChildren'];
    }
    unset($f);

    // Load scores in this folder.
    $stmt = $pdo->prepare('SELECT * FROM scores WHERE folderid = :parentId ORDER BY name');
    $stmt->execute([':parentId' => $dbParent]);
    $scores = $stmt->fetchAll(PDO::FETCH_ASSOC);

    send_json([
        'folders'  => $folders,
        'scores' => $scores,
    ]);
}

function addScoreFolder(): void {
    $pdo = getPdo();

    global $rootParentId;
    $body = get_json_body();

    $name     = trim($body['name'] ?? '');
    $dbParent = array_key_exists('parentid', $body) ? (int)$body['parentid'] : null;
    if ($name === '') {
        send_json(['error' => 'Name required'], 400);
    }

    $stmt = $pdo->prepare('INSERT INTO folders (parentid, name) VALUES (:parentId, :name)');
    $stmt->execute([
        ':parentId' => $dbParent,
        ':name'     => $name,
    ]);
    $id = (int)$pdo->lastInsertId();

    send_json(['success' => true, 'id' => $id]);
}

function addScore(): void {
    $pdo = getPdo();

    global $rootParentId;
    $body = get_json_body();

    $type = $body['type'] ?? null;
    if ($type === 'folder') {
        $parentId = isset($body['parentid']) ? (int)$body['parentid'] : $rootParentId;
        $name     = trim($body['name'] ?? '');
        if ($name === '') {
            send_json(['error' => 'Name required'], 400);
        }

        $stmt = $pdo->prepare('INSERT INTO folders (parentid, name) VALUES (:parentId, :name)');
        $stmt->execute([
            ':parentId' => $parentId,
            ':name'     => $name,
        ]);
        $id = (int)$pdo->lastInsertId();

        send_json(['success' => true, 'id' => $id]);

    } elseif ($type === 'score') {
        if (!isset($body['folderId'])) {
            send_json(['error' => 'folderId required'], 400);
        }
        $folderId = (int)$body['folderId'];
        $name     = trim($body['name'] ?? '');
        $content  = $body['content'] ?? '';

        if ($name === '') {
            send_json(['error' => 'Name required'], 400);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO scores (folderid, name, content) VALUES (:folderId, :name, :content)'
        );
        $stmt->execute([
            ':folderId' => $folderId,
            ':name'     => $name,
            ':content'  => $content,
        ]);
        $id = (int)$pdo->lastInsertId();

        send_json(['success' => true, 'id' => $id]);

    } else {
        send_json(['error' => 'Invalid type (folder|score)'], 400);
    }
}

function renameScore(): void {
    $pdo = getPdo();

    $body = get_json_body();
    $type = $body['type'] ?? null;
    $id   = isset($body['id']) ? (int)$body['id'] : null;
    $name = trim($body['name'] ?? '');

    if (!$type || !$id || $name === '') {
        send_json(['error' => 'type, id and name required'], 400);
    }

    if ($type === 'folder') {
        $stmt = $pdo->prepare('UPDATE folders SET name = :name WHERE id = :id');
    } elseif ($type === 'score') {
        $stmt = $pdo->prepare('UPDATE scores SET name = :name WHERE id = :id');
    } else {
        send_json(['error' => 'Invalid type (folder|score)'], 400);
    }

    $stmt->execute([
        ':name' => $name,
        ':id'   => $id,
    ]);

    send_json(['success' => true]);
}

function updateScore(): void {
    $pdo = getPdo();

    $body = get_json_body();
    $id      = isset($body['id']) ? (int)$body['id'] : null;
    $content = $body['content'] ?? null;

    if (!$id || $content === null) {
        send_json(['error' => 'id and content required'], 400);
    }

    $stmt = $pdo->prepare('UPDATE scores SET content = :content WHERE id = :id');
    $stmt->execute([
        ':content' => $content,
        ':id'      => $id,
    ]);

    send_json(['success' => true]);
}

function handle_delete(): void {
    $pdo = getPdo();

    $body = get_json_body();
    $type = $body['type'] ?? null;
    $id   = isset($body['id']) ? (int)$body['id'] : null;

    if (!$type || !$id) {
        send_json(['error' => 'type and id required'], 400);
    }

    if ($type === 'score') {
        $stmt = $pdo->prepare('DELETE FROM scores WHERE id = :id');
        $stmt->execute([':id' => $id]);
        send_json(['success' => true]);
    }

    if ($type === 'folder') {
        // Get the parent of the folder to be deleted.
        $stmt = $pdo->prepare('SELECT parentid FROM folders WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $folder = $stmt->fetch();

        if (!$folder) {
            send_json(['error' => 'Folder not found'], 404);
        }

        $parentId = (int)$folder['parentid'];

        // The root folder must not be deleted.
        if ($parentId === $rootParentId) {
            send_json(['error' => 'Cannot delete root folder'], 400);
        }

        // Move all scores of this folder into its parent.
        $stmt = $pdo->prepare(
            'UPDATE scores SET folderid = :newFolderId WHERE folderid = :oldFolderId'
        );
        $stmt->execute([
            ':newFolderId' => $parentId,
            ':oldFolderId' => $id,
        ]);

        // Also move all subfolders into its parent.
        $stmt = $pdo->prepare(
            'UPDATE folders SET parentid = :newParentId WHERE parentid = :oldParentId'
        );
        $stmt->execute([
            ':newParentId' => $parentId,
            ':oldParentId' => $id,
        ]);

        // Remove the folder itself.
        $stmt = $pdo->prepare('DELETE FROM folders WHERE id = :id');
        $stmt->execute([':id' => $id]);

        send_json(['success' => true]);
    }

    send_json(['error' => 'Invalid type (folder|score)'], 400);
}

function handle_move(): void {
    $pdo = getPdo();

    $body = get_json_body();
    $type = $body['type'] ?? null;
    $id   = isset($body['id']) ? (int)$body['id'] : null;

    if ($type === 'folder') {
        $newParentId = isset($body['newParentId']) ? (int)$body['newParentId'] : null;
        if (!$id || $newParentId === null) {
            send_json(['error' => 'id and newParentId required'], 400);
        }

        $stmt = $pdo->prepare('UPDATE folders SET parentid = :parentId WHERE id = :id');
        $stmt->execute([
            ':parentId' => $newParentId,
            ':id'       => $id,
        ]);

        send_json(['success' => true]);

    } elseif ($type === 'score') {
        $newFolderId = isset($body['newFolderId']) ? (int)$body['newFolderId'] : null;
        if (!$id || $newFolderId === null) {
            send_json(['error' => 'id and newFolderId required'], 400);
        }

        $stmt = $pdo->prepare('UPDATE scores SET folderid = :folderId WHERE id = :id');
        $stmt->execute([
            ':folderId' => $newFolderId,
            ':id'       => $id,
        ]);

        send_json(['success' => true]);
    }

    send_json(['error' => 'Invalid type (folder|score)'], 400);
}

function listSoundlib(): void {
    $baseDir = __DIR__ . '/soundLib';

    $realPath = realpath($baseDir);
    if ($realPath === false) {
        send_json(['error' => 'Base directory not found'], 500);
    }

    $result = scan_dir_tree($realPath, $baseDir);

    send_json($result);
}

function scan_dir_tree(string $dir, string $root): array {
    $items = [];

    $entries = scandir($dir);
    if ($entries === false) {
        return $items;
    }

    foreach ($entries as $entry) {
        if ($entry === '' || $entry[0] === '.') {
            continue;
        }

        $fullPath  = $dir . DIRECTORY_SEPARATOR . $entry;
        $relative  = ltrim(str_replace($root, '', $fullPath), DIRECTORY_SEPARATOR);
        $isDir     = is_dir($fullPath);

        $node = [
            'name' => $entry,
            'path' => $relative,
            'isDir' => $isDir,
        ];

        if ($isDir) {
            $node['children'] = scan_dir_tree($fullPath, $root);
        }

        $items[] = $node;
    }

    // Sort by name.
    usort($items, fn($a, $b) => strcmp($a['name'], $b['name']));

    return $items;
}

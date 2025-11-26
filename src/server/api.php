<?php

// Configuration.
$dbHost = 'localhost';
$dbName = '<dbname>';
$dbUser = '<username>';
$dbPass = '<password>';

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

// Database connection.
try {
    $dsn = "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    send_json(['error' => 'Database connection failed'], 500);
}

// Determine action.
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? null;

if ($action === null) {
    send_json(['error' => 'Missing action'], 400);
}

// Dispatcher
switch ($action) {
    case 'list':
        handle_list($pdo);
        break;
    case 'create':
        handle_create($pdo);
        break;
    case 'rename':
        handle_rename($pdo);
        break;
    case 'updateSnippet':
        handle_update_snippet($pdo);
        break;
    case 'delete':
        handle_delete($pdo, $rootParentId);
        break;
    case 'move':
        handle_move($pdo);
        break;
    default:
        send_json(['error' => 'Unknown action'], 400);
}

// ------------------- Handlers -------------------

function handle_list(PDO $pdo): void {
    $parentId = isset($_GET['parentId']) ? (int)$_GET['parentId'] : -1;

    // Load folders.
    $stmt = $pdo->prepare('SELECT id, name FROM folders WHERE parentid = :parentId ORDER BY name');
    $stmt->execute([':parentId' => $parentId]);
    $folders = $stmt->fetchAll();

    // Load snippets.
    $stmt = $pdo->prepare('SELECT id, name FROM snippets WHERE folderid = :parentId ORDER BY name');
    $stmt->execute([':parentId' => $parentId]);
    $snippets = $stmt->fetchAll();

    send_json([
        'folders'  => $folders,
        'snippets' => $snippets,
    ]);
}

function handle_create(PDO $pdo): void {
    global $rootParentId;
    $body = get_json_body();

    $type = $body['type'] ?? null;
    if ($type === 'folder') {
        $parentId = isset($body['parentId']) ? (int)$body['parentId'] : $rootParentId;
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

    } elseif ($type === 'snippet') {
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
            'INSERT INTO snippets (folderid, name, content) VALUES (:folderId, :name, :content)'
        );
        $stmt->execute([
            ':folderId' => $folderId,
            ':name'     => $name,
            ':content'  => $content,
        ]);
        $id = (int)$pdo->lastInsertId();

        send_json(['success' => true, 'id' => $id]);

    } else {
        send_json(['error' => 'Invalid type (folder|snippet)'], 400);
    }
}

function handle_rename(PDO $pdo): void {
    $body = get_json_body();
    $type = $body['type'] ?? null;
    $id   = isset($body['id']) ? (int)$body['id'] : null;
    $name = trim($body['name'] ?? '');

    if (!$type || !$id || $name === '') {
        send_json(['error' => 'type, id and name required'], 400);
    }

    if ($type === 'folder') {
        $stmt = $pdo->prepare('UPDATE folders SET name = :name WHERE id = :id');
    } elseif ($type === 'snippet') {
        $stmt = $pdo->prepare('UPDATE snippets SET name = :name WHERE id = :id');
    } else {
        send_json(['error' => 'Invalid type (folder|snippet)'], 400);
    }

    $stmt->execute([
        ':name' => $name,
        ':id'   => $id,
    ]);

    send_json(['success' => true]);
}

function handle_update_snippet(PDO $pdo): void {
    $body = get_json_body();
    $id      = isset($body['id']) ? (int)$body['id'] : null;
    $content = $body['content'] ?? null;

    if (!$id || $content === null) {
        send_json(['error' => 'id and content required'], 400);
    }

    $stmt = $pdo->prepare('UPDATE snippets SET content = :content WHERE id = :id');
    $stmt->execute([
        ':content' => $content,
        ':id'      => $id,
    ]);

    send_json(['success' => true]);
}

function handle_delete(PDO $pdo, int $rootParentId): void {
    $body = get_json_body();
    $type = $body['type'] ?? null;
    $id   = isset($body['id']) ? (int)$body['id'] : null;

    if (!$type || !$id) {
        send_json(['error' => 'type and id required'], 400);
    }

    if ($type === 'snippet') {
        $stmt = $pdo->prepare('DELETE FROM snippets WHERE id = :id');
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

        // Move all snippets of this folder into its parent.
        $stmt = $pdo->prepare(
            'UPDATE snippets SET folderid = :newFolderId WHERE folderid = :oldFolderId'
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

    send_json(['error' => 'Invalid type (folder|snippet)'], 400);
}

function handle_move(PDO $pdo): void {
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

    } elseif ($type === 'snippet') {
        $newFolderId = isset($body['newFolderId']) ? (int)$body['newFolderId'] : null;
        if (!$id || $newFolderId === null) {
            send_json(['error' => 'id and newFolderId required'], 400);
        }

        $stmt = $pdo->prepare('UPDATE snippets SET folderid = :folderId WHERE id = :id');
        $stmt->execute([
            ':folderId' => $newFolderId,
            ':id'       => $id,
        ]);

        send_json(['success' => true]);
    }

    send_json(['error' => 'Invalid type (folder|snippet)'], 400);
}

// - `GET api.php?action=list&parentId=-1`
// - `POST api.php?action=create` (JSON: `type: folder|snippet`)
// - `POST api.php?action=rename`
// - `POST api.php?action=updateSnippet`
// - `POST api.php?action=delete`
// - `POST api.php?action=move`

// `fetch('/api.php?action=…', { method, body: JSON.stringify(...) })`

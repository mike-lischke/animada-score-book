<?php
/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

declare(strict_types=1);

$dbHost = 'localhost';
$dbName = 'your db';
$dbUser = 'your user name';
$dbPass = 'your password';

function getPdo(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $GLOBALS['dbHost'], $GLOBALS['dbName']);
        $pdo = new PDO($dsn, $GLOBALS['dbUser'], $GLOBALS['dbPass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }

    return $pdo;
}

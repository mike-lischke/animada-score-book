[![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/mike-lischke/animada-score-book/nodejs.yml?branch=main&style=for-the-badge&color=green&logo=github)](https://github.com/mike-lischke/animada-score-book/actions/workflows/nodejs.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge&color=green)](./License.txt)

<p align="center">
<img src="/public/logo.svg" title="Animada Score Book" alt="Animada Score Book" style="height: 200px" /><br/>
</p>

<hr />

# Animada Score Book

Animada Score Book is your ensemble's digital home for rhythm — a rich, browser-based score management and playback platform built from the ground up for Samba groups. Browse your entire score library in a beautiful tree view, listen to arrangements come alive with synchronized multi-track audio playback driven by a precision metronome, and export your work as MP3 files or crisp print-ready sheet music. A full sound library manager with waveform previews lets you organize and assign instrument samples, while the built-in backend with user accounts, groups, and fine-grained permissions keeps everything secure and collaborative. Whether you're rehearsing, arranging, or archiving, Animada Score Book puts the pulse of your bateria right in the browser.

## Features

- **Desktop & Mobile.** Full support for desktops, tablets, and phones with automatic and manual zoom to make the
  most of your screen real estate.
- **Dual Display Modes.** Switch on the fly between a grid-based view — perfect for learning — and a true notation
  view for seasoned players. Toggle anytime, even during playback.
- **Samba-First Notation.** Purpose-built for percussion and Samba music with a simplified notation system.
  Special note heads and markings distinguish playing techniques at a glance.
- **Flexible Playback.** Play the entire song or a selected bar range, once or on loop. Adjust tempo and overall
  volume on the fly.
- **Metronome & Count-In.** Toggle the built-in metronome on and off, with an optional count-in to lead you in.
- **Multi-Track.** View and play back multiple tracks simultaneously — one instrument per track.
- **Per-Track Mixer.** Fine-tune each track's volume independently with a continuous slider mixer.
- **Minimap.** A bird's-eye overview for navigating long scores quickly.
- **Horizontal Bar Layout.** Bars flow horizontally with smooth automatic scrolling during playback.
- **MP3 Export.** Export the full arrangement as an MP3 file, respecting all playback settings — tempo, volume,
  count-in, and more (loop excluded).
- **Print.** Print the loaded score in either grid or notation view — crisp, rehearsal-ready sheets.
- **Customizable Theme.** Choose from a range of color schemes to suit your taste and lighting conditions.
- **Score Management.** A database-backed score library with fine-grained access control: private, group-shared,
  or world-readable. Full user and group administration included.
- **BananaDrum Import.** Import scores from BananaDrum URLs to bring your existing repertoire on board.

> [!IMPORTANT]
> **Editing is not yet implemented.** The current version focuses on score library browsing, arrangement playback,
> printing, and sound management. Full score and arrangement editing capabilities are planned for a future release.

## Getting Started

Animada Score Book consists of two parts that work together: a **backend server** that stores your scores and manages users, and a **frontend** that runs in the browser. The setup is the same whether you install on your own laptop or on a web server — both need Node.js and a database.

### What You Need

- **[Node.js](https://nodejs.org/)** version 20 or later. This powers the backend server — it's required on every machine that runs Animada Score Book, including hosted servers. Download the LTS version from the website and run the installer.
- **A database** — **MySQL**, **MariaDB**, or **PostgreSQL**. The backend connects to it to store scores, users, and permissions. Most hosting packages include a database; if you're setting up locally, [MariaDB](https://mariadb.org/download/) is a good lightweight choice.

### Step-by-Step Setup

#### 1. Get the Code

[Download the latest release](../../releases) and unzip it, or clone the repository:

```bash
git clone https://github.com/mike-lischke/animada-score-book.git
cd animada-score-book
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure the Backend

This is the central step. Create a file named `backend-config.json` in the project folder with the following content — adjust the values to match your database:

```json
{
    "host": "127.0.0.1",
    "port": 3100,
    "database": {
        "engine": "mysql",
        "host": "127.0.0.1",
        "port": 3306,
        "database": "animada_score_book",
        "user": "root",
        "password": "your-password-here"
    },
    "soundLibPath": "public/sounds"
}
```

- **`host` / `port`** — the address and port the backend listens on. `3100` is the default; change it if that port is already in use.
- **`database.engine`** — `"mysql"`, `"mariadb"`, or `"postgres"`. For PostgreSQL, also change `"port"` to `5432`.
- **`database.host` / `port`** — where your database server is reachable. On the same machine this is `127.0.0.1`; your hosting provider will give you the address for remote databases.
- **`database.database`** — the name of the database. The server creates the database automatically if it doesn't exist yet, so all you need to provide is a name.
- **`database.user` / `password`** — the login credentials for the database.
- **`soundLibPath`** — where the server looks for instrument sound files. The default `public/sounds` points to the built-in sound library that ships with the repository. Only change this if you store your sounds elsewhere.

The backend also needs a secret key to secure user logins. Set it before starting:

```bash
# macOS / Linux:
export JWT_SECRET="pick-a-long-random-string-here"

# Windows (PowerShell):
$env:JWT_SECRET = "pick-a-long-random-string-here"
```

Pick a long, random string and keep it safe — this key is what keeps your users' accounts secure.

#### 4. Start the Backend

```bash
npm run start
```

Keep this terminal open. The server will confirm it's running — you'll see something like `Server running on http://0.0.0.0:3100`.

#### 5. Build and Serve the Frontend

```bash
npm run build
```

This creates a `dist/` folder with everything the browser needs. Serve that folder with any static web server — nginx, Apache, Caddy, or even a simple file server. The frontend automatically talks to the backend on the same domain, so point both to the same address and you're done.

> **First run:** When you open the app in your browser for the first time, a setup wizard will guide you through creating an admin account and connecting to the backend. No further manual steps needed.

## Contributing & Development

### Reporting Bugs

Found a problem? Please [open an issue](../../issues) on GitHub. Include as much detail as you can: what you were doing, what you expected to happen, and what happened instead. Screenshots and browser console logs are incredibly helpful.

### Development Setup

To work on the code itself, you need the same basics as a regular installation — Node.js 20+, a database, and the `backend-config.json` file. Once that's in place, here's what a development session looks like:

**Terminal 1 — Backend:**

```bash
npm run start-with-dummy-secret
```

which uses a simple secret just for development. Don't use that in production (on your hosting server).

**Terminal 2 — Frontend dev server** (with hot reload):

```bash
npm run dev
```

This opens the app at `http://localhost:5173` and updates automatically as you edit files.

**Useful commands while developing:**

| Command | What it does |
|---|---|
| `npm run check` | Type-checks all TypeScript source and test files |
| `npm run lint` | Runs ESLint across the codebase |
| `npm run test` | Runs the unit test suite (Vitest) |
| `npm run test:e2e` | Runs end-to-end browser tests (Playwright) |

The project is written in **TypeScript** with **Preact** for the UI, **SCSS** and **Tailwind** for styling, and **DaisyUI** for components. The backend is a plain Node.js HTTP server with MySQL/MariaDB/PostgreSQL adapters.

### VS Code ###
This project ist developed in VS Code and already has a launch configuration you can use to start a debugging session.
# Rules for All AI Agents

These rules apply to every AI model or automation working in this repository, independent of the tool. Read them before the first command.

## The machine belongs to its owner

- Work exclusively inside this repository's folder. Every file an agent reads, creates, changes or deletes lives there — temporary files, backups and scratch data included. Paths outside the repository, the system temp directory among them, need the user's explicit permission for that case; a task alone is not such a permission.
- Change nothing on this computer without explicit permission from the user. That includes environment variables of a running shell (`export`, assigning `PATH`), dotfiles such as `~/.zshrc`, global tool configuration, package installations, `sudo` and anything outside this repository.
- Reading files and printing information is always allowed. Writing files inside the repository is the normal case; everything beyond that needs a request from the user.
- Announce every step that does more than reading or editing files in the repository — builds, packages, database migrations, starting servers, network calls with side effects — and run it only when asked.
- Pass environment variables per invocation (`VAR=… command`) instead of exporting them for the session.
- Never name a variable `path` or `PATH` in zsh. Both are bound to the `PATH` array, so `for path in …` empties `PATH` for the rest of the shell session.
- Use Node.js and TypeScript for tooling: `tsx`, Vitest, Playwright and the `npm` scripts of this repository. Do not use python, perl, sed or awk for logic or file editing.
- Read and change files with the editor tools (`view`, `edit`, `create`). Shell commands run the project's tooling; they do not write or rewrite source files with redirection or heredocs.

## Project conventions

The coding conventions of this repository live in [.github/copilot-instructions.md](.github/copilot-instructions.md). They bind every agent, not only GitHub Copilot.

## Commits

- Commit only when the user asks for it. A finished task or a green test run is no reason to commit.
- Show the commit message and wait for approval before committing, even when the user did not ask to review it.

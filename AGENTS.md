# Rules for All AI Agents

These rules apply to every AI model or automation working in this repository, independent of the tool. Read them before the first command.

## The machine belongs to its owner

- Change nothing on this computer without explicit permission from the user. That includes environment variables of a running shell (`export`, assigning `PATH`), dotfiles such as `~/.zshrc`, global tool configuration, package installations, `sudo` and anything outside this repository.
- Reading files and printing information is always allowed. Writing files inside the repository is the normal case; everything beyond that needs a request from the user.
- Announce every step that does more than reading or editing files in the repository — builds, packages, database migrations, starting servers, network calls with side effects — and run it only when asked.
- Pass environment variables per invocation (`VAR=… command`) instead of exporting them for the session.
- Never name a variable `path` or `PATH` in zsh. Both are bound to the `PATH` array, so `for path in …` empties `PATH` for the rest of the shell session.
- Use Node.js and TypeScript for tooling: `tsx`, Vitest, Playwright and the `npm` scripts of this repository. Do not use python, perl, sed or awk for logic or file editing.

## Project conventions

The coding conventions of this repository live in [.github/copilot-instructions.md](.github/copilot-instructions.md). They bind every agent, not only GitHub Copilot.

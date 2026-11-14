# Security policy

## Supported version

The `main` branch is the only supported version.

## Report a vulnerability

Use GitHub private vulnerability reporting. Open the Security tab of this repository and select Report a vulnerability. Do not open a public issue for a vulnerability.

## Threat model

The server listens on `127.0.0.1` and runs on your own computer. It starts your installed Claude Code CLI for each interviewer turn and each grade.

The app defends against these threats:

- Other websites. The server accepts only `127.0.0.1` as Host and Origin, and it sends `Cross-Origin-Opener-Policy: same-origin`. This stops a DNS rebinding attack. The server also checks Origin and Sec-Fetch-Site on writes, and the launch key on every API call, so a page in another tab cannot send a forged request (CSRF).
- Other users on the same computer. The interview files are readable only by your user (0700 folders, 0600 files). Every `/api` call needs the launch key, and the server makes a new key at each start. A local user could try to take a known port, so the server starts on a random free port. The page locks itself when the server stops, because it holds a live stream, and after a network error. The Mac app's web view keeps its data in memory only, so nothing survives a run.
- Injected libraries. Another program could load its own code into the Mac app, which holds the microphone permission, with `DYLD_*` variables. The app is signed with the hardened runtime, and it gives the server only an allowlist of environment variables.
- Prompt injection in your answers and notes. The calls to Claude have no tools, so injected text cannot run a command or read a file. The server refuses a call if `claude` starts with tools or MCP servers. It neutralizes @-mentions in prompts, so they cannot pull in a file.
- CLAUDE.md files. Claude runs in a private folder under `~/.system-design-coach`, with CLAUDE.md loading turned off, so no CLAUDE.md file can change the interview.

These threats are out of scope:

- Malware that runs as your own user. It can read your files and your Claude login without this app.
- The security of Claude Code and of Anthropic's service. Report those problems to Anthropic.

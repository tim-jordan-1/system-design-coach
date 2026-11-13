# Security policy

## Supported version

The `main` branch is the only supported version.

## Report a vulnerability

Use GitHub private vulnerability reporting. Open the Security tab of this repository and select Report a vulnerability. Do not open a public issue for a vulnerability.

## Threat model

The server listens on `127.0.0.1` and runs on your own computer. It starts your installed Claude Code CLI for each interviewer turn and each grade.

The app defends against these threats:

- Other websites. The server checks the Host header, so a DNS rebinding attack cannot reach it. It checks Origin, Sec-Fetch-Site and the launch key on writes, so a page in another tab cannot send a forged request (CSRF).
- Other users on the same computer. The interview files are readable only by your user (0700 folders, 0600 files). Every `/api` call needs the launch key, and the server makes a new key at each start.
- Prompt injection in your answers and notes. The calls to Claude have no tools, so injected text cannot run a command or read a file.

These threats are out of scope:

- Malware that runs as your own user. It can read your files and your Claude login without this app.
- The security of Claude Code and of Anthropic's service. Report those problems to Anthropic.

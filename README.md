# repane-mcp-file-server

# Workspace MCP

A sandboxed **MCP file-server connector** for AI agents: file operations, git-lite tools, and a handoff protocol (`PROJECT_STATE`, `PLAN_LOG`, `CHECKPOINTS`, `DECISIONS`) so multiple agent sessions can share memory on one project. Served over HTTPS through a tunnel and kept alive by a process manager.

> Midterms Pt 1: Build Your Own (CS 3A / CS 3B Elective, Week 06, Model Context Protocol)

## Project structure

```
workspace-mcp/
├── src/
│   ├── index.ts              # Express app, /mcp endpoint, auth check
│   ├── server.ts             # createServer(): registers all tools
│   ├── sandbox.ts            # resolveSafe(): path-escape protection
│   ├── config.ts             # env loading (PORT, WORKSPACE_ROOT, AUTH_TOKEN)
│   └── tools/
│       ├── files.ts          # list_files, read_file, write_file, str_replace, delete_file
│       ├── git.ts            # git_status, git_diff, git_commit, git_log
│       ├── search.ts         # search_files
│       └── handoff.ts        # handoff protocol helpers
├── test/                     # sandbox + tool tests
├── workspace/                # SANDBOX ROOT: the only folder agents can touch
│   ├── PROJECT_STATE.md
│   ├── PLAN_LOG.md
│   ├── CHECKPOINTS.md
│   └── DECISIONS.md
├── docs/
│   ├── report.md             # stack, tool design choices, security tradeoffs
│   ├── transcript.md         # tool-call transcript of the demo task
│   └── screenshots/
├── ecosystem.config.cjs      # pm2 config
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Request flow

```
MCP Client → HTTPS tunnel (ngrok) → Express /mcp → McpServer → Tool handler → resolveSafe() → Filesystem / git
```

Every tool that takes a path goes through `resolveSafe()`. No tool touches the filesystem directly.

## Stack

| Layer | Choice |
|---|---|
| Runtime and SDK | Node.js with the official TypeScript MCP SDK |
| Transport | Streamable HTTP |
| Validation | `zod` schemas on every tool input |
| Exposure | ngrok with a static domain |
| Process manager | pm2 |
| Version control | git on the host |
| Testing | MCP Inspector, then a real client |

## Requirements

- Node.js 18+
- npm 9+
- git (on PATH)
- pm2 (`npm install -g pm2`)
- An [ngrok](https://ngrok.com) account with a static domain (free tier is fine)
- An MCP client that supports Streamable HTTP (e.g. Claude with custom connectors)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/workspace-mcp.git
cd workspace-mcp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
PORT=3000
WORKSPACE_ROOT=./workspace
AUTH_TOKEN=change_me          # optional: bearer token auth (stretch)
```

### 4. Initialize the workspace git repo

The git tools operate on the workspace folder, which is its own repo, separate from this project repo.

```bash
cd workspace
git init
git config user.name "Your Name"
git config user.email "you@example.com"
cd ..
```

If the four handoff files (`PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, `DECISIONS.md`) are missing from `workspace/`, create them empty:

```bash
touch workspace/PROJECT_STATE.md workspace/PLAN_LOG.md workspace/CHECKPOINTS.md workspace/DECISIONS.md
```

### 5. Run the tests

```bash
npm test
```

The sandbox tests confirm that `../`, absolute paths, and symlinks pointing outside the workspace are all rejected.

### 6. Run in development mode

```bash
npm run dev
```

MCP endpoint: `http://localhost:3000/mcp`

### 7. Test with MCP Inspector

In a new terminal:

```bash
npx @modelcontextprotocol/inspector
```

1. Set **Transport Type** to `Streamable HTTP`
2. Set **URL** to `http://localhost:3000/mcp`
3. Click **Connect**, then open the **Tools** tab and run `list_files`

## Deployment (HTTPS tunnel + process manager)

### 1. Build and start with pm2

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # run the command it prints so the app survives reboots
```

Check it:

```bash
pm2 status
pm2 logs workspace-mcp
```

### 2. Expose it with ngrok

```bash
ngrok config add-authtoken <YOUR_NGROK_TOKEN>
ngrok http --url=<your-static-domain>.ngrok-free.app 3000
```

Your public MCP URL is:

```
https://<your-static-domain>.ngrok-free.app/mcp
```

To keep the tunnel alive as well:

```bash
pm2 start "ngrok http --url=<your-static-domain>.ngrok-free.app 3000" --name tunnel
pm2 save
```

### 3. Connect a real MCP client

**Claude (claude.ai or Desktop):** Settings → Connectors → Add custom connector → paste the HTTPS `/mcp` URL.

If `AUTH_TOKEN` is set, configure your client to send `Authorization: Bearer <AUTH_TOKEN>`.

## Tools

| Tool | Description |
|---|---|
| `list_files` | List files and folders in a directory |
| `read_file` | Read a text file (size capped) |
| `write_file` | Create or overwrite a file |
| `str_replace` | Replace one exact, unique string in a file |
| `delete_file` | Delete a file (handoff files are protected) |
| `search_files` | Search file contents in the workspace |
| `git_status` | Show working tree status |
| `git_diff` | Show changes, optionally for one path |
| `git_log` | Show recent commits |
| `git_commit` | Stage everything and commit with a message |

## Sandbox and security

- All paths are resolved against `WORKSPACE_ROOT`; anything that escapes is rejected.
- Symlinks are resolved with `realpath` and checked against the real root.
- Writes are size-limited and blocked from `.git/`.
- `str_replace` fails unless the match is unique.
- Git commands run through `execFile` with an argument array, never a shell string.
- Handoff files cannot be deleted.

## Handoff protocol

These files in `workspace/` let a new agent session pick up where the last one stopped.

| File | Purpose |
|---|---|
| `PROJECT_STATE.md` | Current snapshot: goal, done, in progress, next. Overwritten each session. |
| `PLAN_LOG.md` | Append-only log of plans and what actually happened. |
| `CHECKPOINTS.md` | Append-only list of verified milestones with commit hashes. |
| `DECISIONS.md` | Append-only list of decisions and their reasoning. |

**Agent convention:** at the start of every session, read `PROJECT_STATE.md` first. At the end, update it and append to `PLAN_LOG.md`.

## Demo task

The multi-step task used to prove the setup runs across 2 or more agent sessions. See [`docs/transcript.md`](docs/transcript.md) for the full tool-call transcript.

To reproduce it:

1. Start a new chat with the connector enabled and ask the agent to read `PROJECT_STATE.md`, then start the task.
2. End that session after the agent updates the handoff files and commits.
3. Start a brand-new chat and ask it to continue. It should resume using only the handoff files.
4. Run `git_log` to see commits from both sessions.

## Documentation

- [`docs/report.md`](docs/report.md): stack, tool design choices, and security tradeoffs
- [`docs/transcript.md`](docs/transcript.md): tool-call transcript of the demo task
- [`docs/screenshots/`](docs/screenshots/): Inspector, pm2, and client connection screenshots

## Troubleshooting

| Problem | Fix |
|---|---|
| Inspector can't connect | Use transport **Streamable HTTP** and include `/mcp` in the URL |
| Client can't connect over ngrok | Confirm the tunnel is up, the URL is `https://`, and `pm2 status` shows the app online |
| Tool changes don't appear | `npm run build`, `pm2 restart workspace-mcp`, then reconnect the client |
| pm2 app keeps restarting | `pm2 logs workspace-mcp`; usually a missing `dist/` build or wrong `WORKSPACE_ROOT` |
| `git_commit` fails | Run `git init` inside `workspace/` and set `user.name` / `user.email` |

## Notes

- Always run `npm run build` before `pm2 start` or `pm2 restart`.
- Never commit `.env`, only `.env.example`.
- The public tunnel URL gives access to the workspace folder. Keep real files out of it and set `AUTH_TOKEN` before sharing the URL.

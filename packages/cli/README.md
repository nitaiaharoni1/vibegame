# @vigame/cli

CLI for the vigame toolkit. Starts the MCP server, launches Vite, and provides inspection commands for human developers.

## Install

```bash
npm install -g @vigame/cli
```

## Usage

```bash
# Start MCP + WebSocket bridge server (required for AI tools and inspection commands)
vigame start

# Start Vite dev server
vigame dev

# Inspect a running game
vigame inspect screenshot -o screen.png
vigame inspect world
vigame entity list
vigame component get Player Transform
vigame runtime pause
```

> All commands that talk to the game require `vigame start` running in a separate terminal.

Part of the [vigame](https://github.com/nitaiaharoni1/vibegame) monorepo.

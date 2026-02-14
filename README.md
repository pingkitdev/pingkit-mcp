# @pingkit/mcp

Let your AI coding tools read your user feedback.

[![npm version](https://img.shields.io/npm/v/@pingkit/mcp)](https://www.npmjs.com/package/@pingkit/mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-brightgreen)](https://modelcontextprotocol.io)

PingKit MCP is a [Model Context Protocol](https://modelcontextprotocol.io) server that connects your AI coding assistant to your [PingKit](https://pingkit.dev) user feedback. Ask your AI what users are complaining about, triage issues, and mark feedback resolved — without leaving your editor.

Works with Claude Code, Cursor, Codex, Windsurf, and any MCP-compatible client.

<!-- TODO: Add demo GIF/screenshot of MCP in action -->

## Examples

```
You:  Show me unresolved feedback about the login screen

  Found 3 unresolved items matching "login":

  fb_8a2k [new] — "Login button doesn't respond on iPhone SE"
                   v2.3.1 · iPhone SE · iOS 17.4

  fb_7x9p [new] — "Face ID login fails after updating to v2.3.0"
                   v2.3.0 · iPhone 15 Pro · iOS 18.1

  fb_6m4n [acknowledged] — "Keep getting logged out every few hours"
                            v2.2.9 · iPhone 14 · iOS 17.3
```

```
You:  Acknowledge those first two and note that we're investigating

  Acknowledged 2 items. Notes updated.
```

```
You:  What are the top complaints in v2.3.0?

  Analyzed 47 feedback items for v2.3.0:

  1. Face ID authentication failures (12 reports)
  2. Slow load times on app launch (8 reports)
  3. Dark mode contrast issues (6 reports)
  ...
```

## Quick start

### 1. Get your token

Create a personal access token at [pingkit.dev/settings](https://pingkit.dev/settings).

### 2. Add to your MCP client

Add this to your MCP configuration file:

```json
{
  "mcpServers": {
    "pingkit": {
      "command": "npx",
      "args": ["-y", "@pingkit/mcp"],
      "env": {
        "PINGKIT_TOKEN": "pt_your_token"
      }
    }
  }
}
```

| Client | Config location |
|--------|----------------|
| Claude Code | `.mcp.json` in your project root |
| Cursor | `.cursor/mcp.json` in your project root |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Codex | Pass `--mcp-config path/to/mcp.json` |

### 3. Ask your AI a question

Try: *"Show me unresolved feedback"* — if you get results, you're all set.

## Available tools

| Tool | Description | Try asking |
|------|-------------|------------|
| `list_feedback` | Search and filter feedback with pagination | "Show new feedback from this week" |
| `get_feedback` | Get full details of a single item | "Show me details on fb_8a2k" |
| `update_feedback` | Update status or add internal notes | "Mark fb_8a2k as resolved" |
| `bulk_feedback` | Bulk acknowledge, archive, or delete | "Archive all resolved feedback" |
| `feedback_stats` | Submission timeline and version breakdown | "How many reports came in this month?" |
| `list_projects` | List all your PingKit projects | "Which projects do I have?" |
| `get_quota` | Check usage and plan limits | "Am I near my feedback quota?" |

### Built-in prompts

| Prompt | What it does |
|--------|-------------|
| `triage` | Review unresolved feedback and suggest priorities |
| `release_review` | Summarize feedback for a specific app version |
| `trends` | Analyze feedback patterns over time |

## Requirements

- Node.js 18+
- A [PingKit](https://pingkit.dev) account with a personal access token

## Links

- [PingKit](https://pingkit.dev) — website and dashboard
- [PingKit iOS SDK](https://github.com/pingkitdev/pingkit-swift) — the companion SDK for your app
- [Documentation](https://pingkit.dev/docs)
- [MCP specification](https://modelcontextprotocol.io)

## License

[Apache-2.0](LICENSE)

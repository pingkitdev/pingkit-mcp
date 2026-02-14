# @pingkit/mcp

MCP (Model Context Protocol) server for [PingKit](https://pingkit.dev) — access your in-app feedback data from AI coding tools like Claude Code, Cursor, Codex, and Windsurf.

## Setup

### 1. Create a personal access token

Go to [Settings](https://pingkit.dev/settings) in the PingKit dashboard and create a personal access token.

### 2. Add to your MCP config

Add the following to your `.mcp.json` (Claude Code, Cursor) or equivalent config:

```json
{
  "mcpServers": {
    "pingkit": {
      "command": "npx",
      "args": ["-y", "@pingkit/mcp"],
      "env": {
        "PINGKIT_TOKEN": "pt_your_token_here"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_feedback` | Search and filter feedback with pagination |
| `get_feedback` | Get full details of a single feedback item |
| `update_feedback` | Update status or add internal notes |
| `bulk_feedback` | Perform bulk actions (acknowledge, archive, delete) |
| `feedback_stats` | Get submission timeline and version breakdown |
| `list_projects` | List all your projects |
| `get_quota` | Check current usage and plan limits |

## Prompts

| Prompt | Description |
|--------|-------------|
| `triage` | Review unresolved feedback and suggest priorities |
| `release_review` | Summarize feedback for a specific app version |
| `trends` | Analyze feedback trends over time |

## Example usage

Once configured, ask your AI assistant natural language questions:

- "Show me unresolved feedback about the login screen"
- "What are users saying about v2.3.0?"
- "Acknowledge all feedback about dark mode"
- "What are the trends in feedback this month?"

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PINGKIT_TOKEN` | Yes | Personal access token from dashboard |
| `PINGKIT_URL` | No | API base URL (defaults to `https://pingkit.dev`) |

## License

MIT

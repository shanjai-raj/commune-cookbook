# Commune MCP Server — Email in Claude Desktop, Cursor, Windsurf

Use Commune from any MCP-compatible client with natural language. No code required.

## Install in 30 seconds

```bash
# Claude Desktop / Cursor / Windsurf
uvx commune-mcp
```

Or via Smithery:
```bash
npx @smithery/cli install commune --client claude
```

## Config

Add to your MCP client config (Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "commune": {
      "command": "uvx",
      "args": ["commune-mcp"],
      "env": { "COMMUNE_API_KEY": "comm_your_key_here" }
    }
  }
}
```

For Cursor, add to `.cursor/mcp.json`. For VS Code (GitHub Copilot), add to `.vscode/mcp.json`. For Zed, add to `~/.config/zed/settings.json` under `"context_servers"`.

## What you can say

```
"Check my support inbox for new emails"
"Reply to John's thread saying we're processing his refund"
"Search for all emails about the payment issue"
"Create a new inbox called billing under example.com"
"Send an SMS to +14155551234 saying shipment is delayed"
"Show me deliverability stats for the last 7 days"
```

## How the flow works

```
You type a message to Claude
    ↓
Claude calls Commune tools (list_threads, get_thread_messages, send_email)
    ↓
Commune executes (real email delivered or retrieved)
    ↓
Claude summarizes the result for you
```

## Tools reference

13 tools across email and SMS:

| Tool | Category | Description |
|------|----------|-------------|
| `commune_list_inboxes` | Email | List all inboxes and their addresses |
| `commune_create_inbox` | Email | Create a new inbox |
| `commune_list_threads` | Email | List threads in an inbox, flagged by reply status |
| `commune_get_thread` | Email | Fetch all messages in a thread |
| `commune_send_email` | Email | Send a new email or reply in an existing thread |
| `commune_search_emails` | Email | Semantic search across threads using natural language |
| `commune_set_thread_status` | Email | Set status: open, needs_reply, waiting, or closed |
| `commune_tag_thread` | Email | Add tags to a thread for triage and routing |
| `commune_list_phone_numbers` | SMS | List provisioned phone numbers |
| `commune_send_sms` | SMS | Send an SMS to any E.164 number |
| `commune_list_sms_conversations` | SMS | List all SMS conversations |
| `commune_get_sms_thread` | SMS | Fetch full message history with a specific number |
| `commune_search_sms` | SMS | Semantic search across SMS messages |

## Compatibility

| Client | Status |
|--------|--------|
| Claude Desktop | Supported |
| Cursor | Supported |
| VS Code (GitHub Copilot) | Supported |
| Windsurf | Supported |
| Zed | Supported |
| Any MCP-compatible client | Supported |

## Architecture

The MCP server runs as a local process on your machine. Claude communicates with it over stdio using the Model Context Protocol. The server calls the Commune API on your behalf — your API key never leaves your machine.

```
Claude Desktop / Cursor / VS Code
    ↓ MCP protocol (stdio)
Commune MCP Server (local process)
    ↓ HTTPS REST
Commune API
    ↓
Email + SMS infrastructure
```

## Troubleshooting

**Tools don't appear in Claude Desktop**
1. Check the config file path and JSON syntax — a single missing comma will break parsing
2. Confirm the path in `args` is correct
3. Restart Claude Desktop fully (Cmd+Q, not just close the window)
4. Open the MCP console in Claude Desktop (Settings > Developer) and check for error output

**`Error: COMMUNE_API_KEY is not set`**
The `env` field in the MCP config is required. Make sure your key is in the `env` block of the client config.

## Examples in this folder

| File | Description |
|------|-------------|
| `customer_support_workflow.md` | Walkthrough of a support session via Claude Desktop |
| `inbox_setup_guide.md` | Setting up domains and inboxes via MCP |

## Related

- [Claude tool_use](../claude/) — programmatic version using the API directly
- [commune-mcp on PyPI](https://pypi.org/project/commune-mcp/)

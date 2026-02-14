#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PingKitClient } from "./client.js";
import type { FeedbackItem } from "./client.js";

const token = process.env.PINGKIT_TOKEN;
if (!token) {
  console.error(
    "PINGKIT_TOKEN environment variable is required.\n" +
      "Create a personal access token at https://pingkit.dev/settings",
  );
  process.exit(1);
}

const client = new PingKitClient(token, process.env.PINGKIT_URL);

const server = new McpServer({
  name: "pingkit",
  version: "0.1.0",
});

// ── Tools ──

server.tool(
  "list_feedback",
  "Search and filter user feedback. Returns paginated results with device metadata.",
  {
    status: z
      .enum(["new", "acknowledged", "resolved", "archived"])
      .optional()
      .describe("Filter by status"),
    search: z.string().optional().describe("Search text in feedback content"),
    project_id: z.string().optional().describe("Filter by project ID"),
    app_version: z
      .string()
      .optional()
      .describe("Filter by app version (exact match)"),
    created_from: z
      .string()
      .optional()
      .describe("Start date filter (ISO 8601)"),
    created_to: z.string().optional().describe("End date filter (ISO 8601)"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Items per page (default 20)"),
    offset: z.number().min(0).optional().describe("Pagination offset"),
  },
  async (args) => {
    const result = await client.listFeedback({
      ...args,
      limit: args.limit ?? 20,
    });
    return {
      content: [
        {
          type: "text" as const,
          text: formatFeedbackList(result.data, result.meta),
        },
      ],
    };
  },
);

server.tool(
  "get_feedback",
  "Get full details of a single feedback item by ID.",
  {
    id: z.string().describe("Feedback item ID (e.g. fb_abc123)"),
  },
  async ({ id }) => {
    const result = await client.getFeedback(id);
    return {
      content: [
        { type: "text" as const, text: formatFeedbackDetail(result.data) },
      ],
    };
  },
);

server.tool(
  "update_feedback",
  "Update feedback status or add internal notes.",
  {
    id: z.string().describe("Feedback item ID"),
    status: z
      .enum(["new", "acknowledged", "resolved", "archived"])
      .optional()
      .describe("New status"),
    notes: z
      .string()
      .max(5000)
      .optional()
      .describe("Internal notes (visible only in dashboard)"),
  },
  async ({ id, status, notes }) => {
    const body: { status?: string; notes?: string } = {};
    if (status) body.status = status;
    if (notes !== undefined) body.notes = notes;
    const result = await client.updateFeedback(id, body);
    return {
      content: [
        {
          type: "text" as const,
          text: result.updated
            ? `Updated ${id} successfully.`
            : `No changes made to ${id}.`,
        },
      ],
    };
  },
);

server.tool(
  "bulk_feedback",
  "Perform bulk actions on multiple feedback items.",
  {
    ids: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe("Array of feedback IDs"),
    action: z
      .enum(["acknowledge", "archive", "delete"])
      .describe("Action to perform"),
  },
  async ({ ids, action }) => {
    const result = await client.bulkFeedback(ids, action);
    return {
      content: [
        {
          type: "text" as const,
          text: `${action}d ${result.affected} of ${ids.length} items.`,
        },
      ],
    };
  },
);

server.tool(
  "feedback_stats",
  "Get feedback analytics — submission timeline and version breakdown.",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    created_from: z
      .string()
      .optional()
      .describe("Start date filter (ISO 8601)"),
    created_to: z.string().optional().describe("End date filter (ISO 8601)"),
  },
  async (args) => {
    const result = await client.feedbackStats(args);
    const { timeline, versions } = result.data;

    let text = "## Feedback Timeline (last 30 days)\n\n";
    if (timeline.length === 0) {
      text += "No data available.\n";
    } else {
      for (const entry of timeline) {
        const bar = "\u2588".repeat(Math.min(entry.count, 50));
        text += `${entry.date}: ${bar} ${entry.count}\n`;
      }
    }

    text += "\n## Top App Versions\n\n";
    if (versions.length === 0) {
      text += "No version data available.\n";
    } else {
      for (const v of versions) {
        text += `- ${v.app_version}: ${v.count} submissions\n`;
      }
    }

    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "list_projects",
  "List all your PingKit projects.",
  {},
  async () => {
    const result = await client.listProjects();
    let text = "## Projects\n\n";
    if (result.data.length === 0) {
      text += "No projects found.\n";
    } else {
      for (const p of result.data) {
        text += `- **${p.name}** (${p.id})\n`;
        text += `  Rate limit: ${p.rate_limit_per_hour}/hr | App Attest: ${p.require_app_attest ? "required" : "off"}\n`;
      }
    }
    return { content: [{ type: "text" as const, text }] };
  },
);

server.tool(
  "get_quota",
  "Check your current feedback submission quota and usage.",
  {},
  async () => {
    const q = await client.getQuota();
    const limitStr = q.limit === null ? "unlimited" : q.limit.toString();
    const text =
      `## Usage Quota\n\n` +
      `- Plan: ${q.plan}\n` +
      `- Used this month: ${q.used} / ${limitStr}\n` +
      `- Resets: ${q.resets_at}\n`;
    return { content: [{ type: "text" as const, text }] };
  },
);

// ── Resources ──

server.resource(
  "recent-feedback",
  "pingkit://feedback/recent",
  { description: "Last 10 feedback items across all projects", mimeType: "text/plain" },
  async () => {
    const result = await client.listFeedback({ limit: 10 });
    return {
      contents: [
        {
          uri: "pingkit://feedback/recent",
          text: formatFeedbackList(result.data, result.meta),
          mimeType: "text/plain",
        },
      ],
    };
  },
);

server.resource(
  "projects",
  "pingkit://projects",
  { description: "All your PingKit projects", mimeType: "text/plain" },
  async () => {
    const result = await client.listProjects();
    let text = "";
    for (const p of result.data) {
      text += `${p.id} | ${p.name} | rate_limit=${p.rate_limit_per_hour}/hr | app_attest=${p.require_app_attest ? "on" : "off"}\n`;
    }
    return {
      contents: [
        {
          uri: "pingkit://projects",
          text: text || "No projects found.",
          mimeType: "text/plain",
        },
      ],
    };
  },
);

// ── Prompts ──

server.prompt(
  "triage",
  "Review unresolved feedback and suggest priorities",
  {
    project_id: z
      .string()
      .optional()
      .describe("Filter by project ID (optional)"),
  },
  ({ project_id }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            `Use the list_feedback tool to fetch all feedback with status "new"${project_id ? ` for project ${project_id}` : ""}. ` +
            `Review each item and:\n` +
            `1. Group by theme (e.g., crashes, UX issues, feature requests)\n` +
            `2. Prioritize by severity and frequency\n` +
            `3. Suggest which items to acknowledge or resolve\n` +
            `4. If any feedback describes a bug, suggest a fix approach`,
        },
      },
    ],
  }),
);

server.prompt(
  "release_review",
  "Summarize feedback for a specific app version",
  {
    app_version: z.string().describe("App version to review (e.g., 2.3.0)"),
    project_id: z
      .string()
      .optional()
      .describe("Filter by project ID (optional)"),
  },
  ({ app_version, project_id }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            `Use list_feedback to fetch all feedback for app version "${app_version}"${project_id ? ` in project ${project_id}` : ""}. ` +
            `Then:\n` +
            `1. Summarize the overall sentiment\n` +
            `2. List the most common issues reported\n` +
            `3. Highlight any critical bugs or crashes\n` +
            `4. Suggest action items for the next release`,
        },
      },
    ],
  }),
);

server.prompt(
  "trends",
  "Analyze feedback trends over time",
  {
    project_id: z
      .string()
      .optional()
      .describe("Filter by project ID (optional)"),
  },
  ({ project_id }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            `Use the feedback_stats tool${project_id ? ` with project_id "${project_id}"` : ""} to get the submission timeline and version breakdown. ` +
            `Then use list_feedback to sample recent items. Analyze:\n` +
            `1. Submission volume trends (increasing, decreasing, spikes)\n` +
            `2. Which app versions generate the most feedback\n` +
            `3. Common themes in recent submissions\n` +
            `4. Any patterns that suggest emerging issues`,
        },
      },
    ],
  }),
);

// ── Formatters ──

function formatFeedbackList(
  items: FeedbackItem[],
  meta: { total: number; limit: number; offset: number },
): string {
  if (items.length === 0) return "No feedback items found.";

  let text = `Showing ${items.length} of ${meta.total} items (offset ${meta.offset}):\n\n`;
  for (const item of items) {
    text += `### ${item.id} [${item.status}]\n`;
    text += `${item.text}\n`;
    const parts: string[] = [];
    if (item.app_version) parts.push(`v${item.app_version}`);
    if (item.device_model) parts.push(item.device_model);
    if (item.os_version) parts.push(`iOS ${item.os_version}`);
    if (parts.length > 0) text += `_${parts.join(" | ")}_\n`;
    text += `Created: ${item.created_at}\n\n`;
  }
  return text;
}

function formatFeedbackDetail(item: FeedbackItem): string {
  let text = `## ${item.id} [${item.status}]\n\n`;
  text += `**Text:** ${item.text}\n\n`;
  text += `| Field | Value |\n|-------|-------|\n`;
  text += `| Project | ${item.project_id} |\n`;
  text += `| Status | ${item.status} |\n`;
  if (item.app_version) text += `| App Version | ${item.app_version} |\n`;
  if (item.app_build) text += `| Build | ${item.app_build} |\n`;
  if (item.device_model) text += `| Device | ${item.device_model} |\n`;
  if (item.os_version) text += `| iOS | ${item.os_version} |\n`;
  if (item.locale) text += `| Locale | ${item.locale} |\n`;
  if (item.timezone) text += `| Timezone | ${item.timezone} |\n`;
  text += `| Has Image | ${item.has_image ? "Yes" : "No"} |\n`;
  text += `| Created | ${item.created_at} |\n`;
  text += `| Updated | ${item.updated_at} |\n`;

  if (item.notes) text += `\n**Notes:** ${item.notes}\n`;

  if (item.custom_metadata) {
    try {
      const meta = JSON.parse(item.custom_metadata);
      text += `\n**Custom Metadata:**\n`;
      for (const [k, v] of Object.entries(meta)) {
        text += `- ${k}: ${String(v)}\n`;
      }
    } catch {
      // ignore parse errors
    }
  }

  return text;
}

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

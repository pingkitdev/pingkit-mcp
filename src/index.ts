#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PingKitClient } from "./client.js";
import type { FeedbackItem } from "./client.js";

// ── Formatters ──

export function formatFeedbackList(
  items: FeedbackItem[],
  meta: { total: number; limit: number; offset: number },
): string {
  if (items.length === 0) return "No feedback items found.";

  let text = `Showing ${items.length} of ${meta.total} items`;
  if (meta.offset > 0) text += ` (offset ${meta.offset})`;
  text += "\n";

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    text += `\n${i + 1}. [${item.status}]`;
    if (item.type) text += ` ${item.type}`;
    text += ` "${item.text}"\n`;
    const parts: string[] = [];
    if (item.app_version) parts.push(`v${item.app_version}`);
    if (item.device_model) parts.push(item.device_model);
    if (item.os_version) parts.push(`iOS ${item.os_version}`);
    if (item.source) parts.push(`source: ${item.source}`);
    if (parts.length > 0) text += `   ${parts.join(" · ")}\n`;
    if (item.email) text += `   Email: ${item.email}\n`;
    if (item.notes) text += `   Notes: ${item.notes.length > 80 ? item.notes.slice(0, 80) + "…" : item.notes}\n`;
    text += `   Created: ${item.created_at.split("T")[0]}\n`;
    text += `   ID: ${item.id}\n`;
  }
  return text;
}

export function formatFeedbackDetail(item: FeedbackItem): string {
  let text = `[${item.status}] "${item.text}"\n\n`;

  const fields: [string, string][] = [
    ["ID", item.id],
    ["Project", item.project_id],
    ["Status", item.status],
  ];
  if (item.type) fields.push(["Type", item.type]);
  if (item.email) fields.push(["Email", item.email]);
  if (item.source) fields.push(["Source", item.source]);
  if (item.app_version) {
    const ver = item.app_build ? `${item.app_version} (Build ${item.app_build})` : item.app_version;
    fields.push(["App Version", ver]);
  }
  if (item.device_model) fields.push(["Device", item.device_model]);
  if (item.os_version) fields.push(["iOS", item.os_version]);
  if (item.locale) fields.push(["Locale", item.locale]);
  if (item.timezone) fields.push(["Timezone", item.timezone]);
  fields.push(["Has Image", item.has_image ? "Yes" : "No"]);
  fields.push(["Created", item.created_at.split("T")[0]]);
  fields.push(["Updated", item.updated_at.split("T")[0]]);

  const maxLabel = Math.max(...fields.map(([k]) => k.length));
  for (const [key, value] of fields) {
    text += `  ${key.padEnd(maxLabel)}  ${value}\n`;
  }

  if (item.notes) text += `\n  Notes: ${item.notes}\n`;

  if (item.custom_metadata) {
    try {
      const meta = JSON.parse(item.custom_metadata);
      text += `\n  Custom Metadata:\n`;
      for (const [k, v] of Object.entries(meta)) {
        text += `    ${k}: ${String(v)}\n`;
      }
    } catch {
      // ignore parse errors
    }
  }

  return text;
}

// ── Server factory ──

export function createServer(token: string, baseUrl?: string) {
  const client = new PingKitClient(token, baseUrl);

  const server = new McpServer({
    name: "pingkit",
    version: "0.1.0",
  });

  // ── Tools ──

  server.tool(
    "list_feedback",
    "Search and filter user feedback. Returns paginated results with device metadata. " +
      "Tip: if a search query returns no results, try listing without the search parameter and a broader status filter — " +
      "the search performs server-side keyword matching which may not match all phrasing variations.",
    {
      status: z
        .enum(["new", "acknowledged", "resolved", "archived"])
        .optional()
        .describe("Filter by status"),
      search: z
        .string()
        .optional()
        .describe(
          "Server-side keyword search on feedback text. May not match partial words or synonyms. " +
            "If no results, try listing without search and filtering manually.",
        ),
      type: z
        .string()
        .optional()
        .describe("Filter by feedback type (e.g. bug, feature_request, question)"),
      project_id: z.string().optional().describe("Filter by project ID"),
      app_version: z
        .string()
        .optional()
        .describe("Filter by app version (exact match)"),
      sort: z
        .enum(["newest", "oldest"])
        .optional()
        .describe("Sort order by creation date (default: newest)"),
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
    "get_feedback_image",
    "Download the image attached to a feedback item. Only call this when has_image is true.",
    {
      id: z.string().describe("Feedback item ID"),
    },
    async ({ id }) => {
      try {
        const { data, contentType } = await client.getFeedbackImage(id);
        return {
          content: [
            {
              type: "image" as const,
              data,
              mimeType: contentType,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to retrieve image: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
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
      if (!result.updated) {
        return {
          content: [{ type: "text" as const, text: `No changes made to ${id}.` }],
        };
      }
      const changes: string[] = [];
      if (status) changes.push(`status → ${status}`);
      if (notes !== undefined) changes.push(`notes → "${notes.length > 80 ? notes.slice(0, 80) + "…" : notes}"`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Updated ${id}: ${changes.join(", ")}.`,
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

      let text = "Feedback Timeline (last 30 days)\n";
      if (timeline.length === 0) {
        text += "  No data available.\n";
      } else {
        const maxCount = Math.max(...timeline.map((e) => e.count));
        const maxCountWidth = String(maxCount).length;
        for (const entry of timeline) {
          const bar = "\u2588".repeat(Math.min(entry.count, 50));
          text += `  ${entry.date}  ${bar} ${String(entry.count).padStart(maxCountWidth)}\n`;
        }
      }

      text += "\nTop App Versions\n";
      if (versions.length === 0) {
        text += "  No version data available.\n";
      } else {
        for (const v of versions) {
          text += `  ${v.app_version}: ${v.count} submissions\n`;
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
      if (result.data.length === 0) {
        return { content: [{ type: "text" as const, text: "No projects found." }] };
      }
      let text = `${result.data.length} project${result.data.length === 1 ? "" : "s"}\n`;
      for (const p of result.data) {
        text += `\n  ${p.name} (${p.id})\n`;
        text += `  Rate limit: ${p.rate_limit_per_hour}/hr · App Attest: ${p.require_app_attest ? "required" : "off"}\n`;
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
        `Usage Quota\n` +
        `  Plan:            ${q.plan}\n` +
        `  Used this month: ${q.used} / ${limitStr}\n` +
        `  Resets:          ${q.resets_at}\n`;
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

  return { server, client };
}

// ── Start ──

async function main() {
  const token = process.env.PINGKIT_TOKEN;
  if (!token) {
    console.error(
      "PINGKIT_TOKEN environment variable is required.\n" +
        "Create a personal access token at https://pingkit.dev/settings",
    );
    process.exit(1);
  }

  const { server } = createServer(token, process.env.PINGKIT_URL);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only auto-start when executed directly (not imported by tests)
const isDirectRun = process.argv[1] &&
  (process.argv[1].endsWith("/index.js") || process.argv[1].endsWith("/index.ts"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

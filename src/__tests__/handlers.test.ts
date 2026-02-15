import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../index.js";
import { makeFeedbackItem, makePaginationMeta, makeProject } from "./fixtures.js";

function stubFetch(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const status = init?.status ?? 200;
  const headers = new Headers(init?.headers);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

let mcpClient: Client;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  // Stub fetch before creating the server
  vi.stubGlobal("fetch", stubFetch({}));

  const { server } = createServer("tok_test", "https://test.pingkit.dev");
  mcpClient = new Client({ name: "test-client", version: "1.0.0" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    mcpClient.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  cleanup = async () => {
    await mcpClient.close();
    await server.close();
  };
});

afterEach(async () => {
  await cleanup();
});

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const result = await mcpClient.callTool({ name, arguments: args });
  return result;
}

function getTextContent(result: Awaited<ReturnType<typeof callTool>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const textBlock = content.find((c) => c.type === "text");
  return textBlock?.text ?? "";
}

describe("list_feedback", () => {
  it("returns formatted output with default limit 20", async () => {
    const items = [makeFeedbackItem()];
    const meta = makePaginationMeta({ total: 1, count: 1 });
    vi.stubGlobal("fetch", stubFetch({ data: items, meta }));

    const result = await callTool("list_feedback", {});
    const text = getTextContent(result);

    expect(text).toContain("Showing 1 of 1 items");
    expect(text).toContain("fb_test123");

    // Verify the default limit=20 was sent in the request
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("limit=20");
  });
});

describe("get_feedback", () => {
  it("returns formatted detail", async () => {
    const item = makeFeedbackItem({ app_version: "2.0.0" });
    vi.stubGlobal("fetch", stubFetch({ data: item }));

    const result = await callTool("get_feedback", { id: "fb_test123" });
    const text = getTextContent(result);

    expect(text).toContain("fb_test123 [new]");
    expect(text).toContain("App Version");
    expect(text).toContain("2.0.0");
  });
});

describe("get_feedback_image", () => {
  it("returns text fallback on error", async () => {
    vi.stubGlobal("fetch", stubFetch({ error: { message: "No image" } }, { status: 404 }));

    const result = await callTool("get_feedback_image", { id: "fb_noimg" });
    const text = getTextContent(result);

    expect(text).toContain("Failed to retrieve image");
  });

  it("returns image content on success", async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: () => Promise.resolve(imageBytes.buffer),
    }));

    const result = await callTool("get_feedback_image", { id: "fb_img" });
    const content = result.content as Array<{ type: string; data?: string; mimeType?: string }>;
    const imageBlock = content.find((c) => c.type === "image");

    expect(imageBlock).toBeDefined();
    expect(imageBlock!.mimeType).toBe("image/png");
    expect(imageBlock!.data).toBe(Buffer.from(imageBytes.buffer).toString("base64"));
  });
});

describe("update_feedback", () => {
  it("returns 'No changes' when updated is false", async () => {
    vi.stubGlobal("fetch", stubFetch({ id: "fb_1", updated: false }));

    const result = await callTool("update_feedback", { id: "fb_1", status: "resolved" });
    const text = getTextContent(result);

    expect(text).toContain("No changes made to fb_1");
  });

  it("truncates long notes in summary", async () => {
    vi.stubGlobal("fetch", stubFetch({ id: "fb_1", updated: true }));
    const longNotes = "X".repeat(100);

    const result = await callTool("update_feedback", { id: "fb_1", notes: longNotes });
    const text = getTextContent(result);

    expect(text).toContain("X".repeat(80) + "…");
    expect(text).not.toContain("X".repeat(81));
  });

  it("shows status change in summary", async () => {
    vi.stubGlobal("fetch", stubFetch({ id: "fb_1", updated: true }));

    const result = await callTool("update_feedback", { id: "fb_1", status: "resolved" });
    const text = getTextContent(result);

    expect(text).toContain("status → resolved");
  });
});

describe("bulk_feedback", () => {
  it("returns correct affected count message", async () => {
    vi.stubGlobal("fetch", stubFetch({ affected: 3 }));

    const result = await callTool("bulk_feedback", {
      ids: ["fb_1", "fb_2", "fb_3"],
      action: "archive",
    });
    const text = getTextContent(result);

    expect(text).toContain("archived 3 of 3 items");
  });
});

describe("feedback_stats", () => {
  it("shows 'No data available' for empty timeline", async () => {
    vi.stubGlobal("fetch", stubFetch({ data: { timeline: [], versions: [] } }));

    const result = await callTool("feedback_stats", {});
    const text = getTextContent(result);

    expect(text).toContain("No data available");
  });

  it("shows bar chart with block chars for non-empty timeline", async () => {
    vi.stubGlobal("fetch", stubFetch({
      data: {
        timeline: [
          { date: "2025-01-15", count: 5 },
          { date: "2025-01-16", count: 3 },
        ],
        versions: [{ app_version: "2.0.0", count: 8 }],
      },
    }));

    const result = await callTool("feedback_stats", {});
    const text = getTextContent(result);

    expect(text).toContain("█");
    expect(text).toContain("2025-01-15");
    expect(text).toContain("2025-01-16");
    expect(text).toContain("2.0.0: 8 submissions");
  });
});

describe("list_projects", () => {
  it("returns 'No projects found.' for empty list", async () => {
    vi.stubGlobal("fetch", stubFetch({ data: [] }));

    const result = await callTool("list_projects", {});
    const text = getTextContent(result);

    expect(text).toBe("No projects found.");
  });

  it("shows singular 'project' for one project", async () => {
    vi.stubGlobal("fetch", stubFetch({ data: [makeProject()] }));

    const result = await callTool("list_projects", {});
    const text = getTextContent(result);

    expect(text).toMatch(/^1 project\n/);
    expect(text).not.toContain("projects");
  });

  it("shows plural 'projects' for multiple projects", async () => {
    vi.stubGlobal("fetch", stubFetch({
      data: [
        makeProject({ id: "proj_1", name: "App One" }),
        makeProject({ id: "proj_2", name: "App Two" }),
      ],
    }));

    const result = await callTool("list_projects", {});
    const text = getTextContent(result);

    expect(text).toMatch(/^2 projects\n/);
  });
});

describe("get_quota", () => {
  it("shows 'unlimited' for null limit", async () => {
    vi.stubGlobal("fetch", stubFetch({
      used: 42,
      limit: null,
      plan: "enterprise",
      resets_at: "2025-02-01T00:00:00Z",
    }));

    const result = await callTool("get_quota", {});
    const text = getTextContent(result);

    expect(text).toContain("unlimited");
    expect(text).toContain("42");
    expect(text).toContain("enterprise");
  });
});

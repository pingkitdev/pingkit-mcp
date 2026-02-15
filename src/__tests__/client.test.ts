import { describe, it, expect, vi, beforeEach } from "vitest";
import { PingKitClient } from "../client.js";

function mockFetch(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
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

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({}));
});

describe("PingKitClient constructor", () => {
  it("defaults base URL to https://pingkit.dev", () => {
    const client = new PingKitClient("tok_test");
    // Verify by making a request and checking the URL
    client.listProjects();
    expect(fetch).toHaveBeenCalledWith(
      "https://pingkit.dev/v1/projects",
      expect.any(Object),
    );
  });

  it("strips trailing slash from custom URL", () => {
    const client = new PingKitClient("tok_test", "https://custom.dev/");
    client.listProjects();
    expect(fetch).toHaveBeenCalledWith(
      "https://custom.dev/v1/projects",
      expect.any(Object),
    );
  });

  it("allows http://localhost", () => {
    expect(() => new PingKitClient("tok_test", "http://localhost:3000")).not.toThrow();
  });

  it("allows http://127.0.0.1", () => {
    expect(() => new PingKitClient("tok_test", "http://127.0.0.1:3000")).not.toThrow();
  });

  it("throws for http:// non-localhost URLs", () => {
    expect(() => new PingKitClient("tok_test", "http://example.com")).toThrow(
      "HTTPS",
    );
  });
});

describe("request handling", () => {
  it("sends Bearer token in Authorization header", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [] }));
    const client = new PingKitClient("tok_secret");
    await client.listProjects();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok_secret",
        }),
      }),
    );
  });

  it("sends Content-Type: application/json header", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [] }));
    const client = new PingKitClient("tok_test");
    await client.listProjects();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("extracts error message from JSON error response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ error: { message: "Invalid token" } }, { status: 401 }),
    );
    const client = new PingKitClient("tok_bad");
    await expect(client.listProjects()).rejects.toThrow("Invalid token");
  });

  it("falls back to HTTP status for non-JSON error", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.reject(new Error("not json")),
    });
    vi.stubGlobal("fetch", fn);
    const client = new PingKitClient("tok_test");
    await expect(client.listProjects()).rejects.toThrow("HTTP 500");
  });
});

describe("listFeedback", () => {
  it("calls /v1/feedback with no query string when no params", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [], meta: {} }));
    const client = new PingKitClient("tok_test");
    await client.listFeedback();

    expect(fetch).toHaveBeenCalledWith(
      "https://pingkit.dev/v1/feedback",
      expect.any(Object),
    );
  });

  it("includes all params in query string", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [], meta: {} }));
    const client = new PingKitClient("tok_test");
    await client.listFeedback({
      status: "new",
      search: "crash",
      project_id: "proj_1",
      app_version: "2.0",
      type: "bug",
      sort: "oldest",
      created_from: "2025-01-01",
      created_to: "2025-01-31",
      limit: 10,
      offset: 5,
    });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("status=new");
    expect(url).toContain("search=crash");
    expect(url).toContain("project_id=proj_1");
    expect(url).toContain("app_version=2.0");
    expect(url).toContain("type=bug");
    expect(url).toContain("sort=oldest");
    expect(url).toContain("created_from=2025-01-01");
    expect(url).toContain("created_to=2025-01-31");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
  });

  it("omits falsy params", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [], meta: {} }));
    const client = new PingKitClient("tok_test");
    await client.listFeedback({ status: "new" });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("status=new");
    expect(url).not.toContain("search=");
    expect(url).not.toContain("limit=");
  });
});

describe("getFeedback", () => {
  it("calls correct URL with encodeURIComponent", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: {} }));
    const client = new PingKitClient("tok_test");
    await client.getFeedback("fb_abc/123");

    expect(fetch).toHaveBeenCalledWith(
      "https://pingkit.dev/v1/feedback/fb_abc%2F123",
      expect.any(Object),
    );
  });
});

describe("updateFeedback", () => {
  it("sends PATCH with JSON body", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "fb_1", updated: true }));
    const client = new PingKitClient("tok_test");
    await client.updateFeedback("fb_1", { status: "resolved", notes: "done" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/feedback/fb_1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", notes: "done" }),
      }),
    );
  });
});

describe("bulkFeedback", () => {
  it("POSTs to /v1/feedback/bulk", async () => {
    vi.stubGlobal("fetch", mockFetch({ affected: 2 }));
    const client = new PingKitClient("tok_test");
    await client.bulkFeedback(["fb_1", "fb_2"], "archive");

    expect(fetch).toHaveBeenCalledWith(
      "https://pingkit.dev/v1/feedback/bulk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids: ["fb_1", "fb_2"], action: "archive" }),
      }),
    );
  });
});

describe("feedbackStats", () => {
  it("builds query string correctly", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: { timeline: [], versions: [] } }));
    const client = new PingKitClient("tok_test");
    await client.feedbackStats({ project_id: "proj_1", created_from: "2025-01-01" });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/v1/feedback/stats?");
    expect(url).toContain("project_id=proj_1");
    expect(url).toContain("created_from=2025-01-01");
  });
});

describe("getFeedbackImage", () => {
  it("returns base64 data and content-type from header", async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: () => Promise.resolve(imageBytes.buffer),
    });
    vi.stubGlobal("fetch", fn);

    const client = new PingKitClient("tok_test");
    const result = await client.getFeedbackImage("fb_img");

    expect(result.contentType).toBe("image/jpeg");
    expect(result.data).toBe(Buffer.from(imageBytes.buffer).toString("base64"));
  });

  it("defaults content-type to image/png", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(), // no content-type
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal("fetch", fn);

    const client = new PingKitClient("tok_test");
    const result = await client.getFeedbackImage("fb_img");

    expect(result.contentType).toBe("image/png");
  });

  it("does not send Content-Type request header", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal("fetch", fn);

    const client = new PingKitClient("tok_test");
    await client.getFeedbackImage("fb_img");

    const calledHeaders = fn.mock.calls[0][1]?.headers ?? {};
    expect(calledHeaders).not.toHaveProperty("Content-Type");
  });
});

describe("listProjects", () => {
  it("calls /v1/projects", async () => {
    vi.stubGlobal("fetch", mockFetch({ data: [] }));
    const client = new PingKitClient("tok_test");
    await client.listProjects();

    expect(fetch).toHaveBeenCalledWith(
      "https://pingkit.dev/v1/projects",
      expect.any(Object),
    );
  });
});

describe("getQuota", () => {
  it("calls /v1/feedback/quota", async () => {
    vi.stubGlobal("fetch", mockFetch({ used: 10, limit: 100, plan: "pro", resets_at: "2025-02-01" }));
    const client = new PingKitClient("tok_test");
    await client.getQuota();

    expect(fetch).toHaveBeenCalledWith(
      "https://pingkit.dev/v1/feedback/quota",
      expect.any(Object),
    );
  });
});

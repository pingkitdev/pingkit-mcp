const DEFAULT_BASE_URL = "https://pingkit.dev";

export class PingKitClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl?: string) {
    this.token = token;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

    // Enforce HTTPS for non-localhost URLs to prevent token leakage over plaintext
    if (
      !this.baseUrl.startsWith("https://") &&
      !this.baseUrl.startsWith("http://localhost") &&
      !this.baseUrl.startsWith("http://127.0.0.1")
    ) {
      throw new Error(
        "PINGKIT_URL must use HTTPS (or http://localhost for development)",
      );
    }
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  async listFeedback(params?: {
    status?: string;
    search?: string;
    project_id?: string;
    app_version?: string;
    type?: string;
    sort?: string;
    created_from?: string;
    created_to?: string;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.project_id) query.set("project_id", params.project_id);
    if (params?.app_version) query.set("app_version", params.app_version);
    if (params?.type) query.set("type", params.type);
    if (params?.sort) query.set("sort", params.sort);
    if (params?.created_from) query.set("created_from", params.created_from);
    if (params?.created_to) query.set("created_to", params.created_to);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    const qs = query.toString();
    return this.request<{
      data: FeedbackItem[];
      meta: PaginationMeta;
    }>(`/v1/feedback${qs ? `?${qs}` : ""}`);
  }

  async getFeedback(id: string) {
    return this.request<{ data: FeedbackItem }>(
      `/v1/feedback/${encodeURIComponent(id)}`,
    );
  }

  async updateFeedback(id: string, body: { status?: string; notes?: string }) {
    return this.request<{ id: string; updated: boolean }>(
      `/v1/feedback/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  }

  async bulkFeedback(ids: string[], action: string) {
    return this.request<{ affected: number }>("/v1/feedback/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action }),
    });
  }

  async feedbackStats(params?: {
    project_id?: string;
    created_from?: string;
    created_to?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.project_id) query.set("project_id", params.project_id);
    if (params?.created_from) query.set("created_from", params.created_from);
    if (params?.created_to) query.set("created_to", params.created_to);
    const qs = query.toString();
    return this.request<{
      data: {
        timeline: { date: string; count: number }[];
        versions: { app_version: string; count: number }[];
      };
    }>(`/v1/feedback/stats${qs ? `?${qs}` : ""}`);
  }

  async getFeedbackImage(id: string) {
    const response = await fetch(`${this.baseUrl}/v1/feedback/${encodeURIComponent(id)}/image`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const buffer = await response.arrayBuffer();
    return { data: Buffer.from(buffer).toString("base64"), contentType };
  }

  async listProjects() {
    return this.request<{ data: Project[] }>("/v1/projects");
  }

  async getQuota() {
    return this.request<{
      used: number;
      limit: number | null;
      plan: string;
      resets_at: string;
    }>("/v1/feedback/quota");
  }
}

export interface FeedbackItem {
  id: string;
  project_id: string;
  text: string;
  status: "new" | "acknowledged" | "resolved" | "archived";
  email: string | null;
  type: string | null;
  source: string | null;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  app_build: string | null;
  locale: string | null;
  timezone: string | null;
  custom_metadata: string | null;
  has_image: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  webhook_url: string | null;
  notification_type: string | null;
  rate_limit_per_hour: number;
  require_app_attest: number;
  created_at: string;
  updated_at: string;
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  count: number;
  total: number;
}

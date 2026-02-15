import type { FeedbackItem, PaginationMeta, Project } from "../client.js";

export function makeFeedbackItem(overrides?: Partial<FeedbackItem>): FeedbackItem {
  return {
    id: "fb_test123",
    project_id: "proj_abc",
    text: "The app crashes when I tap the settings icon",
    status: "new",
    email: null,
    type: null,
    source: null,
    device_model: null,
    os_version: null,
    app_version: null,
    app_build: null,
    locale: null,
    timezone: null,
    custom_metadata: null,
    has_image: 0,
    notes: null,
    created_at: "2025-01-15T10:30:00Z",
    updated_at: "2025-01-15T10:30:00Z",
    ...overrides,
  };
}

export function makePaginationMeta(overrides?: Partial<PaginationMeta>): PaginationMeta {
  return {
    limit: 20,
    offset: 0,
    count: 1,
    total: 1,
    ...overrides,
  };
}

export function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj_abc",
    name: "My App",
    webhook_url: null,
    notification_type: null,
    rate_limit_per_hour: 100,
    require_app_attest: 0,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

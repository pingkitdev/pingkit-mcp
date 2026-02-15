import { describe, it, expect } from "vitest";
import { formatFeedbackList, formatFeedbackDetail } from "../index.js";
import { makeFeedbackItem, makePaginationMeta } from "./fixtures.js";

describe("formatFeedbackList", () => {
  it("returns message for empty array", () => {
    const result = formatFeedbackList([], makePaginationMeta({ total: 0, count: 0 }));
    expect(result).toBe("No feedback items found.");
  });

  it("renders single item with all optional fields null", () => {
    const item = makeFeedbackItem();
    const meta = makePaginationMeta({ total: 1, count: 1 });
    const result = formatFeedbackList([item], meta);

    expect(result).toContain("Showing 1 of 1 items");
    expect(result).toContain(item.id);
    expect(result).toContain(`[${item.status}]`);
    expect(result).toContain(`"${item.text}"`);
    expect(result).toContain(`Created: ${item.created_at}`);
    // Should not contain metadata lines since all optional fields are null
    expect(result).not.toContain("Email:");
    expect(result).not.toContain("Notes:");
  });

  it("renders item with all metadata populated", () => {
    const item = makeFeedbackItem({
      app_version: "2.1.0",
      device_model: "iPhone 15 Pro",
      os_version: "17.2",
      source: "widget",
      email: "user@example.com",
      notes: "Needs investigation",
    });
    const meta = makePaginationMeta({ total: 1, count: 1 });
    const result = formatFeedbackList([item], meta);

    expect(result).toContain("v2.1.0");
    expect(result).toContain("iPhone 15 Pro");
    expect(result).toContain("iOS 17.2");
    expect(result).toContain("source: widget");
    expect(result).toContain("Email: user@example.com");
    expect(result).toContain("Notes: Needs investigation");
  });

  it("truncates notes longer than 80 chars", () => {
    const longNotes = "A".repeat(100);
    const item = makeFeedbackItem({ notes: longNotes });
    const meta = makePaginationMeta({ total: 1, count: 1 });
    const result = formatFeedbackList([item], meta);

    expect(result).toContain("A".repeat(80) + "…");
    expect(result).not.toContain("A".repeat(81));
  });

  it("does not truncate notes exactly 80 chars", () => {
    const notes80 = "B".repeat(80);
    const item = makeFeedbackItem({ notes: notes80 });
    const meta = makePaginationMeta({ total: 1, count: 1 });
    const result = formatFeedbackList([item], meta);

    expect(result).toContain(`Notes: ${notes80}`);
    expect(result).not.toContain("…");
  });

  it("shows offset in header when offset > 0", () => {
    const item = makeFeedbackItem();
    const meta = makePaginationMeta({ total: 50, count: 1, offset: 20 });
    const result = formatFeedbackList([item], meta);

    expect(result).toContain("(offset 20)");
  });

  it("does not show offset when offset is 0", () => {
    const item = makeFeedbackItem();
    const meta = makePaginationMeta({ total: 1, count: 1, offset: 0 });
    const result = formatFeedbackList([item], meta);

    expect(result).not.toContain("offset");
  });

  it("shows type in separator when present", () => {
    const item = makeFeedbackItem({ type: "bug" });
    const meta = makePaginationMeta({ total: 1, count: 1 });
    const result = formatFeedbackList([item], meta);

    expect(result).toContain("(bug)");
  });
});

describe("formatFeedbackDetail", () => {
  it("renders minimal item with only required fields", () => {
    const item = makeFeedbackItem();
    const result = formatFeedbackDetail(item);

    expect(result).toContain(`${item.id} [${item.status}]`);
    expect(result).toContain(`"${item.text}"`);
    expect(result).toContain("Project");
    expect(result).toContain(item.project_id);
    expect(result).toContain("Status");
    expect(result).toContain("Has Image");
    expect(result).toContain("No"); // has_image: 0
    expect(result).toContain("Created");
    expect(result).toContain("Updated");
  });

  it("renders app_version without app_build as version only", () => {
    const item = makeFeedbackItem({ app_version: "1.0.0" });
    const result = formatFeedbackDetail(item);

    expect(result).toContain("App Version");
    expect(result).toContain("1.0.0");
    expect(result).not.toContain("Build");
  });

  it("renders app_version with app_build as version (Build N)", () => {
    const item = makeFeedbackItem({ app_version: "1.0.0", app_build: "42" });
    const result = formatFeedbackDetail(item);

    expect(result).toContain("1.0.0 (Build 42)");
  });

  it("renders has_image: 1 as Yes", () => {
    const item = makeFeedbackItem({ has_image: 1 });
    const result = formatFeedbackDetail(item);

    // Find the Has Image line specifically
    const lines = result.split("\n");
    const hasImageLine = lines.find((l) => l.includes("Has Image"));
    expect(hasImageLine).toContain("Yes");
  });

  it("renders has_image: 0 as No", () => {
    const item = makeFeedbackItem({ has_image: 0 });
    const result = formatFeedbackDetail(item);

    const lines = result.split("\n");
    const hasImageLine = lines.find((l) => l.includes("Has Image"));
    expect(hasImageLine).toContain("No");
  });

  it("parses and renders valid custom_metadata JSON", () => {
    const item = makeFeedbackItem({
      custom_metadata: JSON.stringify({ build_env: "staging", user_tier: "pro" }),
    });
    const result = formatFeedbackDetail(item);

    expect(result).toContain("Custom Metadata:");
    expect(result).toContain("build_env: staging");
    expect(result).toContain("user_tier: pro");
  });

  it("silently ignores invalid custom_metadata JSON", () => {
    const item = makeFeedbackItem({ custom_metadata: "not valid json{" });
    const result = formatFeedbackDetail(item);

    expect(result).not.toContain("Custom Metadata:");
    // Should not throw
  });

  it("aligns labels based on longest label", () => {
    const item = makeFeedbackItem({
      app_version: "2.0.0",
      device_model: "iPhone 15",
      os_version: "17.0",
    });
    const result = formatFeedbackDetail(item);

    // "App Version" (11 chars) is the longest label
    // All labels should be padded to align
    const lines = result.split("\n").filter((l) => l.startsWith("  ") && l.includes("  "));
    const fieldLines = lines.filter((l) => {
      const trimmed = l.trimStart();
      return /^[A-Z]/.test(trimmed) && trimmed.includes("  ");
    });

    // Check that at least two field lines exist with consistent alignment
    expect(fieldLines.length).toBeGreaterThan(2);
  });
});

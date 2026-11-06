import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, apiFetch, setUnauthorizedHandler } from "../api/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("apiFetch", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    setUnauthorizedHandler(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success and sends same-origin GET by default", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sub: "owner" }));
    const r = await apiFetch<{ sub: string }>("/api/auth/me");
    expect(r).toEqual({ sub: "owner" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/me");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
  });

  it("POSTs JSON bodies with a content-type header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await apiFetch("/api/positions", { json: { osi: "SPXW  261106C07400000", qty: 1, entryPremium: 2.5 } });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({ osi: "SPXW  261106C07400000", qty: 1, entryPremium: 2.5 });
  });

  it("surfaces the server's { error } message with the HTTP status", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Premium $300 exceeds per-contract budget $150" }, 400));
    const err = await apiFetch("/api/positions", { json: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).message).toBe("Premium $300 exceeds per-contract budget $150");
  });

  it("falls back to an HTTP status message for non-JSON error bodies", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }));
    const err = await apiFetch("/api/state").catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).message).toBe("HTTP 502");
  });

  it("wraps network failures as ApiError(0)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const err = await apiFetch("/api/state").catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toMatch(/Network error/);
  });

  it("invokes the unauthorized handler on 401 and still rejects", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Not signed in." }, 401));
    await expect(apiFetch("/api/state")).rejects.toMatchObject({ status: 401, message: "Not signed in." });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("re-throws aborts untouched so callers can ignore stale requests", async () => {
    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);
    await expect(apiFetch("/api/state")).rejects.toBe(abort);
  });

  it("builds query strings for typed endpoints", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(null));
    await api.replay("2026-11-06", 1762459800000);
    await api.bars("SPY");
    await api.positions();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/replay?date=2026-11-06&at=1762459800000");
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/bars?symbol=SPY");
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/positions");
  });
});

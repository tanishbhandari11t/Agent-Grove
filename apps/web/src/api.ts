import type { Mission, OfficeSnapshot } from "@agent-grove/shared";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = (data as { error?: unknown }).error;
    const message =
      typeof raw === "string"
        ? raw
        : raw
          ? JSON.stringify(raw)
          : res.statusText || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export function fetchHealth() {
  return request<{ ok: boolean; openRouter: boolean; mode: "live" | "demo" }>("/api/health");
}

export function fetchOffice() {
  return request<OfficeSnapshot>("/api/office");
}

export function fetchMissions() {
  return request<{ missions: Mission[] }>("/api/missions");
}

export function fetchMission(id: string) {
  return request<{ mission: Mission }>(`/api/missions/${id}`);
}

export function createMission(prompt: string, title?: string) {
  return request<{ mission: Mission }>("/api/missions", {
    method: "POST",
    body: JSON.stringify({ prompt, title }),
  });
}

export function retryMission(id: string) {
  return request<{ mission: Mission }>(`/api/missions/${id}/retry`, { method: "POST" });
}

export function fetchAnalytics() {
  return request<{
    total: number;
    completed: number;
    failed: number;
    failureRate: number;
    averageDurationMs: number;
    totalTokens: number;
  }>("/api/analytics");
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentInfo, Mission, OfficeSnapshot } from "@agent-grove/shared";
import { DEFAULT_AGENTS } from "@agent-grove/shared";
import {
  createMission,
  fetchAnalytics,
  fetchHealth,
  fetchMission,
  fetchMissions,
  fetchOffice,
  retryMission,
} from "./api";

const idleAgents: AgentInfo[] = DEFAULT_AGENTS.map((a) => ({ ...a, status: "idle" }));

export function useLiveStore() {
  const [agents, setAgents] = useState<AgentInfo[]>(idleAgents);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Mission | null>(null);
  const [mode, setMode] = useState<"live" | "demo" | "unknown">("unknown");
  const [analytics, setAnalytics] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    failureRate: 0,
    averageDurationMs: 0,
    totalTokens: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const analyticsTimer = useRef<number | null>(null);

  const refreshAnalytics = useCallback(async () => {
    try {
      setAnalytics(await fetchAnalytics());
    } catch {
      /* ignore while server boots */
    }
  }, []);

  const refreshAnalyticsSoon = useCallback(() => {
    if (analyticsTimer.current) window.clearTimeout(analyticsTimer.current);
    analyticsTimer.current = window.setTimeout(() => {
      void refreshAnalytics();
    }, 500);
  }, [refreshAnalytics]);

  const selectMission = useCallback(async (id: string) => {
    setSelectedId(id);
    try {
      const { mission } = await fetchMission(id);
      setSelected(mission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mission");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [health, office, missionList] = await Promise.all([
          fetchHealth(),
          fetchOffice(),
          fetchMissions(),
        ]);
        if (cancelled) return;
        setMode(health.mode);
        setAgents(office.agents);
        setMissions(missionList.missions);
        if (missionList.missions[0]) {
          setSelectedId(missionList.missions[0].id);
          setSelected(missionList.missions[0]);
        }
        await refreshAnalytics();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to reach API");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      if (analyticsTimer.current) window.clearTimeout(analyticsTimer.current);
    };
  }, [refreshAnalytics]);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) {
          retryTimer = window.setTimeout(connect, 1500);
        }
      };
      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as
            | { type: "office.updated"; payload: OfficeSnapshot }
            | { type: "agents.updated"; payload: AgentInfo[] }
            | { type: "mission.updated" | "mission.created"; payload: Mission }
            | { type: "missions.snapshot"; payload: Mission[] };

          if (event.type === "office.updated") {
            setAgents(event.payload.agents);
          } else if (event.type === "agents.updated") {
            setAgents(event.payload);
          } else if (event.type === "missions.snapshot") {
            setMissions(event.payload);
          } else if (event.type === "mission.created" || event.type === "mission.updated") {
            setMissions((prev) => {
              const others = prev.filter((m) => m.id !== event.payload.id);
              return [event.payload, ...others];
            });
            setSelectedId((current) => {
              if (!current || current === event.payload.id) {
                setSelected(event.payload);
                return event.payload.id;
              }
              return current;
            });
            if (
              event.type === "mission.created" ||
              event.payload.status === "completed" ||
              event.payload.status === "failed"
            ) {
              refreshAnalyticsSoon();
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [refreshAnalyticsSoon]);

  const submitMission = useCallback(async (prompt: string) => {
    setBusy(true);
    setError(null);
    try {
      const { mission } = await createMission(prompt);
      setSelectedId(mission.id);
      setSelected(mission);
      setMissions((prev) => [mission, ...prev.filter((m) => m.id !== mission.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create mission");
    } finally {
      setBusy(false);
    }
  }, []);

  const retrySelected = useCallback(async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const { mission } = await retryMission(selectedId);
      setSelected(mission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  const activeAgents = useMemo(
    () => agents.filter((a) => a.status !== "idle" && a.status !== "completed").length,
    [agents],
  );

  return {
    agents,
    missions,
    selected,
    selectedId,
    selectMission,
    submitMission,
    retrySelected,
    analytics,
    mode,
    busy,
    error,
    connected,
    activeAgents,
  };
}

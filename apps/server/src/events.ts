import type { AgentInfo, Mission, OfficeSnapshot } from "@agent-grove/shared";

export type ServerEvent =
  | { type: "office.updated"; payload: OfficeSnapshot }
  | { type: "mission.updated"; payload: Mission }
  | { type: "mission.created"; payload: Mission }
  | { type: "agents.updated"; payload: AgentInfo[] };

type Listener = (event: ServerEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(event: ServerEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("event listener failed", err);
    }
  }
}

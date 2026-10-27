import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentInfo, AgentRole, AgentStatus, Mission, OfficeSnapshot } from "@agent-grove/shared";
import { DEFAULT_AGENTS } from "@agent-grove/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "store.json");

export interface StoreData {
  missions: Mission[];
  agents: AgentInfo[];
  activeMissionId: string | null;
}

function defaultAgents(): AgentInfo[] {
  return DEFAULT_AGENTS.map((a) => ({ ...a, status: "idle" as AgentStatus }));
}

function emptyStore(): StoreData {
  return {
    missions: [],
    agents: defaultAgents(),
    activeMissionId: null,
  };
}

let cache: StoreData | null = null;

export async function loadStore(): Promise<StoreData> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cache = JSON.parse(raw) as StoreData;
    if (!cache.agents?.length) cache.agents = defaultAgents();
    return cache;
  } catch {
    cache = emptyStore();
    await saveStore();
    return cache;
  }
}

export async function saveStore(): Promise<void> {
  if (!cache) return;
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
}

export async function listMissions(): Promise<Mission[]> {
  const store = await loadStore();
  return [...store.missions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMission(id: string): Promise<Mission | undefined> {
  const store = await loadStore();
  return store.missions.find((m) => m.id === id);
}

export async function upsertMission(mission: Mission): Promise<Mission> {
  const store = await loadStore();
  const idx = store.missions.findIndex((m) => m.id === mission.id);
  if (idx >= 0) store.missions[idx] = mission;
  else store.missions.unshift(mission);
  await saveStore();
  return mission;
}

export async function setActiveMission(id: string | null): Promise<void> {
  const store = await loadStore();
  store.activeMissionId = id;
  await saveStore();
}

export async function setAgentStatus(
  agentId: AgentRole,
  status: AgentStatus,
  currentTask?: string,
): Promise<AgentInfo[]> {
  const store = await loadStore();
  store.agents = store.agents.map((agent) =>
    agent.id === agentId
      ? { ...agent, status, currentTask: currentTask ?? (status === "idle" ? undefined : agent.currentTask) }
      : agent,
  );
  await saveStore();
  return store.agents;
}

export async function resetAgents(): Promise<AgentInfo[]> {
  const store = await loadStore();
  store.agents = defaultAgents();
  await saveStore();
  return store.agents;
}

export async function getOfficeSnapshot(): Promise<OfficeSnapshot> {
  const store = await loadStore();
  return {
    agents: store.agents,
    activeMissionId: store.activeMissionId,
  };
}

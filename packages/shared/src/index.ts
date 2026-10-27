export type AgentRole = "planner" | "scout" | "analyst" | "inspector" | "scribe";

export type AgentStatus =
  | "idle"
  | "planning"
  | "researching"
  | "analyzing"
  | "verifying"
  | "writing"
  | "waiting_approval"
  | "failed"
  | "completed";

export type MissionStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export interface AgentInfo {
  id: AgentRole;
  name: string;
  title: string;
  desk: string;
  characterIndex: number;
  status: AgentStatus;
  currentTask?: string;
}

export interface MissionEvent {
  id: string;
  missionId: string;
  agentId?: AgentRole;
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface MissionTask {
  id: string;
  missionId: string;
  agentId: AgentRole;
  title: string;
  status: TaskStatus;
  result?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface MissionReport {
  id: string;
  missionId: string;
  content: string;
  createdAt: string;
}

export interface Mission {
  id: string;
  title: string;
  prompt: string;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  tasks: MissionTask[];
  events: MissionEvent[];
  report?: MissionReport;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface CreateMissionRequest {
  title?: string;
  prompt: string;
}

export interface OfficeSnapshot {
  agents: AgentInfo[];
  activeMissionId: string | null;
}

export const DEFAULT_AGENTS: Omit<AgentInfo, "status" | "currentTask">[] = [
  {
    id: "planner",
    name: "Planner",
    title: "Orchestrator",
    desk: "Mission board",
    characterIndex: 0,
  },
  {
    id: "scout",
    name: "Scout",
    title: "Research",
    desk: "Research desk",
    characterIndex: 1,
  },
  {
    id: "analyst",
    name: "Analyst",
    title: "Analysis",
    desk: "Data desk",
    characterIndex: 2,
  },
  {
    id: "inspector",
    name: "Inspector",
    title: "Verification",
    desk: "QA desk",
    characterIndex: 3,
  },
  {
    id: "scribe",
    name: "Scribe",
    title: "Reporting",
    desk: "Report desk",
    characterIndex: 4,
  },
];

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  planning: "Planning",
  researching: "Researching",
  analyzing: "Analyzing",
  verifying: "Verifying",
  writing: "Writing",
  waiting_approval: "Needs approval",
  failed: "Failed",
  completed: "Done",
};

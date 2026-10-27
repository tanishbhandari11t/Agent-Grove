import { nanoid } from "nanoid";
import type {
  AgentRole,
  AgentStatus,
  CreateMissionRequest,
  Mission,
  MissionEvent,
  MissionTask,
} from "@agent-grove/shared";
import { chatCompletion, hasOpenRouterKey } from "./openrouter.js";
import { publish } from "./events.js";
import {
  getMission,
  getOfficeSnapshot,
  resetAgents,
  setActiveMission,
  setAgentStatus,
  upsertMission,
} from "./store.js";

const ROLE_STATUS: Record<AgentRole, AgentStatus> = {
  planner: "planning",
  scout: "researching",
  analyst: "analyzing",
  inspector: "verifying",
  scribe: "writing",
};

const running = new Set<string>();

function now(): string {
  return new Date().toISOString();
}

function event(
  missionId: string,
  eventType: string,
  message: string,
  agentId?: AgentRole,
  payload?: Record<string, unknown>,
): MissionEvent {
  return {
    id: nanoid(),
    missionId,
    agentId,
    eventType,
    message,
    payload,
    createdAt: now(),
  };
}

async function pushMission(mission: Mission): Promise<Mission> {
  const saved = await upsertMission(mission);
  publish({ type: "mission.updated", payload: saved });
  return saved;
}

async function bumpAgent(agentId: AgentRole, status: AgentStatus, task?: string): Promise<void> {
  const agents = await setAgentStatus(agentId, status, task);
  publish({ type: "agents.updated", payload: agents });
  publish({ type: "office.updated", payload: await getOfficeSnapshot() });
}

function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() || text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

function addUsage(
  mission: Mission,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
): void {
  mission.usage = {
    promptTokens: (mission.usage?.promptTokens ?? 0) + usage.promptTokens,
    completionTokens: (mission.usage?.completionTokens ?? 0) + usage.completionTokens,
    totalTokens: (mission.usage?.totalTokens ?? 0) + usage.totalTokens,
  };
}

export async function createMission(input: CreateMissionRequest): Promise<Mission> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Mission prompt is required");

  const title = (input.title?.trim() || prompt.slice(0, 72)).trim();
  const mission: Mission = {
    id: nanoid(),
    title,
    prompt,
    status: "queued",
    createdAt: now(),
    updatedAt: now(),
    tasks: [],
    events: [
      event(
        "temp",
        "mission.created",
        hasOpenRouterKey()
          ? "Mission queued. OpenRouter agents will execute the workflow."
          : "Mission queued in demo mode (no OPENROUTER_API_KEY).",
      ),
    ],
  };
  mission.events[0].missionId = mission.id;

  await upsertMission(mission);
  await setActiveMission(mission.id);
  publish({ type: "mission.created", payload: mission });
  publish({ type: "office.updated", payload: await getOfficeSnapshot() });

  void runMission(mission.id);
  return mission;
}

export async function retryMission(id: string): Promise<Mission> {
  const existing = await getMission(id);
  if (!existing) throw new Error("Mission not found");
  if (running.has(id)) throw new Error("Mission is already running");

  existing.status = "queued";
  existing.error = undefined;
  existing.finishedAt = undefined;
  existing.startedAt = undefined;
  existing.report = undefined;
  existing.usage = undefined;
  existing.tasks = [];
  existing.updatedAt = now();
  existing.events.push(event(id, "mission.retry", "Retry requested by user"));
  await pushMission(existing);
  await setActiveMission(id);
  void runMission(id);
  return existing;
}

async function runMission(missionId: string): Promise<void> {
  if (running.has(missionId)) return;
  running.add(missionId);

  let mission = await getMission(missionId);
  if (!mission) {
    running.delete(missionId);
    return;
  }

  try {
    mission.status = "running";
    mission.startedAt = now();
    mission.updatedAt = now();
    mission.events.push(event(missionId, "mission.started", "Workflow started"));
    await pushMission(mission);

    // 1) Planner
    const planTask = await runRole(mission, "planner", "Create task plan", async () => {
      const result = await chatCompletion([
        {
          role: "system",
          content:
            "You are the Planner agent. Return ONLY JSON: {\"tasks\":[{\"agent\":\"scout|analyst|inspector|scribe\",\"title\":\"...\"}]}. Prefer scout → analyst → inspector → scribe.",
        },
        {
          role: "user",
          content: JSON.stringify({ mission: mission!.title, prompt: mission!.prompt }),
        },
      ]);
      addUsage(mission!, result.usage);
      const parsed = parseJsonLoose(result.content) as {
        tasks?: Array<{ agent?: string; title?: string }>;
      };
      return { text: result.content, parsed };
    });

    const planned = (
      (planTask.parsed as { tasks?: Array<{ agent?: string; title?: string }> })?.tasks ?? [
        { agent: "scout", title: "Gather findings" },
        { agent: "analyst", title: "Analyze and recommend" },
        { agent: "inspector", title: "Verify evidence" },
        { agent: "scribe", title: "Write report" },
      ]
    ).filter((t) => t.agent && t.title);

    // 2) Scout
    const scout = await runRole(mission, "scout", planned[0]?.title || "Research findings", async () => {
      const result = await chatCompletion([
        {
          role: "system",
          content:
            "You are the Scout research agent. Return ONLY JSON: {\"findings\":[{\"name\":\"\",\"summary\":\"\",\"url\":\"\",\"notes\":\"\"}]}. Use plausible public knowledge; mark uncertainty clearly.",
        },
        {
          role: "user",
          content: JSON.stringify({ mission: mission!.title, prompt: mission!.prompt }),
        },
      ]);
      addUsage(mission!, result.usage);
      return { text: result.content, parsed: parseJsonLoose(result.content) };
    });

    // 3) Analyst
    const analysis = await runRole(
      mission,
      "analyst",
      planned[1]?.title || "Compare and recommend",
      async () => {
        const result = await chatCompletion([
          {
            role: "system",
            content:
              "You are the Analyst agent. Return ONLY JSON: {\"comparison\":[{\"name\":\"\",\"score\":0,\"reason\":\"\"}],\"recommendation\":\"\"}.",
          },
          {
            role: "user",
            content: JSON.stringify({
              mission: mission!.title,
              prompt: mission!.prompt,
              findings: scout.parsed,
            }),
          },
        ]);
        addUsage(mission!, result.usage);
        return { text: result.content, parsed: parseJsonLoose(result.content) };
      },
    );

    // 4) Inspector
    const inspection = await runRole(
      mission,
      "inspector",
      planned[2]?.title || "Verify completeness",
      async () => {
        const result = await chatCompletion([
          {
            role: "system",
            content:
              "You are the Inspector agent. Return ONLY JSON: {\"ok\":true,\"issues\":[\"...\"],\"notes\":\"\"}. Flag missing evidence or unsupported claims.",
          },
          {
            role: "user",
            content: JSON.stringify({
              mission: mission!.title,
              findings: scout.parsed,
              analysis: analysis.parsed,
            }),
          },
        ]);
        addUsage(mission!, result.usage);
        return { text: result.content, parsed: parseJsonLoose(result.content) };
      },
    );

    // 5) Scribe
    const reportModel = process.env.OPENROUTER_REPORT_MODEL?.trim() || undefined;
    const report = await runRole(mission, "scribe", planned[3]?.title || "Write final report", async () => {
      const result = await chatCompletion(
        [
          {
            role: "system",
            content:
              "You are the Scribe agent. Write a polished Markdown report using ONLY the supplied evidence. Include Summary, Findings, Recommendation, Risks/Gaps, and Sources. Clearly mark missing information.",
          },
          {
            role: "user",
            content: JSON.stringify({
              mission: mission!.title,
              prompt: mission!.prompt,
              findings: scout.parsed,
              analysis: analysis.parsed,
              inspection: inspection.parsed,
            }),
          },
        ],
        { model: reportModel, temperature: 0.5 },
      );
      addUsage(mission!, result.usage);
      return { text: result.content, parsed: null };
    });

    mission = (await getMission(missionId))!;
    mission.status = "completed";
    mission.finishedAt = now();
    mission.updatedAt = now();
    mission.report = {
      id: nanoid(),
      missionId,
      content: report.text,
      createdAt: now(),
    };
    mission.events.push(event(missionId, "report.completed", "Report ready", "scribe"));
    await pushMission(mission);
    await resetAgents();
    publish({ type: "agents.updated", payload: (await getOfficeSnapshot()).agents });
    publish({ type: "office.updated", payload: await getOfficeSnapshot() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mission failed";
    mission = (await getMission(missionId)) ?? mission;
    mission.status = "failed";
    mission.error = message;
    mission.finishedAt = now();
    mission.updatedAt = now();
    mission.events.push(event(missionId, "mission.failed", message));
    await pushMission(mission);
    await resetAgents();
    publish({ type: "office.updated", payload: await getOfficeSnapshot() });
  } finally {
    running.delete(missionId);
  }
}

async function runRole(
  mission: Mission,
  agentId: AgentRole,
  title: string,
  work: () => Promise<{ text: string; parsed: unknown }>,
): Promise<{ text: string; parsed: unknown }> {
  const task: MissionTask = {
    id: nanoid(),
    missionId: mission.id,
    agentId,
    title,
    status: "running",
    startedAt: now(),
  };
  mission.tasks.push(task);
  mission.updatedAt = now();
  mission.events.push(event(mission.id, "task.started", title, agentId));
  await bumpAgent(agentId, ROLE_STATUS[agentId], title);
  await pushMission(mission);

  // Small pause so the office animation is visible
  await sleep(450);

  try {
    const result = await work();
    task.status = "completed";
    task.result = result.text;
    task.finishedAt = now();
    mission.updatedAt = now();
    mission.events.push(
      event(mission.id, "task.completed", `${agentId} finished: ${title}`, agentId, {
        preview: result.text.slice(0, 280),
      }),
    );
    await bumpAgent(agentId, "completed", title);
    await pushMission(mission);
    await sleep(350);
    await bumpAgent(agentId, "idle");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Task failed";
    task.status = "failed";
    task.result = message;
    task.finishedAt = now();
    mission.events.push(event(mission.id, "task.failed", message, agentId));
    await bumpAgent(agentId, "failed", title);
    await pushMission(mission);
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { z } from "zod";
import { createMission, retryMission } from "./orchestrator.js";
import { subscribe } from "./events.js";
import { getMission, getOfficeSnapshot, listMissions, loadStore } from "./store.js";
import { hasOpenRouterKey } from "./openrouter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(root, ".env") });

const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || (isProd ? "0.0.0.0" : "127.0.0.1");
const CORS_ORIGIN = process.env.CORS_ORIGIN || (isProd ? true : "http://localhost:5173");

const createBody = z.object({
  prompt: z.string().min(8).max(4000),
  title: z.string().min(2).max(120).optional(),
});

async function main() {
  await loadStore();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: CORS_ORIGIN, credentials: true });
  await app.register(websocket);

  app.get("/api/health", async () => ({
    ok: true,
    openRouter: hasOpenRouterKey(),
    mode: hasOpenRouterKey() ? "live" : "demo",
  }));

  app.get("/api/office", async () => getOfficeSnapshot());

  app.get("/api/missions", async () => {
    const missions = await listMissions();
    return { missions };
  });

  app.get<{ Params: { id: string } }>("/api/missions/:id", async (req, reply) => {
    const mission = await getMission(req.params.id);
    if (!mission) return reply.code(404).send({ error: "Mission not found" });
    return { mission };
  });

  app.post("/api/missions", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const mission = await createMission(parsed.data);
    return reply.code(201).send({ mission });
  });

  app.post<{ Params: { id: string } }>("/api/missions/:id/retry", async (req, reply) => {
    try {
      const mission = await retryMission(req.params.id);
      return { mission };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/analytics", async () => {
    const missions = await listMissions();
    const completed = missions.filter((m) => m.status === "completed");
    const failed = missions.filter((m) => m.status === "failed");
    const durations = completed
      .map((m) => {
        if (!m.startedAt || !m.finishedAt) return null;
        return new Date(m.finishedAt).getTime() - new Date(m.startedAt).getTime();
      })
      .filter((n): n is number => n !== null);

    const avgMs =
      durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    const tokens = missions.reduce((sum, m) => sum + (m.usage?.totalTokens ?? 0), 0);

    return {
      total: missions.length,
      completed: completed.length,
      failed: failed.length,
      failureRate: missions.length ? failed.length / missions.length : 0,
      averageDurationMs: avgMs,
      totalTokens: tokens,
    };
  });

  app.register(async (scoped) => {
    scoped.get("/api/ws", { websocket: true }, (socket) => {
      void getOfficeSnapshot().then((office) => {
        socket.send(JSON.stringify({ type: "office.updated", payload: office }));
      });
      void listMissions().then((missions) => {
        socket.send(JSON.stringify({ type: "missions.snapshot", payload: missions.slice(0, 20) }));
      });

      const unsubscribe = subscribe((event) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      });

      socket.on("close", () => unsubscribe());
    });
  });

  // Production: serve the Vite build from the same server (one free Render service)
  const webDist = path.join(root, "apps/web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/api/ws")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Agent Grove API on http://${HOST}:${PORT} (${hasOpenRouterKey() ? "live" : "demo"} mode)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

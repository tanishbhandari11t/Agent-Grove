import type { AgentInfo, AgentRole, AgentStatus, Mission } from "@agent-grove/shared";
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  facingFromDelta,
  frameSource,
  loadImage,
  type Facing,
} from "./sprites";

/** Character draw multiplier vs native 16×32 frame (tuned in-browser). */
const CHAR_SCREEN_MUL = 2.6;
/** Nudge feet into the chair seat when idle/working. */
const SIT_OFFSET_Y = 0;
const SPEED = 110;
const ARRIVE = 6;
const DEBUG_SEATS = false;

export type WorldEntityId = AgentRole | "manager";

interface Point {
  x: number;
  y: number;
}

interface Seat extends Point {
  facing: Facing;
}

interface Entity {
  id: WorldEntityId;
  name: string;
  charIndex: number;
  x: number;
  y: number;
  target: Point | null;
  facing: Facing;
  frame: number;
  frameTimer: number;
  status: AgentStatus | "manager";
  statusLabel: string;
  phase: "idle" | "to_desk" | "working" | "to_manager" | "delivering" | "to_home";
  home: Point;
  desk: Seat;
}

/** Seat feet positions measured in-browser on office-bg.jpg chairs. */
const DESKS: Record<AgentRole, Seat> = {
  planner: { x: 332, y: 222, facing: "up" }, // top-left green chair
  scout: { x: 458, y: 222, facing: "up" }, // top-right green stool
  analyst: { x: 298, y: 350, facing: "right" }, // communal left chair
  inspector: { x: 408, y: 350, facing: "left" }, // communal right chair
  scribe: { x: 352, y: 402, facing: "up" }, // communal bottom chair
};

/** Idle = stay seated at their desk. */
const HOMES: Record<AgentRole, Point> = {
  planner: { x: DESKS.planner.x, y: DESKS.planner.y },
  scout: { x: DESKS.scout.x, y: DESKS.scout.y },
  analyst: { x: DESKS.analyst.x, y: DESKS.analyst.y },
  inspector: { x: DESKS.inspector.x, y: DESKS.inspector.y },
  scribe: { x: DESKS.scribe.x, y: DESKS.scribe.y },
};

const BUSY: AgentStatus[] = [
  "planning",
  "researching",
  "analyzing",
  "verifying",
  "writing",
  "waiting_approval",
];

function statusBubble(status: AgentStatus): string {
  if (BUSY.includes(status)) return "Working";
  if (status === "completed") return "Done";
  if (status === "failed") return "Failed";
  if (status === "waiting_approval") return "Waiting";
  return "Idle";
}

export class OfficeWorld {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private officeImg: HTMLImageElement | null = null;
  private chars: HTMLImageElement[] = [];
  private entities = new Map<WorldEntityId, Entity>();
  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private mission: Mission | null = null;
  private lastMissionStatus: string | null = null;
  private deliveredMissionId: string | null = null;
  private onDeliver: ((mission: Mission) => void) | null = null;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.boundKeyDown = (e) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) {
        this.keys.clear();
        return;
      }
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        this.keys.add(k);
      }
    };
    this.boundKeyUp = (e) => {
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) {
        this.keys.clear();
        return;
      }
      this.keys.delete(e.key.toLowerCase());
    };
  }

  async init(): Promise<void> {
    this.officeImg = await loadImage("/assets/office-bg.jpg");
    this.chars = await Promise.all([
      loadImage("/assets/characters/char_0.png"),
      loadImage("/assets/characters/char_1.png"),
      loadImage("/assets/characters/char_2.png"),
      loadImage("/assets/characters/char_3.png"),
      loadImage("/assets/characters/char_4.png"),
      loadImage("/assets/characters/char_5.png"),
    ]);

    for (const role of Object.keys(HOMES) as AgentRole[]) {
      const home = HOMES[role];
      const desk = DESKS[role];
      this.entities.set(role, {
        id: role,
        name: role[0]!.toUpperCase() + role.slice(1),
        charIndex: ["planner", "scout", "analyst", "inspector", "scribe"].indexOf(role),
        x: home.x,
        y: home.y,
        target: null,
        facing: desk.facing,
        frame: 0,
        frameTimer: 0,
        status: "idle",
        statusLabel: "Idle",
        phase: "idle",
        home,
        desk,
      });
    }

    this.entities.set("manager", {
      id: "manager",
      name: "Manager",
      charIndex: 5,
      x: 700,
      y: 400,
      target: null,
      facing: "left",
      frame: 0,
      frameTimer: 0,
      status: "manager",
      statusLabel: "You",
      phase: "idle",
      home: { x: 700, y: 400 },
      desk: { x: 700, y: 400, facing: "left" },
    });

    this.resize();
  }

  setDeliveryHandler(handler: (mission: Mission) => void): void {
    this.onDeliver = handler;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    this.last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  syncAgents(agents: AgentInfo[], mission: Mission | null): void {
    this.mission = mission;

    if (mission && (mission.status === "running" || mission.status === "queued")) {
      if (this.deliveredMissionId === mission.id) {
        /* still the same active run */
      } else if (mission.status === "queued" || mission.status === "running") {
        // new run — allow a future delivery for this id
        if (this.deliveredMissionId && this.deliveredMissionId !== mission.id) {
          this.deliveredMissionId = null;
        }
      }
    }

    for (const agent of agents) {
      const ent = this.entities.get(agent.id);
      if (!ent) continue;
      ent.status = agent.status;
      ent.name = agent.name;

      // Delivery walk owns this agent until it returns home
      if (ent.phase === "to_manager" || ent.phase === "delivering") {
        ent.statusLabel = ent.phase === "delivering" ? "Report!" : "Delivering";
        continue;
      }

      ent.statusLabel = statusBubble(agent.status);

      if (BUSY.includes(agent.status)) {
        if (ent.phase !== "to_desk" && ent.phase !== "working") {
          const dist = Math.hypot(ent.x - ent.desk.x, ent.y - ent.desk.y);
          if (dist <= ARRIVE) {
            ent.x = ent.desk.x;
            ent.y = ent.desk.y;
            ent.phase = "working";
            ent.facing = ent.desk.facing;
            ent.target = null;
          } else {
            ent.phase = "to_desk";
            ent.target = { x: ent.desk.x, y: ent.desk.y };
          }
        }
      } else if (agent.status === "failed") {
        if (ent.phase !== "to_home" && ent.phase !== "idle") {
          ent.phase = "to_home";
          ent.target = { x: ent.home.x, y: ent.home.y };
        }
      } else if (agent.status === "idle") {
        if (ent.phase === "working" || ent.phase === "to_desk") {
          ent.phase = "to_home";
          ent.target = { x: ent.home.x, y: ent.home.y };
        } else if (ent.phase === "idle" && !ent.target) {
          ent.x = ent.desk.x;
          ent.y = ent.desk.y;
          ent.facing = ent.desk.facing;
        }
      }
    }

    // Only walk-deliver when a live run finishes (running/queued → completed).
    const wasInProgress =
      this.lastMissionStatus === "running" || this.lastMissionStatus === "queued";
    const becameComplete =
      wasInProgress &&
      mission?.status === "completed" &&
      !!mission.report &&
      this.deliveredMissionId !== mission.id;

    if (becameComplete && mission) {
      this.deliveredMissionId = mission.id;
      const scribe = this.entities.get("scribe");
      if (scribe) {
        scribe.phase = "to_manager";
        scribe.statusLabel = "Delivering";
        const manager = this.entities.get("manager")!;
        scribe.target = { x: manager.x, y: manager.y - 40 };
      }
    } else if (mission?.status === "completed" && mission.report) {
      this.deliveredMissionId = mission.id;
    }

    this.lastMissionStatus = mission?.status ?? this.lastMissionStatus;
  }

  private update(dt: number): void {
    this.updateManager(dt);
    for (const ent of this.entities.values()) {
      if (ent.id === "manager") continue;
      this.updateAgent(ent, dt);
    }
  }

  private updateManager(dt: number): void {
    const m = this.entities.get("manager");
    if (!m || !this.officeImg) return;

    if (isTypingTarget(document.activeElement)) {
      this.keys.clear();
      m.frame = 0;
      m.frameTimer = 0;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      m.facing = facingFromDelta(dx, dy);
      m.x += dx * SPEED * dt;
      m.y += dy * SPEED * dt;
      m.x = clamp(m.x, 40, this.officeImg.width - 40);
      m.y = clamp(m.y, 80, this.officeImg.height - 20);
      m.frameTimer += dt;
      if (m.frameTimer > 0.14) {
        m.frameTimer = 0;
        m.frame = (m.frame + 1) % 4;
      }
    } else {
      m.frame = 0;
      m.frameTimer = 0;
    }

    // Keep delivery target tracking the manager a bit
    const scribe = this.entities.get("scribe");
    if (scribe?.phase === "to_manager") {
      scribe.target = { x: m.x, y: m.y - 36 };
    }
  }

  private updateAgent(ent: Entity, dt: number): void {
    if (ent.phase === "working") {
      ent.facing = ent.desk.facing;
      ent.frameTimer += dt;
      if (ent.frameTimer > 0.28) {
        ent.frameTimer = 0;
        ent.frame = ent.frame === 0 ? 1 : 0;
      }
      return;
    }

    if (!ent.target) {
      // Sit facing their desk while idle at seat
      if (ent.phase === "idle") {
        ent.facing = ent.desk.facing;
      }
      ent.frame = 0;
      return;
    }

    const dx = ent.target.x - ent.x;
    const dy = ent.target.y - ent.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE) {
      ent.x = ent.target.x;
      ent.y = ent.target.y;
      ent.target = null;
      ent.frame = 0;
      this.onArrive(ent);
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    ent.facing = facingFromDelta(nx, ny);
    ent.x += nx * SPEED * dt;
    ent.y += ny * SPEED * dt;
    ent.frameTimer += dt;
    if (ent.frameTimer > 0.14) {
      ent.frameTimer = 0;
      ent.frame = (ent.frame + 1) % 4;
    }
  }

  private onArrive(ent: Entity): void {
    if (ent.phase === "to_desk") {
      ent.phase = "working";
      ent.facing = ent.desk.facing;
      return;
    }
    if (ent.phase === "to_home") {
      ent.phase = "idle";
      ent.facing = ent.desk.facing;
      ent.statusLabel = statusBubble(ent.status === "manager" ? "idle" : (ent.status as AgentStatus));
      return;
    }
    if (ent.phase === "to_manager") {
      ent.phase = "delivering";
      ent.statusLabel = "Report!";
      if (this.mission && this.onDeliver) this.onDeliver(this.mission);
      window.setTimeout(() => {
        if (!this.running) return;
        const current = this.entities.get(ent.id);
        if (!current || current.phase !== "delivering") return;
        current.phase = "to_home";
        current.statusLabel = "Idle";
        current.target = { x: current.home.x, y: current.home.y };
      }, 1200);
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    ctx.fillStyle = "#070d0a";
    ctx.fillRect(0, 0, cssW, cssH);

    if (!this.officeImg) return;

    // Fit the whole office on screen (no crop), letterbox if needed
    const img = this.officeImg;
    const scale = Math.min(cssW / img.width, cssH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const ox = (cssW - drawW) / 2;
    const oy = (cssH - drawH) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, ox, oy, drawW, drawH);

    const toScreen = (x: number, y: number) => ({
      x: ox + x * scale,
      y: oy + y * scale,
    });

    if (DEBUG_SEATS) {
      for (const seat of Object.values(DESKS)) {
        const p = toScreen(seat.x, seat.y + SIT_OFFSET_Y);
        ctx.fillStyle = "rgba(255, 40, 40, 0.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const sorted = [...this.entities.values()].sort((a, b) => a.y - b.y);
    for (const ent of sorted) {
      const sheet = this.chars[ent.charIndex];
      if (!sheet) continue;
      const { sx, sy, flip } = frameSource(ent.facing, ent.frame);
      const seated =
        ent.id !== "manager" &&
        (ent.phase === "idle" || ent.phase === "working") &&
        !ent.target;
      const drawY = ent.y + (seated ? SIT_OFFSET_Y : 0);
      const p = toScreen(ent.x, drawY);
      const w = CHAR_FRAME_W * scale * CHAR_SCREEN_MUL;
      const h = CHAR_FRAME_H * scale * CHAR_SCREEN_MUL;

      ctx.save();
      if (flip) {
        ctx.translate(p.x, p.y - h);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, sx, sy, CHAR_FRAME_W, CHAR_FRAME_H, -w / 2, 0, w, h);
      } else {
        ctx.drawImage(sheet, sx, sy, CHAR_FRAME_W, CHAR_FRAME_H, p.x - w / 2, p.y - h, w, h);
      }
      ctx.restore();

      // Compact status above head only (no giant name plate clutter)
      this.drawBubble(ctx, p.x, p.y - h - 4, ent.statusLabel, ent.id === "manager");
      const nameSize = Math.max(9, 10 * scale * 0.45);
      ctx.font = `600 ${nameSize}px Outfit, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillText(ent.name, p.x + 1, p.y + 11);
      ctx.fillStyle = "#f2faf4";
      ctx.fillText(ent.name, p.x, p.y + 10);
    }

    // Hint
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(16, cssH - 42, 220, 26);
    ctx.fillStyle = "#d7ebe0";
    ctx.font = "500 12px Outfit, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("WASD / arrows — move Manager", 26, cssH - 24);
  }

  private drawBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    manager: boolean,
  ): void {
    ctx.font = "600 9px IBM Plex Mono, monospace";
    const padX = 6;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2;
    const bh = 15;
    const bx = x - bw / 2;
    const by = y - bh;

    ctx.fillStyle = manager ? "rgba(61, 207, 122, 0.92)" : "rgba(8, 14, 10, 0.88)";
    ctx.strokeStyle = manager ? "rgba(6, 40, 22, 0.8)" : "rgba(140, 190, 150, 0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    // tiny tail
    ctx.beginPath();
    ctx.moveTo(x - 4, by + bh);
    ctx.lineTo(x, by + bh + 5);
    ctx.lineTo(x + 4, by + bh);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = manager ? "#062012" : "#e8f3ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, by + bh / 2 + 0.5);
    ctx.textBaseline = "alphabetic";
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

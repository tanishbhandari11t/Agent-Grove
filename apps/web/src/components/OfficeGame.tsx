import { useEffect, useRef } from "react";
import type { AgentInfo, Mission } from "@agent-grove/shared";
import { OfficeWorld } from "../office/world";

interface Props {
  agents: AgentInfo[];
  mission: Mission | null;
  onReportDelivered: (mission: Mission) => void;
}

export function OfficeGame({ agents, mission, onReportDelivered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<OfficeWorld | null>(null);
  const deliverRef = useRef(onReportDelivered);
  const agentsRef = useRef(agents);
  const missionRef = useRef(mission);
  deliverRef.current = onReportDelivered;
  agentsRef.current = agents;
  missionRef.current = mission;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const world = new OfficeWorld(canvas);
    worldRef.current = world;

    void world.init().then(() => {
      if (cancelled) return;
      world.setDeliveryHandler((m) => deliverRef.current(m));
      world.start();
      world.syncAgents(agentsRef.current, missionRef.current);
    });

    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      world.stop();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    worldRef.current?.syncAgents(agents, mission);
  }, [agents, mission]);

  return <canvas ref={canvasRef} className="office-canvas" tabIndex={0} aria-label="Agent Grove office" />;
}

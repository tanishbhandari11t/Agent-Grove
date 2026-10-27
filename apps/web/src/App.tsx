import { useState } from "react";
import type { Mission } from "@agent-grove/shared";
import { OfficeGame } from "./components/OfficeGame";
import { MissionDock } from "./components/MissionDock";
import { useLiveStore } from "./useLiveStore";

export default function App() {
  const store = useLiveStore();
  const [delivered, setDelivered] = useState<Mission | null>(null);

  return (
    <div className="grove-root">
      <OfficeGame
        agents={store.agents}
        mission={store.selected}
        onReportDelivered={(mission) => setDelivered(mission)}
      />

      <MissionDock
        mode={store.mode}
        connected={store.connected}
        busy={store.busy}
        missions={store.missions}
        selected={store.selected}
        deliveredReport={delivered}
        onCloseReport={() => setDelivered(null)}
        onSubmit={store.submitMission}
        onSelect={(id) => void store.selectMission(id)}
        onRetry={store.retrySelected}
      />

      {store.error ? <div className="error-banner floating">{store.error}</div> : null}
    </div>
  );
}

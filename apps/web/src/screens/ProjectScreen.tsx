import { useState } from "react";
import { ControlPlane } from "../components/ControlPlane";
import { Rail } from "../components/Rail";
import { SpecPlane } from "../components/SpecPlane";

type Plane = "control" | "spec";

interface ProjectScreenProps {
  name: string;
  onHome: () => void;
}

export function ProjectScreen({ name, onHome }: ProjectScreenProps) {
  const [plane, setPlane] = useState<Plane>("control");

  return (
    <div className="screen">
      <Rail projectName={name} onHome={onHome} />

      <nav className="planes" aria-label="Planes">
        {(["control", "spec"] as const).map((which) => (
          <button
            key={which}
            className={
              plane === which ? "planes__tab planes__tab--active" : "planes__tab"
            }
            type="button"
            onClick={() => setPlane(which)}
          >
            <span className="planes__marker" />
            {which === "control" ? "Control plane" : "Spec plane"}
          </button>
        ))}
      </nav>

      {plane === "control" ? <ControlPlane /> : <SpecPlane />}
    </div>
  );
}

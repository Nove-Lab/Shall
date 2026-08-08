interface ProjectScreenProps {
  name: string;
  onHome: () => void;
}

export function ProjectScreen({ name, onHome }: ProjectScreenProps) {
  return (
    <main className="shell project-screen">
      <button className="text-button back-button" type="button" onClick={onHome}>
        ← Recent projects
      </button>
      <h1>{name}</h1>
    </main>
  );
}

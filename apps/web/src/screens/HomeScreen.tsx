interface RecentProject {
  id: string;
  path: string;
  name: string;
  exists: boolean;
}

interface HomeScreenProps {
  projects: RecentProject[];
  loading: boolean;
  onOpenPicker: () => void;
  onOpenProject: (path: string) => void;
  onRemoveProject: (id: string) => void;
}

export function HomeScreen({
  projects,
  loading,
  onOpenPicker,
  onOpenProject,
  onRemoveProject,
}: HomeScreenProps) {
  return (
    <main className="shell">
      <header className="home-header">
        <h1 className="wordmark">Shall</h1>
        <button className="primary-button" type="button" onClick={onOpenPicker}>
          Open Project
        </button>
      </header>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent projects</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="empty-state">
            No projects yet — open a folder to get started
          </p>
        ) : (
          <ul className="project-list">
            {projects.map((project) => (
              <li
                className={`project-row${project.exists ? "" : " is-missing"}`}
                key={project.id}
              >
                <button
                  className="project-link"
                  type="button"
                  disabled={!project.exists}
                  onClick={() => onOpenProject(project.path)}
                >
                  <strong>{project.name}</strong>
                  <span>{project.path}</span>
                  {!project.exists && <small>Folder not found</small>}
                </button>
                {!project.exists && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => onRemoveProject(project.id)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

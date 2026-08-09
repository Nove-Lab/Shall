interface RailProps {
  projectName: string;
  onHome: () => void;
}

export function Rail({ projectName, onHome }: RailProps) {
  return (
    <header className="rail">
      <div className="rail__group">
        <button className="rail__brand" type="button" onClick={onHome}>
          <span className="rail__mark" />
          <span className="rail__wordmark">shall</span>
        </button>
        <span className="rail__divider" />
        <button className="rail__switcher" type="button" onClick={onHome}>
          <span className="rail__switcher-name">{projectName}</span>
          <span className="rail__switcher-hint">projects</span>
        </button>
      </div>
    </header>
  );
}

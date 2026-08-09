const PANELS = [
  { id: "s1", numeral: "1.", title: "Review Queue" },
  { id: "s2", numeral: "2.", title: "Task Board" },
  { id: "s3", numeral: "3.", title: "Activity Feed" },
  { id: "s4", numeral: "4.", title: "Shall Vitals" },
] as const;

export function ControlPlane() {
  return (
    <div className="control">
      <div className="control__toolbar">
        <div className="control__mode" aria-label="Control plane mode">
          <span className="control__mode-item control__mode-item--active">
            Highlight
          </span>
          <span className="control__mode-item control__mode-item--disabled">
            Full detail
          </span>
        </div>
        <span className="control__toolbar-copy">
          four surfaces, summarised — open any panel for the full record
        </span>
        <span className="control__toolbar-spacer" />
        <span className="control__annunciator">
          ⟳ every count below is computed, not stored
        </span>
      </div>

      <main className="control__grid">
        {PANELS.map((panel) => (
          <section className="panel" id={panel.id} key={panel.id}>
            <header className="panel__head">
              <span className="panel__numeral">{panel.numeral}</span>
              <h2 className="panel__title">{panel.title}</h2>
            </header>
            <div className="panel__body" />
          </section>
        ))}
      </main>
    </div>
  );
}

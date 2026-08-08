import { useEffect, useState } from "react";
import {
  browse,
  makeDirectory,
  type BrowseResult,
} from "../api";

interface ProjectPickerProps {
  busy: boolean;
  actionError: string | null;
  onCancel: () => void;
  onChoose: (path: string, hasShall: boolean) => void;
}

export function ProjectPicker({
  busy,
  actionError,
  onCancel,
  onChoose,
}: ProjectPickerProps) {
  const [location, setLocation] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  async function load(path?: string) {
    setError(null);
    try {
      setLocation(await browse(path));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not browse folder",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createFolder() {
    if (!location || !folderName.trim()) {
      return;
    }
    setError(null);
    try {
      const newPath = await makeDirectory(location.path, folderName);
      setFolderName("");
      setCreatingFolder(false);
      await load(newPath);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create folder",
      );
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="picker-title"
        aria-modal="true"
        className="picker"
        role="dialog"
      >
        <header className="picker-header">
          <div>
            <h2 id="picker-title">Open Project</h2>
            <p className="path-label">{location?.path || "Loading…"}</p>
          </div>
          <button className="text-button" type="button" onClick={onCancel}>
            Close
          </button>
        </header>

        <div className="picker-toolbar">
          <button
            className="secondary-button"
            type="button"
            disabled={!location?.parent || busy}
            onClick={() => void load(location?.parent ?? undefined)}
          >
            Up
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => setCreatingFolder(true)}
          >
            New Folder
          </button>
        </div>

        {creatingFolder && (
          <form
            className="new-folder-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createFolder();
            }}
          >
            <input
              autoFocus
              aria-label="New folder name"
              placeholder="Folder name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
            />
            <button className="secondary-button" type="submit">
              Create
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setCreatingFolder(false)}
            >
              Cancel
            </button>
          </form>
        )}

        <div className="directory-list">
          {location?.directories.map((directory) => (
            <button
              className="directory-row"
              key={directory.path}
              type="button"
              disabled={busy}
              onClick={() => void load(directory.path)}
            >
              <span>{directory.name}</span>
              {directory.hasShall && <small>Shall project</small>}
            </button>
          ))}
          {location && location.directories.length === 0 && (
            <p className="muted">No folders here</p>
          )}
        </div>

        {(error || actionError) && (
          <p className="error-message">{error || actionError}</p>
        )}

        <footer className="picker-footer">
          <button
            className="primary-button"
            type="button"
            disabled={!location || busy}
            onClick={() =>
              location && onChoose(location.path, location.hasShall)
            }
          >
            {busy ? "Opening…" : "Select This Folder"}
          </button>
        </footer>
      </section>
    </div>
  );
}

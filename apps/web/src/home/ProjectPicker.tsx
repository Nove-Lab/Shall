import { useEffect, useState } from "react";
import { ChevronUp, Folder, FolderPlus } from "lucide-react";
import { browse, makeDirectory, type BrowseResult } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/EmptyState";

interface ProjectPickerProps {
  open: boolean;
  busy: boolean;
  actionError: string | null;
  onOpenChange: (open: boolean) => void;
  /** `isProject` decides whether the folder is opened or initialized. */
  onChoose: (path: string, isProject: boolean) => void;
}

export function ProjectPicker({
  open,
  busy,
  actionError,
  onOpenChange,
  onChoose,
}: ProjectPickerProps) {
  const [location, setLocation] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const isShallRoot = location?.shall === "root";

  async function load(path?: string) {
    setError(null);
    try {
      setLocation(await browse(path));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not browse folder",
      );
    }
  }

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open Project</DialogTitle>
          <DialogDescription className="truncate font-mono">
            {location?.path ?? "Loading…"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!location?.parent || busy}
            onClick={() => void load(location?.parent ?? undefined)}
          >
            <ChevronUp />
            Up
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setCreatingFolder(true)}
          >
            <FolderPlus />
            New Folder
          </Button>
        </div>

        {creatingFolder ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createFolder();
            }}
          >
            <Input
              autoFocus
              aria-label="New folder name"
              placeholder="Folder name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
            />
            <Button type="submit" variant="outline" size="sm">
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCreatingFolder(false)}
            >
              Cancel
            </Button>
          </form>
        ) : null}

        <ScrollArea className="h-64 rounded-md border">
          {location && location.directories.length === 0 ? (
            <EmptyState message="No folders here" />
          ) : (
            <ul className="p-1">
              {location?.directories.map((directory) => (
                <li key={directory.path}>
                  <button
                    type="button"
                    disabled={busy}
                    className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50"
                    onClick={() => void load(directory.path)}
                  >
                    <Folder className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {directory.name}
                    </span>
                    {directory.shall === "project" ? (
                      <Badge variant="secondary">Shall project</Badge>
                    ) : directory.shall === "root" ? (
                      <Badge variant="outline">Shall root</Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {error || actionError ? (
          <p className="text-destructive text-sm">{error || actionError}</p>
        ) : isShallRoot ? (
          <p className="text-muted-foreground text-sm">
            Shall's own <span className="font-mono">.shall</span> home, not a
            project. Pick another folder.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={!location || busy || isShallRoot}
            onClick={() =>
              location
                ? onChoose(location.path, location.shall === "project")
                : undefined
            }
          >
            {busy ? "Opening…" : "Select This Folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

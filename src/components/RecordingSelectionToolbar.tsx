import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { deleteRecording, type RecordingRow } from "../lib/api";
import { recordingDisplayName } from "./RecordingActionsMenu";
import Dialog from "./a11y/Dialog";
import { useToasts } from "./ToastProvider";

type Props = {
  /** All recordings matching the current filter/search, including older rows. */
  recordings: RecordingRow[];
  /** null means normal browsing; an empty set means selection mode. */
  selection: Set<string> | null;
  onChange: (selection: Set<string> | null) => void;
  onDeleted: (ids: Set<string>) => void;
};

export default function RecordingSelectionToolbar({ recordings, selection, onChange, onDeleted }: Props) {
  const { t } = useTranslation("main");
  const { push } = useToasts();
  const [targets, setTargets] = useState<RecordingRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const selected = recordings.filter((row) => selection?.has(row.id));
  const allSelected = recordings.length > 0 && selected.length === recordings.length;
  const buttonClass = "rounded-md border border-line px-3 py-1.5 text-xs text-fg hover:bg-elevated disabled:opacity-50";

  const deleteSelected = async () => {
    if (!targets || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    const deleted = new Set<string>();
    const failures: string[] = [];
    // Reuse native deletion: missing media files do not prevent DB cleanup.
    // Process sequentially so a large library does not flood native IPC.
    for (const row of targets) {
      try {
        await deleteRecording(row.id);
        deleted.add(row.id);
      } catch (error) {
        failures.push(`${recordingDisplayName(row)}: ${String(error)}`);
      }
    }
    onChange(failures.length ? new Set(targets.filter((row) => !deleted.has(row.id)).map((row) => row.id)) : null);
    setTargets(null);
    setDeleting(false);
    deletingRef.current = false;
    if (deleted.size) {
      onDeleted(deleted);
      push({ tone: "success", message: t("recordings.selection.deleted", { count: deleted.size }) });
    }
    if (failures.length) {
      push({
        tone: "error", durationMs: 15_000,
        message: t("recordings.selection.failed", { count: failures.length, error: failures[0] }),
      });
    }
  };

  if (selection === null) {
    return recordings.length ? (
      <div className="flex justify-end pb-3">
        <button type="button" className={buttonClass} onClick={() => onChange(new Set())}>
          {t("recordings.selection.start")}
        </button>
      </div>
    ) : null;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
        <button type="button" className={buttonClass} disabled={deleting || !recordings.length}
          onClick={() => onChange(allSelected ? new Set() : new Set(recordings.map((row) => row.id)))}>
          {t(allSelected ? "recordings.selection.deselectAll" : "recordings.selection.selectAll")}
        </button>
        <span role="status" className="mr-auto text-xs tabular-nums text-muted">
          {t("recordings.selection.count", { count: selected.length })}
        </span>
        <button type="button" disabled={deleting || !selected.length} onClick={() => setTargets(selected)}
          className="flex items-center gap-1.5 rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50">
          <Trash2 size={13} aria-hidden="true" /> {t("recordings.selection.delete")}
        </button>
        <button type="button" className={buttonClass} disabled={deleting} onClick={() => onChange(null)}>
          {t("recordings.selection.done")}
        </button>
      </div>
      {targets ? (
        <Dialog alert label={t("recordings.selection.confirmTitle", { count: targets.length })}
          dismissible={!deleting} onClose={() => setTargets(null)}
          panelClassName="w-full max-w-md rounded-xl border border-line bg-canvas p-5 shadow-xl">
          <h2 className="text-sm font-semibold">{t("recordings.selection.confirmTitle", { count: targets.length })}</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t("recordings.selection.confirmMessage")}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonClass} disabled={deleting} onClick={() => setTargets(null)}>
              {t("recordings.selection.cancel")}
            </button>
            <button type="button" disabled={deleting} onClick={() => void deleteSelected()}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {t(deleting ? "recordings.selection.deleting" : "recordings.selection.confirmDelete")}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

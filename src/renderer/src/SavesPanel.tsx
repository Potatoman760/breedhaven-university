import { useEffect, useState } from "react";
import { formatDate, toDate } from "../../shared/game";
import type { ContentPack } from "../../shared/model";
import {
  AUTO_SLOT_ID,
  SAVE_NAME_CHARS,
  SLOT_PAGES,
  latestSave,
  pageOf,
  saveLabel,
  slotLabel,
  type SaveData,
  type SaveSummary,
  type SlotId,
} from "../../shared/saves";
import { errorMessage } from "./errors";
import { useConfirm } from "./ui/Confirm";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

export function describeSave(content: ContentPack, save: SaveSummary): string {
  if (save.unreadable) return "Incompatible save";
  const date = toDate(content.calendar, save.time);
  return (
    `${save.playerName} · Day ${date.dayIndex + 1} · ${formatDate(date)}` +
    (save.inScene ? " · mid-scene" : "")
  );
}

interface Props {
  content: ContentPack;
  /** In save mode, the game to write. The autosave is shown and cannot be written to: it is the game's own. */
  mode: "save" | "load";
  current?: SaveData;
  onLoad: (data: SaveData) => void;
  onClose: () => void;
}

// The page the slots were last left on, for as long as the game is open: the next time they are opened, they open there.
let lastPage: number | undefined;

export function SavesPanel({ content, mode, current, onLoad, onClose }: Props) {
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [notice, setNotice] = useState("");
  // The names as they are being typed, by slot: one for an empty slot is what the save made there will be called.
  const [names, setNames] = useState<Partial<Record<SlotId, string>>>({});

  // Which page of the slots is showing. It opens where it was last left, or the first time on the page of the save he
  // made last, where he is likeliest to be going.
  const [page, setShownPage] = useState(lastPage ?? 0);
  const setPage = (next: number) => {
    lastPage = next;
    setShownPage(next);
  };

  const refresh = () => window.api.listSaves().then(setSaves);
  useEffect(() => {
    window.api.listSaves().then((listed) => {
      setSaves(listed);
      const latest = latestSave(
        listed.filter((save) => save.slotId !== AUTO_SLOT_ID),
      );
      if (latest && lastPage === undefined) setPage(pageOf(latest.slotId));
    });
  }, []);

  // Overwriting and deleting are asked about first, in the game's own dialog.
  const { ask, dialog } = useConfirm();

  if (!saves) return null;

  async function run(action: () => Promise<void>) {
    try {
      setNotice("");
      await action();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const summaryOf = (slotId: SlotId) => saves.find((s) => s.slotId === slotId);
  /** The name a slot is shown with: what is being typed, or failing that what its save is called. */
  const nameOf = (slotId: SlotId): string => {
    const summary = summaryOf(slotId);
    return (
      names[slotId] ??
      (summary && !summary.unreadable ? (summary.name ?? "") : "")
    );
  };

  const save = (slotId: SlotId, occupied: boolean) =>
    run(async () => {
      if (!current) return;
      if (
        occupied &&
        !(await ask({
          title: `Overwrite ${saveLabel(slotId, summaryOf(slotId))}?`,
          detail: "The game saved there is replaced by this one.",
          confirm: "Overwrite",
        }))
      )
        return;
      // Whatever is in the name box goes with it: typed afresh, or the name the slot already had.
      const saved = await window.api.saveGame({
        slotId,
        name: nameOf(slotId),
        ...current,
      });
      setNames(({ [slotId]: _typed, ...rest }) => rest);
      await refresh();
      setNotice(`Saved to ${saveLabel(slotId, saved)}.`);
    });

  /** Keeps a name typed for a save that is already there. For an empty slot it waits for the save. */
  const rename = (slotId: SlotId) =>
    run(async () => {
      const summary = summaryOf(slotId);
      const typed = names[slotId];
      if (typed === undefined || !summary || summary.unreadable) return;
      if (typed.trim() !== (summary.name ?? ""))
        await window.api.renameSave({ slotId, name: typed });
      setNames(({ [slotId]: _typed, ...rest }) => rest);
      await refresh();
    });

  const load = (slotId: SlotId) =>
    run(async () => onLoad(await window.api.loadGame(slotId)));

  const remove = (slotId: SlotId) =>
    run(async () => {
      if (
        !(await ask({
          title: `Delete ${saveLabel(slotId, summaryOf(slotId))}?`,
          detail: "This cannot be undone.",
          confirm: "Delete",
          grave: true,
        }))
      )
        return;
      await window.api.deleteSave(slotId);
      setNames(({ [slotId]: _typed, ...rest }) => rest);
      await refresh();
    });

  return (
    <Dialog title={mode === "save" ? "Save game" : "Load game"} onClose={onClose} ornate className="saves-dialog">
      <div className="saves">
        {[AUTO_SLOT_ID, ...SLOT_PAGES[page]].map((slotId) => {
          const summary = saves.find((s) => s.slotId === slotId);
          const auto = slotId === AUTO_SLOT_ID;
          return (
            <div key={slotId} className={auto ? "slot auto" : "slot"}>
              <div>
                {/* A save can be given a name of its own, and called something else at any time. The autosave is the game's, and keeps its own. */}
                {slotId === AUTO_SLOT_ID ||
                summary?.unreadable ||
                (mode === "load" && !summary) ? (
                  <strong>{slotLabel(slotId)}</strong>
                ) : (
                  <input
                    className="slot-name"
                    value={nameOf(slotId)}
                    maxLength={SAVE_NAME_CHARS}
                    placeholder={slotLabel(slotId)}
                    aria-label={`Name of ${slotLabel(slotId)}`}
                    onChange={(e) =>
                      setNames({ ...names, [slotId]: e.target.value })
                    }
                    onBlur={() => rename(slotId)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && e.currentTarget.blur()
                    }
                  />
                )}
                <span>
                  {summary ? describeSave(content, summary) : "Empty"}
                </span>
                {summary && (
                  <span>
                    Saved {new Date(summary.savedAt).toLocaleString()}
                  </span>
                )}
              </div>
              {mode === "save" ? (
                auto ? (
                  // The game writes this one itself, as he plays: it is not his to save over.
                  <span className="hint slot-auto-note">Saved as you play</span>
                ) : (
                  <Button variant="primary" size="small" onClick={() => save(slotId, summary !== undefined)}>
                    Save here
                  </Button>
                )
              ) : (
                <Button
                  variant="primary"
                  size="small"
                  disabled={!summary || summary.unreadable}
                  onClick={() => load(slotId)}
                >
                  Load
                </Button>
              )}
              {!(auto && mode === "save") && (
                <Button
                  size="small"
                  disabled={!summary}
                  onClick={() => remove(slotId)}
                >
                  Delete
                </Button>
              )}
            </div>
          );
        })}
        <div
          className="slot-pages"
          role="tablist"
          aria-label="Pages of save slots"
        >
          <Button
            size="small"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </Button>
          {SLOT_PAGES.map((slots, i) => (
            <Button
              key={i}
              role="tab"
              aria-selected={i === page}
              variant={i === page ? "primary" : "secondary"}
              size="small"
              className="slot-page"
              title={`Slots ${i * slots.length + 1} to ${i * slots.length + slots.length}`}
              onClick={() => setPage(i)}
            >
              {i + 1}
              {/* A dot on a page that has a save on it, so that he need not hunt for them. */}
              {slots.some((slotId) => summaryOf(slotId)) && <i aria-hidden />}
            </Button>
          ))}
          <Button
            size="small"
            disabled={page === SLOT_PAGES.length - 1}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            ›
          </Button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </div>
      {dialog}
    </Dialog>
  );
}

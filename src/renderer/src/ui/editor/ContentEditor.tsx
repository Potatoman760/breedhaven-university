import { Button } from "../Button";
import { useEffect, useState, type ReactNode } from "react";
import {
  isSafeId,
  slugify,
  type EditorInfo,
  type EditorResult,
} from "../../../../shared/editor";
import {
  LIGHTS,
  kindOf,
  LOVE_INTEREST_KINDS,
  LoveInterestSchema,
  DEFAULT_IMAGE_SEED,
  STANDARD_OUTFITS,
  STATS,
  type ContentPack,
  type LoveInterest,
  type Studies,
} from "../../../../shared/model";
import { errorMessage } from "../../errors";
import { describeShift } from "../../../../shared/game";
import { Portrait } from "../MapPanel";
import { EditorFoot, PickList, Group, List, Text, LlmMark } from "./fields";
import { ArtTool } from "../art/ArtTool";
import { NewCharacterDialog } from "./NewCharacterDialog";
import { CatalogueEditor } from "./CatalogueEditor";
import { EventsEditor } from "./EventsEditor";
import { LocationEditor } from "./LocationEditor";
import { PlayerEditor } from "./PlayerEditor";
import { ScheduleTab } from "./ScheduleTab";
import { SpritesTab } from "./SpritesTab";
import { TraitsTab } from "./TraitsTab";

interface Props {
  content: ContentPack;
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void;
  onClose: () => void;
}

const TABS = ["Profile", "Traits", "Sprites", "Academics"] as const;
type Tab = (typeof TABS)[number];

/** A character with nothing filled in, valid enough to be edited. */
function blank(): LoveInterest {
  return LoveInterestSchema.parse({
    id: "",
    name: "",
    age: 18,
    pronouns: "she/her",
    personality: "",
    outfits: STANDARD_OUTFITS,
    defaultOutfitId: "default",
    imageSeed: DEFAULT_IMAGE_SEED,
    ai: { speechPattern: "" },
  });
}

/** A subject not yet filled in. */
const NEW_SUBJECT: Studies = {
  subject: "",
  code: "GEN",
  level: 1,
  stats: ["intelligence"],
  practical: false,
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const SIDES = ["Characters", "Player", "Locations", "Events", "Courses"] as const;
type Side = (typeof SIDES)[number];
// The sides that change the game itself and not what a player adds to it: there only when the game's own files are being edited.
const AUTHORING: readonly Side[] = ["Player", "Locations"];

/**
 * The editor: the characters (love interests and NPCs, who are written the same way and
 * told apart by their kind), the player as a new game starts him, the places of the game
 * and their pictures, and the course catalogue. Each side keeps its own draft.
 */
export function ContentEditor(props: Props) {
  const [side, setSide] = useState<Side>("Characters");
  // Whether the game's own files are what is being edited: so it is run from source, and not in a game as a player has it.
  const [authoring, setAuthoring] = useState(false);
  useEffect(() => {
    window.api.editor.info().then((info) => setAuthoring(info.base), () => undefined);
  }, []);
  const sides = SIDES.filter((name) => authoring || !AUTHORING.includes(name));
  /**
   * The rail down the left edge: the sides of the editor, one under another, and the way
   * out at its foot. Each asks the side being left whether it may be.
   */
  const switcher = (mayLeave: () => boolean) => (
    <nav className="editor-rail">
      <span className="caps">Edit</span>
      <div className="editor-sides" role="tablist" aria-orientation="vertical">
        {sides.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={side === name}
            className={side === name ? "tab selected" : "tab"}
            onClick={() => name !== side && mayLeave() && setSide(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <Button onClick={() => mayLeave() && props.onClose()}>Done</Button>
    </nav>
  );
  return side === "Courses" ? (
    <CatalogueEditor {...props} switcher={switcher} />
  ) : side === "Events" ? (
    <EventsEditor {...props} switcher={switcher} />
  ) : side === "Player" ? (
    <PlayerEditor {...props} switcher={switcher} />
  ) : side === "Locations" ? (
    <LocationEditor {...props} switcher={switcher} />
  ) : (
    <LoveInterestEditor {...props} switcher={switcher} />
  );
}

function LoveInterestEditor({
  content,
  onContent,
  switcher,
}: Props & { switcher: (mayLeave: () => boolean) => ReactNode }) {
  const [info, setInfo] = useState<EditorInfo | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("Profile");
  // The character being edited, and how it stood when it was opened. `original` is null for a new one.
  // Love interests first, then the NPCs: one list, told apart by their kind.
  const everyone: LoveInterest[] = [...content.loveInterests, ...content.npcs];
  const [original, setOriginal] = useState<LoveInterest | null>(
    everyone[0] ?? null,
  );
  const [draft, setDraft] = useState<LoveInterest>(everyone[0] ?? blank());
  const [issues, setIssues] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.editor
      .info()
      .then(setInfo, (error) => setStatus(errorMessage(error)));
  }, []);

  const isNew = original === null;
  const kind = kindOf(draft);
  // An NPC has a look, a voice and a place to be found, and nothing of a relationship.
  const isNpc = kind === "npc";
  // The jobs this character is the boss of: she is at work for their shifts.
  const gives = (content.jobs?.jobs ?? []).filter(
    (job) => job.bossId === draft.id,
  );
  const dirty = !same(draft, original ?? blank());
  const mayLeave = () =>
    !dirty || window.confirm("Discard the changes you have not saved?");
  // Whether the art tool is open on her room.
  const [drawingRoom, setDrawingRoom] = useState(false);
  const set = (patch: Partial<LoveInterest>) => {
    // What was wrong with the last save may no longer be.
    setIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setAi = (patch: Partial<LoveInterest["ai"]>) =>
    setDraft((current) => ({ ...current, ai: { ...current.ai, ...patch } }));
  const origin = info?.loveInterests[draft.id];

  /** Opens another character, or a new one, asking first if changes would be lost. */
  function open(next: LoveInterest | null) {
    if (!mayLeave()) return;
    setOriginal(next);
    setDraft(next ?? blank());
    setIssues([]);
    setStatus("");
    if (!next) setTab("Profile");
  }

  // Whether the dialog a new love interest begins with is open.
  const [creating, setCreating] = useState(false);
  /** Opens a love interest who has not been saved yet: an empty one, or one the LLM wrote. */
  function start(fresh: LoveInterest) {
    setOriginal(null);
    setDraft(fresh);
    setIssues([]);
    setStatus("");
    setTab("Profile");
  }

  /** Takes in the result of a change: the new content, and what the editor now knows about it. */
  function take(result: EditorResult) {
    setInfo(result.info);
    if (result.issues.length === 0) onContent(result.content);
  }

  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const result = await window.api.editor.saveLoveInterest(draft);
      setIssues(result.issues);
      take(result);
      if (result.issues.length > 0) return;
      const saved =
        [...result.content.loveInterests, ...result.content.npcs].find(
          (li) => li.id === draft.id,
        ) ?? draft;
      setOriginal(saved);
      setDraft(saved);
      setStatus(
        `Saved to your add-ons. It is in the game from the next scene.${result.removed ? ` ${result.removed} unused picture${result.removed === 1 ? " was" : "s were"} deleted.` : ""}`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const question = `Delete ${draft.name}? Saved games keep their history with her, but she will no longer appear.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const result = await window.api.editor.deleteLoveInterest(draft.id);
      setIssues(result.issues);
      take(result);
      if (result.issues.length > 0) return;
      const next =
        [...result.content.loveInterests, ...result.content.npcs].find(
          (li) => li.id === draft.id,
        ) ??
        result.content.loveInterests[0] ??
        null;
      setOriginal(next);
      setDraft(next ?? blank());
      setStatus("Deleted.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const shown = everyone.filter((li) =>
    li.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const stages = content.relationships.stages;
  const roomPlace = content.locations.find(
    (l) => l.id === draft.room?.locationId,
  );
  // Every picture the place has, each view by day and by night as it is drawn.
  const roomViews = (roomPlace?.backgrounds ?? []).flatMap((view) =>
    Object.entries(view.images).map(([period, image]) => ({
      id: `${view.id}-${period}`,
      name: `${view.name}, ${period}`,
      image,
    })),
  );

  return (
    <main className="editor">
      {switcher(mayLeave)}
      <aside className="editor-list">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${everyone.length} characters`}
          aria-label="Search"
        />
        <Button variant="primary" onClick={() => mayLeave() && setCreating(true)}>
          New character
        </Button>
        {creating && (
          <NewCharacterDialog
            onClose={() => setCreating(false)}
            onSkip={() => {
              setCreating(false);
              start(blank());
            }}
            onDraft={(written) => {
              setCreating(false);
              start(written);
              setStatus(
                "Written by the LLM. Read it over, change what you like, and save to keep her.",
              );
            }}
          />
        )}
        <div className="editor-people">
          {shown.map((li) => (
            <button
              key={li.id}
              className={
                `courier-person kind-${kindOf(li)}${!isNew && li.id === original?.id ? " selected" : ""}`
              }
              onClick={() => open(li)}
            >
              <Portrait li={li} />
              <span>
                <strong>{li.name}</strong>
                <span className="hint">
                  {li.age}
                  {kindOf(li) === "npc" && !li.role ? "" : " · "}
                  {kindOf(li) === "npc"
                    ? li.role
                    : kindOf(li) === "teacher"
                      ? `teaches ${li.teaching?.subjects[0]?.subject ?? ""}`
                      : (li.studies?.subject ?? "outsider")}
                </span>
              </span>
            </button>
          ))}
          {shown.length === 0 && <p className="hint">Nobody by that name.</p>}
        </div>
        {info && info.issues.length > 0 && (
          <div className="notice">
            <strong>Left out of the game:</strong>
            {info.issues.map((issue) => (
              <div key={issue}>{issue}</div>
            ))}
          </div>
        )}
        <Button variant="quiet"
          onClick={() => window.api.editor.openFolder()}
 title={info?.addonDir}
        >
          Open the add-on folder
        </Button>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || "New character"}</h1>
            <span className="hint">
              {isNew
                ? "Not saved yet"
                : origin === "base"
                  ? "Built in. Saving keeps your version in your add-ons and leaves the original untouched."
                  : origin === "override"
                    ? "Built in, with your changes."
                    : "One of your add-ons."}
            </span>
          </div>
          <div className="tabs" role="tablist">
            {TABS.filter((name) => !(isNpc && name === "Traits")).map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? "tab selected" : "tab"}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="editor-body">
          {tab === "Profile" && (
            <>
              <div className="row">
                <Text
                  label="Name"
                llm
                  value={draft.name}
                  onChange={(name) =>
                    set(isNew ? { name, id: slugify(name) } : { name })
                  }
                />
                <Text
                  label="Id"
                  value={draft.id}
                  disabled={!isNew}
                  onChange={(id) => set({ id: slugify(id) })}
                  hint={
                    isNew
                      ? "Names her files, and saved games refer to her by it. It cannot be changed later."
                      : undefined
                  }
                />
              </div>
              <label>
                Kind
                <select
                  value={kind}
                  onChange={(e) => {
                    const next = e.target
                      .value as (typeof LOVE_INTEREST_KINDS)[number];
                    // Each kind keeps only what belongs to it.
                    set({
                      kind: next,
                      studies:
                        next === "student"
                          ? (draft.studies ?? NEW_SUBJECT)
                          : undefined,
                      teaching:
                        next === "teacher"
                          ? (draft.teaching ?? {
                              department: "",
                              title: "Professor",
                              subjects: [NEW_SUBJECT],
                            })
                          : undefined,
                    });
                  }}
                >
                  <option value="student">
                    a student: has a subject and a timetable of classes
                  </option>
                  <option value="teacher">
                    a teacher: gives classes in her department
                  </option>
                  <option value="outsider">
                    another love interest: nothing to do with classes
                  </option>
                  <option value="npc">
                    an NPC: someone to talk to and work for, not a love interest
                  </option>
                </select>
              </label>

              {isNpc && (
                <Text
                  label="Role"
                llm
                  value={draft.role}
                  onChange={(role) => set({ role })}
                  placeholder="hall manager of the Cloister Halls"
                />
              )}
              <div className="row">
                <label>
                  <span className="field-name">
                    Age
                    <LlmMark />
                  </span>
                  <input
                    type="number"
                    min={18}
                    value={draft.age}
                    onChange={(e) => set({ age: Number(e.target.value) })}
                  />
                </label>
                <Text
                  label="Pronouns"
                llm
                  value={draft.pronouns}
                  onChange={(pronouns) => set({ pronouns })}
                />
              </div>
              <Text
                label="Bio"
                llm
                value={draft.bio}
                onChange={(bio) => set({ bio })}
                rows={3}
              />
              <Text
                label="Personality"
                llm
                value={draft.personality}
                onChange={(personality) => set({ personality })}
                rows={3}
              />
              <Text
                label="Appearance"
                llm
                value={draft.appearance}
                onChange={(appearance) => set({ appearance })}
                rows={3}
              />
{!isNpc && (
                <>
                                <div className="row">
                <List
                  label="Likes"
                llm
                  value={draft.likes}
                  onChange={(likes) => set({ likes })}
                  hint="Separated by commas."
                />
                <List
                  label="Dislikes"
                llm
                  value={draft.dislikes}
                  onChange={(dislikes) => set({ dislikes })}
                />
              </div>
              <PickList
                label="Admires in the player"
                llm
                options={STATS.map((stat) => ({ id: stat, name: stat }))}
                value={draft.admires}
                onChange={(admires) => set({ admires })}
                max={3}
              />
              <PickList
                addLabel="Add friends"
                label="Friends"
                llm
                options={content.loveInterests
                  .filter((other) => other.id !== draft.id)
                  .map((other) => ({ id: other.id, name: other.name.split(" ")[0] }))}
                value={draft.friends}
                onChange={(friends) =>
                  set({ friends, enemies: draft.enemies.filter((id) => !friends.includes(id)) })
                }
              />
              <PickList
                addLabel="Add enemies"
                label="Enemies"
                llm
                options={content.loveInterests
                  .filter((other) => other.id !== draft.id)
                  .map((other) => ({ id: other.id, name: other.name.split(" ")[0] }))}
                value={draft.enemies}
                onChange={(enemies) =>
                  set({ enemies, friends: draft.friends.filter((id) => !enemies.includes(id)) })
                }
              />
                </>
              )}
              {/* How she sounds and what she knows: all of it goes to the LLM. */}
              <Text
                label="How she speaks"
                llm
                value={draft.ai.speechPattern}
                onChange={(speechPattern) => setAi({ speechPattern })}
                rows={3}
              />
              <Text
                label="Tone"
                llm
                value={draft.ai.tone}
                onChange={(tone) => setAi({ tone })}
              />
              <List
                label="Verbal quirks"
                llm
                value={draft.ai.verbalQuirks}
                onChange={(verbalQuirks) => setAi({ verbalQuirks })}
                lines
                hint="One a line."
              />
              <Text
                label="Backstory"
                llm
                value={draft.ai.backstory}
                onChange={(backstory) => setAi({ backstory })}
                rows={5}
              />
              {isNpc && (
                <List
                  label="What they know"
                llm
                  value={draft.ai.knowledge}
                  onChange={(knowledge) => setAi({ knowledge })}
                  lines
                  hint="One a line."
                />
              )}
{!isNpc && (
                <>
                                <Group
                title="Example dialogue"
                llm
              >
                {draft.ai.exampleDialogue.map((example, index) => {
                  const change = (patch: Partial<typeof example>) =>
                    setAi({
                      exampleDialogue: draft.ai.exampleDialogue.map((e, i) =>
                        i === index ? { ...e, ...patch } : e,
                      ),
                    });
                  return (
                    <div key={index} className="row">
                      <Text
                        label="Them"
                        value={example.user}
                        onChange={(user) => change({ user })}
                      />
                      <Text
                        label="Her"
                        value={example.reply}
                        onChange={(reply) => change({ reply })}
                      />
                      <Button variant="quiet"
                        onClick={() =>
 setAi({
 exampleDialogue: draft.ai.exampleDialogue.filter(
 (_, i) => i !== index,
 ),
 })
 }
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
                <Button
                  onClick={() =>
 setAi({
 exampleDialogue: [
 ...draft.ai.exampleDialogue,
 { user: "", reply: "" },
 ],
 })
 }
                >
                  Add an example
                </Button>
              </Group>
              <Group
                title="Secrets"
                llm
              >
                {draft.ai.secrets.map((secret, index) => (
                  <div key={index} className="row">
                    <Text
                      label={
                        secret.revealWhen.length > 0
                          ? `Secret (shared once ${secret.revealWhen.length} condition${secret.revealWhen.length > 1 ? "s are" : " is"} met)`
                          : "Secret (shared freely)"
                      }
                      value={secret.text}
                      onChange={(text) =>
                        setAi({
                          secrets: draft.ai.secrets.map((s, i) =>
                            i === index ? { ...s, text } : s,
                          ),
                        })
                      }
                    />
                    <Button variant="quiet"
                      onClick={() =>
 setAi({
 secrets: draft.ai.secrets.filter(
 (_, i) => i !== index,
 ),
 })
 }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() =>
 setAi({
 secrets: [
 ...draft.ai.secrets,
 {
 text: "",
 revealWhen: [
 {
 type: "stage",
 min: stages.at(-2)?.id ?? stages[0].id,
 },
 ],
 },
 ],
 })
 }
                >
                  Add a secret
                </Button>
              </Group>
                </>
              )}
                            <Text
                label="Further instructions"
                llm
                value={draft.ai.extraInstructions}
                onChange={(extraInstructions) => setAi({ extraInstructions })}
                rows={4}
              />
            </>
          )}

          {tab === "Traits" && info && (
            <TraitsTab
              content={content}
              info={info}
              draft={draft}
              set={set}
              onResult={take}
            />
          )}

          {tab === "Sprites" && (
            <>
              <SpritesTab draft={draft} set={set} assetPrefix={info?.assetPrefix} />
{!isNpc && (
                <>
                                <Group
                title="Her room"
              >
                <div className="row">
                  <Text
                    label="What it is"
                llm
                    value={draft.room?.name ?? ""}
                    placeholder="a garret at the Honeyed Bee"
                    onChange={(name) =>
                      set({
                        room:
                          name || draft.room?.description
                            ? {
                                description: "",
                                locationId: content.locations[0].id,
                                ...draft.room,
                                name,
                              }
                            : undefined,
                      })
                    }
                  />
                  {draft.room && (
                    <label>
                      In
                      <select
                        value={draft.room.locationId}
                        onChange={(e) =>
                          set({
                            room: {
                              ...draft.room!,
                              locationId: e.target.value,
                            },
                          })
                        }
                      >
                        {content.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {draft.room && (
                  <>
                    <Text
                      label="Description"
                llm
                      value={draft.room.description}
                      rows={3}
                      onChange={(description) =>
                        set({ room: { ...draft.room!, description } })
                      }
                    />
                    <div className="row checks">
                      {draft.room.background ? (
                        <img
                          className="room-art"
                          src={`content://pack/${draft.room.background}`}
                          alt="Her room"
                        />
                      ) : (
                        <span className="hint">No picture yet.</span>
                      )}
                      <Button
                        disabled={!isSafeId(draft.id)}
 onClick={async () => {
 try {
 const background =
 await window.api.editor.importAsset({
 loveInterestId: draft.id,
 kind: "image",
 });
 if (background)
 set({ room: { ...draft.room!, background } });
 } catch (error) {
 setStatus(errorMessage(error));
 }
 }}
                      >
                        {draft.room.background
                          ? "Replace the picture"
                          : "Add a picture"}
                      </Button>
                      <Button
                        disabled={!isSafeId(draft.id)}
 title="Draw her room with your own ComfyUI, from its description"
 onClick={() => setDrawingRoom(true)}
                      >
                        Generate a picture
                      </Button>
                      {roomViews.length > 0 && (
                        <label className="inline">
                          or use
                          <select
                            value={
                              roomViews.some(
                                (view) => view.image === draft.room!.background,
                              )
                                ? draft.room.background
                                : ""
                            }
                            onChange={(e) =>
                              set({
                                room: {
                                  ...draft.room!,
                                  background: e.target.value || undefined,
                                },
                              })
                            }
                          >
                            <option value="">
                              a view of {roomPlace?.name}...
                            </option>
                            {roomViews.map((view) => (
                              <option key={view.id} value={view.image}>
                                {view.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {draft.room.background && (
                        <Button variant="quiet"
                          onClick={() =>
 set({
 room: { ...draft.room!, background: undefined },
 })
 }
                        >
                          Remove the picture
                        </Button>
                      )}
                    </div>
                    {drawingRoom && (
                      <ArtTool
                        target={{
                          kind: "background",
                          location: {
                            id: draft.id,
                            // The room's name says whose it is ("her flat above the Honeyed Bee"), which is no use to an image model.
                            name: "",
                            appearance: draft.room.description,
                            indoors: true,
                          },
                          title: draft.room.name,
                          periods: [...LIGHTS],
                          onUse: (_view, background) =>
                            set({ room: { ...draft.room!, background } }),
                        }}
                        onClose={() => setDrawingRoom(false)}
                      />
                    )}
                  </>
                )}
              </Group>
                </>
              )}
            </>
          )}

          {tab === "Academics" && (
            <>
                            {kind === "teacher" && draft.teaching && (
                <Group
                  title="Teaching"
                >
                  <div className="row">
                    <Text
                      label="Department"
                llm
                      value={draft.teaching.department}
                      onChange={(department) =>
                        set({ teaching: { ...draft.teaching!, department } })
                      }
                    />
                    <Text
                      label="Styled"
                      value={draft.teaching.title}
                      onChange={(title) =>
                        set({ teaching: { ...draft.teaching!, title } })
                      }
                      hint="Before her name in the catalogue."
                    />
                  </div>
                  {draft.teaching.subjects.map((subject, index) => {
                    const change = (patch: Partial<Studies>) =>
                      set({
                        teaching: {
                          ...draft.teaching!,
                          subjects: draft.teaching!.subjects.map((s, i) =>
                            i === index ? { ...s, ...patch } : s,
                          ),
                        },
                      });
                    return (
                      <div key={index} className="card">
                        <div className="row">
                          <Text
                            label="Subject"
                llm
                            value={subject.subject}
                            onChange={(value) => change({ subject: value })}
                          />
                          <Text
                            label="Catalogue code"
                            value={subject.code}
                            onChange={(code) =>
                              change({ code: code.toUpperCase().slice(0, 4) })
                            }
                          />
                          <label>
                            Year
                            <select
                              value={subject.level}
                              onChange={(e) =>
                                change({ level: Number(e.target.value) })
                              }
                            >
                              {[1, 2, 3, 4].map((year) => (
                                <option key={year} value={year}>
                                  Year {year}
                                </option>
                              ))}
                              <option value={5}>Graduate</option>
                            </select>
                          </label>
                          <Button variant="quiet"
                            disabled={draft.teaching!.subjects.length <= 1}
 onClick={() =>
 set({
 teaching: {
 ...draft.teaching!,
 subjects: draft.teaching!.subjects.filter(
 (_, i) => i !== index,
 ),
 },
 })
 }
                          >
                            Remove
                          </Button>
                        </div>
                        <label className="inline">
                          <input
                            type="checkbox"
                            checked={subject.practical}
                            onChange={(e) =>
                              change({ practical: e.target.checked })
                            }
                          />
                          Has a lab: a practical subject, with a long weekly
                          class as well as its lectures
                        </label>
                        <PickList
                          label="A class in it raises"
                          options={STATS.map((stat) => ({
                            id: stat,
                            name: stat,
                          }))}
                          value={subject.stats}
                          onChange={(stats) =>
                            stats.length > 0 && change({ stats })
                          }
                          max={2}
                        />
                      </div>
                    );
                  })}
                  <Button
                    onClick={() =>
 set({
 teaching: {
 ...draft.teaching!,
 subjects: [...draft.teaching!.subjects, NEW_SUBJECT],
 },
 })
 }
                  >
                    Add a subject
                  </Button>
                </Group>
              )}
              {kind === "student" && (
                <Group
                  title="Studies"
                >
                  <div className="row">
                    <Text
                      label="Subject"
                llm
                      value={draft.studies?.subject ?? ""}
                      onChange={(subject) =>
                        set({
                          studies: {
                            ...NEW_SUBJECT,
                            ...draft.studies,
                            subject,
                          },
                        })
                      }
                    />
                    {draft.studies && (
                      <>
                        <Text
                          label="Catalogue code"
                          value={draft.studies.code}
                          onChange={(code) =>
                            set({
                              studies: {
                                ...draft.studies!,
                                code: code.toUpperCase().slice(0, 4),
                              },
                            })
                          }
                        />
                        <label>
                          Year
                          <select
                            value={draft.studies.level}
                            onChange={(e) =>
                              set({
                                studies: {
                                  ...draft.studies!,
                                  level: Number(e.target.value),
                                },
                              })
                            }
                          >
                            {[1, 2, 3, 4].map((year) => (
                              <option key={year} value={year}>
                                Year {year}
                              </option>
                            ))}
                            <option value={5}>Graduate</option>
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                  {draft.studies && (
                    <label className="inline">
                      <input
                        type="checkbox"
                        checked={draft.studies.practical}
                        onChange={(e) =>
                          set({
                            studies: {
                              ...draft.studies!,
                              practical: e.target.checked,
                            },
                          })
                        }
                      />
                      Has a lab: a practical subject, with a long weekly class
                      as well as its lectures
                    </label>
                  )}
                  {draft.studies && (
                    <PickList
                      label="A class in it raises"
                      options={STATS.map((stat) => ({ id: stat, name: stat }))}
                      value={draft.studies.stats}
                      onChange={(stats) =>
                        stats.length > 0 &&
                        set({ studies: { ...draft.studies!, stats } })
                      }
                      max={2}
                    />
                  )}
                </Group>
              )}
            </>
          )}
          {tab === "Academics" &&
            gives.map((job) => (
              <p key={job.id} className="status">
                {draft.name || "This character"} gives the job of{" "}
                {job.title.toLowerCase()}, and is at{" "}
                {content.locations.find((l) => l.id === job.locationId)?.name ??
                  job.locationId}{" "}
                for exactly its shifts:{" "}
                {job.shifts.map(describeShift).join(", ")}. Those hours come
                from the job and are not set here.
              </p>
            ))}
          {tab === "Academics" && (
            <ScheduleTab
              content={content}
              schedule={draft.schedule}
              onChange={(schedule) => set({ schedule })}
              before="Classes and plans with the player come before all of them."
            />
          )}
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={isSafeId(draft.id)}
          onUndo={() => {
            setDraft(original ?? blank());
            setIssues([]);
          }}
          onSave={save}
          // Only a character made here can be deleted. One of the game's own that has been changed stays changed: there is no going back to how she shipped.
          remove={!isNew && origin === 'addon' ? { label: 'Delete', onClick: remove } : undefined}
        />
      </section>
    </main>
  );
}

import { Button } from "../Button";
import { useEffect, useState, type ReactNode } from "react";
import {
  isSafeId,
  slugify,
  type EditorInfo,
  type EditorResult,
} from "../../../../shared/editor";
import {
  kindOf,
  LOVE_INTEREST_KINDS,
  LoveInterestSchema,
  DEFAULT_IMAGE_SEED,
  STANDARD_OUTFITS,
  STATS,
  type ContentPack,
  type LoveInterest,
  type LoveInterestKind,
  type Role,
  type Studies,
} from "../../../../shared/model";
import { errorMessage } from "../../errors";
import { describeShift, handleOf } from "../../../../shared/game";
import { eventOutfits } from "../../../../shared/game/events";
import { RoomPictures } from "./RoomPictures";
import { InstructionsPage } from "./InstructionsPage";
import { Portrait } from "../Portrait";
import { ConditionsField, EditorFoot, PickList, Group, List, Text, LlmMark } from "./fields";
import { ComfyEditor } from "./ComfyEditor";
import { NewCharacterDialog } from "./NewCharacterDialog";
import { CatalogueEditor } from "./CatalogueEditor";
import { JobsEditor } from "./JobsEditor";
import { MajorsEditor } from "./MajorsEditor";
import { SocietiesEditor } from "./SocietiesEditor";
import { LocationEditor } from "./LocationEditor";
import { PlayerEditor } from "./PlayerEditor";
import { ScheduleTab } from "./ScheduleTab";
import { FamilyTab } from "./FamilyTab";
import { SpritesTab } from "./SpritesTab";
import { TraitsTab } from "./TraitsTab";
import { LooksEditor } from "./LooksEditor";
import { t, type MessageKey } from "../../../../shared/i18n";

interface Props {
  content: ContentPack;
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void;
  onClose: () => void;
}

const TABS = ["Profile", "Traits", "Media", "Family", "Academics"] as const;
type Tab = (typeof TABS)[number];
// What each tab is called where it is shown: the names above are how the editor knows them.
const TAB_LABELS: Record<Tab, MessageKey> = {
  Profile: "editor.tabs.profile",
  Traits: "editor.tabs.traits",
  Media: "editor.tabs.media",
  Family: "editor.tabs.family",
  Academics: "editor.tabs.academics",
};

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

/** The subjects a student can read: every one the curriculum has that is not a general course. */
const majorsToRead = (content: ContentPack) => (content.curriculum?.majors ?? []).filter((major) => !major.general);

/** A subject of the curriculum at a year, as a character has it. */
function subjectOf(content: ContentPack, code: string, level: number): Studies | undefined {
  const major = content.curriculum?.majors.find((one) => one.code === code);
  return major && { subject: major.subject, code: major.code, level, stats: major.stats, practical: major.practical };
}

/** What a character who has just become a student or a teacher is given until something is chosen for her: the first there is. */
function firstSubject(content: ContentPack, teaching: boolean): Studies {
  const major = (teaching ? content.curriculum?.majors : majorsToRead(content))?.[0];
  return (major && subjectOf(content, major.code, 1)) ?? { subject: "", code: "", level: 1, stats: ["intelligence"], practical: false };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const SIDES = ["Instructions", "Characters", "Looks", "Majors", "Player", "Locations", "Courses", "Societies", "Jobs", "ComfyUI"] as const;
type Side = (typeof SIDES)[number];
const SIDE_LABELS: Record<Side, MessageKey> = {
  Instructions: "editor.instructions.title",
  Characters: "editor.sides.characters",
  Looks: "editor.sides.looks",
  Majors: "editor.sides.majors",
  Player: "editor.sides.player",
  Locations: "editor.sides.locations",
  Courses: "editor.sides.courses",
  Societies: "editor.sides.societies",
  Jobs: "editor.sides.jobs",
  ComfyUI: "editor.sides.comfy",
};
// The sides that change the game itself and not what a player adds to it: there only when the game's own files are being edited.
const AUTHORING: readonly Side[] = ["Player", "Locations", "Societies", "Jobs"];
// The sides only a player has: how to add a character of one's own, which whoever writes the game knows.
const PLAYING: readonly Side[] = ["Instructions"];

/**
 * The editor: the characters (love interests and NPCs, who are written the same way and
 * told apart by their kind), the player as a new game starts him, the places of the game
 * and their pictures, and the course catalogue. Each side keeps its own draft. The last
 * side is not content: it is how the editor's art tool draws, which only the editor uses.
 */
// The kinds a character can be, as the filter over the list names them.
const KIND_FILTERS: { kind: LoveInterestKind; label: MessageKey }[] = [
  { kind: "student", label: "editor.characters.students" },
  { kind: "teacher", label: "editor.characters.teachers" },
  { kind: "outsider", label: "editor.characters.outsiders" },
  { kind: "npc", label: "editor.characters.npcs" },
];
// The feelings a character who knows him already starts at, as their boxes are labelled.
const METER_LABELS: Record<"affection" | "trust" | "desire", MessageKey> = {
  affection: "editor.characters.affection",
  trust: "editor.characters.trust",
  desire: "editor.characters.desire",
};

export function ContentEditor(props: Props) {
  // A player lands on the instructions; whoever is editing the game's own files goes straight to the characters.
  const [side, setSide] = useState<Side>("Instructions");
  // Whether the game's own files are what is being edited: so it is run from source, and not in a game as a player has it.
  const [authoring, setAuthoring] = useState(false);
  useEffect(() => {
    window.api.editor.info().then(
      (info) => {
        setAuthoring(info.base);
        if (info.base) setSide((now) => (now === "Instructions" ? "Characters" : now));
      },
      () => undefined,
    );
  }, []);
  const sides = SIDES.filter((name) => (authoring ? !PLAYING.includes(name) : !AUTHORING.includes(name)));
  /**
   * The rail down the left edge: the sides of the editor, one under another, and the way
   * out at its foot. Each asks the side being left whether it may be.
   */
  const switcher = (mayLeave: () => boolean) => (
    <nav className="editor-rail">
      <span className="caps">{t("editor.characters.edit")}</span>
      <div className="editor-sides" role="tablist" aria-orientation="vertical">
        {sides.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={side === name}
            className={side === name ? "tab selected" : "tab"}
            onClick={() => name !== side && mayLeave() && setSide(name)}
          >
            {t(SIDE_LABELS[name])}
          </button>
        ))}
      </div>
      <Button onClick={() => mayLeave() && props.onClose()}>{t("editor.characters.done")}</Button>
    </nav>
  );
  return side === "Instructions" ? (
    <InstructionsPage switcher={switcher} onGo={setSide} />
  ) : side === "Courses" ? (
    <CatalogueEditor {...props} switcher={switcher} />
  ) : side === "Majors" ? (
    <MajorsEditor {...props} switcher={switcher} />
  ) : side === "Jobs" ? (
    <JobsEditor {...props} switcher={switcher} />
  ) : side === "Societies" ? (
    <SocietiesEditor {...props} switcher={switcher} />
  ) : side === "Player" ? (
    <PlayerEditor {...props} switcher={switcher} />
  ) : side === "ComfyUI" ? (
    <ComfyEditor switcher={switcher} acts={props.content.looks.acts} />
  ) : side === "Looks" ? (
    <LooksEditor {...props} switcher={switcher} />
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
  // Which kind of character the list is narrowed to: all of them, to begin with.
  const [kindShown, setKindShown] = useState<LoveInterestKind | "all">("all");
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
    !dirty || window.confirm(t("editor.common.discard"));
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
        t("editor.common.doneRebuilt", { done: t("editor.characters.saved", { removed: result.removed ?? 0 }), rebuilt: !!result.catalogueRebuilt }),
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const question = t("editor.characters.deleteConfirm", { name: draft.name });
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
      setStatus(t("editor.common.deleted"));
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const shown = everyone.filter(
    (li) =>
      li.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (kindShown === "all" || kindOf(li) === kindShown),
  );
  const stages = content.relationships.stages;
  const roomPlace = content.locations.find(
    (l) => l.id === draft.room?.locationId,
  );

  return (
    <main className="editor">
      {switcher(mayLeave)}
      <aside className="editor-list">
        <Button variant="primary" onClick={() => mayLeave() && setCreating(true)}>
          {t("editor.newCharacter.title")}
        </Button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("editor.characters.search", { count: everyone.length })}
          aria-label={t("editor.common.search")}
        />
        {/* Narrows the list to one kind of character. Each is counted, so it is plain how many there are of it. */}
        <select
          value={kindShown}
          onChange={(e) => setKindShown(e.target.value as LoveInterestKind | "all")}
          aria-label={t("editor.characters.filter")}
        >
          <option value="all">{t("editor.characters.allTypes", { count: everyone.length })}</option>
          {KIND_FILTERS.map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {t("editor.characters.kindOption", { label: t(label), count: everyone.filter((li) => kindOf(li) === kind).length })}
            </option>
          ))}
        </select>
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
                t("editor.characters.drafted"),
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
              <Portrait who={li} caption />
              <span>
                <strong>{li.name}</strong>
                <span className="hint">
                  {li.age}
                  {kindOf(li) === "npc" && !li.role ? "" : " · "}
                  {kindOf(li) === "npc"
                    ? li.role
                    : kindOf(li) === "teacher"
                      ? t("editor.characters.teaches", { subject: li.teaching?.subjects[0]?.subject ?? "" })
                      : (li.studies?.subject ?? t("editor.characters.outsider"))}
                </span>
              </span>
            </button>
          ))}
          {shown.length === 0 && <p className="hint">{t("editor.characters.noneFound")}</p>}
        </div>
        {info && info.issues.length > 0 && (
          <div className="notice">
            <strong>{t("editor.characters.leftOut")}</strong>
            {info.issues.map((issue) => (
              <div key={issue}>{issue}</div>
            ))}
          </div>
        )}
        <Button variant="quiet"
          onClick={() => window.api.editor.openFolder()}
 title={info?.addonDir}
        >
          {t("editor.common.openFolder")}
        </Button>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || t("editor.newCharacter.title")}</h1>
            <span className="hint">
              {isNew
                ? t("editor.characters.notSaved")
                : origin === "base"
                  ? t("editor.common.builtIn")
                  : origin === "override"
                    ? t("editor.common.builtInChanged")
                    : t("editor.characters.yours")}
            </span>
          </div>
          <div className="tabs" role="tablist">
            {TABS.filter((name) => !(isNpc && (name === "Traits" || name === "Family"))).map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? "tab selected" : "tab"}
                onClick={() => setTab(name)}
              >
                {t(TAB_LABELS[name])}
              </button>
            ))}
          </div>
        </div>

        <div className="editor-body">
          {tab === "Profile" && (
            <>
              <div className="row">
                <Text
                  label={t("editor.common.name")}
                llm
                  value={draft.name}
                  onChange={(name) =>
                    set(isNew ? { name, id: slugify(name) } : { name })
                  }
                />
                <Text
                  label={t("editor.common.id")}
                  value={draft.id}
                  disabled={!isNew}
                  onChange={(id) => set({ id: slugify(id) })}
                  hint={
                    isNew
                      ? t("editor.characters.idHint")
                      : undefined
                  }
                />
              </div>
              {/* Her name on Bloomr; left empty, one is made from her name, which is shown as the placeholder. */}
              {!isNpc && (
                <Text
                  label={t("editor.characters.handle")}
                  value={draft.handle ?? ""}
                  placeholder={handleOf({ ...draft, handle: undefined }).replace(/^@/, "")}
                  onChange={(handle) => set({ handle: handle.replace(/^@/, "").trim() || undefined })}
                />
              )}
              <label>
                {t("editor.characters.kind")}
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
                          ? (draft.studies ?? firstSubject(content, false))
                          : undefined,
                      teaching:
                        next === "teacher"
                          ? (draft.teaching ?? {
                              department: "",
                              title: "Professor",
                              subjects: [{ ...firstSubject(content, true), number: content.curriculum?.majors[0]?.courses[0]?.number ?? "101" }],
                            })
                          : undefined,
                    });
                  }}
                >
                  <option value="student">
                    {t("editor.characters.kindStudent")}
                  </option>
                  <option value="teacher">
                    {t("editor.characters.kindTeacher")}
                  </option>
                  <option value="outsider">
                    {t("editor.characters.kindOutsider")}
                  </option>
                  <option value="npc">
                    {t("editor.characters.kindNpc")}
                  </option>
                </select>
              </label>

              {isNpc && (
                <Text
                  label={t("editor.characters.role")}
                llm
                  value={draft.role}
                  onChange={(role) => set({ role })}
                  placeholder={t("editor.characters.rolePlaceholder")}
                />
              )}
              {/* What she does in the Undercroft, when he takes her down with him. */}
              {!isNpc && content.expedition && (
                <label>
                  {t("editor.characters.partyRole")}
                  <select
                    value={draft.partyRole ?? ""}
                    onChange={(e) => set({ partyRole: (e.target.value || undefined) as Role | undefined })}
                  >
                    <option value="">{t("editor.common.none")}</option>
                    {content.expedition.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="row">
                <label>
                  <span className="field-name">
                    {t("editor.characters.age")}
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
                  label={t("editor.characters.pronouns")}
                llm
                  value={draft.pronouns}
                  onChange={(pronouns) => set({ pronouns })}
                />
                <label>
                  {t("editor.characters.birthday")}
                  <select
                    value={draft.birthday?.month ?? ""}
                    onChange={(e) => set({ birthday: e.target.value ? { month: e.target.value, day: draft.birthday?.day ?? 1 } : undefined })}
                  >
                    <option value="">{t("editor.common.none")}</option>
                    {content.calendar.months.map((month) => (
                      <option key={month.id} value={month.id}>
                        {month.name}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.birthday && (
                  <label>
                    {t("editor.jobs.day")}
                    <input
                      type="number"
                      min={1}
                      max={content.calendar.months.find((month) => month.id === draft.birthday?.month)?.days ?? 30}
                      value={draft.birthday.day}
                      onChange={(e) => set({ birthday: { month: draft.birthday!.month, day: Math.max(1, Math.floor(Number(e.target.value)) || 1) } })}
                    />
                  </label>
                )}
              </div>
              {!isNpc && (
                <div className="row checks">
                  {/* Someone he already knows at the start of a game: an old friend, a cousin's flatmate. */}
                  <label className="row checks">
                    <input
                      type="checkbox"
                      checked={draft.startsAt !== undefined}
                      onChange={(e) => set({ startsAt: e.target.checked ? { affection: 20, trust: 20, desire: 0 } : undefined })}
                    />
                    {t("editor.characters.knowsHim")}
                  </label>
                  {draft.startsAt &&
                    (["affection", "trust", "desire"] as const).map((meter) => (
                      <label key={meter}>
                        {t(METER_LABELS[meter])}
                        <input
                          type="number"
                          min={0}
                          max={content.relationships.meterMax}
                          value={draft.startsAt![meter]}
                          onChange={(e) => set({ startsAt: { ...draft.startsAt!, [meter]: Math.max(0, Number(e.target.value) || 0) } })}
                        />
                      </label>
                    ))}
                </div>
              )}
              <Text
                label={t("editor.player.bio")}
                llm
                value={draft.bio}
                onChange={(bio) => set({ bio })}
                rows={3}
              />
              <Text
                label={t("editor.characters.personality")}
                llm
                value={draft.personality}
                onChange={(personality) => set({ personality })}
                rows={3}
              />
              <Text
                label={t("editor.common.appearance")}
                llm
                value={draft.appearance}
                onChange={(appearance) => set({ appearance })}
                rows={3}
              />
{!isNpc && (
                <>
                                <div className="row">
                <List
                  label={t("editor.characters.likes")}
                llm
                  value={draft.likes}
                  onChange={(likes) => set({ likes })}
                  hint={t("editor.characters.commas")}
                />
                <List
                  label={t("editor.characters.dislikes")}
                llm
                  value={draft.dislikes}
                  onChange={(dislikes) => set({ dislikes })}
                />
              </div>
              <PickList
                label={t("editor.characters.admires")}
                llm
                options={STATS.map((stat) => ({ id: stat, name: stat }))}
                value={draft.admires}
                onChange={(admires) => set({ admires })}
                max={3}
              />
              <PickList
                addLabel={t("editor.characters.addFriends")}
                label={t("editor.characters.friends")}
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
                addLabel={t("editor.characters.addEnemies")}
                label={t("editor.characters.enemies")}
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
                label={t("editor.characters.speech")}
                llm
                value={draft.ai.speechPattern}
                onChange={(speechPattern) => setAi({ speechPattern })}
                rows={3}
              />
              <Text
                label={t("editor.characters.tone")}
                llm
                value={draft.ai.tone}
                onChange={(tone) => setAi({ tone })}
              />
              <List
                label={t("editor.characters.quirks")}
                llm
                value={draft.ai.verbalQuirks}
                onChange={(verbalQuirks) => setAi({ verbalQuirks })}
                lines
                hint={t("editor.characters.oneALine")}
              />
              <Text
                label={t("editor.characters.backstory")}
                llm
                value={draft.ai.backstory}
                onChange={(backstory) => setAi({ backstory })}
                rows={5}
              />
              <List
                label={t("editor.characters.knowledge")}
                llm
                value={draft.ai.knowledge}
                onChange={(knowledge) => setAi({ knowledge })}
                lines
                hint={t("editor.characters.oneALine")}
              />
{!isNpc && (
                <>
                                <Group
                title={t("editor.characters.examples")}
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
                        label={t("editor.characters.them")}
                        value={example.user}
                        onChange={(user) => change({ user })}
                      />
                      <Text
                        label={t("editor.characters.her")}
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
                        {t("editor.common.remove")}
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
                  {t("editor.characters.addExample")}
                </Button>
              </Group>
              <Group
                title={t("editor.characters.secrets")}
                llm
              >
                {draft.ai.secrets.map((secret, index) => (
                  <div key={index} className="editor-group">
                    <Text
                      label={t("editor.characters.secret")}
                      value={secret.text}
                      onChange={(text) =>
                        setAi({
                          secrets: draft.ai.secrets.map((s, i) =>
                            i === index ? { ...s, text } : s,
                          ),
                        })
                      }
                    />
                    <ConditionsField
                      content={content}
                      label={secret.revealWhen.length > 0 ? t("editor.characters.revealWhen") : t("editor.characters.revealFreely")}
                      value={secret.revealWhen}
                      onChange={(revealWhen) =>
                        setAi({
                          secrets: draft.ai.secrets.map((s, i) =>
                            i === index ? { ...s, revealWhen } : s,
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
                      {t("editor.common.remove")}
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
                  {t("editor.characters.addSecret")}
                </Button>
              </Group>
                </>
              )}
                            <Text
                label={t("editor.characters.extra")}
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

          {tab === "Family" && !isNpc && <FamilyTab draft={draft} set={set} />}

          {tab === "Media" && (
            <>
              <SpritesTab draft={draft} set={set} assetPrefix={info?.assetPrefix} eventOutfits={eventOutfits(content)} looks={content.looks} />
{!isNpc && (
                <>
                                <Group
                title={t("editor.characters.room")}
              >
                <div className="row">
                  <Text
                    label={t("editor.jobs.whatItIs")}
                llm
                    value={draft.room?.name ?? ""}
                    placeholder={t("editor.characters.roomPlaceholder")}
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
                      {t("editor.characters.roomIn")}
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
                      label={t("editor.common.description")}
                llm
                      value={draft.room.description}
                      rows={3}
                      onChange={(description) =>
                        set({ room: { ...draft.room!, description } })
                      }
                    />
                    <RoomPictures
                      room={draft.room}
                      place={roomPlace}
                      owner={draft.id}
                      disabled={!isSafeId(draft.id)}
                      onChange={(patch) => set({ room: { ...draft.room!, ...patch } })}
                      onStatus={setStatus}
                    />
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
                  title={t("editor.characters.teaching")}
                >
                  <div className="row">
                    <Text
                      label={t("editor.characters.department")}
                llm
                      value={draft.teaching.department}
                      onChange={(department) =>
                        set({ teaching: { ...draft.teaching!, department } })
                      }
                    />
                    <Text
                      label={t("editor.characters.styled")}
                      value={draft.teaching.title}
                      onChange={(title) =>
                        set({ teaching: { ...draft.teaching!, title } })
                      }
                      hint={t("editor.characters.styledHint")}
                    />
                  </div>
                  {/* What she teaches is courses the curriculum has written: she is not asked to make one up. */}
                  {draft.teaching.subjects.map((subject, index) => (
                    <div key={index} className="row">
                      <label>
                        {t("editor.characters.course")}
                        <select
                          value={`${subject.code}:${subject.number}`}
                          onChange={(e) => {
                            const [code, number] = e.target.value.split(":");
                            const found = subjectOf(content, code, 1);
                            const picked = found && { ...found, number };
                            if (picked)
                              set({
                                teaching: {
                                  ...draft.teaching!,
                                  subjects: draft.teaching!.subjects.map((s, i) => (i === index ? picked : s)),
                                },
                              });
                          }}
                        >
                          {(content.curriculum?.majors ?? []).flatMap((major) =>
                            major.courses.map((course) => (
                              <option key={`${major.code}:${course.number}`} value={`${major.code}:${course.number}`}>
                                {t("editor.characters.courseOption", { code: major.code, number: course.number, title: course.title })}
                              </option>
                            )),
                          )}
                        </select>
                      </label>
                      <Button
                        disabled={draft.teaching!.subjects.length < 2}
                        onClick={() =>
                          set({
                            teaching: {
                              ...draft.teaching!,
                              subjects: draft.teaching!.subjects.filter((_, i) => i !== index),
                            },
                          })
                        }
                      >
                        {t("editor.common.remove")}
                      </Button>
                    </div>
                  ))}
                  <Button
                    onClick={() => {
                      const first = content.curriculum?.majors[0];
                      const found = first && subjectOf(content, first.code, 1);
                      const picked = found && { ...found, number: first.courses[0].number };
                      if (picked)
                        set({
                          teaching: {
                            ...draft.teaching!,
                            subjects: [...draft.teaching!.subjects, picked],
                          },
                        });
                    }}
                  >
                    {t("editor.majors.addCourse")}
                  </Button>
                </Group>
              )}
              {kind === "student" && (
                <Group title={t("editor.characters.studies")} hint={t("editor.characters.studiesHint")}>
                  <div className="row">
                    <label>
                      {t("editor.majors.subject")}
                      <select
                        value={draft.studies?.code ?? ""}
                        onChange={(e) => {
                          const picked = subjectOf(content, e.target.value, draft.studies?.level ?? 1);
                          if (picked) set({ studies: picked });
                        }}
                      >
                        {!majorsToRead(content).some((major) => major.code === draft.studies?.code) && <option value="">{t("editor.characters.chooseSubject")}</option>}
                        {majorsToRead(content).map((major) => (
                          <option key={major.code} value={major.code}>
                            {t("editor.catalogue.subjectOption", { code: major.code, subject: major.subject })}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.studies && (
                      <label>
                        {t("editor.characters.year")}
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
                              {t("editor.characters.yearN", { year })}
                            </option>
                          ))}
                          <option value={5}>{t("editor.characters.graduate")}</option>
                        </select>
                      </label>
                    )}
                  </div>
                </Group>
              )}
            </>
          )}
          {tab === "Academics" &&
            gives.map((job) => (
              <p key={job.id} className="status">
                {t("editor.characters.givesJob", {
                  name: draft.name || t("editor.characters.thisCharacter"),
                  job: job.title.toLowerCase(),
                  place: content.locations.find((l) => l.id === job.locationId)?.name ?? job.locationId,
                  shifts: job.shifts.map(describeShift).join(", "),
                })}
              </p>
            ))}
          {tab === "Academics" && (
            <ScheduleTab
              content={content}
              schedule={draft.schedule}
              onChange={(schedule) => set({ schedule })}
              before={t("editor.characters.scheduleBefore")}
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
          remove={!isNew && origin === 'addon' ? { label: t('editor.common.delete'), onClick: remove } : undefined}
        />
      </section>
    </main>
  );
}

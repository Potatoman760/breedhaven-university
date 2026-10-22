import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { BanterLine } from "../../../shared/game";
import type { PartAnimation } from "../../../shared/model";
import { useVolumes } from "../sound";

/** What a trip plays: its parts' openings, and the drives there and home. */
export type TripMomentKind = Exclude<PartAnimation, "lanterns"> | "drive-home";

// How long an opening plays, and a drive with nothing said; how long the lines are waited for, and each is up.
const OPENING_MS = 5200;
const DRIVE_MS = 3600;
const WAIT_MS = 9000;
const LINE_MS = 2600;
const MS_PER_CHAR = 55;
// A drive goes on a moment after the last line.
const AFTER_LINES_MS = 1200;

// The drives are the car going by along the road, seen from the side: the road a tile that repeats as it scrolls, the
// car with its two windows left clear, and in each the head of whoever sits there. The drive home is the same, the
// other way.
const ROAD = "sprites/fx/drive-road.webp";
const ROAD_RATIO = 4096 / 768;
const CAR = "sprites/fx/drive-car.webp";
const CAR_RATIO = 1520 / 726;
// The windows, front then back, as parts of the car's picture: left, top, width and height, in percent.
const WINDOWS = [
  { x: 43.2, y: 25.1, w: 17.5, h: 19.4 },
  { x: 25.6, y: 24.9, w: 14.9, h: 17.5 },
];
// How wide the car is on the screen, and how far above the foot of it it runs.
const CAR_VW = 70;
const CAR_BOTTOM_VH = 14;

const BACKDROPS: Partial<Record<TripMomentKind, string>> = {
  soak: "generated/backgrounds/saltmere/outdoor-bath.webp",
  cascade: "generated/backgrounds/saltmere/cascade.webp",
  market: "generated/backgrounds/saltmere/night-market.webp",
  "private-bath": "generated/backgrounds/saltmere/private-bath.webp",
  fireworks: "generated/backgrounds/saltmere/lake.webp",
  "last-morning": "generated/backgrounds/saltmere/balcony.webp",
};
// Those that move: a looping clip in place of the picture, heard at the player's volume for effects. Its own motion
// stands for the effects laid over a still.
const CLIPS: Partial<Record<TripMomentKind, string>> = {
  soak: "sprites/saltmere/outdoor-bath.mp4",
  cascade: "sprites/saltmere/cascade.mp4",
  market: "sprites/saltmere/night-market.mp4",
  "private-bath": "sprites/saltmere/private-bath.mp4",
  fireworks: "sprites/saltmere/lake.mp4",
  "last-morning": "sprites/saltmere/balcony.mp4",
};
const CLIP_VOLUME = 0.7;

// Who is shown, standing at the foot of it: in the car, watching the fireworks, and at breakfast on the last morning.
const SHOWN: TripMomentKind[] = [
  "drive-there",
  "drive-home",
  "fireworks",
  "last-morning",
];

export interface TripCompanion {
  id: string;
  /** Her sprite, glad. */
  image: string;
  /** Her walking profile, facing right: her head in the car's window. */
  walk?: string;
  stageHeight: number;
}

interface Props {
  kind: TripMomentKind;
  companions: TripCompanion[];
  /** The opening's title, shown across it: the part's name. Left out on a drive. */
  title?: string;
  /** What is said on a drive: asked for as it opens. */
  lines?: () => Promise<BanterLine[]>;
  onDone: () => void;
}

/** A number from 0 up to 1 that is the same for the same index: where each mote, leaf or spark goes. */
const spread = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A moment of a trip away, played for itself before its scene: the drive along the road with a few words from the
 * car, or the opening of one of the trip's outings, each with its own effects (steam over the baths, falling leaves at
 * the falls, the market's lights, the fireworks over the lake, the sunrise). A click on a balloon goes on to the next
 * line; anywhere else, it is over.
 */
export function TripMoment({ kind, companions, title, lines, onDone }: Props) {
  const drive = kind === "drive-there" || kind === "drive-home";
  const [said, setSaid] = useState<BanterLine[] | null>(lines ? null : []);
  const [at, setAt] = useState(0);
  const effects = useVolumes().effects;
  const clip = CLIPS[kind];

  // An opening plays for its length; a drive for as long as there is talk, and a moment more.
  useEffect(() => {
    if (drive) return;
    const timer = window.setTimeout(onDone, OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [drive, onDone]);
  useEffect(() => {
    if (!lines) return;
    let open = true;
    const giveUp = window.setTimeout(
      () => open && setSaid((now) => now ?? []),
      WAIT_MS,
    );
    lines().then(
      (got) => open && setSaid((now) => now ?? got),
      () => open && setSaid((now) => now ?? []),
    );
    return () => {
      open = false;
      window.clearTimeout(giveUp);
    };
  }, []);
  const line = drive && said && at < said.length ? said[at] : undefined;
  useEffect(() => {
    if (!drive || said === null) return;
    const wait = line
      ? Math.max(LINE_MS, line.text.length * MS_PER_CHAR)
      : said.length === 0
        ? DRIVE_MS
        : AFTER_LINES_MS;
    const timer = window.setTimeout(
      () => (line ? setAt((n) => n + 1) : onDone()),
      wait,
    );
    return () => window.clearTimeout(timer);
  }, [drive, said, line, onDone]);

  const shown = SHOWN.includes(kind) && !drive ? companions.slice(0, 2) : [];
  const places = shown.length > 1 ? [27, 73] : [50];
  // In the car, each sits at a window, front first; her balloon is over her window, the other way on the drive home.
  const seated = drive
    ? companions.filter((one) => one.walk).slice(0, WINDOWS.length)
    : [];
  const windowAt = (i: number) => {
    const across =
      50 - CAR_VW / 2 + ((WINDOWS[i].x + WINDOWS[i].w / 2) / 100) * CAR_VW;
    return kind === "drive-home" ? 100 - across : across;
  };
  // How far up the screen the top of a window is: what her balloon stands on.
  const windowTop = (i: number) =>
    `calc(${CAR_BOTTOM_VH + 1.5}vh + ${((CAR_VW / CAR_RATIO) * (100 - WINDOWS[i].y)) / 100}vw)`;
  const speaker = line
    ? (drive ? seated : shown).findIndex((one) => one.id === line.speakerId)
    : -1;
  const balloonAt = speaker < 0 ? 50 : places[speaker];
  const balloonTop = `calc(118vh - 96vh * ${(shown[speaker]?.stageHeight ?? 100) / 100} + 4vh)`;

  // The effects, laid out once.
  const motes = useMemo(
    () => Array.from({ length: kind === "fireworks" ? 7 : 22 }, (_, i) => i),
    [kind],
  );

  return (
    <div
      className={`trip-moment trip-${kind}`}
      onClick={onDone}
      role="presentation"
    >
      {drive ? (
        <div className="trip-drive">
          <div
            className="trip-road"
            style={
              {
                backgroundImage: `url("content://pack/${ROAD}")`,
                "--ratio": ROAD_RATIO,
              } as CSSProperties
            }
          />
          <div
            className="trip-car"
            style={{
              width: `${CAR_VW}vw`,
              bottom: `${CAR_BOTTOM_VH}vh`,
              aspectRatio: CAR_RATIO,
            }}
          >
            {seated.map((one, i) => (
              <div
                key={one.id}
                className="trip-window"
                style={{
                  left: `${WINDOWS[i].x}%`,
                  top: `${WINDOWS[i].y}%`,
                  width: `${WINDOWS[i].w}%`,
                  height: `${WINDOWS[i].h}%`,
                }}
              >
                <img
                  className="trip-head"
                  src={`content://pack/${one.walk}`}
                  alt=""
                />
              </div>
            ))}
            <img
              className="trip-car-body"
              src={`content://pack/${CAR}`}
              alt=""
            />
          </div>
        </div>
      ) : clip ? (
        <video
          className="trip-scene"
          src={`content://pack/${clip}`}
          autoPlay
          loop
          playsInline
          muted={effects === 0}
          ref={(video) => {
            if (video) video.volume = CLIP_VOLUME * effects;
          }}
        />
      ) : (
        <div
          className="trip-scene"
          style={{
            backgroundImage: `url("content://pack/${BACKDROPS[kind]}")`,
          }}
        />
      )}
      {/* The private bath opens on its door sliding back. */}
      {kind === "private-bath" && (
        <>
          <div className="trip-door left" />
          <div className="trip-door right" />
        </>
      )}
      {!clip && (
        <div className="trip-fx">
          {(kind === "soak" ||
            kind === "private-bath" ||
            kind === "last-morning") &&
            motes
              .slice(0, 12)
              .map((i) => (
                <i
                  key={i}
                  className="trip-steam"
                  style={
                    {
                      "--x": `${spread(i, 1) * 100}%`,
                      "--d": `${spread(i, 2) * 3}s`,
                      "--s": 0.6 + spread(i, 3) * 1.2,
                    } as CSSProperties
                  }
                />
              ))}
          {kind === "cascade" &&
            motes.map((i) => (
              <i
                key={i}
                className="trip-leaf"
                style={
                  {
                    "--x": `${spread(i, 1) * 100}%`,
                    "--d": `${spread(i, 2) * 4}s`,
                    "--sway": `${(spread(i, 3) - 0.5) * 30}vw`,
                    "--c": ["#c0392b", "#e67e22", "#f1c40f", "#a93226"][i % 4],
                  } as CSSProperties
                }
              />
            ))}
          {kind === "market" &&
            motes.map((i) => (
              <i
                key={i}
                className="trip-bokeh"
                style={
                  {
                    "--x": `${spread(i, 1) * 100}%`,
                    "--y": `${spread(i, 4) * 100}%`,
                    "--d": `${spread(i, 2) * 3}s`,
                    "--s": 0.5 + spread(i, 3) * 1.5,
                  } as CSSProperties
                }
              />
            ))}
          {kind === "fireworks" &&
            motes.map((i) => (
              <div
                key={i}
                className="trip-burst"
                style={
                  {
                    "--x": `${15 + spread(i, 1) * 70}%`,
                    "--y": `${10 + spread(i, 4) * 35}%`,
                    "--d": `${0.3 + i * 0.6}s`,
                    "--c": [
                      "#ffd25e",
                      "#ff6f91",
                      "#7fd8ff",
                      "#b892ff",
                      "#ffffff",
                      "#ff9b4a",
                      "#9dff8a",
                    ][i % 7],
                  } as CSSProperties
                }
              >
                {Array.from({ length: 16 }, (_, k) => (
                  <i
                    key={k}
                    style={{ "--a": `${(k / 16) * 360}deg` } as CSSProperties}
                  />
                ))}
              </div>
            ))}
          {(kind === "cascade" || kind === "last-morning") && (
            <div className="trip-rays" />
          )}
        </div>
      )}
      {shown.map((one, i) => (
        <img
          key={one.id}
          className="trip-companion"
          src={`content://pack/${one.image}`}
          alt=""
          style={
            {
              "--x": `${places[i]}%`,
              "--scale": one.stageHeight / 100,
            } as CSSProperties
          }
        />
      ))}
      {title && <div className="trip-title">{title}</div>}
      {/* In the car, her balloon stands on the top of her window, its tail down at her. */}
      {line && speaker >= 0 && drive && (
        <span
          key={at}
          className="drive-balloon-at"
          style={{ left: `${windowAt(speaker)}%`, bottom: windowTop(speaker) }}
        >
          <button
            type="button"
            className="below-balloon drive-balloon"
            onClick={(event) => {
              event.stopPropagation();
              setAt((n) => n + 1);
            }}
          >
            {line.text}
          </button>
        </span>
      )}
      {line && speaker >= 0 && !drive && (
        <button
          key={at}
          type="button"
          className={
            balloonAt > 50
              ? "below-balloon lantern-balloon toward-left"
              : "below-balloon lantern-balloon"
          }
          style={
            balloonAt > 50
              ? { right: `calc(${100 - balloonAt}% + 7vw)`, top: balloonTop }
              : { left: `calc(${balloonAt}% + 7vw)`, top: balloonTop }
          }
          onClick={(event) => {
            event.stopPropagation();
            setAt((n) => n + 1);
          }}
        >
          {line.text}
        </button>
      )}
    </div>
  );
}

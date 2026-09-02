import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TetrisGame,
  SHAPES,
  COLORS,
  type PieceId,
  type HudData,
  type GameEvent,
} from "./game/tetris";
import { audio } from "./game/audio";

const BG_URL =
  "https://image.qwenlm.ai/generated-images/0997e841-3761-4c89-b7c0-bdd03f0b82e8/_result.png";
const MASCOT_URL =
  "https://image.qwenlm.ai/generated-images/4a777d6a-ee03-4e49-8d37-8efca35d28cc/_result.png";
const SHOOTER_URL =
  "https://image.qwenlm.ai/generated-images/35c2c050-3ff0-4d5d-8f66-a299ec987f96/_result.png";
const CROWD_URL =
  "https://image.qwenlm.ai/generated-images/4b7c6dbb-30d9-4156-a6ab-1ca4e45edf58/_result.png";

const YT_VIDEO_ID = "J7NFL-eOxiQ";
const DROP_AT = 62.6; // 1:03 «Династии»
const CHAOS_DURATION = 9999; // безумие до конца песни

/* ---------- YouTube IFrame API ---------- */
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(v: number): void;
  destroy(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
}
declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          width?: string;
          height?: string;
          videoId: string;
          playerVars?: Record<string, number>;
          events?: Record<string, (e: { data: number; target: YTPlayer }) => void>;
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
function ensureYtApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector("script[data-yt-api]")) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.setAttribute("data-yt-api", "1");
      document.head.appendChild(s);
    }
  });
}

/* ================= small building blocks ================= */

function Panel({
  jp,
  title,
  children,
  className = "",
  bodyClass = "",
}: {
  jp: string;
  title: string;
  children?: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div
      className={
        "clip-panel bg-gradient-to-br from-[#ff2d8f]/70 via-[#4a5ae0]/40 to-[#2de2ff]/70 p-[1.5px] " +
        className
      }
    >
      <div className={"clip-panel bg-[#0d1334]/95 px-3 py-2.5 " + bodyClass}>
        <div className="mb-1.5 flex items-baseline gap-1.5">
          <span className="font-jp text-[10px] leading-none text-[#ff9ecb]">{jp}</span>
          <span className="font-arcade text-[8px] tracking-[0.18em] text-[#8fa2ff]">{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function trim(m: number[][]): number[][] {
  const rows = m.filter((r) => r.some(Boolean));
  if (!rows.length) return m;
  const w = rows[0].length;
  const used = Array.from({ length: w }, (_, x) => rows.some((r) => r[x]));
  return rows.map((r) => r.filter((_, x) => used[x]));
}

function MiniPiece({ id, size = 15, emptyH = 52 }: { id: PieceId | null; size?: number; emptyH?: number }) {
  if (!id) {
    return (
      <div
        style={{ height: emptyH }}
        className="flex items-center justify-center font-jp text-sm text-[#39457f]"
      >
        なし
      </div>
    );
  }
  const m = trim(SHAPES[id]);
  const c = COLORS[id];
  return (
    <div
      className="mx-auto grid"
      style={{ gridTemplateColumns: `repeat(${m[0].length}, ${size}px)`, gap: 1 }}
    >
      {m.flatMap((row, y) =>
        row.map((v, x) => (
          <div
            key={`${y}-${x}`}
            style={{
              width: size,
              height: size,
              borderRadius: 3,
              background: v
                ? `linear-gradient(180deg, ${c.l} 0%, ${c.m} 45%, ${c.d} 100%)`
                : "transparent",
              boxShadow: v
                ? `0 0 9px ${c.g}, inset 0 2px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.35)`
                : "none",
            }}
          />
        ))
      )}
    </div>
  );
}

function Petals() {
  const items = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        dur: 9 + Math.random() * 10,
        delay: -Math.random() * 18,
        sway: 2 + Math.random() * 2.4,
        scale: 0.6 + Math.random() * 0.9,
        op: 0.35 + Math.random() * 0.45,
      })),
    []
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[4] overflow-hidden">
      {items.map((p) => (
        <span
          key={p.id}
          className="absolute"
          style={
            {
              left: `${p.left}%`,
              top: "-4vh",
              "--po": p.op,
              animation: `petal-fall ${p.dur}s linear ${p.delay}s infinite`,
            } as React.CSSProperties
          }
        >
          <i
            className="block"
            style={{
              width: 13 * p.scale,
              height: 13 * p.scale,
              borderRadius: "62% 6% 62% 6%",
              background: "radial-gradient(circle at 30% 30%, #ffe3f1 0%, #ff8ec2 55%, #ff5ca8 100%)",
              boxShadow: "0 0 6px rgba(255,92,168,0.5)",
              animation: `petal-sway ${p.sway}s ease-in-out infinite alternate`,
            }}
          />
        </span>
      ))}
    </div>
  );
}

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" aria-hidden>
      <rect x="1" y="1" width="12" height="12" rx="2" fill="#ff2d8f" />
      <rect x="14" y="1" width="12" height="12" rx="2" fill="#2de2ff" />
      <rect x="27" y="1" width="12" height="12" rx="2" fill="#ffd166" />
      <rect x="14" y="16" width="12" height="12" rx="2" fill="#c06bff" />
    </svg>
  );
}

/* inline SVG icons — no emoji */
const ic = "inline-block align-middle";
function IconPause() {
  return (
    <svg className={ic} width="14" height="14" viewBox="0 0 14 14">
      <rect x="2" y="1" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="8" y="1" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg className={ic} width="14" height="14" viewBox="0 0 14 14">
      <path d="M3 1l9 6-9 6z" fill="currentColor" />
    </svg>
  );
}
function IconRestart() {
  return (
    <svg className={ic} width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M13.8 1.6v3.4h-3.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSound({ off }: { off: boolean }) {
  return (
    <svg className={ic} width="16" height="16" viewBox="0 0 16 16">
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
      {off ? (
        <path d="M10.5 5.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M10.5 5a4 4 0 0 1 0 6M12.5 3.5a6.5 6.5 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}
function IconChipMusic() {
  return (
    <svg className={ic} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 12.5V3l7-1.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4" cy="12.5" r="2" fill="currentColor" />
      <circle cx="11" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}
function IconRadioWave() {
  return (
    <svg className={ic} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5.2 10.8a4 4 0 0 1 0-5.6M10.8 5.2a4 4 0 0 1 0 5.6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 13a7 7 0 0 1 0-10M13 3a7 7 0 0 1 0 10" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconMusicOff() {
  return (
    <svg className={ic} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 12.5V3l7-1.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4" cy="12.5" r="2" fill="currentColor" />
      <circle cx="11" cy="10" r="2" fill="currentColor" />
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

interface Excl {
  id: number;
  main: string;
  sub: string;
  cls: string;
}

const BTN =
  "font-arcade text-[10px] tracking-[0.14em] px-6 py-3.5 clip-panel-sm transition-all duration-150 " +
  "bg-gradient-to-r from-[#ff2d8f] to-[#ff5ca8] text-white hover:brightness-115 hover:-translate-y-0.5 " +
  "active:translate-y-0.5 shadow-[0_0_22px_rgba(255,45,143,0.5)]";
function Key({ k }: { k: string }) {
  return <span className="keycap">{k}</span>;
}

const FLYERS = [
  { src: MASCOT_URL, top: "7%", delay: "0s", dur: "2.6s" },
  { src: SHOOTER_URL, top: "21%", delay: "-0.9s", dur: "3.1s" },
  { src: CROWD_URL, top: "37%", delay: "-1.6s", dur: "2.3s" },
  { src: MASCOT_URL, top: "53%", delay: "-0.4s", dur: "3.4s" },
  { src: SHOOTER_URL, top: "67%", delay: "-2.1s", dur: "2.8s" },
  { src: CROWD_URL, top: "79%", delay: "-1.2s", dur: "3.6s" },
];

/* ================= App ================= */

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TetrisGame | null>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const bestAtStartRef = useRef(0);
  const exclId = useRef(0);
  const lastYtRef = useRef(0);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const radioWrapRef = useRef<HTMLDivElement>(null);

  const [hud, setHud] = useState<HudData>({
    score: 0,
    best: 0,
    lines: 0,
    level: 1,
    combo: 0,
    phase: "menu",
    hold: null,
    next: [],
    hits: 0,
  });
  const [excls, setExcls] = useState<Excl[]>([]);
  const [bubble, setBubble] = useState({ jp: "よろしくね！", ru: "Рада видеть!", key: 0 });
  const [mascotKey, setMascotKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [time, setTime] = useState(0);
  const [aiming, setAiming] = useState(false);
  const [shooterFx, setShooterFx] = useState(0);
  const [hitFx, setHitFx] = useState(0);
  const [chaos, setChaos] = useState(false);
  const [musicMode, setMusicMode] = useState<"chip" | "radio" | "off">(() => {
    try {
      const v = localStorage.getItem("anime-tetris-music");
      if (v === "radio" || v === "off" || v === "chip") return v;
    } catch {
      /* ignore */
    }
    return "chip";
  });
  const [radioPlaying, setRadioPlaying] = useState(false);

  const say = useCallback((jp: string, ru: string) => {
    setBubble((b) => ({ jp, ru, key: b.key + 1 }));
  }, []);

  const pushExcl = useCallback((main: string, sub: string, cls: string) => {
    const id = ++exclId.current;
    setExcls((prev) => [...prev.slice(-2), { id, main, sub, cls }]);
    window.setTimeout(() => setExcls((prev) => prev.filter((e) => e.id !== id)), 1200);
  }, []);

  const domShake = useCallback(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    el.classList.remove("do-shake");
    void el.offsetWidth;
    el.classList.add("do-shake");
  }, []);

  const handleEvent = useCallback(
    (e: GameEvent) => {
      switch (e.type) {
        case "start":
          bestAtStartRef.current = gameRef.current?.best ?? 0;
          setNewRecord(false);
          setChaos(false);
          say("レッツゴー！", "Поехали!");
          break;
        case "clear": {
          const words: Record<number, [string, string, string]> = {
            1: ["YATTA!", "Ятта!", "text-[#7ef0ff]"],
            2: ["SUGOI!", "Сугой!", "text-[#ff9ecb]"],
            3: ["KAWAII!", "Кавайи!", "text-[#9dffb8]"],
          };
          const w = words[e.n] ?? words[1];
          pushExcl(w[0], w[1], w[2]);
          setMascotKey((k) => k + 1);
          const bub: Record<number, [string, string]> = {
            1: ["やった！", "Есть линия!"],
            2: ["すごい！", "Двойная!"],
            3: ["かわいい！", "Тройная!"],
          };
          say(...(bub[e.n] ?? bub[1]));
          break;
        }
        case "tetris":
          pushExcl("テトリス！！", "TETRIS ×4!", "text-[#ffe6a3]");
          say("すごすぎる！！", "Целых четыре!!");
          setMascotKey((k) => k + 1);
          domShake();
          break;
        case "combo":
          pushExcl(`${e.n} COMBO`, "コンボ！", "text-[#7ef0ff]");
          if (e.n >= 3) say("コンボつづき！", "Серия комбо!");
          break;
        case "levelup":
          pushExcl(`LEVEL ${e.level}`, "レベルアップ！", "text-[#ffe6a3]");
          say("レベルアップ！", `Уровень ${e.level}!`);
          setMascotKey((k) => k + 1);
          break;
        case "gameover": {
          const g = gameRef.current;
          if (g) {
            setTime(g.getTime());
            if (g.score > bestAtStartRef.current) setNewRecord(true);
          }
          setChaos(false);
          setAiming(false);
          say("がんばって…", "Гамбатэ… ещё раз!");
          domShake();
          break;
        }
        case "pause":
          if (gameRef.current) setTime(gameRef.current.getTime());
          setAiming(false);
          say("きゅうけいタイム", "Перерыв на чай");
          break;
        case "resume":
          say("さいかい！", "Продолжаем!");
          break;
        case "attack-warn":
          setAiming(true);
          say("ねらわれてる！", "Снайпер-тян целится!");
          break;
        case "attack-shot":
          setAiming(false);
          setShooterFx((k) => k + 1);
          break;
        case "attack-hit":
          setHitFx((k) => k + 1);
          pushExcl("БАМ!", "ひっ! Попала!", "text-[#ff5c7a]");
          say("当たった♡", "Попала! Ай-яй!");
          domShake();
          break;
        case "attack-miss":
          pushExcl("ПРОМАХ!", "ハズレ~", "text-[#7ef0ff]");
          say("ざんねん~", "Уф, промахнулась!");
          break;
        case "chaos-start":
          setChaos(true);
          pushExcl("DROP!!!", "ДРОП! ОЧКИ ×2!", "text-[#ffb347]");
          say("無茶苦茶だー！！", "ПОЛНОЕ БЕЗУМИЕ!!");
          setMascotKey((k) => k + 1);
          domShake();
          break;
        case "chaos-end":
          setChaos(false);
          say("はあはあ…", "Фух… отпустило");
          break;
        case "harddrop":
          break;
      }
    },
    [say, pushExcl, domShake]
  );

  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  /* ---- init game + keyboard ---- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const game = new TetrisGame(cv, {
      onHud: setHud,
      onEvent: (e) => handleEventRef.current(e),
    });
    gameRef.current = game;

    try {
      const m = localStorage.getItem("anime-tetris-muted") === "1";
      if (m) {
        audio.muted = true;
        setMuted(true);
      }
    } catch {
      /* ignore */
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const c = e.code;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"].includes(c)) e.preventDefault();
      if (e.repeat) return;
      switch (c) {
        case "ArrowLeft":
        case "KeyA":
          g.pressDir(-1);
          break;
        case "ArrowRight":
        case "KeyD":
          g.pressDir(1);
          break;
        case "ArrowDown":
        case "KeyS":
          g.setSoft(true);
          break;
        case "ArrowUp":
        case "KeyX":
          g.rotate(1);
          break;
        case "KeyZ":
          g.rotate(-1);
          break;
        case "Space":
          g.hardDrop();
          break;
        case "KeyC":
        case "ShiftLeft":
        case "ShiftRight":
          g.doHold();
          break;
        case "KeyP":
        case "Escape":
          if (g.phase === "playing" || g.phase === "paused") g.togglePause();
          break;
        case "Enter":
          audio.ensure();
          if (g.phase === "menu" || g.phase === "gameover") g.start();
          else if (g.phase === "paused") g.togglePause();
          break;
        case "KeyM":
          toggleMuteRef.current();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          g.releaseDir(-1);
          break;
        case "ArrowRight":
        case "KeyD":
          g.releaseDir(1);
          break;
        case "ArrowDown":
        case "KeyS":
          g.setSoft(false);
          break;
      }
    };
    const onBlur = () => {
      const g = gameRef.current;
      if (g && g.phase === "playing") g.togglePause();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
      game.destroy();
      gameRef.current = null;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      }
    };
  }, []);

  const toggleMute = useCallback(() => {
    const next = !audio.muted;
    audio.ensure();
    audio.setMuted(next);
    setMuted(next);
    try {
      if (ytPlayerRef.current) ytPlayerRef.current.setVolume(next ? 0 : 70);
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("anime-tetris-muted", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleMuteRef = useRef(toggleMute);
  toggleMuteRef.current = toggleMute;

  /* ---- музыкальный режим ---- */
  const cycleMusic = useCallback(() => {
    setMusicMode((m) => {
      const next = m === "chip" ? "radio" : m === "radio" ? "off" : "chip";
      try {
        localStorage.setItem("anime-tetris-music", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    audio.musicEnabled = musicMode === "chip";
    if (musicMode !== "radio") {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          /* ignore */
        }
      }
      setRadioPlaying(false);
      audio.stopMusic();
      if (musicMode === "chip" && gameRef.current && gameRef.current.phase === "playing") {
        audio.startMusic();
      }
      return;
    }
    // radio
    audio.stopMusic();
    let cancelled = false;
    ensureYtApi().then(() => {
      if (cancelled || !window.YT?.Player || !radioWrapRef.current) return;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.playVideo();
        } catch {
          /* ignore */
        }
        return;
      }
      radioWrapRef.current.innerHTML = "";
      const host = document.createElement("div");
      host.style.height = "100%";
      radioWrapRef.current.appendChild(host);
      ytPlayerRef.current = new window.YT.Player(host, {
        width: "100%",
        height: "100%",
        videoId: YT_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
          disablekb: 1,
        },
        events: {
          onReady: (e) => {
            e.target.setVolume(audio.muted ? 0 : 70);
            e.target.playVideo();
          },
          onStateChange: (e) => {
            if (e.data === 1) setRadioPlaying(true);
            if (e.data === 2) setRadioPlaying(false);
            if (e.data === 0) e.target.playVideo(); // зацикливаем трек
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [musicMode]);

  /* ---- детектор дропа на 1:03 ---- */
  useEffect(() => {
    if (musicMode !== "radio") return;
    const t = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      try {
        if (p.getPlayerState() !== 1) return;
        const tt = p.getCurrentTime() ?? 0;
        let prev = lastYtRef.current;
        if (tt < prev - 2) prev = 0; // трек начался заново
        if (prev < DROP_AT && tt >= DROP_AT) gameRef.current?.triggerChaos(CHAOS_DURATION);
        lastYtRef.current = tt;
      } catch {
        /* ignore */
      }
    }, 200);
    return () => window.clearInterval(t);
  }, [musicMode]);

  /* ---- сюрприз-безумие в чиптюн-режиме ---- */
  useEffect(() => {
    if (hud.phase !== "playing" || musicMode !== "chip") return;
    const t = window.setTimeout(
      () => gameRef.current?.triggerChaos(),
      60000 + Math.random() * 30000
    );
    return () => window.clearTimeout(t);
  }, [hud.phase, musicMode]);

  const radioPlay = useCallback(() => {
    audio.ensure();
    try {
      ytPlayerRef.current?.playVideo();
    } catch {
      /* ignore */
    }
  }, []);

  /* bubble auto-reset to idle */
  useEffect(() => {
    const t = window.setTimeout(() => say("よろしくね！", "Рада видеть!"), 3400);
    return () => window.clearTimeout(t);
  }, [bubble.key, say]);

  /* timer */
  useEffect(() => {
    if (hud.phase !== "playing") return;
    const t = window.setInterval(() => setTime(gameRef.current?.getTime() ?? 0), 500);
    return () => window.clearInterval(t);
  }, [hud.phase]);

  const startGame = () => {
    audio.ensure();
    gameRef.current?.start();
  };

  const inGame = hud.phase === "playing" || hud.phase === "paused";
  const levelProg = (hud.lines % 10) * 10;

  return (
    <div className={"relative min-h-screen overflow-hidden " + (chaos ? "chaos-root" : "")}>
      {/* ============ ambient background ============ */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <img
          src={BG_URL}
          alt=""
          className="anim-bg-breathe h-full w-full object-cover"
          draggable={false}
        />
        <div
          className={
            "absolute inset-0 bg-gradient-to-b from-[#070a1f]/75 via-[#070a1f]/35 to-[#070a1f]/92 transition-colors duration-500 " +
            (chaos ? "opacity-60" : "")
          }
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(4,6,18,0.75) 100%)" }}
        />
      </div>
      <Petals />

      {/* ============ content ============ */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* header */}
        <header className="flex items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="anim-pulse-glow clip-panel-sm bg-[#0d1334]/90 p-1.5">
              <LogoMark />
            </div>
            <div>
              <h1 className="font-arcade text-[11px] leading-tight md:text-sm">
                <span className="neon-pink">АНИМЕ</span> <span className="neon-cyan">ТЕТРИС</span>
              </h1>
              <p className="font-jp text-[10px] tracking-[0.3em] text-[#8fa2ff]">アニメテトリス</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="clip-panel-sm hidden items-center gap-2 bg-[#0d1334]/90 px-3 py-2 sm:flex">
              <span className="font-jp text-[10px] text-[#ff9ecb]">ベスト</span>
              <span className="font-arcade text-[10px] text-[#ffe6a3]">{hud.best.toLocaleString("ru-RU")}</span>
            </div>
            <button
              onClick={cycleMusic}
              className={
                "clip-panel-sm flex items-center gap-2 bg-[#0d1334]/90 px-3 py-2.5 transition-colors " +
                (musicMode === "radio"
                  ? "text-[#ff5ca8] shadow-[0_0_14px_rgba(255,45,143,0.4)]"
                  : musicMode === "chip"
                    ? "text-[#2de2ff]"
                    : "text-[#5b6aa8] hover:text-[#9fb0ff]")
              }
              aria-label="Режим музыки"
              title="Музыка: чиптюн / радио / выкл"
            >
              {musicMode === "chip" ? <IconChipMusic /> : musicMode === "radio" ? <IconRadioWave /> : <IconMusicOff />}
              <span className="font-arcade hidden text-[8px] tracking-[0.14em] md:inline">
                {musicMode === "chip" ? "ЧИПТЮН" : musicMode === "radio" ? "РАДИО" : "МУЗ OFF"}
              </span>
            </button>
            {inGame && (
              <button
                onClick={() => gameRef.current?.togglePause()}
                className="clip-panel-sm bg-[#0d1334]/90 px-3 py-2.5 text-[#9fb0ff] transition-colors hover:text-[#2de2ff]"
                aria-label="Пауза"
              >
                {hud.phase === "paused" ? <IconPlay /> : <IconPause />}
              </button>
            )}
            {inGame && (
              <button
                onClick={startGame}
                className="clip-panel-sm bg-[#0d1334]/90 px-3 py-2.5 text-[#9fb0ff] transition-colors hover:text-[#ff5ca8]"
                aria-label="Заново"
              >
                <IconRestart />
              </button>
            )}
            <button
              onClick={toggleMute}
              className="clip-panel-sm bg-[#0d1334]/90 px-3 py-2.5 text-[#9fb0ff] transition-colors hover:text-white"
              aria-label="Звук"
            >
              <IconSound off={muted} />
            </button>
          </div>
        </header>

        {/* main arena */}
        <main className="flex flex-1 items-start justify-center gap-3 px-3 pb-8 pt-1 lg:gap-5">
          {/* left column */}
          <aside className="hidden w-52 flex-col gap-3 md:flex">
            <Panel jp="ホールド" title="HOLD">
              <div className="py-1">
                <MiniPiece id={hud.hold} size={16} />
              </div>
              <p className="mt-1 text-center text-[10px] font-semibold tracking-wider text-[#5b6aa8]">
                <Key k="C" /> — спрятать
              </p>
            </Panel>

            {/* mascot card */}
            <div
              key={mascotKey}
              className={
                "clip-panel bg-gradient-to-b from-[#ff2d8f] via-[#8f5ae0]/60 to-[#2de2ff] p-[1.5px] " +
                (mascotKey > 0 ? "anim-bounce-once" : "")
              }
            >
              <div className="clip-panel relative bg-[#0d1334]/95 p-2">
                <div className="clip-panel-sm relative overflow-hidden">
                  <img
                    src={MASCOT_URL}
                    alt="Мико-тян"
                    className="block h-44 w-full object-cover object-top"
                    draggable={false}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0d1334] to-transparent pt-6" />
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                    <span className="font-arcade text-[9px] text-white">МИКО-ТЯН</span>
                    <span className="font-jp text-[9px] text-[#ff9ecb]">サポーター</span>
                  </div>
                </div>
                {/* speech bubble */}
                <div key={bubble.key} className="relative mt-2" style={{ animation: "bubble-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  <div className="clip-panel-sm bg-white/95 px-2.5 py-1.5 text-[#2a2450]">
                    <p className="font-jp text-[12px] leading-tight">{bubble.jp}</p>
                    <p className="text-[10px] font-bold text-[#7a74a8]">{bubble.ru}</p>
                  </div>
                  <span className="absolute -top-1 left-6 h-2.5 w-2.5 rotate-45 bg-white/95" />
                </div>
              </div>
            </div>

            <Panel jp="操作方法" title="CONTROLS">
              <ul className="space-y-1.5 text-[11px] font-semibold text-[#aebaf0]">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1"><Key k="◄" /><Key k="►" /></span> движение
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1"><Key k="▲" /><Key k="X" /></span> поворот
                </li>
                <li className="flex items-center justify-between gap-2">
                  <Key k="Z" /> поворот назад
                </li>
                <li className="flex items-center justify-between gap-2">
                  <Key k="▼" /> ускорить
                </li>
                <li className="flex items-center justify-between gap-2">
                  <Key k="SPACE" /> бросок
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1"><Key k="C" /><Key k="SHIFT" /></span> холд
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex gap-1"><Key k="P" /><Key k="ESC" /></span> пауза
                </li>
              </ul>
            </Panel>

            {/* sniper girl */}
            <div
              className={
                "clip-panel bg-gradient-to-b from-[#ff2d55] via-[#a02fd0]/60 to-[#ff8f2d] p-[1.5px] " +
                (aiming ? "atk-warn" : "")
              }
            >
              <div className="clip-panel relative bg-[#170d24]/95 p-2">
                <div className="mb-1.5 flex items-baseline gap-1.5">
                  <span className="font-jp text-[10px] leading-none text-[#ff8d8d]">スナイパー</span>
                  <span className="font-arcade text-[8px] tracking-[0.18em] text-[#ffab7a]">DANGER</span>
                  {aiming && (
                    <span className="anim-blink font-arcade ml-auto text-[8px] text-[#ff2d55]">ЦЕЛИТСЯ!</span>
                  )}
                </div>
                <div className="clip-panel-sm relative overflow-hidden">
                  <img
                    key={shooterFx}
                    src={SHOOTER_URL}
                    alt="Снайпер-тян"
                    className={"block h-40 w-full object-cover object-top " + (shooterFx > 0 ? "anim-recoil" : "")}
                    draggable={false}
                  />
                  {shooterFx > 0 && (
                    <div className="pointer-events-none absolute" style={{ left: "4%", top: "36%" }}>
                      <div
                        key={"mz" + shooterFx}
                        className="anim-muzzle h-16 w-16 -ml-8 -mt-8 rounded-full"
                        style={{
                          background:
                            "radial-gradient(circle, rgba(255,244,190,0.95) 0%, rgba(255,150,60,0.6) 42%, transparent 68%)",
                        }}
                      />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#170d24] to-transparent pt-6" />
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                    <span className="font-arcade text-[9px] text-white">СНАЙПЕР-ТЯН</span>
                    <span className="font-jp text-[9px] text-[#ff8d8d]">敵・ВРАГ</span>
                  </div>
                </div>
                <p className="mt-1.5 text-center text-[10px] font-semibold leading-snug text-[#c09ab4]">
                  {aiming
                    ? "УВОРАЧИВАЙСЯ! Жми SPACE — бросай фигуру!"
                    : "Шальная пуля: иногда отстреливает блоки у фигуры"}
                </p>
              </div>
            </div>
          </aside>

          {/* board */}
          <div className="flex flex-col items-center gap-2">
            {/* mobile top strip */}
            <div className="flex w-full items-center justify-center gap-2 md:hidden">
              <div className="clip-panel-sm bg-[#0d1334]/92 px-3 py-1.5">
                <p className="mb-0.5 text-center font-jp text-[9px] text-[#ff9ecb]">ホールド</p>
                <MiniPiece id={hud.hold} size={10} emptyH={26} />
              </div>
              <div className="clip-panel-sm bg-[#0d1334]/92 px-3 py-1.5">
                <p className="mb-0.5 text-center font-jp text-[9px] text-[#8fa2ff]">つぎ</p>
                <MiniPiece id={hud.next[0] ?? null} size={10} emptyH={26} />
              </div>
              <div className="clip-panel-sm bg-[#0d1334]/92 px-3 py-1.5">
                <p className="mb-0.5 text-center font-jp text-[9px] text-[#8fa2ff]">スコア</p>
                <p className="font-arcade text-[10px] text-[#7ef0ff]">{hud.score.toLocaleString("ru-RU")}</p>
              </div>
            </div>

            <div ref={boardWrapRef} className="relative">
              {/* neon frame */}
              <div className="clip-panel bg-gradient-to-b from-[#ff2d8f] via-[#6a5ae0] to-[#2de2ff] p-[2.5px] shadow-[0_0_38px_rgba(255,45,143,0.35),0_0_80px_rgba(45,226,255,0.18)]">
                <div className="clip-panel relative bg-[#0a0f2e] p-[3px]">
                  <canvas
                    ref={canvasRef}
                    className="relative block"
                    style={{ height: "min(74vh, 620px)", width: "auto", aspectRatio: "1 / 2" }}
                  />
                  <div className="scanlines pointer-events-none absolute inset-0 z-10" />
                  {hitFx > 0 && (
                    <div
                      key={hitFx}
                      className="anim-hitflash pointer-events-none absolute inset-0 z-10 bg-[#ff2d55]/45"
                    />
                  )}
                  {/* exclamations layer */}
                  <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                    {excls.map((e) => (
                      <div key={e.id} className="absolute inset-0">
                        <div
                          className={"excl text-center " + e.cls}
                          style={{ "--rot": `${(e.id % 5) - 2}deg` } as React.CSSProperties}
                        >
                          <span
                            className="block text-[30px] leading-none"
                            style={{
                              textShadow:
                                "0 0 10px currentColor, 0 0 26px currentColor, 0 3px 0 rgba(7,10,31,0.9)",
                            }}
                          >
                            {e.main}
                          </span>
                          <span className="font-arcade mt-1 block text-[9px] tracking-[0.2em] text-white/90" style={{ textShadow: "0 2px 0 rgba(7,10,31,0.9)" }}>
                            {e.sub}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* corner accents */}
              <span className="absolute -left-1.5 -top-1.5 h-4 w-4 border-l-2 border-t-2 border-[#ff5ca8] drop-shadow-[0_0_6px_rgba(255,92,168,0.9)]" />
              <span className="absolute -right-1.5 -top-1.5 h-4 w-4 border-r-2 border-t-2 border-[#2de2ff] drop-shadow-[0_0_6px_rgba(45,226,255,0.9)]" />
              <span className="absolute -bottom-1.5 -left-1.5 h-4 w-4 border-b-2 border-l-2 border-[#2de2ff] drop-shadow-[0_0_6px_rgba(45,226,255,0.9)]" />
              <span className="absolute -bottom-1.5 -right-1.5 h-4 w-4 border-b-2 border-r-2 border-[#ff5ca8] drop-shadow-[0_0_6px_rgba(255,92,168,0.9)]" />
            </div>

            {/* touch controls */}
            <div className="grid w-full max-w-[340px] grid-cols-6 gap-1.5 md:hidden">
              {(
                [
                  ["◀", (g: TetrisGame) => g.pressDir(-1), (g: TetrisGame) => g.releaseDir(-1)],
                  ["▶", (g: TetrisGame) => g.pressDir(1), (g: TetrisGame) => g.releaseDir(1)],
                  ["▼", (g: TetrisGame) => g.setSoft(true), (g: TetrisGame) => g.setSoft(false)],
                  ["⟳", (g: TetrisGame) => g.rotate(1), null],
                  ["H", (g: TetrisGame) => g.doHold(), null],
                  ["DROP", (g: TetrisGame) => g.hardDrop(), null],
                ] as Array<[string, (g: TetrisGame) => void, ((g: TetrisGame) => void) | null]>
              ).map(([label, down, up]) => (
                <button
                  key={label}
                  className="clip-panel-sm bg-[#141b46]/95 py-3 font-arcade text-[10px] text-[#aebaf0] active:bg-[#232c63] active:text-white"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    audio.ensure();
                    down(gameRef.current!);
                  }}
                  onPointerUp={() => up && gameRef.current && up(gameRef.current)}
                  onPointerLeave={() => up && gameRef.current && up(gameRef.current)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* right column */}
          <aside className="hidden w-40 flex-col gap-3 sm:flex sm:w-48 lg:w-52">
            <Panel jp="つぎ" title="NEXT">
              <div className="py-1">
                <MiniPiece id={hud.next[0] ?? null} size={15} emptyH={40} />
                <div className="mt-2 flex items-center justify-center gap-5">
                  <div className="opacity-70">
                    <MiniPiece id={hud.next[1] ?? null} size={10} emptyH={30} />
                  </div>
                  <div className="opacity-45">
                    <MiniPiece id={hud.next[2] ?? null} size={10} emptyH={30} />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel jp="スコア" title="SCORE">
              <div className="flex items-center gap-2">
                <p className="font-arcade text-[15px] leading-none text-white" style={{ textShadow: "0 0 12px rgba(45,226,255,0.65)" }}>
                  {hud.score.toLocaleString("ru-RU")}
                </p>
                {chaos && <span className="font-arcade chaos-x2 text-[13px]">×2</span>}
              </div>
              <p className="mt-1.5 text-[10px] font-bold tracking-wider text-[#5b6aa8]">
                РЕКОРД <span className="text-[#ffe6a3]">{hud.best.toLocaleString("ru-RU")}</span>
              </p>
            </Panel>

            <Panel jp="レベル" title="LEVEL">
              <div className="flex items-end justify-between">
                <p className="font-arcade text-[18px] leading-none text-[#ff9ecb]" style={{ textShadow: "0 0 14px rgba(255,45,143,0.6)" }}>
                  {hud.level}
                </p>
                <p className="text-[10px] font-bold text-[#5b6aa8]">{hud.lines % 10}/10</p>
              </div>
              <div className="clip-panel-sm relative mt-2 h-2 overflow-hidden bg-[#1a2150]">
                <div
                  className="h-full bg-gradient-to-r from-[#ff2d8f] to-[#2de2ff] transition-all duration-300"
                  style={{ width: `${levelProg}%` }}
                />
                <span
                  className="pointer-events-none absolute inset-y-0 w-6 bg-white/40"
                  style={{ animation: "shine-sweep 2.4s ease-in-out infinite" }}
                />
              </div>
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              <Panel jp="ライン" title="LINES">
                <p className="font-arcade text-[13px] text-[#7ef0ff]">{hud.lines}</p>
              </Panel>
              <Panel jp="時間" title="TIME">
                <p className="font-arcade text-[13px] text-[#aebaf0]">{fmtTime(time)}</p>
              </Panel>
            </div>

            <Panel jp="コンボ" title="COMBO">
              {hud.combo > 1 ? (
                <p
                  key={hud.combo}
                  className="font-arcade text-[16px] text-[#ffe6a3]"
                  style={{
                    animation: "combo-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
                    textShadow: "0 0 14px rgba(255,209,102,0.7)",
                  }}
                >
                  ×{hud.combo}
                </p>
              ) : (
                <p className="font-arcade text-[13px] text-[#39457f]">—</p>
              )}
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              <Panel jp="被弾" title="HITS">
                <p className={"font-arcade text-[13px] " + (hud.hits > 0 ? "text-[#ff5c7a]" : "text-[#39457f]")}>
                  {hud.hits}
                </p>
              </Panel>
              {musicMode === "radio" ? (
                <Panel jp="ラジオ" title="RADIO" bodyClass="pb-1.5">
                  <div className="crt clip-panel-sm relative aspect-video w-full overflow-hidden bg-black">
                    <div ref={radioWrapRef} className="absolute inset-0" />
                    {!radioPlaying && (
                      <button
                        onClick={radioPlay}
                        className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 bg-[#05071a]/70 font-arcade text-[9px] tracking-[0.14em] text-white transition-colors hover:bg-[#05071a]/50"
                      >
                        <IconPlay /> ВКЛ
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={"h-2 w-2 shrink-0 rounded-full bg-[#ff2d55] " + (radioPlaying ? "anim-led" : "opacity-40")} />
                    <p className="min-w-0 truncate text-[9px] font-bold text-[#aebaf0]">
                      ДИНАСТИЯ — VILLIAN, madk1d
                    </p>
                  </div>
                </Panel>
              ) : (
                <Panel jp="音楽" title="MUSIC">
                  <p className="text-[10px] font-semibold leading-snug text-[#5b6aa8]">
                    {musicMode === "chip" ? "Чиптюн-опенинг играет" : "Музыка выключена"}
                  </p>
                </Panel>
              )}
            </div>
          </aside>
        </main>
      </div>

      {/* ============ overlays ============ */}
      {hud.phase === "menu" && (
        <div className="anim-overlay-in absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#05071a]/88 px-4 backdrop-blur-[3px]">
          <FloatingBlocks />
          <div className="anim-rise-in relative grid max-w-4xl items-center gap-8 py-8 md:grid-cols-[1.2fr_auto]">
            <div>
              <p className="font-jp mb-3 inline-block clip-panel-sm bg-[#ff2d8f]/15 px-3 py-1 text-[12px] tracking-[0.35em] text-[#ff9ecb]">
                アニメ・テトリス
              </p>
              <h2 className="font-arcade anim-flicker text-4xl leading-[1.15] md:text-6xl">
                <span className="neon-pink block">АНИМЕ</span>
                <span className="neon-cyan block">ТЕТРИС</span>
              </h2>
              <p className="mt-4 max-w-sm text-[15px] font-semibold leading-relaxed text-[#aebaf0]">
                Собирай линии, лови комбо и заряжайся неоном токийской ночи.
                <span className="font-jp ml-1 text-[#ff9ecb]">がんばって！</span>
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button className={BTN} onClick={startGame}>
                  СТАРТ
                </button>
                <span className="font-arcade anim-blink text-[10px] tracking-[0.2em] text-[#ffe6a3]">
                  НАЖМИ ENTER
                </span>
              </div>

              <div className="mt-7 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-[12px] font-semibold text-[#8fa2ff]">
                <span className="flex items-center gap-2"><Key k="◄" /><Key k="►" /> движение</span>
                <span className="flex items-center gap-2"><Key k="SPACE" /> хард-дроп</span>
                <span className="flex items-center gap-2"><Key k="▲" /> / <Key k="Z" /><Key k="X" /> поворот</span>
                <span className="flex items-center gap-2"><Key k="C" /> холд</span>
                <span className="flex items-center gap-2"><Key k="▼" /> мягкий дроп</span>
                <span className="flex items-center gap-2"><Key k="P" /> пауза</span>
              </div>

              <p className="mt-4 inline-block clip-panel-sm bg-[#ff2d55]/12 px-3 py-1.5 text-[12px] font-semibold text-[#ff9d9d]">
                Осторожно: Снайпер-тян палит по фигуре шальными пулями, а на дропе «Династии» начинается полное безумие
              </p>

              {hud.best > 0 && (
                <p className="mt-6 font-arcade text-[10px] tracking-[0.18em] text-[#8fa2ff]">
                  ЛУЧШИЙ СЧЁТ: <span className="neon-gold">{hud.best.toLocaleString("ru-RU")}</span>
                </p>
              )}
            </div>
            <div className="relative mx-auto w-56 md:w-64">
              <div className="clip-panel bg-gradient-to-b from-[#ff2d8f] via-[#8f5ae0] to-[#2de2ff] p-[2px] shadow-[0_0_50px_rgba(255,45,143,0.4)]">
                <div className="clip-panel overflow-hidden bg-[#0d1334]">
                  <img src={MASCOT_URL} alt="Мико-тян" className="block w-full object-cover" draggable={false} />
                </div>
              </div>
              <p className="font-arcade mt-2 text-center text-[9px] tracking-[0.25em] text-[#ff9ecb]">
                МИКО-ТЯН ЖДЁТ ТЕБЯ
              </p>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "paused" && (
        <div className="anim-overlay-in absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-[#05071a]/78 backdrop-blur-[2px]">
          <p className="font-jp text-[13px] tracking-[0.4em] text-[#8fa2ff]">きゅうけい</p>
          <h2 className="font-arcade neon-cyan text-3xl md:text-4xl">ПАУЗА</h2>
          <p className="font-arcade anim-blink text-[10px] tracking-[0.2em] text-[#aebaf0]">
            P ИЛИ ENTER — ПРОДОЛЖИТЬ
          </p>
        </div>
      )}

      {hud.phase === "gameover" && (
        <div className="anim-overlay-in absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#05071a]/88 px-4 backdrop-blur-[3px]">
          <div className="anim-rise-in w-full max-w-md">
            <div className="clip-panel bg-gradient-to-b from-[#ff2d8f] via-[#6a5ae0] to-[#2de2ff] p-[2px] shadow-[0_0_60px_rgba(255,45,143,0.35)]">
              <div className="clip-panel bg-[#0c1130]/97 px-6 py-7 text-center">
                <p className="font-jp text-[12px] tracking-[0.35em] text-[#ff9ecb]">ゲームオーバー</p>
                <h2 className="font-arcade neon-pink mt-2 text-2xl md:text-3xl">ИГРА ОКОНЧЕНА</h2>

                {newRecord && (
                  <p
                    className="font-arcade neon-gold mt-3 inline-block text-[11px] tracking-[0.2em]"
                    style={{ animation: "combo-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both" }}
                  >
                    НОВЫЙ РЕКОРД!
                  </p>
                )}

                <p className="font-arcade mt-5 text-[10px] tracking-[0.2em] text-[#8fa2ff]">СЧЁТ</p>
                <p className="font-arcade text-3xl text-white" style={{ textShadow: "0 0 18px rgba(45,226,255,0.7)" }}>
                  {hud.score.toLocaleString("ru-RU")}
                </p>

                <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["ライン", "ЛИНИИ", String(hud.lines)],
                    ["レベル", "УРОВЕНЬ", String(hud.level)],
                    ["時間", "ВРЕМЯ", fmtTime(time)],
                    ["被弾", "ПОПАДАНИЯ", String(hud.hits)],
                  ].map(([jp, ru, v]) => (
                    <div key={ru} className="clip-panel-sm bg-[#141b46] px-2 py-2.5">
                      <p className="font-jp text-[9px] text-[#ff9ecb]">{jp}</p>
                      <p className="text-[9px] font-bold tracking-wider text-[#5b6aa8]">{ru}</p>
                      <p className="font-arcade mt-1 text-[12px] text-[#e8ecff]">{v}</p>
                    </div>
                  ))}
                </div>

                <button className={BTN + " mt-7"} onClick={startGame}>
                  ЕЩЁ РАЗ
                </button>
                <p className="font-arcade anim-blink mt-3 text-[9px] tracking-[0.2em] text-[#5b6aa8]">
                  ENTER — РЕВАНШ
                </p>
                <p className="font-jp mt-4 text-[12px] text-[#8fa2ff]">
                  がんばって！<span className="text-[10px] text-[#5b6aa8]">— Мико-тян верит в тебя</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ CHAOS OVERLAY (дроп) ============ */}
      {chaos && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <div className="chaos-redfilter absolute inset-0" />
          <div className="chaos-flicker absolute inset-0" />
          {/* crowd parade */}
          <div className="absolute inset-x-0 bottom-0 h-28">
            <div className="crowd-band crowd-b" style={{ backgroundImage: `url(${CROWD_URL})` }} />
            <div className="crowd-band crowd-a" style={{ backgroundImage: `url(${CROWD_URL})` }} />
          </div>
          {/* flying girls - running everywhere */}
          {FLYERS.map((f, i) => (
            <img
              key={i}
              src={f.src}
              alt=""
              draggable={false}
              className="chaos-flyer chaos-flyer-run"
              style={{ top: f.top, animationDelay: f.delay, animationDuration: f.dur }}
            />
          ))}
          {/* shooter girls with guns - more of them, shooting randomly */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`shooter-${i}`}
              className="chaos-shooter"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 80}%`,
                animationDelay: `${-Math.random() * 5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              } as React.CSSProperties}
            >
              <img
                src={SHOOTER_URL}
                alt=""
                draggable={false}
                className="chaos-shooter-img"
              />
              <div
                className="chaos-muzzle"
                style={{
                  animationDelay: `${Math.random() * 0.5}s`,
                } as React.CSSProperties}
              />
            </div>
          ))}
          {/* big text */}
          <div className="absolute inset-x-0 top-[14%] text-center">
            <span className="font-arcade chaos-drop-text text-3xl md:text-5xl">БЕЗУМИЕ ×2</span>
            <p className="font-jp mt-2 text-[15px] tracking-[0.3em] text-[#ffd9b8]" style={{ textShadow: "0 0 12px rgba(255,120,40,0.9)" }}>
              無茶苦茶モード
            </p>
          </div>
          {/* lyrics / screaming text */}
          <div className="absolute inset-x-0 top-[35%] text-center">
            <span className="font-arcade chaos-scream text-2xl md:text-4xl block animate-pulse">ДИНАСТИЯЯЯЯЯЯЯ</span>
            <span className="font-arcade chaos-lyric text-lg md:text-xl block mt-2">ПЕРВЫЙ МИЛИОН</span>
            <span className="font-arcade chaos-lyric text-lg md:text-xl block">Я ПЕРВЫЙ ЧЕМПИОН</span>
            <span className="font-arcade chaos-lyric text-lg md:text-xl block mt-3 text-[#ff5c7a]">ЛЮБЛЮ МОСКВУ</span>
            <span className="font-arcade chaos-lyric text-sm md:text-base block text-[#ff8f2d]">НО ЗА*БАЛИ ВСЕ МОСКОВСКИЕ Ш*ЛАВЫ</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* decorative floating tetrominoes for the menu */
function FloatingBlocks() {
  const blocks = useMemo(
    () => [
      { id: "T" as PieceId, top: "12%", left: "6%", s: 16, d: "4.2s", r: "-12deg" },
      { id: "I" as PieceId, top: "70%", left: "10%", s: 14, d: "5.1s", r: "8deg" },
      { id: "S" as PieceId, top: "18%", left: "88%", s: 15, d: "4.6s", r: "14deg" },
      { id: "L" as PieceId, top: "76%", left: "84%", s: 16, d: "3.8s", r: "-6deg" },
      { id: "O" as PieceId, top: "45%", left: "94%", s: 12, d: "5.6s", r: "0deg" },
      { id: "J" as PieceId, top: "48%", left: "3%", s: 13, d: "4.9s", r: "10deg" },
    ],
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 hidden md:block">
      {blocks.map((b) => (
        <div
          key={b.id}
          className="absolute opacity-60"
          style={{ top: b.top, left: b.left, animation: `float-y ${b.d} ease-in-out infinite`, ["--fr" as string]: b.r } as React.CSSProperties}
        >
          <MiniPiece id={b.id} size={b.s} />
        </div>
      ))}
    </div>
  );
}

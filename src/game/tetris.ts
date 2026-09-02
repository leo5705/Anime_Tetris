import { audio } from "./audio";

export type PieceId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Phase = "menu" | "playing" | "paused" | "gameover";

export const COLS = 10;
export const ROWS = 20;
export const HIDDEN = 2;
export const TOTAL = ROWS + HIDDEN;
export const CELL = 32;

export interface HudData {
  score: number;
  best: number;
  lines: number;
  level: number;
  combo: number;
  phase: Phase;
  hold: PieceId | null;
  next: PieceId[];
  hits: number;
}

export type GameEvent =
  | { type: "start" }
  | { type: "clear"; n: number }
  | { type: "tetris" }
  | { type: "combo"; n: number }
  | { type: "levelup"; level: number }
  | { type: "gameover" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "attack-warn" }
  | { type: "attack-shot" }
  | { type: "attack-hit" }
  | { type: "attack-miss" }
  | { type: "chaos-start" }
  | { type: "chaos-end" }
  | { type: "harddrop" };

export interface GameHooks {
  onHud: (h: HudData) => void;
  onEvent: (e: GameEvent) => void;
}

export const SHAPES: Record<PieceId, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export const COLORS: Record<PieceId, { m: string; l: string; d: string; g: string }> = {
  I: { m: "#25e0ff", l: "#c2f8ff", d: "#0b7fa6", g: "rgba(37,224,255,0.55)" },
  O: { m: "#ffd23f", l: "#fff4bd", d: "#c29500", g: "rgba(255,210,63,0.55)" },
  T: { m: "#c06bff", l: "#ecd2ff", d: "#7a2fc0", g: "rgba(192,107,255,0.55)" },
  S: { m: "#5dff8f", l: "#d2ffe1", d: "#1d9e50", g: "rgba(93,255,143,0.5)" },
  Z: { m: "#ff5c7a", l: "#ffc9d4", d: "#bd1d43", g: "rgba(255,92,122,0.55)" },
  J: { m: "#5f8bff", l: "#cad9ff", d: "#2747b3", g: "rgba(95,139,255,0.55)" },
  L: { m: "#ffa94d", l: "#ffe6c7", d: "#bd6510", g: "rgba(255,169,77,0.55)" },
};

function cw(m: number[][]): number[][] {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}
function ccw(m: number[][]): number[][] {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[x][n - 1 - y]));
}

const ROTATIONS = {} as Record<PieceId, number[][][]>;
(Object.keys(SHAPES) as PieceId[]).forEach((id) => {
  const rots = [SHAPES[id]];
  for (let i = 1; i < 4; i++) rots.push(cw(rots[i - 1]));
  ROTATIONS[id] = rots;
});

type Kick = [number, number];
const KICKS_JLSTZ: Record<string, Kick[]> = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICKS_I: Record<string, Kick[]> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const BASE_SCORE = [0, 100, 300, 500, 800];
const BEST_KEY = "anime-tetris-best";

interface Particle {
  x: number; y: number; vx: number; vy: number; grav: number;
  t: number; life: number; size: number; color: string; kind: "spark" | "petal" | "star";
  rot: number; vr: number;
}
interface Floater { x: number; y: number; text: string; color: string; t: number; life: number; size: number }
interface Flash { x: number; y: number; t: number }
interface Cur { id: PieceId; rot: number; x: number; y: number; shape: number[][] }
interface Attack {
  phase: "idle" | "aim" | "fire";
  t: number;
  row: number;
  bx: number;
  dir: 1 | -1;
  next: number;
  dmg: number;
}
interface Rock { x: number; y: number; vy: number; vr: number; rot: number; size: number }
interface LavaDrop { x: number; y: number; vy: number }

export class TetrisGame {
  phase: Phase = "menu";
  score = 0;
  lines = 0;
  level = 1;
  combo = -1;
  best = 0;
  hold: PieceId | null = null;
  private hitsTaken = 0;

  private grid: (PieceId | 0)[][] = [];
  private cur: Cur | null = null;
  private queue: PieceId[] = [];
  private bag: PieceId[] = [];
  private holdUsed = false;
  private time = 0;
  private dropAcc = 0;
  private softHeld = false;
  private lockTimer = 0;
  private lockResets = 0;
  private heldDirs: number[] = [];
  private dasDir = 0;
  private dasTimer = 0;
  private arrTimer = 0;
  private clearing: { rows: number[]; t: number } | null = null;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private flashes: Flash[] = [];
  private shake = 0;
  private atk: Attack = { phase: "idle", t: 0, row: 0, bx: 0, dir: 1, next: 12, dmg: 0 };
  /* --- хаос дропа --- */
  private chaos = 0;
  private chaosRockAcc = 0;
  private chaosLavaAcc = 0;
  private lightning = 0;
  private rainbowT = 0;
  private rocks: Rock[] = [];
  private lava: LavaDrop[] = [];

  private raf = 0;
  private last = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  private ghostSprite: HTMLCanvasElement | null = null;
  private hooks: GameHooks;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  constructor(cv: HTMLCanvasElement, hooks: GameHooks) {
    this.cv = cv;
    this.hooks = hooks;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = COLS * CELL * this.dpr;
    cv.height = ROWS * CELL * this.dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    this.ctx = ctx;
    this.grid = this.emptyGrid();
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch {
      this.best = 0;
    }
    this.buildSprites();
    this.hud();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    audio.stopMusic();
  }

  getTime() {
    return this.time;
  }

  /* ---------------- setup ---------------- */
  private emptyGrid(): (PieceId | 0)[][] {
    return Array.from({ length: TOTAL }, () => Array<PieceId | 0>(COLS).fill(0));
  }

  private buildSprites() {
    const pad = 8;
    const S = (CELL + pad * 2) * this.dpr;
    (Object.keys(COLORS) as PieceId[]).forEach((id) => {
      const c = COLORS[id];
      const sp = document.createElement("canvas");
      sp.width = S;
      sp.height = S;
      const g = sp.getContext("2d")!;
      g.scale(this.dpr, this.dpr);
      const o = pad;
      g.shadowColor = c.g;
      g.shadowBlur = 9;
      g.fillStyle = c.m;
      this.rr(g, o + 1.5, o + 1.5, CELL - 3, CELL - 3, 5);
      g.fill();
      g.shadowBlur = 0;
      const grad = g.createLinearGradient(0, o, 0, o + CELL);
      grad.addColorStop(0, c.l);
      grad.addColorStop(0.35, c.m);
      grad.addColorStop(1, c.d);
      g.fillStyle = grad;
      this.rr(g, o + 1.5, o + 1.5, CELL - 3, CELL - 3, 5);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.4)";
      this.rr(g, o + 4, o + 3.5, CELL - 8, 7, 3.5);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 1.2;
      this.rr(g, o + 3, o + 3, CELL - 6, CELL - 6, 4);
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.35)";
      this.rr(g, o + 1.5, o + 1.5, CELL - 3, CELL - 3, 5);
      g.stroke();
      this.sprites.set(id, sp);
    });
    const sp = document.createElement("canvas");
    sp.width = S;
    sp.height = S;
    const g = sp.getContext("2d")!;
    g.scale(this.dpr, this.dpr);
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.setLineDash([4, 3]);
    g.lineWidth = 1.6;
    this.rr(g, pad + 3.5, pad + 3.5, CELL - 7, CELL - 7, 4);
    g.stroke();
    this.ghostSprite = sp;
  }

  private rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------------- helpers ---------------- */
  private cellsOf(shape: number[][]): [number, number][] {
    const out: [number, number][] = [];
    for (let y = 0; y < shape.length; y++)
      for (let x = 0; x < shape[y].length; x++) if (shape[y][x]) out.push([x, y]);
    return out;
  }

  private collides(shape: number[][], px: number, py: number): boolean {
    for (const [cx, cy] of this.cellsOf(shape)) {
      const x = px + cx;
      const y = py + cy;
      if (x < 0 || x >= COLS || y >= TOTAL) return true;
      if (y >= 0 && this.grid[y][x]) return true;
    }
    return false;
  }

  private refill() {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) {
        this.bag = ["I", "O", "T", "S", "Z", "J", "L"];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop()!);
    }
  }

  private spawn(id: PieceId): Cur {
    const n = SHAPES[id].length;
    return {
      id,
      rot: 0,
      x: id === "O" ? 4 : Math.floor((COLS - n) / 2),
      y: 0,
      shape: SHAPES[id].map((r) => [...r]),
    };
  }

  private spawnNext() {
    this.refill();
    const id = this.queue.shift()!;
    this.refill();
    this.cur = this.spawn(id);
    this.lockTimer = 0;
    this.lockResets = 0;
    this.dropAcc = 0;
    if (this.collides(SHAPES[id], this.cur.x, this.cur.y)) {
      this.gameOver();
    }
    this.hud();
  }

  private interval() {
    return Math.max(40, Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1) * 1000);
  }

  private dropY(): number {
    if (!this.cur) return 0;
    let y = this.cur.y;
    while (!this.collides(this.cur.shape, this.cur.x, y + 1)) y++;
    return y;
  }

  private hud() {
    this.hooks.onHud({
      score: this.score,
      best: this.best,
      lines: this.lines,
      level: this.level,
      combo: Math.max(0, this.combo),
      phase: this.phase,
      hold: this.hold,
      next: this.queue.slice(0, 3),
      hits: this.hitsTaken,
    });
  }

  private emit(e: GameEvent) {
    this.hooks.onEvent(e);
  }

  /* ---------------- public input ---------------- */
  start() {
    this.grid = this.emptyGrid();
    this.queue = [];
    this.bag = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.time = 0;
    this.clearing = null;
    this.particles = [];
    this.floaters = [];
    this.flashes = [];
    this.shake = 0;
    this.heldDirs = [];
    this.dasDir = 0;
    this.softHeld = false;
    this.hitsTaken = 0;
    this.atk = { phase: "idle", t: 0, row: 0, bx: 0, dir: 1, next: 12, dmg: 0 };
    this.chaos = 0;
    this.rocks = [];
    this.lava = [];
    this.lightning = 0;
    this.phase = "playing";
    this.spawnNext();
    audio.ensure();
    audio.start();
    audio.startMusic();
    this.emit({ type: "start" });
    this.hud();
  }

  togglePause() {
    if (this.phase === "playing") {
      this.phase = "paused";
      audio.stopMusic();
      audio.pause();
      if (this.atk.phase !== "idle") {
        this.atk.phase = "idle";
        this.atk.next = this.time + 6;
      }
      this.emit({ type: "pause" });
    } else if (this.phase === "paused") {
      this.phase = "playing";
      this.last = performance.now();
      audio.ensure();
      audio.startMusic();
      this.emit({ type: "resume" });
    }
    this.hud();
  }

  pressDir(d: -1 | 1) {
    if (this.phase !== "playing" || !this.cur || this.clearing) return;
    if (!this.heldDirs.includes(d)) this.heldDirs.push(d);
    this.dasDir = d;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.move(d);
  }

  releaseDir(d: -1 | 1) {
    this.heldDirs = this.heldDirs.filter((x) => x !== d);
    if (this.dasDir === d) {
      this.dasDir = this.heldDirs.length ? this.heldDirs[this.heldDirs.length - 1] : 0;
      this.dasTimer = 0;
      this.arrTimer = 0;
    }
  }

  setSoft(on: boolean) {
    this.softHeld = on;
  }

  private move(d: number) {
    if (!this.cur || this.clearing) return;
    if (!this.collides(this.cur.shape, this.cur.x + d, this.cur.y)) {
      this.cur.x += d;
      audio.move();
      this.resetLock();
    }
  }

  rotate(dir: 1 | -1) {
    if (this.phase !== "playing" || !this.cur || this.clearing) return;
    const { id, rot, x, y } = this.cur;
    const to = (rot + dir + 4) % 4;
    const ns = dir === 1 ? cw(this.cur.shape) : ccw(this.cur.shape);
    const table = id === "I" ? KICKS_I : KICKS_JLSTZ;
    const kicks = id === "O" ? ([[0, 0]] as Kick[]) : table[`${rot}>${to}`] || [[0, 0] as Kick];
    for (const [kx, ky] of kicks) {
      if (!this.collides(ns, x + kx, y + ky)) {
        this.cur = { id, rot: to, x: x + kx, y: y + ky, shape: ns };
        audio.rotate();
        this.resetLock();
        this.burstAtPiece(3, COLORS[id].m, 1.2);
        return;
      }
    }
  }

  hardDrop() {
    if (this.phase !== "playing" || !this.cur || this.clearing) return;
    const dist = this.dropY() - this.cur.y;
    this.cur.y = this.dropY();
    this.score += dist * 2 * (this.chaos > 0 ? 2 : 1);
    audio.hard();
    this.shake = Math.max(this.shake, 9);
    this.burstAtPiece(14, "#ffffff", 2.2);
    this.emit({ type: "harddrop" });
    this.lockPiece();
  }

  doHold() {
    if (this.phase !== "playing" || !this.cur || this.clearing || this.holdUsed) return;
    audio.hold();
    const curId = this.cur.id;
    if (this.hold) {
      const h = this.hold;
      this.hold = curId;
      this.cur = this.spawn(h);
    } else {
      this.hold = curId;
      this.refill();
      const id = this.queue.shift()!;
      this.refill();
      this.cur = this.spawn(id);
    }
    this.holdUsed = true;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.dropAcc = 0;
    this.hud();
  }

  private resetLock() {
    if (this.lockResets < 15 && this.cur && this.collides(this.cur.shape, this.cur.x, this.cur.y + 1)) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  /* ---------------- core flow ---------------- */
  private lockPiece() {
    if (!this.cur) return;
    const { id, x, y } = this.cur;
    let topOut = false;
    for (const [cx, cy] of this.cellsOf(this.cur.shape)) {
      const gy = y + cy;
      const gx = x + cx;
      if (gy < 0) continue;
      if (gy < HIDDEN) topOut = true;
      this.grid[gy][gx] = id;
      this.flashes.push({ x: gx, y: gy, t: 0 });
    }
    this.cur = null;
    this.holdUsed = false;

    if (topOut) {
      this.gameOver();
      return;
    }

    const full: number[] = [];
    for (let y2 = 0; y2 < TOTAL; y2++) {
      if (this.grid[y2].every((c) => c !== 0)) full.push(y2);
    }

    if (full.length > 0) {
      this.combo++;
      const n = full.length;
      const mult = this.chaos > 0 ? 2 : 1;
      const gained = (BASE_SCORE[n] * this.level + (this.combo > 0 ? 50 * this.combo * this.level : 0)) * mult;
      this.score += gained;
      this.lines += n;
      this.clearing = { rows: full, t: 0 };
      audio.clear(n, this.combo);
      this.shake = Math.max(this.shake, n >= 4 ? 15 : 5 + n);
      for (const row of full) {
        const vy = row - HIDDEN;
        for (let cx = 0; cx < COLS; cx++) {
          this.spawnParticle(
            cx * CELL + CELL / 2,
            vy * CELL + CELL / 2,
            COLORS[this.grid[row][cx] as PieceId]?.m ?? "#ffffff",
            n >= 4 ? 3 : 2
          );
        }
      }
      this.addFloater(
        COLS * CELL * 0.5,
        (full[0] - HIDDEN) * CELL,
        `+${gained}`,
        mult > 1 ? "#ffb347" : n >= 4 ? "#ffd166" : "#7ef0ff",
        n >= 4 ? 17 : 13
      );
      if (n >= 4) this.emit({ type: "tetris" });
      else this.emit({ type: "clear", n });
      if (this.combo >= 2) this.emit({ type: "combo", n: this.combo });
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
        audio.levelup();
        this.emit({ type: "levelup", level: newLevel });
      }
    } else {
      this.combo = -1;
      audio.lock();
      this.spawnNext();
    }
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* ignore */
      }
    }
    this.hud();
  }

  private gameOver() {
    this.phase = "gameover";
    this.cur = null;
    this.clearing = null;
    this.chaos = 0;
    this.rocks = [];
    this.lava = [];
    this.atk.phase = "idle";
    audio.stopMusic();
    audio.gameover();
    this.shake = 14;
    let count = 0;
    for (let y = HIDDEN; y < TOTAL && count < 220; y++) {
      for (let x = 0; x < COLS && count < 220; x++) {
        const c = this.grid[y][x];
        if (c) {
          this.spawnParticle(x * CELL + CELL / 2, (y - HIDDEN) * CELL + CELL / 2, COLORS[c].m, 1);
          count++;
        }
      }
    }
    this.emit({ type: "gameover" });
    this.hud();
  }

  /* ---------------- sniper attack ---------------- */
  private pieceCenter(): { x: number; y: number } {
    const W = COLS * CELL;
    const H = ROWS * CELL;
    if (!this.cur) return { x: W / 2, y: H * 0.3 };
    const cs = this.cellsOf(this.cur.shape);
    let sx = 0;
    let sy = 0;
    for (const [cx, cy] of cs) {
      sx += (this.cur.x + cx + 0.5) * CELL;
      sy += (this.cur.y + cy - HIDDEN + 0.5) * CELL;
    }
    return { x: sx / cs.length, y: Math.max(CELL, sy / cs.length) };
  }

  triggerChaos(duration?: number) {
    if (this.phase !== "playing") return;
    if (this.chaos <= 0) this.emit({ type: "chaos-start" });
    this.chaos = duration ?? 8;
    this.shake = Math.max(this.shake, 15);
    audio.chaosStart();
  }

  private updateAttack(dt: number) {
    if (this.phase !== "playing") return;
    const a = this.atk;
    if (a.phase === "idle") {
      if (this.level < 2 || !this.cur || this.clearing) return;
      if (this.time >= a.next) {
        a.phase = "aim";
        a.t = 0;
        audio.sniperWarn();
        this.emit({ type: "attack-warn" });
      }
      return;
    }
    a.t += dt;
    if (a.phase === "aim") {
      if (a.t >= 1.05) {
        a.phase = "fire";
        a.t = 0;
        const c = this.pieceCenter();
        a.row = Math.min(ROWS - 1, Math.max(0, Math.round((c.y - CELL / 2) / CELL)));
        a.dir = Math.random() < 0.5 ? 1 : -1;
        a.bx = a.dir === 1 ? -60 : COLS * CELL + 60;
        a.dmg = 1 + (Math.random() < 0.45 ? 1 : 0);
        audio.sniperShot();
        this.emit({ type: "attack-shot" });
      }
      return;
    }
    // fire
    a.bx += a.dir * 2600 * dt;
    const inRange = a.bx > 0 && a.bx < COLS * CELL;
    if (inRange) this.shake = Math.max(this.shake, 1.4);
    const hit = this.cur && Math.abs(a.bx - this.pieceCenter().x) < CELL * 0.55;
    if (inRange && hit && this.cur) {
      audio.sniperHit();
      this.hitsTaken++;
      this.shake = Math.max(this.shake, 10);
      this.burstAtPiece(16, "#ff5c7a", 2.4);
      this.burstAtPiece(8, "#ffffff", 1.6);
      this.dmgCur(a.dmg);
      a.phase = "idle";
      a.next = this.time + Math.max(6, 17 - this.level * 0.6) + Math.random() * 8;
      this.emit({ type: "attack-hit" });
      this.hud();
      return;
    }
    if ((a.dir === 1 && a.bx >= COLS * CELL + 40) || (a.dir === -1 && a.bx <= -40)) {
      audio.sniperMiss();
      a.phase = "idle";
      a.next = this.time + Math.max(6, 17 - this.level * 0.6) + Math.random() * 8;
      this.emit({ type: "attack-miss" });
    }
  }

  private dmgCur(dmg: number) {
    const cur = this.cur;
    if (!cur) return;
    const cells = this.cellsOf(cur.shape);
    for (let k = 0; k < dmg && cells.length > 1; k++) {
      const idx = Math.floor(Math.random() * cells.length);
      const [cx, cy] = cells[idx];
      cur.shape[cy][cx] = 0;
      cells.splice(idx, 1);
    }
    this.cur = {
      ...cur,
      shape: cur.shape.map((r) => {
        const nr = [...r];
        while (nr.length && nr.every((v) => !v)) nr.pop();
        return nr;
      }),
    };
    if (!this.cur.shape.length || this.cur.shape.every((r) => r.every((v) => !v))) {
      this.cur = null;
      this.holdUsed = false;
      this.spawnNext();
    }
  }

  /* ---------------- chaos of the drop ---------------- */
  private smashCell() {
    if (this.clearing) return;
    const cands: [number, number][] = [];
    for (let y = HIDDEN; y < Math.min(TOTAL, HIDDEN + 7); y++)
      for (let x = 0; x < COLS; x++) if (this.grid[y][x]) cands.push([x, y]);
    if (!cands.length) return;
    const [x, y] = cands[Math.floor(Math.random() * cands.length)];
    const c = this.grid[y][x] as PieceId;
    this.grid[y][x] = 0;
    this.score += 50;
    for (let k = 0; k < 8; k++)
      this.spawnParticle(x * CELL + 16, (y - HIDDEN) * CELL + 16, COLORS[c].m, 1.6);
    this.addFloater(x * CELL + 16, (y - HIDDEN) * CELL, "+50 КАМЕНЬ!", "#ff8f2d", 11);
    this.hud();
  }

  private updateChaos(dt: number) {
    this.chaos -= dt;
    if (this.chaos <= 0) {
      this.chaos = 0;
      this.rocks = [];
      this.lava = [];
      this.lightning = 0;
      this.emit({ type: "chaos-end" });
      return;
    }
    const H = ROWS * CELL;
    this.shake = Math.max(this.shake, 6 + Math.abs(Math.sin(this.rainbowT * 22)) * 3);
    if (this.lightning > 0) this.lightning -= dt;

    this.chaosRockAcc += dt;
    if (this.chaosRockAcc > 0.3) {
      this.chaosRockAcc = 0;
      this.rocks.push({
        x: 10 + Math.random() * (COLS * CELL - 20),
        y: -40,
        vy: 70 + Math.random() * 100,
        vr: (Math.random() - 0.5) * 6,
        rot: Math.random() * 6.3,
        size: 9 + Math.random() * 13,
      });
    }
    this.chaosLavaAcc += dt;
    if (this.chaosLavaAcc > 0.07) {
      this.chaosLavaAcc = 0;
      this.lava.push({ x: Math.random() * COLS * CELL, y: -8, vy: 250 + Math.random() * 230 });
    }
    if (Math.random() < dt * 1.8) {
      this.lightning = 0.11;
      audio.thunder();
    }

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.vy += 520 * dt;
      r.y += r.vy * dt;
      r.rot += r.vr * dt;
      if (r.y > H - r.size * 0.5) {
        this.rocks.splice(i, 1);
        this.shake = Math.max(this.shake, 5);
        audio.rockThud();
        for (let k = 0; k < 10; k++)
          this.spawnParticle(r.x, H - 6, k % 2 ? "#8a8fa8" : "#ff8f2d", 1.4);
        if (Math.random() < 0.3) this.smashCell();
      }
    }
    for (let i = this.lava.length - 1; i >= 0; i--) {
      const l = this.lava[i];
      l.y += l.vy * dt;
      if (Math.random() < dt * 18) this.spawnParticle(l.x, l.y, "#ffae3d", 0.5);
      if (l.y > H + 10) this.lava.splice(i, 1);
    }
  }

  /* ---------------- particles ---------------- */
  private spawnParticle(x: number, y: number, color: string, power: number) {
    if (this.particles.length > 320) return;
    const a = Math.random() * Math.PI * 2;
    const sp = (1.5 + Math.random() * 3.5) * power;
    const kinds: Particle["kind"][] = ["spark", "spark", "star", "petal"];
    this.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 2 * power,
      grav: 14,
      t: 0,
      life: 0.7 + Math.random() * 0.7,
      size: 2 + Math.random() * 4,
      color,
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 8,
    });
  }

  private burstAtPiece(n: number, color: string, power: number) {
    if (!this.cur) return;
    for (const [cx, cy] of this.cellsOf(this.cur.shape)) {
      const gy = this.cur.y + cy - HIDDEN;
      if (gy < 0) continue;
      for (let i = 0; i < n / 2; i++) {
        this.spawnParticle((this.cur.x + cx) * CELL + CELL / 2, gy * CELL + CELL / 2, color, power);
      }
    }
  }

  private addFloater(x: number, y: number, text: string, color: string, size: number) {
    this.floaters.push({ x, y, text, color, t: 0, life: 1.1, size });
  }

  /* ---------------- update ---------------- */
  private update(dt: number) {
    if (this.phase === "playing") {
      this.time += dt;
      if (this.clearing) {
        this.clearing.t += dt * 1000;
        if (this.clearing.t >= 300) {
          const rows = this.clearing.rows;
          this.grid = this.grid.filter((_, i) => !rows.includes(i));
          while (this.grid.length < TOTAL) this.grid.unshift(Array<PieceId | 0>(COLS).fill(0));
          this.clearing = null;
          this.spawnNext();
        }
      } else if (this.cur) {
        if (this.dasDir !== 0) {
          this.dasTimer += dt * 1000;
          if (this.dasTimer >= 150) {
            this.arrTimer += dt * 1000;
            while (this.arrTimer >= 42) {
              this.arrTimer -= 42;
              this.move(this.dasDir);
            }
          }
        }
        const iv = this.softHeld ? Math.min(this.interval(), 38) : this.interval();
        this.dropAcc += dt * 1000;
        if (this.dropAcc >= iv) {
          this.dropAcc = 0;
          if (!this.collides(this.cur.shape, this.cur.x, this.cur.y + 1)) {
            this.cur.y++;
            if (this.softHeld) {
              this.score += 1;
              this.hud();
            }
          }
        }
        if (this.collides(this.cur.shape, this.cur.x, this.cur.y + 1)) {
          this.lockTimer += dt * 1000;
          if (this.lockTimer >= 500) this.lockPiece();
        } else {
          this.lockTimer = 0;
        }
      }
      this.updateAttack(dt);
      if (this.chaos > 0) this.updateChaos(dt);
    }
    // fx
    this.shake *= Math.pow(0.03, dt);
    if (this.shake < 0.25) this.shake = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt * 8;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.rot += p.vr * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.y -= dt * 46;
      if (f.t >= f.life) this.floaters.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt * 1000;
      if (this.flashes[i].t > 180) this.flashes.splice(i, 1);
    }
  }

  /* ---------------- draw ---------------- */
  private loop = (ts: number) => {
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.update(dt);
    this.draw(ts);
    this.raf = requestAnimationFrame(this.loop);
  };

  private drawSprite(id: PieceId, gx: number, gy: number, alpha = 1, scale = 1) {
    const sp = this.sprites.get(id);
    if (!sp) return;
    const g = this.ctx;
    const px = gx * CELL;
    const py = gy * CELL;
    g.globalAlpha = alpha;
    if (scale !== 1) {
      const c = CELL / 2;
      g.drawImage(sp, px + c - (c + 8) * scale, py + c - (c + 8) * scale, (CELL + 16) * scale, (CELL + 16) * scale);
    } else {
      g.drawImage(sp, px - 8, py - 8, CELL + 16, CELL + 16);
    }
    if (this.chaos > 0) {
      g.globalAlpha = alpha * 0.16;
      g.fillStyle = `hsl(${Math.round((this.rainbowT * 240 + gx * 24 + gy * 40) % 360)} 100% 62%)`;
      g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    g.globalAlpha = 1;
  }

  private draw(now: number) {
    const g = this.ctx;
    const W = COLS * CELL;
    const H = ROWS * CELL;
    this.rainbowT = now / 1000;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const sx = (Math.random() * 2 - 1) * this.shake;
    const sy = (Math.random() * 2 - 1) * this.shake;
    g.save();
    g.translate(sx, sy);

    // background
    const bg = g.createLinearGradient(0, 0, 0, H);
    if (this.chaos > 0) {
      bg.addColorStop(0, "#2a0a18");
      bg.addColorStop(0.55, "#1c0820");
      bg.addColorStop(1, "#33100a");
    } else {
      bg.addColorStop(0, "#0b1136");
      bg.addColorStop(0.55, "#0a0e2c");
      bg.addColorStop(1, "#070a20");
    }
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);

    g.save();
    g.globalAlpha = 0.05;
    g.strokeStyle = this.chaos > 0 ? "#ff8f6a" : "#8fa2ff";
    g.lineWidth = 1;
    for (let i = -H; i < W + H; i += 46) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + H * 0.4, H);
      g.stroke();
    }
    g.restore();

    // grid
    g.strokeStyle = "rgba(130,150,255,0.09)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < COLS; x++) {
      g.moveTo(x * CELL, 0);
      g.lineTo(x * CELL, H);
    }
    for (let y = 1; y < ROWS; y++) {
      g.moveTo(0, y * CELL);
      g.lineTo(W, y * CELL);
    }
    g.stroke();

    // column glow
    if (this.cur && !this.clearing) {
      const xs = new Set<number>();
      for (const [cx] of this.cellsOf(this.cur.shape)) xs.add(this.cur.x + cx);
      const colGrad = g.createLinearGradient(0, 0, 0, H);
      colGrad.addColorStop(0, "rgba(45,226,255,0)");
      colGrad.addColorStop(1, "rgba(45,226,255,0.07)");
      g.fillStyle = colGrad;
      xs.forEach((cx) => g.fillRect(cx * CELL, 0, CELL, H));
    }

    // settled cells
    for (let y = HIDDEN; y < TOTAL; y++) {
      if (this.clearing && this.clearing.rows.includes(y)) continue;
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (c) this.drawSprite(c, x, y - HIDDEN);
      }
    }

    // clearing rows animation
    if (this.clearing) {
      const k = Math.min(1, this.clearing.t / 300);
      const scale = 1 - k * 0.85;
      const alpha = 1 - k;
      for (const y of this.clearing.rows) {
        for (let x = 0; x < COLS; x++) {
          const c = this.grid[y][x];
          if (c) this.drawSprite(c, x, y - HIDDEN, alpha, scale);
        }
        g.globalAlpha = (1 - k) * 0.9;
        g.fillStyle = "#ffffff";
        const sweepX = (k * 1.4 - 0.2) * (W + 120) - 60;
        g.fillRect(sweepX, (y - HIDDEN) * CELL, 60, CELL);
        g.globalAlpha = 1;
      }
    }

    // lock flashes
    for (const f of this.flashes) {
      const a = 1 - f.t / 180;
      g.globalAlpha = a * 0.85;
      g.fillStyle = "#ffffff";
      this.rr(g, f.x * CELL + 2, (f.y - HIDDEN) * CELL + 2, CELL - 4, CELL - 4, 4);
      g.fill();
      g.globalAlpha = 1;
    }

    // sniper aim laser + crosshair
    if (this.phase === "playing" && this.atk.phase === "aim" && this.cur) {
      const c = this.pieceCenter();
      const yy = Math.min(H - 8, Math.max(8, c.y));
      const pulse = 0.35 + 0.25 * Math.sin(now / 60);
      const grad = g.createLinearGradient(0, yy - 8, 0, yy + 8);
      grad.addColorStop(0, "rgba(255,45,85,0)");
      grad.addColorStop(0.5, `rgba(255,45,85,${pulse.toFixed(3)})`);
      grad.addColorStop(1, "rgba(255,45,85,0)");
      g.fillStyle = grad;
      g.fillRect(0, yy - 8, W, 16);
      g.strokeStyle = "rgba(255,60,90,0.9)";
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy);
      g.stroke();
      const r = 15 + 6 * Math.sin(now / 90);
      g.save();
      g.translate(c.x, yy);
      g.rotate(now / 500);
      g.strokeStyle = "#ff2d55";
      g.lineWidth = 2;
      g.shadowColor = "rgba(255,45,85,0.9)";
      g.shadowBlur = 8;
      for (let i = 0; i < 4; i++) {
        const a0 = (i * Math.PI) / 2;
        g.beginPath();
        g.arc(0, 0, r, a0 + 0.28, a0 + Math.PI / 2 - 0.28);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-r - 7, 0); g.lineTo(-r + 3, 0);
      g.moveTo(r - 3, 0); g.lineTo(r + 7, 0);
      g.moveTo(0, -r - 7); g.lineTo(0, -r + 3);
      g.moveTo(0, r - 3); g.lineTo(0, r + 7);
      g.stroke();
      g.restore();
    }

    // ghost
    if (this.cur && !this.clearing && this.phase === "playing") {
      const gy = this.dropY();
      if (gy > this.cur.y) {
        const sp = this.ghostSprite!;
        const c = COLORS[this.cur.id];
        for (const [cx, cy] of this.cellsOf(this.cur.shape)) {
          const yy = gy + cy - HIDDEN;
          if (yy < 0) continue;
          g.globalAlpha = 0.5;
          g.drawImage(sp, (this.cur.x + cx) * CELL - 8, yy * CELL - 8, CELL + 16, CELL + 16);
          g.globalAlpha = 0.12;
          g.fillStyle = c.m;
          this.rr(g, (this.cur.x + cx) * CELL + 2, yy * CELL + 2, CELL - 4, CELL - 4, 4);
          g.fill();
          g.globalAlpha = 1;
        }
      }
    }

    // current piece
    if (this.cur && (this.phase === "playing" || this.phase === "paused")) {
      const pulse = 1 + Math.sin(now / 240) * 0.04;
      for (const [cx, cy] of this.cellsOf(this.cur.shape)) {
        const yy = this.cur.y + cy - HIDDEN;
        if (yy < 0) continue;
        this.drawSprite(this.cur.id, this.cur.x + cx, yy, 1, pulse);
      }
    }

    // particles
    for (const p of this.particles) {
      const a = 1 - p.t / p.life;
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.color;
      if (p.kind === "spark") {
        g.beginPath();
        g.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === "star") {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        const s = p.size * 1.4 * a;
        g.beginPath();
        g.moveTo(0, -s);
        g.lineTo(s * 0.3, -s * 0.3);
        g.lineTo(s, 0);
        g.lineTo(s * 0.3, s * 0.3);
        g.lineTo(0, s);
        g.lineTo(-s * 0.3, s * 0.3);
        g.lineTo(-s, 0);
        g.lineTo(-s * 0.3, -s * 0.3);
        g.closePath();
        g.fill();
        g.restore();
      } else {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        const s = p.size * 1.2;
        g.beginPath();
        g.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;

    // rocks & lava drops (chaos)
    for (const r of this.rocks) {
      g.save();
      g.translate(r.x, r.y);
      g.rotate(r.rot);
      g.fillStyle = "#3c4158";
      g.strokeStyle = "#191c2e";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-r.size, -r.size * 0.5);
      g.lineTo(-r.size * 0.3, -r.size);
      g.lineTo(r.size * 0.8, -r.size * 0.6);
      g.lineTo(r.size, r.size * 0.4);
      g.lineTo(r.size * 0.2, r.size);
      g.lineTo(-r.size * 0.7, r.size * 0.7);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "rgba(255,140,50,0.8)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(-r.size * 0.5, -r.size * 0.3);
      g.lineTo(0, 0);
      g.lineTo(r.size * 0.4, -r.size * 0.2);
      g.stroke();
      g.restore();
    }
    for (const l of this.lava) {
      g.save();
      g.shadowColor = "rgba(255,140,40,0.9)";
      g.shadowBlur = 10;
      g.fillStyle = "#ffae3d";
      g.beginPath();
      g.arc(l.x, l.y, 3.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff0c0";
      g.beginPath();
      g.arc(l.x, l.y - 1, 1.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // floaters
    for (const f of this.floaters) {
      const a = f.t < 0.15 ? f.t / 0.15 : 1 - Math.max(0, (f.t - 0.6) / (f.life - 0.6));
      g.globalAlpha = Math.max(0, Math.min(1, a));
      g.font = `700 ${f.size}px "Exo 2", sans-serif`;
      g.textAlign = "center";
      g.lineWidth = 4;
      g.strokeStyle = "rgba(7,10,31,0.9)";
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;

    // danger vignette
    let topFilled = TOTAL;
    outer: for (let y = 0; y < TOTAL; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y][x]) {
          topFilled = y;
          break outer;
        }
      }
    }
    if (this.phase === "playing" && topFilled <= HIDDEN + 4) {
      const danger = (HIDDEN + 5 - topFilled) / 5;
      const a = danger * (0.14 + 0.1 * Math.sin(now / 110));
      const dg = g.createLinearGradient(0, 0, 0, H * 0.4);
      dg.addColorStop(0, `rgba(255,45,80,${Math.max(0, a).toFixed(3)})`);
      dg.addColorStop(1, "rgba(255,45,80,0)");
      g.fillStyle = dg;
      g.fillRect(0, 0, W, H * 0.4);
    }

    // chaos overlay: lava lake + red filter + lightning
    if (this.chaos > 0) {
      const lh = 26 + Math.sin(now / 150) * 8;
      const lg = g.createLinearGradient(0, H - lh - 26, 0, H);
      lg.addColorStop(0, "rgba(255,80,20,0)");
      lg.addColorStop(1, "rgba(255,110,20,0.55)");
      g.fillStyle = lg;
      g.fillRect(0, H - lh - 26, W, lh + 26);
      g.fillStyle = "rgba(255,190,80,0.85)";
      for (let i = 0; i < 6; i++) {
        const bx = ((i * 61 + now / 9) % (W + 30)) - 15;
        const by = H - 8 - Math.abs(Math.sin(now / 260 + i * 1.7)) * 14;
        g.beginPath();
        g.arc(bx, by, 2.4, 0, Math.PI * 2);
        g.fill();
      }
      const pulse = 0.09 + 0.07 * Math.sin(now / 90);
      g.fillStyle = `rgba(255,30,50,${pulse.toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      if (this.lightning > 0) {
        g.globalAlpha = Math.min(0.7, this.lightning * 6);
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
    }

    g.restore();
  }
}

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
  | { type: "harddrop" }
  | { type: "attack-warn" }
  | { type: "attack-shot"; dir: 1 | -1 }
  | { type: "attack-hit" }
  | { type: "attack-miss" };

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

export class TetrisGame {
  phase: Phase = "menu";
  score = 0;
  lines = 0;
  level = 1;
  combo = -1;
  best = 0;
  hold: PieceId | null = null;

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
  private hitsTaken = 0;
  private atk: Attack = { phase: "idle", t: 0, row: 0, bx: 0, dir: 1, next: 12, dmg: 0 };
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
      // glow pass
      g.shadowColor = c.g;
      g.shadowBlur = 9;
      g.fillStyle = c.m;
      this.rr(g, o + 1.5, o + 1.5, CELL - 3, CELL - 3, 5);
      g.fill();
      g.shadowBlur = 0;
      // body gradient
      const grad = g.createLinearGradient(0, o, 0, o + CELL);
      grad.addColorStop(0, c.l);
      grad.addColorStop(0.35, c.m);
      grad.addColorStop(1, c.d);
      g.fillStyle = grad;
      this.rr(g, o + 1.5, o + 1.5, CELL - 3, CELL - 3, 5);
      g.fill();
      // gloss
      g.fillStyle = "rgba(255,255,255,0.4)";
      this.rr(g, o + 4, o + 3.5, CELL - 8, 7, 3.5);
      g.fill();
      // inner rim
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 1.2;
      this.rr(g, o + 3, o + 3, CELL - 6, CELL - 6, 4);
      g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.35)";
      this.rr(g, o + 1.5, o + 1.5, CELL - 3, CELL - 3, 5);
      g.stroke();
      this.sprites.set(id, sp);
    });
    // ghost sprite
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
    this.score += dist * 2;
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
      const gained = BASE_SCORE[n] * this.level + (this.combo > 0 ? 50 * this.combo * this.level : 0);
      this.score += gained;
      this.lines += n;
      this.clearing = { rows: full, t: 0 };
      audio.clear(n, this.combo);
      this.shake = Math.max(this.shake, n >= 4 ? 15 : 5 + n);
      // particles from cleared rows
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
        n >= 4 ? "#ffd166" : "#7ef0ff",
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
    this.atk.phase = "idle";
    audio.stopMusic();
    audio.gameover();
    this.shake = 14;
    // explode the stack
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

  /* ---------------- sniper attacks (анимешки палят по фигуре) ---------------- */
  private pieceCenter(): { vx: number; vy: number } | null {
    if (!this.cur) return null;
    const cells = this.cellsOf(this.cur.shape);
    if (!cells.length) return null;
    let sx = 0;
    let sy = 0;
    for (const [cx, cy] of cells) {
      sx += this.cur.x + cx + 0.5;
      sy += this.cur.y + cy - HIDDEN + 0.5;
    }
    return { vx: sx / cells.length, vy: sy / cells.length };
  }

  private updateAttack(dt: number) {
    const atk = this.atk;
    if (atk.phase === "idle") {
      if (this.cur && !this.clearing && this.time >= atk.next) {
        atk.phase = "aim";
        atk.t = 0;
        atk.dir = Math.random() < 0.5 ? 1 : -1;
        audio.sniperWarn();
        this.emit({ type: "attack-warn" });
      }
      return;
    }
    atk.t += dt;
    if (atk.phase === "aim") {
      if (atk.t >= 0.85) {
        atk.phase = "fire";
        atk.t = 0;
        atk.dmg = 0;
        const c = this.pieceCenter();
        atk.row = c ? Math.max(0, Math.min(ROWS - 1, Math.round(c.vy - 0.5))) : 10;
        atk.bx = atk.dir === 1 ? -1.8 : COLS + 1.8;
        audio.sniperShot();
        this.shake = Math.max(this.shake, 6);
        this.emit({ type: "attack-shot", dir: atk.dir });
      }
      return;
    }
    // fire: bullet flies across the locked row
    atk.bx += atk.dir * 62 * dt;
    if (this.cur && atk.dmg < 2) {
      for (const [cx, cy] of this.cellsOf(this.cur.shape)) {
        const gx = this.cur.x + cx;
        const gy = this.cur.y + cy;
        if (gy - HIDDEN === atk.row && Math.abs(gx + 0.5 - atk.bx) < 0.55) {
          this.cur.shape[cy][cx] = 0;
          atk.dmg++;
          this.hitsTaken++;
          this.shake = Math.max(this.shake, 12);
          audio.sniperHit();
          const px = gx * CELL + CELL / 2;
          const py = (gy - HIDDEN) * CELL + CELL / 2;
          for (let i = 0; i < 14; i++) {
            this.spawnParticle(px, py, i % 3 ? "#ff5c7a" : "#ffd166", 2.4);
          }
          this.addFloater(px, py - 12, "БАМ!", "#ff5c7a", 18);
          this.emit({ type: "attack-hit" });
          this.hud();
          break;
        }
      }
    }
    if ((atk.dir === 1 && atk.bx > COLS + 2.2) || (atk.dir === -1 && atk.bx < -2.2)) {
      const missed = atk.dmg === 0;
      atk.phase = "idle";
      atk.next = this.time + Math.max(9, 13 + Math.random() * 13 - this.level * 0.6);
      if (missed) {
        audio.sniperMiss();
        this.emit({ type: "attack-miss" });
      }
    }
  }

  private drawAttack(g: CanvasRenderingContext2D, now: number, W: number) {
    const atk = this.atk;
    const H = ROWS * CELL;
    if (atk.phase === "aim") {
      const c = this.pieceCenter();
      if (!c) return;
      const px = c.vx * CELL;
      const py = c.vy * CELL;
      const pulse = 0.5 + 0.5 * Math.sin(now / 70);
      // laser line preview
      g.save();
      g.globalAlpha = 0.14 + 0.12 * pulse;
      g.fillStyle = "#ff2d55";
      g.fillRect(0, py - 2, W, 4);
      g.restore();
      // crosshair
      g.save();
      g.strokeStyle = "#ff2d55";
      g.lineWidth = 2.4;
      g.globalAlpha = 0.7 + 0.3 * pulse;
      const r = CELL * 1.05 + pulse * 4;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        g.moveTo(px + dx * (r - 6), py + dy * (r - 6));
        g.lineTo(px + dx * (r + 9), py + dy * (r + 9));
      }
      g.stroke();
      // marker
      g.fillStyle = "#ff2d55";
      g.font = '900 24px "Exo 2", sans-serif';
      g.textAlign = "center";
      g.fillText("!", px, py - r - 8);
      g.restore();
      // red warning frame
      g.save();
      g.strokeStyle = `rgba(255,45,85,${(0.25 + 0.35 * pulse).toFixed(3)})`;
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, W - 3, H - 3);
      g.restore();
    } else if (atk.phase === "fire") {
      const py = (atk.row + 0.5) * CELL;
      const head = atk.bx * CELL;
      const tail = head - atk.dir * CELL * 2.6;
      // muzzle flash
      if (atk.t < 0.08) {
        const mx = atk.dir === 1 ? 4 : W - 4;
        const k = 1 - atk.t / 0.08;
        g.save();
        g.globalAlpha = k;
        g.fillStyle = "#ffe9a8";
        g.beginPath();
        g.arc(mx, py, 18 * k + 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(mx, py, 9 * k + 3, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // tracer
      g.save();
      g.globalCompositeOperation = "lighter";
      const grad = g.createLinearGradient(tail, 0, head, 0);
      grad.addColorStop(0, "rgba(255,92,122,0)");
      grad.addColorStop(0.7, "rgba(255,92,122,0.85)");
      grad.addColorStop(1, "rgba(255,255,255,0.95)");
      g.strokeStyle = grad;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(tail, py);
      g.lineTo(head, py);
      g.stroke();
      g.restore();
    }
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
        // DAS
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
        // gravity
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
        // lock delay
        if (this.collides(this.cur.shape, this.cur.x, this.cur.y + 1)) {
          this.lockTimer += dt * 1000;
          if (this.lockTimer >= 500) this.lockPiece();
        } else {
          this.lockTimer = 0;
        }
      }
      this.updateAttack(dt);
    }
    // fx
    this.shake *= Math.pow(0.03, dt); // fast decay
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
    g.globalAlpha = 1;
  }

  private draw(now: number) {
    const g = this.ctx;
    const W = COLS * CELL;
    const H = ROWS * CELL;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    const sx = (Math.random() * 2 - 1) * this.shake;
    const sy = (Math.random() * 2 - 1) * this.shake;
    g.save();
    g.translate(sx, sy);

    // background
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1136");
    bg.addColorStop(0.55, "#0a0e2c");
    bg.addColorStop(1, "#070a20");
    g.fillStyle = bg;
    g.fillRect(-20, -20, W + 40, H + 40);

    // faint diagonal stripes
    g.save();
    g.globalAlpha = 0.05;
    g.strokeStyle = "#8fa2ff";
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

    // column glow under current piece
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
        // white sweep
        g.globalAlpha = (1 - k) * 0.9;
        g.fillStyle = "#ffffff";
        const sweepX = ((k * 1.4 - 0.2) * (W + 120)) - 60;
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

    // sniper attack visuals
    this.drawAttack(g, now, W);

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

    g.restore();
  }
}

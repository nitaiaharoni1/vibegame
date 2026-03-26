import {
  createWorld, startWorld, defineSystem, Phase, addSystem,
  queryName, addEntity, addComponent,
} from '@vigame/core';
import type { World } from '@vigame/core';
import { ThreeRendererPlugin, Transform3D, Mesh3D } from '@vigame/renderer-three';
import { parseVGX, hydrateScene } from '@vigame/scene';
import { InputPlugin, isKeyDown, isKeyJustPressed } from '@vigame/input';
import { VigameBridgePlugin } from '@vigame/mcp';
import sceneSource from './scene.vgx?raw';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COURT_HALF_W   =  5.9;
const BASELINE_P1_Z  =  9.8;
const BASELINE_P2_Z  = -9.8;
const NET_Z          =  0;
const NET_HEIGHT     =  0.75;
const BALL_START_Y   =  0.5;

const PADDLE_HALF_W  =  1.1;
const PADDLE_SPEED   =  12;
const PADDLE_P1_Z    =  8.5;
const PADDLE_P2_Z    = -8.5;

const BALL_RADIUS    =  0.22;
const BALL_GRAVITY   = -12;
const SERVE_SPEED_H  =  12;
const SERVE_HEIGHT   =  9;

const AI_SPEED       =  10;
const SWING_DUR      =  0.2;
const TRAIL_LEN      =  6;
const GAMES_TO_WIN   =  4;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface BallState { vx: number; vy: number; vz: number }
interface GameState {
  pointsP1: number; pointsP2: number;
  gamesP1: number;  gamesP2: number;
  serving: boolean; servePlayer: 1 | 2;
  ballState: BallState;
  lastHitBy: 0 | 1 | 2;
  bouncesSinceHit: number;
  ballRx: number; ballRz: number;
  rallyCount: number;
  gameOver: boolean;
}

const game: GameState = {
  pointsP1: 0, pointsP2: 0,
  gamesP1: 0,  gamesP2: 0,
  serving: true, servePlayer: 1,
  ballState: { vx: 0, vy: 0, vz: 0 },
  lastHitBy: 0, bouncesSinceHit: 0,
  ballRx: 0, ballRz: 0,
  rallyCount: 0, gameOver: false,
};

// Swing timers (set on hit, decremented each frame in PaddleSystem)
let p1SwingTimer = 0;
let p2SwingTimer = 0;

// Cached entity IDs (set after hydrateScene)
let p1Eid: number | undefined;
let p2Eid: number | undefined;
let ballEid: number | undefined;
let shadowEid: number | undefined;
let camEid: number | undefined;

// Trail
const trailEids: number[] = [];
const trailPositions: Array<{ x: number; y: number; z: number }> = [];

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const score1El  = document.getElementById('score1')!;
const score2El  = document.getElementById('score2')!;
const pointsEl  = document.getElementById('points');
const rallyEl   = document.getElementById('rally');
const messageEl = document.getElementById('message')! as HTMLElement;

const POINT_NAMES = ['0', '15', '30', '40'];

function getPointDisplay(): string {
  const p1 = game.pointsP1, p2 = game.pointsP2;
  if (p1 >= 3 && p2 >= 3) {
    if (p1 === p2) return 'DEUCE';
    return p1 > p2 ? 'ADV · P1' : 'ADV · P2';
  }
  return `${POINT_NAMES[p1] ?? '40'} · ${POINT_NAMES[p2] ?? '40'}`;
}

function updateHUD() {
  score1El.textContent = String(game.gamesP1);
  score2El.textContent = String(game.gamesP2);
  if (pointsEl) pointsEl.textContent = getPointDisplay();
  if (rallyEl) rallyEl.textContent = game.rallyCount > 1 ? `Rally: ${game.rallyCount}` : '';
}

function showMessage(text: string, duration?: number) {
  messageEl.innerHTML = text.replace('\n', '<br>');
  messageEl.style.display = 'block';
  if (duration) setTimeout(() => { messageEl.style.display = 'none'; }, duration);
}

function hideMessage() {
  messageEl.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------
function getPos(world: World, eid: number): { x: number; y: number; z: number } {
  const t = world.components.get('Transform3D')?.get(eid) as Record<string, number> | undefined;
  return { x: t?.['px'] ?? 0, y: t?.['py'] ?? 0, z: t?.['pz'] ?? 0 };
}

function setPos(world: World, eid: number, x: number, y: number, z: number) {
  const store = world.components.get('Transform3D');
  const t = store?.get(eid) as Record<string, number> | undefined;
  if (t && store) store.set(eid, { ...t, px: x, py: y, pz: z });
}

function setRot(world: World, eid: number, rx: number, ry: number, rz: number) {
  const store = world.components.get('Transform3D');
  const t = store?.get(eid) as Record<string, number> | undefined;
  if (t && store) store.set(eid, { ...t, rx, ry, rz });
}

function setShadow(world: World, eid: number, x: number, z: number, scaleXZ: number) {
  const store = world.components.get('Transform3D');
  const t = store?.get(eid) as Record<string, number> | undefined;
  if (t && store) store.set(eid, { ...t, px: x, py: 0.12, pz: z, sx: scaleXZ, sz: scaleXZ });
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function awardPoint(player: 1 | 2, reason: string, world: World) {
  if (player === 1) game.pointsP1++; else game.pointsP2++;

  const p1 = game.pointsP1, p2 = game.pointsP2;
  let gameWon = false;

  if ((p1 >= 4 || p2 >= 4) && Math.abs(p1 - p2) >= 2) {
    if (player === 1) game.gamesP1++; else game.gamesP2++;
    game.pointsP1 = 0; game.pointsP2 = 0;
    game.servePlayer = player === 1 ? 2 : 1;
    gameWon = true;
    if (game.gamesP1 >= GAMES_TO_WIN || game.gamesP2 >= GAMES_TO_WIN) {
      game.gameOver = true;
    }
  }

  game.serving = true;
  game.rallyCount = 0;
  resetBallToCenter(world);
  updateHUD();

  if (game.gameOver) {
    showMessage(`Player ${player} Wins the Set!\nPress R to restart`);
  } else if (gameWon) {
    showMessage(`Game · Player ${player}!\nPress SPACE to serve`, 2500);
  } else {
    const label = reason === 'net' ? 'net fault'
                : reason === 'bounce' ? 'double bounce'
                : 'out';
    showMessage(`Point · P${player} · ${label}\nPress SPACE to serve`, 2000);
  }
}

// ---------------------------------------------------------------------------
// Ball helpers
// ---------------------------------------------------------------------------
function resetBallToCenter(world: World) {
  if (ballEid !== undefined) setPos(world, ballEid, 0, BALL_START_Y, 0);
  if (shadowEid !== undefined) setShadow(world, shadowEid, 0, 0, 1);
  trailEids.forEach(eid => setPos(world, eid, 0, -20, 0));
  trailPositions.forEach(p => { p.x = 0; p.y = -20; p.z = 0; });
  game.ballState = { vx: 0, vy: 0, vz: 0 };
  game.ballRx = 0; game.ballRz = 0;
  game.bouncesSinceHit = 0;
  game.lastHitBy = 0;
  if (ballEid !== undefined) setRot(world, ballEid, 0, 0, 0);
}

function serve(world: World) {
  if (ballEid === undefined) return;
  const paddle = game.servePlayer === 1 ? p1Eid : p2Eid;
  const ppos = paddle !== undefined ? getPos(world, paddle) : { x: 0, y: 0, z: PADDLE_P1_Z };
  const dir: 1 | -1 = game.servePlayer === 1 ? -1 : 1;
  setPos(world, ballEid, ppos.x * 0.3, BALL_START_Y + 1, ppos.z + dir * 0.8);
  game.ballState = {
    vx: (Math.random() - 0.5) * 3,
    vy: SERVE_HEIGHT,
    vz: dir * SERVE_SPEED_H,
  };
  game.lastHitBy = game.servePlayer;
  game.bouncesSinceHit = 0;
  game.ballRx = 0; game.ballRz = 0;
  game.serving = false;
  hideMessage();
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------
const PaddleSystem = defineSystem({
  name: 'PaddleSystem',
  phase: Phase.Update,
  execute(world, delta) {
    // --- Player 1 (bottom, z=+8.5): A / D keys ---
    if (p1Eid !== undefined) {
      const pos = getPos(world, p1Eid);
      let nx = pos.x;
      if (isKeyDown(world, 'KeyA')) nx -= PADDLE_SPEED * delta;
      if (isKeyDown(world, 'KeyD')) nx += PADDLE_SPEED * delta;
      nx = Math.max(-COURT_HALF_W + PADDLE_HALF_W, Math.min(COURT_HALF_W - PADDLE_HALF_W, nx));

      // Swing animation
      if (p1SwingTimer > 0) {
        p1SwingTimer = Math.max(0, p1SwingTimer - delta);
        const t = 1 - p1SwingTimer / SWING_DUR;
        setRot(world, p1Eid, Math.sin(t * Math.PI) * -35, 0, 0);
      } else {
        setRot(world, p1Eid, 0, 0, 0);
      }
      setPos(world, p1Eid, nx, pos.y, PADDLE_P1_Z);
    }

    // --- Player 2 (top, z=-8.5): predictive AI ---
    if (p2Eid !== undefined) {
      const pos = getPos(world, p2Eid);
      let nx = pos.x;

      const bs = game.ballState;
      if (!game.serving && ballEid !== undefined) {
        const ballPos = getPos(world, ballEid);
        if (bs.vz < 0) {
          // Ball heading toward AI — predict landing X
          const timeToReach = Math.max(0.01, (ballPos.z - PADDLE_P2_Z) / (-bs.vz));
          let predictedX = ballPos.x + bs.vx * timeToReach * 0.6;
          predictedX += (Math.random() - 0.5) * 0.7; // imperfection
          predictedX = Math.max(-COURT_HALF_W + PADDLE_HALF_W, Math.min(COURT_HALF_W - PADDLE_HALF_W, predictedX));
          const diff = predictedX - pos.x;
          nx = pos.x + Math.sign(diff) * Math.min(Math.abs(diff), AI_SPEED * delta);
        } else {
          // Ball heading away — drift back toward center
          const diff = -pos.x;
          nx = pos.x + Math.sign(diff) * Math.min(Math.abs(diff), AI_SPEED * 0.35 * delta);
        }
      }

      nx = Math.max(-COURT_HALF_W + PADDLE_HALF_W, Math.min(COURT_HALF_W - PADDLE_HALF_W, nx));

      // Swing animation
      if (p2SwingTimer > 0) {
        p2SwingTimer = Math.max(0, p2SwingTimer - delta);
        const t = 1 - p2SwingTimer / SWING_DUR;
        setRot(world, p2Eid, Math.sin(t * Math.PI) * 35, 0, 0);
      } else {
        setRot(world, p2Eid, 0, 0, 0);
      }
      setPos(world, p2Eid, nx, pos.y, PADDLE_P2_Z);
    }
  },
});

const BallSystem = defineSystem({
  name: 'BallSystem',
  phase: Phase.Update,
  execute(world, delta) {
    // Serve input
    if (game.serving) {
      if (!game.gameOver && isKeyJustPressed(world, 'Space')) serve(world);
      return;
    }

    if (ballEid === undefined) return;

    const bs  = game.ballState;
    const pos = getPos(world, ballEid);

    // --- Gravity ---
    if (pos.y > BALL_RADIUS) bs.vy += BALL_GRAVITY * delta;

    // --- Floor bounce ---
    if (pos.y + bs.vy * delta <= BALL_RADIUS && bs.vy < 0) {
      bs.vy = Math.abs(bs.vy) * 0.65;
      game.bouncesSinceHit++;

      // Double bounce: hitter wins
      if (game.bouncesSinceHit >= 2 && (game.lastHitBy === 1 || game.lastHitBy === 2)) {
        awardPoint(game.lastHitBy, 'bounce', world);
        return;
      }
    }

    // --- Integrate position ---
    let nx = pos.x + bs.vx * delta;
    let ny = Math.max(BALL_RADIUS, pos.y + bs.vy * delta);
    let nz = pos.z + bs.vz * delta;

    // --- Side walls ---
    if (nx > COURT_HALF_W - BALL_RADIUS)  { nx =  COURT_HALF_W - BALL_RADIUS; bs.vx = -Math.abs(bs.vx); }
    if (nx < -(COURT_HALF_W - BALL_RADIUS)) { nx = -(COURT_HALF_W - BALL_RADIUS); bs.vx = Math.abs(bs.vx); }

    // --- Net fault ---
    const fromP1Side = pos.z > NET_Z + BALL_RADIUS && nz <= NET_Z + BALL_RADIUS;
    const fromP2Side = pos.z < NET_Z - BALL_RADIUS && nz >= NET_Z - BALL_RADIUS;
    if ((fromP1Side || fromP2Side) && ny < NET_HEIGHT) {
      const other: 1 | 2 = fromP1Side ? 2 : 1;
      awardPoint(other, 'net', world);
      return;
    }

    // --- Paddle 1 collision (P1 at z=+8.5, ball has vz > 0 approaching P1) ---
    if (p1Eid !== undefined && bs.vz > 0) {
      const pp = getPos(world, p1Eid);
      if (
        nz + BALL_RADIUS >= PADDLE_P1_Z - 0.28 &&
        nz - BALL_RADIUS <= PADDLE_P1_Z + 0.28 &&
        nx >= pp.x - PADDLE_HALF_W - BALL_RADIUS &&
        nx <= pp.x + PADDLE_HALF_W + BALL_RADIUS
      ) {
        const offset = (nx - pp.x) / PADDLE_HALF_W;
        bs.vz = -(SERVE_SPEED_H * 0.8 + Math.abs(bs.vz) * 0.2 + 1.5);
        bs.vy = 6 + Math.random() * 2.5;
        bs.vx = offset * 7 + bs.vx * 0.25;
        bs.vx = Math.max(-10, Math.min(10, bs.vx));
        nz = PADDLE_P1_Z - BALL_RADIUS - 0.28;
        game.lastHitBy = 1;
        game.bouncesSinceHit = 0;
        game.rallyCount++;
        p1SwingTimer = SWING_DUR;
        updateHUD();
      }
    }

    // --- Paddle 2 collision (P2 at z=-8.5, ball has vz < 0 approaching P2) ---
    if (p2Eid !== undefined && bs.vz < 0) {
      const pp = getPos(world, p2Eid);
      if (
        nz - BALL_RADIUS <= PADDLE_P2_Z + 0.28 &&
        nz + BALL_RADIUS >= PADDLE_P2_Z - 0.28 &&
        nx >= pp.x - PADDLE_HALF_W - BALL_RADIUS &&
        nx <= pp.x + PADDLE_HALF_W + BALL_RADIUS
      ) {
        const offset = (nx - pp.x) / PADDLE_HALF_W;
        bs.vz = SERVE_SPEED_H * 0.8 + Math.abs(bs.vz) * 0.2 + 1.5;
        bs.vy = 6 + Math.random() * 2.5;
        bs.vx = offset * 7 + bs.vx * 0.25;
        bs.vx = Math.max(-10, Math.min(10, bs.vx));
        nz = PADDLE_P2_Z + BALL_RADIUS + 0.28;
        game.lastHitBy = 2;
        game.bouncesSinceHit = 0;
        game.rallyCount++;
        p2SwingTimer = SWING_DUR;
        updateHUD();
      }
    }

    // --- Baseline: ball out / not returned ---
    if (nz > BASELINE_P1_Z) { awardPoint(2, 'out', world); return; }
    if (nz < BASELINE_P2_Z) { awardPoint(1, 'out', world); return; }

    // --- Apply position ---
    setPos(world, ballEid, nx, ny, nz);

    // --- Ball spin (visual) ---
    game.ballRx += bs.vz * 55 * delta;
    game.ballRz -= bs.vx * 55 * delta;
    setRot(world, ballEid, game.ballRx, 0, game.ballRz);

    // --- Shadow (scales with height) ---
    if (shadowEid !== undefined) {
      const height = Math.max(0, ny - BALL_RADIUS);
      const shadowScale = Math.max(0.25, 1.0 - height * 0.10);
      setShadow(world, shadowEid, nx, nz, shadowScale);
    }

    // --- Trail ---
    const speed = Math.sqrt(bs.vx * bs.vx + bs.vz * bs.vz);
    trailPositions.unshift({ x: nx, y: ny, z: nz });
    trailPositions.length = TRAIL_LEN;
    trailEids.forEach((eid, i) => {
      const tp = trailPositions[i]!;
      if (speed > 4) {
        setPos(world, eid, tp.x, tp.y, tp.z);
      } else {
        setPos(world, eid, 0, -20, 0);
      }
    });

    // --- Camera subtle follow ---
    if (camEid !== undefined) {
      const cp = getPos(world, camEid);
      const targetX = nx * 0.20;
      setPos(world, camEid, cp.x + (targetX - cp.x) * Math.min(1, 2.5 * delta), cp.y, cp.z);
    }
  },
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const vgxWorld = parseVGX(sceneSource);
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;

const world = createWorld({
  plugins: [
    ThreeRendererPlugin({
      canvas,
      antialias: true,
      shadows: true,
      clearColor: vgxWorld.config.clearColor,
    }),
    InputPlugin(canvas),
    ...(import.meta.env.DEV ? [VigameBridgePlugin()] : []),
  ],
});

hydrateScene(vgxWorld, world);

// Cache entity IDs
p1Eid     = queryName(world, 'Paddle1');
p2Eid     = queryName(world, 'Paddle2');
ballEid   = queryName(world, 'Ball');
shadowEid = queryName(world, 'BallShadow');
camEid    = queryName(world, 'Camera');

// Create trail entities
for (let i = 0; i < TRAIL_LEN; i++) {
  const eid = addEntity(world);
  const s = Math.max(0.12, 1 - (i + 1) * 0.15);
  addComponent(world, eid, Transform3D, { px: 0, py: -20, pz: 0, sx: s, sy: s, sz: s });
  addComponent(world, eid, Mesh3D, {
    shape: 'sphere', color: '#aadd00', size: '0.22', castShadow: false, receiveShadow: false,
  });
  trailEids.push(eid);
  trailPositions.push({ x: 0, y: -20, z: 0 });
}

addSystem(world, PaddleSystem);
addSystem(world, BallSystem);
startWorld(world);

// Restart handler
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && game.gameOver) {
    game.pointsP1 = 0; game.pointsP2 = 0;
    game.gamesP1  = 0; game.gamesP2  = 0;
    game.serving = true; game.servePlayer = 1;
    game.gameOver = false; game.rallyCount = 0;
    resetBallToCenter(world);
    updateHUD();
    showMessage('Press SPACE to serve');
  }
});

updateHUD();
showMessage('Press SPACE to serve');

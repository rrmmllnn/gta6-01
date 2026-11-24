// Solmar Bay — the main loop. Wires the world, the entities, the missions,
// the renderer, the input and the audio together, and owns the game state:
// title, playing, briefing, paused, busted and wasted. It also owns the
// wanted system, the police response, combat, pickups and the save file.
import { CONFIG } from './config.js';
import { buildWorld, collidesSolid, moveWithCollision, nearestRoadPoint, roadInfo } from './world.js';
import {
  circlesOverlap,
  makeBullet,
  makeCar,
  makeParticle,
  makePed,
  makePlayer,
  seedPopulation,
  stepBullet,
  stepCarPhysics,
  stepPed,
  stepPolice,
  stepTraffic,
} from './entities.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import {
  MISSIONS,
  completeMission,
  failMission,
  missionMarker,
  nearRosaGarage,
  newMissionProgress,
  startMission,
  updateMission,
} from './missions.js';
import { drawBriefing, drawEnd, drawEntities, drawHUD, drawPause, drawTitle, drawWorld } from './render.js';
import { isShotMode, setupShot, updateShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.canvas.width;
canvas.height = CONFIG.canvas.height;

const input = makeInput(canvas);
const audio = makeAudio();
const world = buildWorld(CONFIG.seed);
const rng = { next: Math.random };
void rng;

const game = {
  state: 'title',
  time: 0,
  world,
  player: makePlayer(1560, 620),
  cars: [],
  peds: [],
  bullets: [],
  particles: [],
  wanted: 0,
  cash: CONFIG.player.startCash,
  tokens: 0,
  camera: { x: 1560, y: 620 },
  input,
  audio,
  mission: newMissionProgress(),
  message: '',
  messageTimer: 0,
  save: null,
  stats: { missionsDone: 0, carsStolen: 0, shotsFired: 0 },
  sunset: false,
  shot: null,
  shotTime: 0,
  shotDuration: 6,
  lastCrimeAt: -100,
  wantedTimer: 0,
  policeTimer: 0,
  titlePan: 0,
};

// --- Save -----------------------------------------------------------------

function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash === 'number') game.cash = data.cash;
    if (Array.isArray(data.missionsDone)) game.mission.completed = data.missionsDone.slice();
    if (Array.isArray(data.tokens)) {
      for (const id of data.tokens) {
        const tok = world.tokens.find((t) => t.id === id);
        if (tok) tok.taken = true;
      }
      game.tokens = data.tokens.length;
    }
    game.mission.index = Math.min(game.mission.completed.length, MISSIONS.length - 1);
    return data;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    const data = {
      cash: game.cash,
      missionsDone: game.mission.completed,
      tokens: world.tokens.filter((t) => t.taken).map((t) => t.id),
    };
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(data));
    game.saveData = data;
  } catch {
    // Storage unavailable (private mode, file://): the game still plays.
  }
}
game.saveData = loadSave();
game.save = saveGame;

// --- Population -------------------------------------------------------------

{
  const pop = seedPopulation(world, { next: Math.random, pick: (l) => l[Math.floor(Math.random() * l.length)], chance: (p) => Math.random() < p, range: (a, b) => a + Math.random() * (b - a), int: (a, b) => Math.floor(a + Math.random() * (b - a + 1)) });
  game.cars = pop.cars;
  game.peds = pop.peds;
  // A sports car parked near the spawn, for the first joyride.
  const sport = makeCar(1660, 660, Math.PI / 2, 'sport', { color: '#c0392b' });
  game.cars.push(sport);
}

// --- Wanted level -----------------------------------------------------------

function addWanted(n, reason) {
  if (game.time - game.lastCrimeAt < CONFIG.wanted.crimeCooldownSeconds && n <= 1) return;
  game.lastCrimeAt = game.time;
  game.wanted = Math.min(CONFIG.wanted.maxStars, game.wanted + n);
  game.wantedTimer = 0;
  if (reason) {
    game.message = reason;
    game.messageTimer = 2.5;
  }
}

function nearestPoliceDist() {
  let best = Infinity;
  for (const car of game.cars) {
    if (!car.police) continue;
    best = Math.min(best, Math.hypot(car.x - game.player.x, car.y - game.player.y));
  }
  for (const ped of game.peds) {
    if (!ped.cop) continue;
    best = Math.min(best, Math.hypot(ped.x - game.player.x, ped.y - game.player.y));
  }
  return best;
}

function updateWanted(dt) {
  // Quiet time with no cop in sight lets the heat cool off, one star at a time.
  if (game.wanted > 0 && game.time - game.lastCrimeAt > CONFIG.wanted.decayQuietSeconds && nearestPoliceDist() > 550) {
    game.wantedTimer += dt;
    if (game.wantedTimer > CONFIG.wanted.decayPerStarSeconds) {
      game.wanted--;
      game.wantedTimer = 0;
    }
  } else {
    game.wantedTimer = 0;
  }
  // Keep the police presence matched to the wanted level.
  game.policeTimer -= dt;
  if (game.policeTimer <= 0) {
    game.policeTimer = 1.2;
    const wantCars = game.wanted;
    const wantCops = Math.min(8, game.wanted * 2);
    const policeCars = game.cars.filter((c) => c.police);
    const footCops = game.peds.filter((p) => p.cop);
    if (policeCars.length < wantCars) {
      const spot = spawnSpot(520);
      const car = makeCar(spot.x, spot.y, Math.atan2(game.player.y - spot.y, game.player.x - spot.x), 'police');
      game.cars.push(car);
    }
    if (footCops.length < wantCops) {
      const spot = spawnSpot(420);
      const cop = makePed(spot.x, spot.y, { color: '#1c2733' });
      cop.cop = true;
      game.peds.push(cop);
    }
    // No heat: distant police drive off and despawn.
    if (game.wanted === 0) {
      game.cars = game.cars.filter((c) => !c.police || Math.hypot(c.x - game.player.x, c.y - game.player.y) < 1300);
      game.peds = game.peds.filter((p) => !p.cop || Math.hypot(p.x - game.player.x, p.y - game.player.y) < 1300);
    }
  }
}

// A road point at roughly `dist` from the player, for police spawns.
function spawnSpot(dist) {
  const angle = Math.random() * Math.PI * 2;
  const x = Math.max(60, Math.min(CONFIG.world.width - 60, game.player.x + Math.cos(angle) * dist));
  const y = Math.max(60, Math.min(CONFIG.world.height - 60, game.player.y + Math.sin(angle) * dist));
  const p = nearestRoadPoint(x, y);
  return p;
}

// --- Combat -----------------------------------------------------------------

function playerShoot() {
  const p = game.player;
  if (p.ammo <= 0) {
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 1.1;
      game.message = 'Reloading…';
      game.messageTimer = 1.2;
    }
    return;
  }
  p.ammo--;
  p.shootCooldown = 0.22;
  game.stats.shotsFired++;
  const mx = p.x + Math.cos(p.aimAngle) * 22;
  const my = p.y + Math.sin(p.aimAngle) * 22;
  game.bullets.push(makeBullet(mx, my, p.aimAngle, 'player'));
  game.particles.push(...makeParticle(mx, my, '#ffe27a', 4));
  audio.shot();
  addWanted(0);
  // Firing in front of a cop is a crime.
  if (nearestPoliceDist() < 420) addWanted(1, 'The cops saw you shoot!');
}

function damagePlayer(amount) {
  const p = game.player;
  if (p.invulnerable > 0) return;
  p.health -= amount;
  p.invulnerable = 0.25;
  if (p.health <= 0) {
    p.health = 0;
    endRun('wasted');
  }
}

function endRun(kind) {
  game.state = kind;
  const lost = Math.floor(game.cash * (kind === 'busted' ? 0.15 : 0.1));
  game.cash = Math.max(0, game.cash - lost);
  game.wanted = 0;
  game.message = kind === 'busted' ? `Busted! The PD took $${lost.toLocaleString()}.` : `Wasted! The hospital took $${lost.toLocaleString()}.`;
  game.messageTimer = 4;
  if (game.mission.active) failMission(game, kind === 'busted' ? 'you got busted' : 'you got wasted');
  audio.busted();
  game.save();
}

function respawn() {
  const p = game.player;
  const hospital = world.places.hospital;
  p.x = hospital.x;
  p.y = hospital.y;
  p.health = CONFIG.player.health;
  p.ammo = Math.max(p.ammo, 24);
  p.inCar = null;
  p.invulnerable = 2;
  game.camera.x = p.x;
  game.camera.y = p.y;
  game.state = 'playing';
}

// --- Player -----------------------------------------------------------------

function nearestCar(maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of game.cars) {
    const d = Math.hypot(car.x - game.player.x, car.y - game.player.y);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  return best;
}

function enterCar(car) {
  const p = game.player;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  if (car.traffic) {
    car.traffic = false;
    addWanted(1, 'Carjacking! The cops are coming.');
    game.stats.carsStolen++;
  } else if (car.driver === 'parked') {
    addWanted(1, 'Grand theft auto!');
    game.stats.carsStolen++;
  }
  audio.click();
}

function exitCar() {
  const p = game.player;
  const car = p.inCar;
  if (!car) return;
  const side = { x: p.x - Math.sin(car.angle) * 34, y: p.y + Math.cos(car.angle) * 34 };
  if (!collidesSolid(world, side.x, side.y, 14)) {
    p.x = side.x;
    p.y = side.y;
  } else {
    p.x = car.x - Math.cos(car.angle) * 40;
    p.y = car.y - Math.sin(car.angle) * 40;
  }
  p.inCar = null;
  car.speed *= 0.4;
}

function updatePlayer(dt) {
  const p = game.player;
  p.shootCooldown -= dt;
  p.reloadTimer -= dt;
  p.invulnerable -= dt;
  p.arrestTimer = Math.max(0, p.arrestTimer - dt);

  // Aim follows the mouse.
  const m = input.mouse;
  const worldMouse = {
    x: m.x + game.camera.x - CONFIG.canvas.width / 2,
    y: m.y + game.camera.y - CONFIG.canvas.height / 2,
  };
  p.aimAngle = Math.atan2(worldMouse.y - p.y, worldMouse.x - p.x);

  if (p.inCar) {
    const car = p.inCar;
    p.x = car.x;
    p.y = car.y;
    const up = input.anyDown(CONFIG.keys.up);
    const downKey = input.anyDown(CONFIG.keys.down);
    const left = input.anyDown(CONFIG.keys.left);
    const right = input.anyDown(CONFIG.keys.right);
    const throttle = up ? 1 : downKey ? -0.6 : 0;
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const boost = input.down(CONFIG.keys.run) ? 1.35 : 1;
    const brake = input.down(CONFIG.keys.brake);
    const before = car.speed;
    stepCarPhysics(world, car, throttle * boost, steer, dt, brake);
    if (Math.abs(car.speed) < Math.abs(before) - 260) audio.crash();
    audio.setEngine(Math.abs(car.speed) / (CONFIG.cars[car.type]?.maxSpeed || 400), true);
    if (input.pressed(CONFIG.keys.enterCar)) exitCar();
    return;
  }

  audio.setEngine(0, false);
  // On foot.
  const run = input.down(CONFIG.keys.run);
  const speed = run ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;
  let mx = (input.anyDown(CONFIG.keys.right) ? 1 : 0) - (input.anyDown(CONFIG.keys.left) ? 1 : 0);
  let my = (input.anyDown(CONFIG.keys.down) ? 1 : 0) - (input.anyDown(CONFIG.keys.up) ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
    p.running = run;
    const moved = moveWithCollision(world, p.x, p.y, mx * speed * dt, my * speed * dt, CONFIG.player.radius);
    p.x = moved.x;
    p.y = moved.y;
    p.angle = Math.atan2(my, mx);
  } else {
    p.running = false;
  }
  if (input.pressed(CONFIG.keys.enterCar)) {
    const car = nearestCar(64);
    if (car) enterCar(car);
  }
  if ((input.mouse.clicked || input.mouse.held) && p.shootCooldown <= 0 && p.reloadTimer <= 0) {
    playerShoot();
  }
  if (input.pressed(CONFIG.keys.reload) && p.reloadTimer <= 0) {
    p.reloadTimer = 1.1;
    p.ammo = CONFIG.player.maxAmmo;
    game.message = 'Reloaded.';
    game.messageTimer = 1;
  }
}

// --- World update -------------------------------------------------------------

function updateWorld(dt) {
  // Traffic.
  for (const car of game.cars) {
    if (car === game.player.inCar) continue;
    if (car.police) stepPolice(world, car, game.player, dt);
    else if (car.traffic) stepTraffic(world, car, game.cars, dt);
  }
  // Car-vs-car bumps: push apart and slow down.
  for (let i = 0; i < game.cars.length; i++) {
    for (let j = i + 1; j < game.cars.length; j++) {
      const a = game.cars[i];
      const b = game.cars[j];
      if (circlesOverlap(a, b, 22, 22)) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const push = (44 - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        a.speed *= 0.7;
        b.speed *= 0.7;
      }
    }
  }
  // A car hitting a pedestrian on foot is a crime.
  for (const car of game.cars) {
    for (const ped of game.peds) {
      if (ped.dead || ped.hostile || ped.cop) continue;
      if (circlesOverlap(car, ped, 22, 10)) {
        ped.dead = true;
        game.particles.push(...makeParticle(ped.x, ped.y, '#e74c3c', 10));
        if (car === game.player.inCar) addWanted(1, 'You ran someone over!');
      }
    }
  }
  // Pedestrians.
  let gunshotAt = null;
  if (game.stats.shotsFired > 0 && game.bullets.length > 0) {
    const b = game.bullets[game.bullets.length - 1];
    gunshotAt = { x: b.x, y: b.y };
  }
  for (const ped of game.peds) {
    if (ped.dead) continue;
    stepPed(world, ped, game.player, dt, gunshotAt);
    // Hostile peds and cops shoot at the player.
    if ((ped.hostile || ped.cop) && !game.player.inCar) {
      const dist = Math.hypot(game.player.x - ped.x, game.player.y - ped.y);
      ped.shootTimer -= dt;
      if (dist < 430 && ped.shootTimer <= 0) {
        ped.shootTimer = 0.9 + Math.random() * 0.6;
        const aim = Math.atan2(game.player.y - ped.y, game.player.x - ped.x) + (Math.random() - 0.5) * 0.24;
        game.bullets.push(makeBullet(ped.x, ped.y, aim, 'enemy'));
        audio.enemyShot();
      }
    }
    // A foot cop close to the player on foot starts an arrest.
    if (ped.cop && !game.player.inCar) {
      const dist = Math.hypot(game.player.x - ped.x, game.player.y - ped.y);
      if (dist < 30) {
        game.player.arrestTimer += dt;
        if (game.player.arrestTimer > 1.2) endRun('busted');
      }
    }
  }
  game.peds = game.peds.filter((p) => !p.dead || p.hostile || p.cop);
  // Bullets.
  for (const b of game.bullets) {
    const res = stepBullet(world, b, dt);
    if (res !== 'fly') {
      if (res === 'wall') game.particles.push(...makeParticle(b.x, b.y, '#f5d76e', 3));
      b.life = 0;
      continue;
    }
    if (b.from === 'player') {
      for (const ped of game.peds) {
        if (ped.dead) continue;
        if (circlesOverlap(b, ped, 4, 11)) {
          ped.health -= b.damage;
          b.life = 0;
          game.particles.push(...makeParticle(ped.x, ped.y, '#e74c3c', 6));
          if (ped.health <= 0) {
            ped.dead = true;
            if (ped.hostile) {
              game.mission.kills++;
              game.cash += 100;
            } else {
              addWanted(1, 'You shot a civilian!');
            }
          }
          break;
        }
      }
      if (b.life > 0) {
        for (const car of game.cars) {
          if (circlesOverlap(b, car, 4, 22)) {
            b.life = 0;
            game.particles.push(...makeParticle(b.x, b.y, '#f5d76e', 3));
            if (car.police) addWanted(1, 'You shot at the police!');
            break;
          }
        }
      }
    } else if (b.from === 'enemy') {
      const p = game.player;
      if (!p.inCar && circlesOverlap(b, p, 4, 12)) {
        b.life = 0;
        damagePlayer(b.damage);
        game.particles.push(...makeParticle(p.x, p.y, '#e74c3c', 5));
      }
    }
  }
  game.bullets = game.bullets.filter((b) => b.life > 0);
  // Particles.
  for (const part of game.particles) {
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    part.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
  // Tokens and crates.
  for (const tok of world.tokens) {
    if (tok.taken) continue;
    if (Math.hypot(game.player.x - tok.x, game.player.y - tok.y) < 28) {
      tok.taken = true;
      game.tokens++;
      game.cash += 150;
      game.message = `Gold palm ${game.tokens}/${CONFIG.tokensTotal} — +$150`;
      game.messageTimer = 2.5;
      audio.token();
      game.save();
    }
  }
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (Math.hypot(game.player.x - pk.x, game.player.y - pk.y) < 28) {
      pk.taken = true;
      if (pk.kind === 'health') {
        game.player.health = Math.min(100, game.player.health + 40);
        game.message = 'Health +40';
      } else {
        game.player.ammo += 60;
        game.message = 'Ammo +60';
      }
      game.messageTimer = 2;
      audio.pickup();
    }
  }
  // Keep the streets busy: top the traffic and walkers back up.
  if (game.cars.filter((c) => c.traffic).length < 12) {
    const spot = spawnSpot(700);
    const axis = Math.random() < 0.5 ? 'ave' : 'st';
    const line = axis === 'ave' ? spot.x : spot.y;
    const car = makeCar(spot.x, spot.y, axis === 'ave' ? Math.PI / 2 : 0, ['sedan', 'taxi', 'sport', 'truck'][Math.floor(Math.random() * 4)], {
      traffic: true, roadAxis: axis, roadLine: line, roadDir: Math.random() < 0.5 ? 1 : -1,
    });
    car.speed = 80;
    game.cars.push(car);
  }
  if (game.peds.filter((p) => !p.hostile && !p.cop).length < 16) {
    const spot = spawnSpot(500);
    game.peds.push(makePed(spot.x, spot.y));
  }
}

// --- Camera -----------------------------------------------------------------

function updateCamera(dt) {
  void dt;
  const target = game.player;
  const tx = Math.max(CONFIG.canvas.width / 2, Math.min(CONFIG.world.width - CONFIG.canvas.width / 2, target.x));
  const ty = Math.max(CONFIG.canvas.height / 2, Math.min(CONFIG.world.height - CONFIG.canvas.height / 2, target.y));
  game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 6);
  game.camera.y += (ty - game.camera.y) * Math.min(1, dt * 6);
}

// --- Frame ------------------------------------------------------------------

function update(dt) {
  game.time += dt;
  if (game.messageTimer > 0) game.messageTimer -= dt;
  if (game.state === 'title') {
    game.titlePan += dt * 12;
    game.camera.x = 1200 + Math.sin(game.titlePan * 0.05) * 500;
    game.camera.y = 800 + Math.cos(game.titlePan * 0.04) * 300;
    if (input.pressed(CONFIG.keys.confirm)) {
      audio.unlock();
      audio.click();
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'paused') {
    if (input.pressed(CONFIG.keys.pause) || input.pressed(CONFIG.keys.confirm)) game.state = 'playing';
    return;
  }
  if (game.state === 'briefing') {
    if (input.pressed(CONFIG.keys.confirm)) {
      audio.click();
      startMission(game, game.mission.index);
      game.state = 'playing';
    } else if (input.pressed(CONFIG.keys.enterCar)) {
      game.state = 'playing';
    }
    return;
  }
  if (game.state === 'busted' || game.state === 'wasted') {
    if (input.pressed(CONFIG.keys.confirm)) respawn();
    return;
  }
  // Playing.
  if (input.pressed(CONFIG.keys.pause)) {
    game.state = 'paused';
    return;
  }
  if (input.pressed(CONFIG.keys.mute)) {
    const muted = audio.toggleMute();
    game.message = muted ? 'Sound off' : 'Sound on';
    game.messageTimer = 1.5;
  }
  if (game.shot) {
    updateShot(game, dt);
  } else {
    updatePlayer(dt);
  }
  updateWorld(dt);
  updateWanted(dt);
  updateMission(game, dt);
  updateCamera(dt);
  audio.updateSiren(dt);
  audio.updateMusic(dt, true);
  // Rosa's garage opens the next briefing.
  if (!game.mission.active && game.mission.index < MISSIONS.length && nearRosaGarage(game) && !game.shot) {
    game.state = 'briefing';
  }
}

function render() {
  ctx.save();
  ctx.translate(-Math.round(game.camera.x - CONFIG.canvas.width / 2), -Math.round(game.camera.y - CONFIG.canvas.height / 2));
  drawWorld(ctx, game);
  drawEntities(ctx, game);
  ctx.restore();
  if (game.state === 'title') {
    drawTitle(ctx, game);
  } else if (game.state === 'paused') {
    drawHUD(ctx, game);
    drawPause(ctx);
  } else if (game.state === 'briefing') {
    drawHUD(ctx, game);
    drawBriefing(ctx, game);
  } else if (game.state === 'busted' || game.state === 'wasted') {
    drawHUD(ctx, game);
    drawEnd(ctx, game);
  } else {
    drawHUD(ctx, game);
    // "Press E" prompt when a car is close.
    if (!game.player.inCar) {
      const car = nearestCar(64);
      if (car) {
        ctx.fillStyle = 'rgba(10,16,22,0.8)';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        const label = car.type === 'sport' ? 'Press E — steal the sports car' : 'Press E — get in the car';
        const w = ctx.measureText(label).width + 24;
        ctx.fillRect(CONFIG.canvas.width / 2 - w / 2, CONFIG.canvas.height - 150, w, 30);
        ctx.fillStyle = '#ffe27a';
        ctx.fillText(label, CONFIG.canvas.width / 2, CONFIG.canvas.height - 131);
      }
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  input.endFrame();
  requestAnimationFrame(frame);
}

// Shot mode: the ?shot= parameter stages a real scene and plays it forward
// with an autopilot, so screenshots are genuine play, not a posed still.
const shotName = isShotMode();
if (shotName) {
  game.shot = shotName;
  game.state = 'playing';
  setupShot(game, shotName);
  window.__shotReady = false;
}
window.__solmar = game;

requestAnimationFrame(frame);

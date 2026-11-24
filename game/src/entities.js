// Everything that moves in Solmar Bay: the player on foot and behind the wheel,
// traffic that follows the roads, pedestrians on the sidewalks, police cars and
// foot cops that answer the wanted level, bullets, pickups and particles.
// Each update takes the shared state, the world, the input and a bus of event
// names the main loop turns into sound and messages.

import {
  BUST_DISTANCE, BUST_SECONDS, CAR_MODELS, MAX_WANTED, PED_COUNT,
  PLAYER, TRAFFIC_COUNT, WANTED_DECAY_SECONDS, WORLD,
} from './config.js';
import { AVENUES, STREETS, ROAD } from './config.js';
import { angleDelta, angleTo, clamp, distance, pick, range } from './random.js';

let nextId = 1;

export function createState(world, random, save) {
  const state = {
    time: 0,
    cash: save?.cash ?? 250,
    health: PLAYER.health,
    wanted: 0,
    crimeTimer: 0,
    missionIndex: save?.missionIndex ?? 0,
    tokens: save?.tokens ?? 0,
    tokensTotal: 10,
    best: save?.best ?? 0,
    player: {
      x: 800, y: 900, angle: 0, onFoot: true, car: null,
      ammo: PLAYER.magazine, reloading: 0, fireT: 0, bustT: 0,
      speed: 0, moving: false,
    },
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    messages: [],
    stats: { kills: 0, carsStolen: 0, missionsDone: save?.missionIndex ?? 0 },
    mission: null,
    gameOver: null,
  };
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    state.cars.push(makeTrafficCar(state, world, random, false));
  }
  for (let i = 0; i < PED_COUNT; i += 1) {
    state.peds.push(makePed(state, world, random));
  }
  // Parked cars near the garage and the beach, free for the taking.
  const parked = [
    { model: 'sedan', x: 700, y: 860 }, { model: 'pickup', x: 880, y: 700 },
    { model: 'sedan', x: 1120, y: 1820 }, { model: 'sport', x: 1440, y: 1760 },
    { model: 'taxi', x: 480, y: 1560 }, { model: 'sedan', x: 1760, y: 1120 },
  ];
  for (const p of parked) {
    state.cars.push({
      id: nextId++, model: p.model, x: p.x, y: p.y,
      angle: pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      speed: 0, color: pick(random, CAR_MODELS[p.model].colors),
      driver: 'none', health: 100, stuckT: 0, targetSpeed: 0,
    });
  }
  // Gold palm tokens hidden around the city, worth $150 each.
  const tokenSpots = [
    [480, 480], [1440, 480], [2080, 800], [800, 1440], [1760, 1440],
    [2400, 480], [1120, 1840], [480, 1120], [2080, 1440], [1440, 1760],
  ];
  for (const [x, y] of tokenSpots) state.pickups.push({ x, y, kind: 'token' });
  state.pickups.push({ x: 1120, y: 560, kind: 'medkit' });
  state.pickups.push({ x: 1760, y: 560, kind: 'ammo' });
  state.pickups.push({ x: 480, y: 800, kind: 'medkit' });
  return state;
}

export function say(state, text) {
  state.messages.push({ text, t: state.time });
  if (state.messages.length > 4) state.messages.shift();
}

export function addWanted(state, amount, bus) {
  if (amount <= 0) return;
  const before = state.wanted;
  state.wanted = Math.min(MAX_WANTED, state.wanted + amount);
  state.crimeTimer = 0;
  if (state.wanted > before) {
    say(state, `Wanted level ${state.wanted} — the Solmar PD is on you!`);
    bus.push('wanted');
  }
}

/** Right-hand lane offset for a heading: the lane sits on the driver's right. */
function laneOffset(angle) {
  return { x: -Math.sin(angle) * 20, y: Math.cos(angle) * 20 };
}

function makeTrafficCar(state, world, random, nearPlayer) {
  const axis = random() < 0.5 ? 'v' : 'h';
  let x; let y; let angle;
  if (nearPlayer) {
    const p = world.randomRoadPoint();
    x = p.x; y = p.y;
  } else {
    const p = world.randomRoadPoint();
    x = p.x; y = p.y;
  }
  if (axis === 'v') {
    const dir = random() < 0.5 ? 1 : -1;
    angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const lane = laneOffset(angle);
    x = pick(random, AVENUES) + lane.x;
    y = range(random, 80, WORLD.height - 80);
  } else {
    const dir = random() < 0.5 ? 1 : -1;
    angle = dir > 0 ? 0 : Math.PI;
    const lane = laneOffset(angle);
    x = range(random, 80, WORLD.width - 80);
    y = pick(random, STREETS) + lane.y;
  }
  const model = pick(random, ['sedan', 'sedan', 'taxi', 'pickup', 'sport', 'truck']);
  return {
    id: nextId++, model, x, y, angle,
    speed: range(random, 120, 200), color: pick(random, CAR_MODELS[model].colors),
    driver: 'traffic', health: 100, stuckT: 0,
    targetSpeed: range(random, 130, 210), axis, turnT: range(random, 1, 4),
  };
}

function makePed(state, world, random) {
  const p = world.randomSidewalkPoint();
  return {
    x: p.x, y: p.y, angle: range(random, 0, Math.PI * 2),
    speed: range(random, 45, 75), color: pick(random, ['#e8e0c8', '#c8d8e8', '#e8c8d8', '#d8e8c8', '#e8d8a8', '#b8b8d8']),
    target: world.randomSidewalkPoint(), fleeT: 0, downT: 0, panic: 0,
  };
}

function makePoliceCar(state, world, random) {
  const p = world.randomRoadPoint();
  // Spawn on a road 500-800 px from the player, so the chase arrives, not appears.
  let x = p.x; let y = p.y;
  for (let tries = 0; tries < 12; tries += 1) {
    const q = world.randomRoadPoint();
    const d = distance(q.x, q.y, state.player.x, state.player.y);
    if (d > 480 && d < 850) { x = q.x; y = q.y; break; }
  }
  return {
    id: nextId++, model: 'police', x, y,
    angle: angleTo(x, y, state.player.x, state.player.y),
    speed: 0, color: '#20242e', driver: 'police', health: 100, stuckT: 0,
    targetSpeed: CAR_MODELS.police.top, axis: 'v', turnT: 0,
  };
}

function makeFootCop(state, world, random) {
  const a = range(random, 0, Math.PI * 2);
  const d = range(random, 380, 520);
  const x = clamp(state.player.x + Math.cos(a) * d, 40, WORLD.width - 40);
  const y = clamp(state.player.y + Math.sin(a) * d, 40, WORLD.height - 40);
  return { x, y, angle: angleTo(x, y, state.player.x, state.player.y), speed: 205 };
}

function spawnParticles(state, x, y, count, color, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = range(Math.random, 20, speed);
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: range(Math.random, 0.3, 0.8), max: 0.8, color, size: range(Math.random, 2, 5),
    });
  }
}

function nearestCar(state, x, y, maxDist, drivers) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (drivers && !drivers.includes(car.driver)) continue;
    const d = distance(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function playerEnterCar(state, world, bus) {
  const player = state.player;
  if (!player.onFoot) return;
  const car = nearestCar(state, player.x, player.y, 52, ['traffic', 'none', 'police']);
  if (!car) { say(state, 'No car close enough — walk up to one and press E.'); return; }
  if (car.driver === 'police') { say(state, 'That is a police cruiser — too hot to steal.'); return; }
  if (car.driver === 'traffic') {
    car.driver = 'none';
    state.stats.carsStolen += 1;
    addWanted(state, 1, bus);
    say(state, 'Carjacked! The owner ran off to call the cops.');
    spawnParticles(state, car.x, car.y, 6, '#f2c230', 60);
  } else {
    say(state, `You took the ${car.model}.`);
  }
  player.onFoot = false;
  player.car = car;
  car.driver = 'player';
  car.speed = 0;
  bus.push('enter-car');
}

export function playerExitCar(state, world) {
  const player = state.player;
  if (player.onFoot || !player.car) return;
  const car = player.car;
  car.driver = 'none';
  car.speed = 0;
  const side = laneOffset(car.angle + Math.PI / 2);
  const spot = world.resolveCollision(car.x + side.x * 2.4, car.y + side.y * 2.4, PLAYER.radius + 2);
  player.x = spot.x;
  player.y = spot.y;
  player.onFoot = true;
  player.car = null;
}

function playerShoot(state, aim, bus) {
  const player = state.player;
  if (player.reloading > 0 || player.fireT > 0 || player.ammo <= 0) return;
  player.fireT = PLAYER.pistolRate;
  player.ammo -= 1;
  const angle = angleTo(player.x, player.y, aim.x, aim.y);
  player.angle = angle;
  state.bullets.push({
    x: player.x + Math.cos(angle) * 18, y: player.y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900,
    life: PLAYER.pistolRange / 900, fromPlayer: true, damage: PLAYER.pistolDamage,
  });
  spawnParticles(state, player.x + Math.cos(angle) * 22, player.y + Math.sin(angle) * 22, 3, '#ffd76a', 120);
  bus.push('shot');
  if (player.ammo === 0) {
    player.reloading = PLAYER.reloadTime;
    say(state, 'Reloading…');
  }
}

function carCircleHits(car, x, y, r) {
  const m = CAR_MODELS[car.model];
  const fx = car.x + Math.cos(car.angle) * (m.length / 2 - 8);
  const fy = car.y + Math.sin(car.angle) * (m.length / 2 - 8);
  const bx = car.x - Math.cos(car.angle) * (m.length / 2 - 8);
  const by = car.y - Math.sin(car.angle) * (m.length / 2 - 8);
  return distance(x, y, fx, fy) < r + 13 || distance(x, y, bx, by) < r + 13
    || distance(x, y, car.x, car.y) < r + 13;
}

function damageCar(state, car, amount, bus) {
  car.health -= amount;
  spawnParticles(state, car.x, car.y, 5, '#e5534b', 90);
  if (car.health <= 0) {
    spawnParticles(state, car.x, car.y, 26, '#ff8a3c', 260);
    spawnParticles(state, car.x, car.y, 16, '#3a3f4a', 120);
    bus.push('crash');
    if (car.driver === 'player') {
      say(state, 'Your car is wrecked — bail out!');
      car.driver = 'none';
      car.speed = 0;
      state.player.onFoot = true;
      state.player.car = null;
      state.player.x = car.x + 40;
      state.player.y = car.y;
      state.health = Math.max(10, state.health - 20);
    }
    state.cars = state.cars.filter((c) => c !== car);
  }
}

function updatePlayer(state, world, input, aim, dt, bus) {
  const player = state.player;
  if (player.fireT > 0) player.fireT -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0) player.ammo = PLAYER.magazine;
  }
  const move = input.move();

  if (player.onFoot) {
    const speed = input.runHeld() ? PLAYER.run : PLAYER.walk;
    const len = Math.hypot(move.x, move.y);
    player.moving = len > 0;
    if (len > 0) {
      const nx = player.x + (move.x / len) * speed * dt;
      const ny = player.y + (move.y / len) * speed * dt;
      player.angle = Math.atan2(move.y, move.x);
      const spot = world.resolveCollision(nx, ny, PLAYER.radius);
      // Cars are solid: slide around them instead of walking through.
      let blockedByCar = false;
      for (const car of state.cars) {
        if (carCircleHits(car, spot.x, spot.y, PLAYER.radius)) { blockedByCar = true; break; }
      }
      if (!blockedByCar) { player.x = spot.x; player.y = spot.y; }
    }
    if (input.mouse().down) playerShoot(state, aim, bus);
    // Pickups on foot.
    for (const pk of state.pickups) {
      if (distance(player.x, player.y, pk.x, pk.y) < 26) {
        if (pk.kind === 'token') {
          state.tokens += 1;
          state.cash += 150;
          say(state, `Gold palm token ${state.tokens}/${state.tokensTotal} — +$150.`);
          bus.push('coin');
        } else if (pk.kind === 'medkit') {
          state.health = Math.min(PLAYER.health, state.health + 40);
          say(state, 'Medkit — patched up.');
          bus.push('pickup');
        } else if (pk.kind === 'ammo') {
          player.ammo = PLAYER.magazine;
          player.reloading = 0;
          say(state, 'Ammo restocked.');
          bus.push('pickup');
        }
        state.pickups = state.pickups.filter((p) => p !== pk);
        break;
      }
    }
  } else if (player.car) {
    const car = player.car;
    const model = CAR_MODELS[car.model];
    const forward = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
    const steer = move.x;
    if (forward !== 0) car.speed += forward * model.accel * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
    if (input.brakeHeld()) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 420 * dt);
    car.speed = clamp(car.speed, -model.top * 0.45, model.top);
    if (Math.abs(car.speed) > 4) {
      car.angle += steer * model.grip * dt * clamp(Math.abs(car.speed) / 160, 0.25, 1) * Math.sign(car.speed);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const spot = world.resolveCollision(nx, ny, 20);
    if (Math.abs(spot.x - nx) > 0.5 || Math.abs(spot.y - ny) > 0.5) {
      if (Math.abs(car.speed) > 140 && (car.ramT ?? 0) <= 0) {
        bus.push('crash');
        damageCar(state, car, 8, bus);
        car.ramT = 0.6;
      }
      car.speed *= 0.4;
    }
    car.x = spot.x;
    car.y = spot.y;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.moving = Math.abs(car.speed) > 10;
    // Run over a pedestrian: a crime, and the ped goes down.
    for (const ped of state.peds) {
      if (ped.downT <= 0 && carCircleHits(car, ped.x, ped.y, 10) && Math.abs(car.speed) > 60) {
        ped.downT = 3;
        ped.panic = 6;
        addWanted(state, 1, bus);
        say(state, 'You ran someone over — witnesses called it in!');
        bus.push('crash');
      }
    }
    // Ramming another car damages both — once per hit, not once a frame.
    for (const other of state.cars) {
      if (other === car) continue;
      if (carCircleHits(other, car.x, car.y, 18) && Math.abs(car.speed) > 120 && (car.ramT ?? 0) <= 0) {
        damageCar(state, other, 12, bus);
        car.speed *= 0.55;
        car.ramT = 0.6;
        bus.push('crash');
      }
    }
  }
}

function updateTraffic(state, world, dt, random) {
  const player = state.player;
  for (const car of state.cars) {
    if (car.driver !== 'traffic') continue;
    const model = CAR_MODELS[car.model];
    car.turnT -= dt;
    // Slow for the car ahead on the same road.
    let ahead = null;
    let aheadD = 90;
    for (const other of state.cars) {
      if (other === car) continue;
      const d = distance(car.x, car.y, other.x, other.y);
      if (d < aheadD) {
        const ang = angleTo(car.x, car.y, other.x, other.y);
        if (Math.abs(angleDelta(car.angle, ang)) < 0.5) { ahead = other; aheadD = d; }
      }
    }
    let target = car.targetSpeed;
    if (ahead) target = Math.min(target, 40);
    // A pedestrian in the way: brake, never plough through on purpose.
    for (const ped of state.peds) {
      if (ped.downT > 0) continue;
      if (distance(car.x, car.y, ped.x, ped.y) < 52) {
        const ang = angleTo(car.x, car.y, ped.x, ped.y);
        if (Math.abs(angleDelta(car.angle, ang)) < 0.6) { target = 0; break; }
      }
    }
    car.speed += clamp(target - car.speed, -260 * dt, 180 * dt);
    // At an intersection, sometimes turn onto the cross road.
    const road = world.nearestRoad(car.x, car.y);
    if (car.turnT <= 0 && road.dist < 26) {
      car.turnT = range(random, 2, 6);
      if (random() < 0.3) {
        if (road.axis === 'v') {
          const dir = random() < 0.5 ? 1 : -1;
          car.angle = dir > 0 ? 0 : Math.PI;
          car.axis = 'h';
        } else {
          const dir = random() < 0.5 ? 1 : -1;
          car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.axis = 'v';
        }
      }
    }
    // Stay in the lane: ease back toward the road centre line.
    const lane = laneOffset(car.angle);
    const wantX = car.axis === 'v'
      ? (AVENUES.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a))) + lane.x
      : car.x;
    const wantY = car.axis === 'h'
      ? (STREETS.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a))) + lane.y
      : car.y;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt + (wantX - car.x) * 0.06;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt + (wantY - car.y) * 0.06;
    const spot = world.resolveCollision(nx, ny, 18);
    car.x = spot.x;
    car.y = spot.y;
    // Too far from the player: recycle it onto a road nearby.
    if (distance(car.x, car.y, player.x, player.y) > 1100) {
      const fresh = makeTrafficCar(state, world, random, true);
      car.x = fresh.x; car.y = fresh.y; car.angle = fresh.angle; car.axis = fresh.axis;
      car.speed = fresh.speed; car.targetSpeed = fresh.targetSpeed;
      car.model = fresh.model; car.color = fresh.color;
    }
  }
}

function updatePeds(state, world, dt, random) {
  const player = state.player;
  for (const ped of state.peds) {
    if (ped.downT > 0) { ped.downT -= dt; continue; }
    if (ped.fleeT > 0) ped.fleeT -= dt;
    if (ped.panic > 0) ped.panic -= dt;
    let tx = ped.target.x;
    let ty = ped.target.y;
    let speed = ped.speed;
    // Flee from gunfire, fast cars and the player when the heat is on.
    const threat = state.bullets.length > 0 || (player.car && Math.abs(player.car.speed) > 200);
    if (ped.panic > 0 || (threat && distance(ped.x, ped.y, player.x, player.y) < 260)) {
      const away = angleTo(player.x, player.y, ped.x, ped.y);
      tx = ped.x + Math.cos(away) * 200;
      ty = ped.y + Math.sin(away) * 200;
      speed = ped.speed * 2.4;
      ped.fleeT = 1.5;
    }
    const d = distance(ped.x, ped.y, tx, ty);
    if (d < 12) {
      ped.target = world.randomSidewalkPoint();
      continue;
    }
    ped.angle = angleTo(ped.x, ped.y, tx, ty);
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const spot = world.resolveCollision(nx, ny, 10);
    ped.x = spot.x;
    ped.y = spot.y;
  }
}

function updatePolice(state, world, dt, random, bus) {
  const player = state.player;
  const wantedCars = Math.min(state.wanted, 3);
  const policeCars = state.cars.filter((c) => c.driver === 'police');
  if (state.wanted > 0 && policeCars.length < wantedCars) {
    state.cars.push(makePoliceCar(state, world, random));
  }
  if (state.wanted === 0) {
    for (const car of policeCars) {
      if (distance(car.x, car.y, player.x, player.y) > 700) {
        state.cars = state.cars.filter((c) => c !== car);
      }
    }
    state.cops = [];
  }
  const wantFootCops = state.wanted >= 2 && player.onFoot ? Math.min(state.wanted - 1, 3) : 0;
  while (state.cops.length < wantFootCops) state.cops.push(makeFootCop(state, world, random));
  while (state.cops.length > wantFootCops) state.cops.pop();

  for (const car of policeCars) {
    const model = CAR_MODELS.police;
    const targetAngle = angleTo(car.x, car.y, player.x, player.y);
    const delta = angleDelta(car.angle, targetAngle);
    car.angle += clamp(delta, -3.2 * dt, 3.2 * dt);
    const dist = distance(car.x, car.y, player.x, player.y);
    const want = dist > 120 ? model.top : model.top * 0.55;
    car.speed += clamp(want - car.speed, -400 * dt, 320 * dt);
    const prevX = car.x;
    const prevY = car.y;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const spot = world.resolveCollision(nx, ny, 20);
    car.x = spot.x;
    car.y = spot.y;
    if (distance(prevX, prevY, car.x, car.y) < 6 && Math.abs(car.speed) > 100) {
      car.stuckT += dt;
      if (car.stuckT > 3) {
        const fresh = makePoliceCar(state, world, random);
        car.x = fresh.x; car.y = fresh.y; car.angle = fresh.angle; car.stuckT = 0;
      }
    } else {
      car.stuckT = 0;
    }
    // Ram the player's car; bump the player on foot toward a bust.
    if (player.car && carCircleHits(car, player.car.x, player.car.y, 18)) {
      if ((car.ramT ?? 0) <= 0) {
        damageCar(state, player.car, 6, bus);
        car.ramT = 0.6;
        bus.push('crash');
      }
      car.speed *= 0.5;
    } else if (player.onFoot && distance(car.x, car.y, player.x, player.y) < 40) {
      player.bustT += dt;
    }
  }

  for (const cop of state.cops) {
    cop.angle = angleTo(cop.x, cop.y, player.x, player.y);
    const d = distance(cop.x, cop.y, player.x, player.y);
    if (player.onFoot) {
      if (d > 26) {
        const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
        const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
        const spot = world.resolveCollision(nx, ny, 10);
        cop.x = spot.x;
        cop.y = spot.y;
      }
      if (d < BUST_DISTANCE) {
        player.bustT += dt;
        if (player.bustT >= BUST_SECONDS) {
          state.gameOver = 'busted';
          bus.push('busted');
        }
      } else {
        player.bustT = Math.max(0, player.bustT - dt * 2);
      }
    }
  }
}

function updateBullets(state, world, dt, bus) {
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0) continue;
    if (world.blocked(bullet.x, bullet.y, 2)) {
      bullet.life = 0;
      spawnParticles(state, bullet.x, bullet.y, 3, '#c9c9c9', 60);
      continue;
    }
    if (bullet.fromPlayer) {
      let hit = false;
      for (const enemy of state.enemies) {
        if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < 16) {
          enemy.health -= bullet.damage;
          spawnParticles(state, enemy.x, enemy.y, 6, '#e5534b', 100);
          if (enemy.health <= 0) {
            spawnParticles(state, enemy.x, enemy.y, 14, '#e5534b', 180);
            state.enemies = state.enemies.filter((e) => e !== enemy);
            state.stats.kills += 1;
            state.cash += 50;
            say(state, 'Rival down — +$50.');
          }
          hit = true;
          break;
        }
      }
      if (hit) { bullet.life = 0; continue; }
      for (const car of state.cars) {
        if (car.driver === 'player') continue;
        if (carCircleHits(car, bullet.x, bullet.y, 4)) {
          damageCar(state, car, 20, bus);
          if (car.driver === 'police') addWanted(state, 1, bus);
          bullet.life = 0;
          hit = true;
          break;
        }
      }
      if (hit) continue;
      for (const ped of state.peds) {
        if (ped.downT <= 0 && distance(bullet.x, bullet.y, ped.x, ped.y) < 12) {
          ped.downT = 4;
          ped.panic = 8;
          addWanted(state, 1, bus);
          say(state, 'You shot a civilian — witnesses called it in!');
          bullet.life = 0;
          break;
        }
      }
      for (const cop of state.cops) {
        if (distance(bullet.x, bullet.y, cop.x, cop.y) < 12) {
          state.cops = state.cops.filter((c) => c !== cop);
          addWanted(state, 1, bus);
          say(state, 'You shot a cop — the whole PD is coming.');
          bullet.life = 0;
          break;
        }
      }
    } else {
      const player = state.player;
      if (distance(bullet.x, bullet.y, player.x, player.y) < 14) {
        state.health -= bullet.damage;
        spawnParticles(state, player.x, player.y, 5, '#e5534b', 90);
        bullet.life = 0;
        if (state.health <= 0) {
          state.health = 0;
          state.gameOver = 'wasted';
          bus.push('wasted');
        }
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

function updateEnemies(state, world, dt, bus) {
  const player = state.player;
  for (const enemy of state.enemies) {
    enemy.fireT -= dt;
    const d = distance(enemy.x, enemy.y, player.x, player.y);
    enemy.angle = angleTo(enemy.x, enemy.y, player.x, player.y);
    if (d < 380 && enemy.fireT <= 0) {
      enemy.fireT = 0.9 + Math.random() * 0.7;
      const spread = (Math.random() - 0.5) * 0.25;
      const a = enemy.angle + spread;
      state.bullets.push({
        x: enemy.x + Math.cos(a) * 18, y: enemy.y + Math.sin(a) * 18,
        vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
        life: 0.6, fromPlayer: false, damage: 9,
      });
      bus.push('enemy-shot');
    }
  }
}

function updateParticles(state, dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

/** One fixed step of the whole simulation. */
export function updateEntities(state, world, random, input, aim, dt, bus) {
  state.time += dt;
  for (const car of state.cars) {
    if (car.ramT > 0) car.ramT -= dt;
  }
  updatePlayer(state, world, input, aim, dt, bus);
  updateTraffic(state, world, dt, random);
  updatePeds(state, world, dt, random);
  updatePolice(state, world, dt, random, bus);
  updateEnemies(state, world, dt, bus);
  updateBullets(state, world, dt, bus);
  updateParticles(state, dt);

  // Wanted heat fades when the player lies low and no police is near.
  if (state.wanted > 0) {
    state.crimeTimer += dt;
    let policeNear = false;
    for (const car of state.cars) {
      if (car.driver === 'police' && distance(car.x, car.y, state.player.x, state.player.y) < 450) {
        policeNear = true;
        break;
      }
    }
    if (!policeNear && state.cops.length === 0 && state.crimeTimer > WANTED_DECAY_SECONDS) {
      state.wanted -= 1;
      state.crimeTimer = 0;
      say(state, state.wanted === 0 ? 'You lost them — heat is off.' : `Heat dropping — wanted level ${state.wanted}.`);
    }
  }
  // Slow health regen out of trouble.
  if (state.health > 0 && state.health < PLAYER.health && state.wanted === 0) {
    state.health = Math.min(PLAYER.health, state.health + 2 * dt);
  }
  // Keep the message log short.
  state.messages = state.messages.filter((m) => state.time - m.t < 5);
}

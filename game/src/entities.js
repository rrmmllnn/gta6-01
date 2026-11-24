// The moving things in Solmar Bay: the player, cars (traffic and police),
// pedestrians, bullets and particles. Each factory makes a plain object;
// the update functions below step them one frame at a time.
import { CONFIG } from './config.js';
import { makeRng } from './random.js';
import { collidesSolid, moveWithCollision, nearestRoadPoint, roadInfo } from './world.js';

let nextId = 1;

export function makePlayer(x, y) {
  return {
    id: nextId++,
    kind: 'player',
    x, y,
    angle: -Math.PI / 2,
    vx: 0, vy: 0,
    health: CONFIG.player.health,
    ammo: 48,
    inCar: null,
    running: false,
    aimAngle: 0,
    shootCooldown: 0,
    reloadTimer: 0,
    arrestTimer: 0,
    invulnerable: 0,
  };
}

export function makeCar(x, y, angle, type, opts = {}) {
  const spec = CONFIG.cars[type] || CONFIG.cars.sedan;
  return {
    id: nextId++,
    kind: 'car',
    type,
    x, y,
    angle,
    speed: 0,
    color: opts.color || spec.color,
    police: type === 'police',
    traffic: !!opts.traffic,
    driver: opts.driver || null,
    // Traffic cars drive a road: axis, line and direction on it.
    roadAxis: opts.roadAxis || 'ave',
    roadLine: opts.roadLine || 0,
    roadDir: opts.roadDir || 1,
    targetSpeed: opts.traffic ? 90 + Math.random() * 60 : 0,
    stuck: 0,
    skid: [],
  };
}

export function makePed(x, y, opts = {}) {
  return {
    id: nextId++,
    kind: 'ped',
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: 0,
    target: null,
    wait: 0,
    flee: null,
    hostile: !!opts.hostile,
    health: opts.hostile ? 40 : 20,
    shootTimer: 1 + Math.random(),
    color: opts.color || ['#e07a5f', '#81b29a', '#f2cc8f', '#6d9dc5', '#c77dff'][Math.floor(Math.random() * 5)],
    dead: false,
  };
}

export function makeBullet(x, y, angle, from) {
  return {
    id: nextId++,
    kind: 'bullet',
    x, y,
    angle,
    speed: 920,
    life: 0.85,
    from,
    damage: from === 'player' ? 34 : 8,
  };
}

export function makeParticle(x, y, color, count = 8) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 180;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
  }
  return parts;
}

// --- Cars -----------------------------------------------------------------

function carSpec(car) {
  return CONFIG.cars[car.type] || CONFIG.cars.sedan;
}

// Drive one car forward with simple arcade physics: accelerate, steer by
// speed, drag, and slide along buildings. Off-road driving is slower.
export function stepCarPhysics(world, car, throttle, steer, dt, brake) {
  const spec = carSpec(car);
  const info = roadInfo(car.x, car.y);
  const maxSpeed = spec.maxSpeed * (info.onRoad ? 1 : 0.55);
  const accel = spec.accel * throttle;
  car.speed += accel * dt;
  if (brake) car.speed -= spec.accel * 1.6 * dt;
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  if (car.speed > maxSpeed) car.speed = maxSpeed;
  if (car.speed < -170) car.speed = -170;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  const steerRate = 2.35 * Math.min(1, Math.abs(car.speed) / 160);
  car.angle += steer * steerRate * dt * Math.sign(car.speed || 1);
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const r = Math.max(spec.length, spec.width) / 2 - 4;
  const moved = moveWithCollision(world, car.x, car.y, dx, dy, r);
  if (Math.abs(moved.x - (car.x + dx)) > 1 || Math.abs(moved.y - (car.y + dy)) > 1) {
    car.speed *= 0.55;
  }
  car.x = moved.x;
  car.y = moved.y;
  if (Math.abs(car.speed) > 240) {
    car.skid.push({ x: car.x, y: car.y, angle: car.angle, life: 0.7 });
    if (car.skid.length > 40) car.skid.shift();
  }
  for (const s of car.skid) s.life -= dt;
  car.skid = car.skid.filter((s) => s.life > 0);
}

// A traffic car follows its road; at an intersection it sometimes turns
// onto the crossing road, otherwise it keeps going. It stops behind a
// slower car ahead of it.
export function stepTraffic(world, car, cars, dt) {
  const point = nearestRoadPoint(car.x, car.y);
  const targetAngle = car.roadAxis === 'ave'
    ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.roadDir > 0 ? 0 : Math.PI);
  // Steer gently back onto the centre line of its road.
  let steer = 0;
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  steer = Math.max(-1, Math.min(1, diff * 2.2));
  // Nudge toward the lane: right-hand side of the road.
  const lane = 15;
  if (car.roadAxis === 'ave') {
    const wantX = car.roadLine + (car.roadDir > 0 ? lane : -lane);
    steer += Math.max(-0.6, Math.min(0.6, (wantX - car.x) * 0.012 * Math.sign(car.speed || 1)));
  } else {
    const wantY = car.roadLine + (car.roadDir > 0 ? lane : -lane);
    steer += Math.max(-0.6, Math.min(0.6, (wantY - car.y) * 0.012 * Math.sign(car.speed || 1)));
  }
  // Slow down for a car close ahead.
  let throttle = 1;
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist = Math.hypot(dx, dy);
    const ahead = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
    if (dist < 70 && ahead > 0) { throttle = 0; break; }
  }
  // At an intersection, maybe turn.
  const onLine = car.roadAxis === 'ave'
    ? Math.abs(car.y - point.y) < 6 && CONFIG.streets.some((s) => Math.abs(car.y - s) < 8)
    : Math.abs(car.x - point.x) < 6 && CONFIG.avenues.some((a) => Math.abs(car.x - a) < 8);
  if (onLine && Math.random() < 0.012) {
    const turn = Math.random();
    if (turn < 0.3) {
      // Turn onto the crossing road.
      if (car.roadAxis === 'ave') {
        car.roadAxis = 'st';
        car.roadLine = CONFIG.streets.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
        car.roadDir = Math.random() < 0.5 ? 1 : -1;
      } else {
        car.roadAxis = 'ave';
        car.roadLine = CONFIG.avenues.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a));
        car.roadDir = Math.random() < 0.5 ? 1 : -1;
      }
    } else if (turn < 0.4) {
      car.roadDir *= -1;
    }
  }
  stepCarPhysics(world, car, throttle, steer, dt, false);
}

// A police car chases the player: steer straight at them, a little faster
// than traffic, and nudge back onto roads when it drifts off.
export function stepPolice(world, car, target, dt) {
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  const dist = Math.hypot(dx, dy);
  const throttle = dist > 46 ? 1 : 0.25;
  stepCarPhysics(world, car, throttle, steer, dt, false);
}

// --- Pedestrians ----------------------------------------------------------

// Walkers drift along the sidewalks; a gunshot or a near-miss makes them
// run away from the scare. Hostile peds (mission rivals) stand their
// ground and shoot at the player instead.
export function stepPed(world, ped, player, dt, gunshotAt) {
  if (ped.dead) return;
  if (ped.hostile) {
    const dx = player.x - ped.x;
    const dy = player.y - ped.y;
    const dist = Math.hypot(dx, dy);
    ped.angle = Math.atan2(dy, dx);
    if (dist > 260) {
      const step = moveWithCollision(world, ped.x, ped.y, (dx / dist) * 120 * dt, (dy / dist) * 120 * dt, 10);
      ped.x = step.x;
      ped.y = step.y;
    }
    return;
  }
  if (gunshotAt) {
    const dx = ped.x - gunshotAt.x;
    const dy = ped.y - gunshotAt.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 320) {
      ped.flee = { x: gunshotAt.x, y: gunshotAt.y, until: 2.5 };
    }
  }
  if (ped.flee) {
    ped.flee.until -= dt;
    const dx = ped.x - ped.flee.x;
    const dy = ped.y - ped.flee.y;
    const dist = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy, dx);
    const step = moveWithCollision(world, ped.x, ped.y, (dx / dist) * 210 * dt, (dy / dist) * 210 * dt, 10);
    ped.x = step.x;
    ped.y = step.y;
    if (ped.flee.until <= 0) ped.flee = null;
    return;
  }
  if (ped.wait > 0) {
    ped.wait -= dt;
    return;
  }
  if (!ped.target) {
    const p = nearestRoadPoint(ped.x, ped.y);
    const along = p.axis === 'ave' ? (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 160) : 0;
    const across = p.axis === 'st' ? (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 160) : 0;
    ped.target = {
      x: Math.max(40, Math.min(CONFIG.world.width - 40, p.x + along + (Math.random() < 0.5 ? 44 : -44))),
      y: Math.max(40, Math.min(CONFIG.world.height - 40, p.y + across + (Math.random() < 0.5 ? 44 : -44))),
    };
  }
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) {
    ped.target = null;
    ped.wait = 0.5 + Math.random() * 2.5;
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  const step = moveWithCollision(world, ped.x, ped.y, (dx / dist) * 62 * dt, (dy / dist) * 62 * dt, 10);
  ped.x = step.x;
  ped.y = step.y;
}

// --- Bullets ---------------------------------------------------------------

export function stepBullet(world, bullet, dt) {
  bullet.x += Math.cos(bullet.angle) * bullet.speed * dt;
  bullet.y += Math.sin(bullet.angle) * bullet.speed * dt;
  bullet.life -= dt;
  if (bullet.life <= 0) return 'dead';
  if (collidesSolid(world, bullet.x, bullet.y, 2)) return 'wall';
  if (bullet.x < 0 || bullet.x > CONFIG.world.width || bullet.y < 0 || bullet.y > CONFIG.world.height) return 'dead';
  return 'fly';
}

// Circle overlap, used for car-vs-car bumps, pickups and arrests.
export function circlesOverlap(a, b, ra, rb) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < (ra + rb) * (ra + rb);
}

// Seeded traffic and pedestrians for a fresh game: cars on the roads,
// walkers on the sidewalks, none of them near the spawn point.
export function seedPopulation(world, rng) {
  const cars = [];
  const peds = [];
  const types = ['sedan', 'sedan', 'taxi', 'sport', 'truck'];
  for (let i = 0; i < 16; i++) {
    const axis = rng.chance(0.5) ? 'ave' : 'st';
    const line = axis === 'ave' ? rng.pick(CONFIG.avenues) : rng.pick(CONFIG.streets);
    const along = axis === 'ave' ? rng.range(120, CONFIG.world.height - 120) : rng.range(420, CONFIG.world.width - 120);
    const x = axis === 'ave' ? line : along;
    const y = axis === 'ave' ? along : line;
    if (Math.hypot(x - 1560, y - 620) < 220) continue;
    const car = makeCar(x, y, axis === 'ave' ? Math.PI / 2 : 0, rng.pick(types), {
      traffic: true,
      roadAxis: axis,
      roadLine: line,
      roadDir: rng.chance(0.5) ? 1 : -1,
    });
    car.speed = 80 + rng.range(0, 60);
    cars.push(car);
  }
  for (let i = 0; i < 20; i++) {
    const x = rng.range(420, CONFIG.world.width - 120);
    const y = rng.range(120, CONFIG.world.height - 120);
    if (Math.hypot(x - 1560, y - 620) < 160) continue;
    const p = nearestRoadPoint(x, y);
    peds.push(makePed(p.x + (rng.chance(0.5) ? 46 : -46), p.y + (rng.chance(0.5) ? 46 : -46)));
  }
  return { cars, peds };
}

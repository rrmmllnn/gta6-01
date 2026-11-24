// Screenshot staging for Solmar Bay. The game takes a ?shot= parameter
// (chase, street, mission or beach); each shot sets up a real scene from
// the fixed seed — a wanted chase, a downtown crossroads, a mission in
// progress, a sunset beach cruise — then plays the actual rules forward
// with a simple autopilot (driving the roads toward waypoints, the police
// chasing, rivals shooting back). When the scene has settled, the shot
// reports ready and the screenshot script captures the frame. Nothing here
// is a posed still: every pixel is genuine play.
import { CONFIG } from './config.js';
import { makeBullet, makeCar, stepCarPhysics } from './entities.js';
import { startMission } from './missions.js';

const SHOTS = ['chase', 'street', 'mission', 'beach'];

export function isShotMode() {
  try {
    const name = new URLSearchParams(window.location.search).get('shot');
    return SHOTS.includes(name) ? name : null;
  } catch {
    return null;
  }
}

function putPlayerInCar(game, car) {
  const p = game.player;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  car.speed = 120;
}

// Steer a car toward a waypoint on the road grid.
function driveToward(game, tx, ty, dt) {
  const car = game.player.inCar;
  if (!car) return;
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  stepCarPhysics(game.world, car, 1, steer, dt, false);
  game.player.x = car.x;
  game.player.y = car.y;
}

export function setupShot(game, name) {
  const p = game.player;
  game.shotTime = 0;
  if (name === 'chase') {
    // Three-star chase: the player in a sports car up the downtown avenue,
    // three police cars closing in from behind.
    const car = makeCar(1600, 1050, -Math.PI / 2, 'sport', { color: '#c0392b' });
    game.cars.push(car);
    putPlayerInCar(game, car);
    game.wanted = 3;
    game.lastCrimeAt = game.time;
    const spots = [[1600, 1380], [1540, 1480], [1660, 1420]];
    for (const [x, y] of spots) {
      const cop = makeCar(x, y, -Math.PI / 2, 'police');
      cop.speed = 260;
      game.cars.push(cop);
    }
    game.message = 'Lose the cops!';
    game.messageTimer = 5;
    game.shotDuration = 6;
  } else if (name === 'street') {
    // On foot at a downtown crossroads, traffic and pedestrians moving.
    p.x = 1200;
    p.y = 600;
    p.angle = Math.PI / 2;
    game.wanted = 0;
    game.camera.x = p.x;
    game.camera.y = p.y;
    game.shotDuration = 4;
  } else if (name === 'mission') {
    // Rosa's dockside job, mid-fight: four rivals, the briefcase waiting.
    p.x = 2600;
    p.y = 1750;
    p.ammo = 999;
    p.health = 100;
    game.wanted = 1;
    game.lastCrimeAt = game.time;
    game.camera.x = p.x;
    game.camera.y = p.y;
    startMission(game, 3);
    game.mission.step = 1;
    game.mission.spawned = false;
    game.shotDuration = 6;
  } else if (name === 'beach') {
    // Sunset cruise down the beach road in a sports car.
    game.sunset = true;
    const car = makeCar(280, 1650, Math.PI / 2, 'sport', { color: '#e67e22' });
    game.cars.push(car);
    putPlayerInCar(game, car);
    game.wanted = 0;
    game.message = 'Solmar Bay — the long way home.';
    game.messageTimer = 5;
    game.shotDuration = 6;
  }
  game.shotReady = false;
}

export function updateShot(game, dt) {
  game.shotTime += dt;
  const p = game.player;
  if (game.shot === 'chase') {
    driveToward(game, 1600, 320, dt);
  } else if (game.shot === 'street') {
    // Stroll east along the street, then stop and watch the city.
    if (game.shotTime < 2.5) {
      const moved = { x: p.x + 55 * dt, y: p.y };
      p.x = moved.x;
      p.y = moved.y;
      p.angle = 0;
    }
  } else if (game.shot === 'mission') {
    // Auto-aim at the nearest rival and fire, so the frame shows a real fight.
    game.shotCooldown = (game.shotCooldown || 0) - dt;
    let nearest = null;
    let nearestDist = Infinity;
    for (const ped of game.peds) {
      if (!ped.hostile || ped.dead) continue;
      const d = Math.hypot(ped.x - p.x, ped.y - p.y);
      if (d < nearestDist) { nearest = ped; nearestDist = d; }
    }
    if (nearest && game.shotCooldown <= 0) {
      game.shotCooldown = 0.3;
      const aim = Math.atan2(nearest.y - p.y, nearest.x - p.x) + (Math.random() - 0.5) * 0.06;
      p.aimAngle = aim;
      game.bullets.push(makeBullet(p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22, aim, 'player'));
      game.audio.shot();
    }
  } else if (game.shot === 'beach') {
    driveToward(game, 280, 2150, dt);
  }
  if (game.shotTime >= game.shotDuration && typeof window !== 'undefined') {
    window.__shotReady = true;
  }
}

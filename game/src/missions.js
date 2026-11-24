// The story of Solmar Bay: six jobs from Rosa Delgado, a fixer who runs the
// city from her garage in the suburbs. Each mission is a list of steps; the
// state machine below walks the steps in order, spawns what a step needs
// (a courier, rivals, a briefcase) and pays out when the last step clears.
// A mission fails if the player is busted or wasted, or if a follow target
// is lost; Rosa lets you retry any failed job.
import { makeCar, makePed } from './entities.js';
import { CONFIG } from './config.js';

export const MISSIONS = [
  {
    id: 0,
    title: 'First Errand',
    briefing: 'Rosa: "New in town? Prove you can drive. Pick up the package at the docks and bring it to Solmar Bank downtown. No cops, no drama."',
    reward: 400,
    steps: [
      { type: 'goto', x: 2620, y: 1620, label: 'Pick up the package at the docks', radius: 70 },
      { type: 'deliver', x: 1500, y: 480, label: 'Deliver the package to Solmar Bank', radius: 70 },
    ],
  },
  {
    id: 1,
    title: 'Hot Wheels',
    briefing: 'Rosa: "A client wants a sports car, no questions asked. Find one on the street, take it, and bring it to my garage. Try not to scratch it."',
    reward: 800,
    steps: [
      { type: 'stealSport', label: 'Steal a sports car (press E near one)' },
      { type: 'deliverCar', x: 2320, y: 420, label: 'Bring the sports car to Rosa\'s garage', radius: 80 },
    ],
  },
  {
    id: 2,
    title: 'Tail the Courier',
    briefing: 'Rosa: "A courier is moving my money across town. Follow him and learn where he stops — but stay back. If he spots you, the job is blown."',
    reward: 900,
    steps: [
      { type: 'follow', label: 'Follow the courier — stay in the gold ring, do not get spotted', duration: 18 },
    ],
  },
  {
    id: 3,
    title: 'Dockside Deal',
    briefing: 'Rosa: "The dock crew turned on me. Go to the docks, deal with the four who showed up, grab the briefcase and get out. Bring a gun."',
    reward: 1400,
    steps: [
      { type: 'goto', x: 2620, y: 1700, label: 'Reach the dockside meet', radius: 90 },
      { type: 'kill', count: 4, label: 'Deal with the dock crew (0/4)', radius: 0 },
      { type: 'pickup', x: 2760, y: 1860, label: 'Grab the briefcase', radius: 50 },
      { type: 'deliver', x: 2320, y: 420, label: 'Bring the briefcase to Rosa\'s garage', radius: 80 },
    ],
  },
  {
    id: 4,
    title: 'Beach Getaway',
    briefing: 'Rosa: "I need a ride from the beach, and the cops are already on me. Pick me up, lose the heat, and drop me at the park fountain."',
    reward: 1600,
    steps: [
      { type: 'goto', x: 250, y: 1500, label: 'Pick Rosa up at the beach', radius: 70 },
      { type: 'loseHeat', label: 'Lose the cops — get your wanted level to zero', radius: 0 },
      { type: 'deliver', x: 1300, y: 1200, label: 'Drop Rosa at the park fountain', radius: 70 },
    ],
  },
  {
    id: 5,
    title: 'The Big Score',
    briefing: 'Rosa: "Last one. A bank van is parked downtown with the week\'s take. Grab it and bring it to the hideout. The whole city will be after you — make it count."',
    reward: 3000,
    steps: [
      { type: 'stealVan', label: 'Steal the bank van downtown (press E near it)' },
      { type: 'deliverCar', x: 2920, y: 420, label: 'Bring the van to the hideout', radius: 90 },
    ],
  },
];

export function newMissionProgress() {
  return {
    index: 0,
    step: 0,
    active: false,
    failed: false,
    completed: [],
    kills: 0,
    followTime: 0,
    spotted: 0,
    lostTime: 0,
    timer: 0,
    spawned: false,
    courier: null,
    rivals: [],
    van: null,
  };
}

function currentMission(progress) {
  return MISSIONS[progress.index];
}

function currentStep(progress) {
  const m = currentMission(progress);
  return m ? m.steps[progress.step] : null;
}

// Start a mission: reset its state and spawn anything its first steps need.
export function startMission(game, index) {
  const p = game.mission;
  p.index = index;
  p.step = 0;
  p.active = true;
  p.failed = false;
  p.kills = 0;
  p.followTime = 0;
  p.spotted = 0;
  p.lostTime = 0;
  p.timer = 0;
  p.spawned = false;
  p.courier = null;
  p.rivals = [];
  p.van = null;
  game.message = MISSIONS[index].title;
  game.messageTimer = 3;
}

export function failMission(game, reason) {
  const p = game.mission;
  if (!p.active) return;
  p.active = false;
  p.failed = true;
  if (p.courier) {
    p.courier.traffic = true;
    p.courier = null;
  }
  game.message = `Job failed: ${reason}. Talk to Rosa to retry.`;
  game.messageTimer = 4;
  game.audio.busted();
}

export function completeMission(game) {
  const p = game.mission;
  const m = currentMission(p);
  p.active = false;
  p.completed.push(m.id);
  game.cash += m.reward;
  game.stats.missionsDone++;
  game.message = `Job done: ${m.title} — $${m.reward.toLocaleString()} from Rosa.`;
  game.messageTimer = 4;
  game.audio.jingle();
  game.save();
}

// Where the current objective is, for the marker and the minimap.
export function missionMarker(game) {
  const p = game.mission;
  if (!p.active) return null;
  const step = currentStep(p);
  if (!step) return null;
  if (step.type === 'follow' && p.courier) return { x: p.courier.x, y: p.courier.y };
  if (step.x !== undefined) return { x: step.x, y: step.y };
  return null;
}

export function missionObjective(game) {
  const p = game.mission;
  if (!p.active) {
    if (p.index < MISSIONS.length) return `Next job: ${MISSIONS[p.index].title} — drive to Rosa's garage (gold R)`;
    return 'All jobs done — Solmar Bay is yours. Keep the gold palms coming.';
  }
  const step = currentStep(p);
  if (!step) return '';
  if (step.type === 'kill') return `Deal with the dock crew (${p.kills}/${step.count})`;
  if (step.type === 'follow') {
    return `${step.label} (${Math.max(0, Math.ceil(step.duration - p.followTime))}s)`;
  }
  return step.label;
}

function near(game, x, y, radius) {
  const px = game.player.x;
  const py = game.player.y;
  return Math.hypot(px - x, py - y) < radius;
}

// Spawn helpers for the steps that need actors on the street.
function spawnCourier(game) {
  const p = game.mission;
  const car = makeCar(800, 1800, 0, 'sedan', { traffic: false, color: '#8e44ad' });
  car.targetSpeed = 150;
  car.courierRoute = [
    { x: 800, y: 600 }, { x: 1600, y: 600 }, { x: 1600, y: 1500 },
    { x: 2400, y: 1500 }, { x: 2400, y: 900 }, { x: 800, y: 900 },
  ];
  car.routeIndex = 0;
  game.cars.push(car);
  p.courier = car;
  game.message = 'Courier spotted — follow him, stay in the gold ring.';
  game.messageTimer = 3;
}

function spawnRivals(game) {
  const p = game.mission;
  const spots = [
    [2560, 1680], [2700, 1760], [2580, 1860], [2740, 1660],
  ];
  p.rivals = spots.map(([x, y]) => {
    const ped = makePed(x, y, { hostile: true, color: '#5d4037' });
    game.peds.push(ped);
    return ped;
  });
  game.message = 'The dock crew opened fire!';
  game.messageTimer = 3;
}

function spawnVan(game) {
  const p = game.mission;
  const van = makeCar(1500, 540, Math.PI / 2, 'van', { color: '#3f6d8e' });
  game.cars.push(van);
  p.van = van;
  game.message = 'The bank van is parked by Solmar Bank.';
  game.messageTimer = 3;
}

// One frame of the mission state machine. `game` carries the player, cars,
// peds, wanted level and the audio/save helpers the steps need.
export function updateMission(game, dt) {
  const p = game.mission;
  if (!p.active) return;
  const step = currentStep(p);
  if (!step) {
    completeMission(game);
    return;
  }
  p.timer += dt;

  // First-frame setup for steps that need actors.
  if (!p.spawned) {
    if (step.type === 'follow') spawnCourier(game);
    if (step.type === 'kill') spawnRivals(game);
    if (step.type === 'stealVan') spawnVan(game);
    p.spawned = true;
  }

  const advance = () => {
    p.step++;
    p.spawned = false;
    p.timer = 0;
    if (p.step >= currentMission(p).steps.length) completeMission(game);
  };

  switch (step.type) {
    case 'goto':
    case 'deliver':
    case 'pickup': {
      if (near(game, step.x, step.y, step.radius)) {
        if (step.type === 'pickup') game.audio.pickup();
        advance();
      }
      break;
    }
    case 'stealSport': {
      const car = game.player.inCar;
      if (car && car.type === 'sport') advance();
      break;
    }
    case 'stealVan': {
      const car = game.player.inCar;
      if (car && car.type === 'van') advance();
      break;
    }
    case 'deliverCar': {
      const car = game.player.inCar;
      if (car && near(game, step.x, step.y, step.radius)) advance();
      break;
    }
    case 'kill': {
      if (p.kills >= step.count) advance();
      break;
    }
    case 'follow': {
      const c = p.courier;
      if (!c) { failMission(game, 'the courier got away'); break; }
      // Drive the courier along its loop.
      const target = c.courierRoute[c.routeIndex];
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 40) {
        c.routeIndex = (c.routeIndex + 1) % c.courierRoute.length;
      } else {
        const want = Math.atan2(dy, dx);
        let diff = want - c.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        c.angle += Math.max(-1.4, Math.min(1.4, diff * 2)) * dt;
        c.speed = Math.min(c.speed + 130 * dt, c.targetSpeed);
        c.x += Math.cos(c.angle) * c.speed * dt;
        c.y += Math.sin(c.angle) * c.speed * dt;
      }
      const playerDist = Math.hypot(game.player.x - c.x, game.player.y - c.y);
      if (playerDist > 520) {
        p.lostTime += dt;
        if (p.lostTime > 5) { failMission(game, 'you lost the courier'); break; }
      } else {
        p.lostTime = 0;
      }
      if (playerDist < 110) {
        p.spotted += dt;
        if (p.spotted > 2.5) { failMission(game, 'the courier spotted you'); break; }
      } else {
        p.spotted = Math.max(0, p.spotted - dt);
      }
      if (playerDist >= 110 && playerDist <= 520) {
        p.followTime += dt;
        if (p.followTime >= step.duration) {
          p.courier.traffic = true;
          p.courier = null;
          advance();
        }
      }
      break;
    }
    case 'loseHeat': {
      if (game.wanted === 0) advance();
      break;
    }
    default:
      break;
  }
}

// Rosa's garage is where jobs start: standing near it with no active
// mission opens the briefing for the next job.
export function nearRosaGarage(game) {
  const g = CONFIG.world ? game.world.places.rosaGarage : null;
  if (!g) return false;
  return Math.hypot(game.player.x - g.x, game.player.y - g.y) < 110;
}

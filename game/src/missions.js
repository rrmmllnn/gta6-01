// The story of Solmar Bay: six missions from Rosa Delgado, the garage owner who
// runs the city's freelance work. Each mission is a list of steps; a step points
// at a place, a car, a timer or a headcount, and the mission pays out when the
// last step clears. Free roam resumes between missions — the next one starts at
// the yellow "!" marker by Rosa's garage, or with Enter on the title screen's
// "Continue the story" prompt. Failing (wasted or busted) restarts the mission.

import { LANDMARKS } from './world.js';
import { MISSION_REWARDS } from './config.js';
import { addWanted, say } from './entities.js';
import { distance } from './random.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    brief: 'Rosa needs a decent ride for a client. Steal any car and bring it to the garage.',
    steps: [
      { type: 'car', text: 'Get in any car (walk up to one, press E)' },
      { type: 'goto', at: LANDMARKS.garage, radius: 90, text: 'Drive it to Rosa\'s Garage' },
    ],
  },
  {
    id: 'courier-run',
    title: 'Courier Run',
    brief: 'Three packages, three drop points, 100 seconds. The clients pay for speed, not questions.',
    steps: [
      { type: 'car', text: 'Get a car first — you will need wheels' },
      { type: 'goto', at: { x: 2080, y: 480, label: 'Drop 1 · North Motel' }, radius: 70, text: 'Drop 1: North Motel', timed: 100 },
      { type: 'goto', at: { x: 480, y: 1120, label: 'Drop 2 · Marina' }, radius: 70, text: 'Drop 2: Marina' },
      { type: 'goto', at: { x: 1760, y: 1760, label: 'Drop 3 · Beach Kiosk' }, radius: 70, text: 'Drop 3: Beach Kiosk' },
    ],
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    brief: 'A courier got made. The PD is already rolling — lose a 2-star tail and stay free for 30 seconds.',
    steps: [
      { type: 'wanted', level: 2, text: 'Make some noise — get to wanted level 2' },
      { type: 'survive', seconds: 30, text: 'Stay free for 30 seconds' },
    ],
  },
  {
    id: 'dockside-deal',
    title: 'Dockside Deal',
    brief: 'Pick up the briefcase at the East Docks. The Vipers want it too — expect company.',
    steps: [
      { type: 'goto', at: LANDMARKS.docks, radius: 80, text: 'Reach the East Docks' },
      { type: 'pickup', at: LANDMARKS.docks, radius: 60, text: 'Grab the briefcase', spawnEnemies: 3 },
      { type: 'goto', at: LANDMARKS.garage, radius: 90, text: 'Bring the briefcase back to Rosa' },
    ],
  },
  {
    id: 'bank-job',
    title: 'The Bank Job',
    brief: 'Solmar Bank, noon, one guard on the door. Grab the cash, then lose the 3-star tail at the hideout.',
    steps: [
      { type: 'goto', at: LANDMARKS.bank, radius: 80, text: 'Reach Solmar Bank' },
      { type: 'grab', at: LANDMARKS.bank, radius: 60, seconds: 5, text: 'Hold still — cracking the vault…' },
      { type: 'goto', at: LANDMARKS.hideout, radius: 90, text: 'Escape to the Hideout (wanted 3)' },
    ],
  },
  {
    id: 'king-of-solmar',
    title: 'King of Solmar',
    brief: 'The Vipers want the whole bay. Survive 60 seconds at wanted level 4 — then the city is yours.',
    steps: [
      { type: 'wanted', level: 4, text: 'Go loud — reach wanted level 4' },
      { type: 'survive', seconds: 60, text: 'Survive the storm — 60 seconds' },
    ],
  },
];

export function startMission(state, index, bus) {
  const def = MISSIONS[index];
  if (!def) return false;
  state.mission = {
    def,
    index,
    step: 0,
    timer: 0,
    stepTimer: 0,
    started: true,
  };
  const step = def.steps[0];
  if (step.timed) state.mission.timer = step.timed;
  say(state, `Mission: ${def.title} — ${def.brief}`);
  bus.push('mission-start');
  return true;
}

export function abandonMission(state, bus) {
  if (!state.mission) return;
  say(state, `Mission failed: ${state.mission.def.title}. Head back to Rosa to retry.`);
  state.mission = null;
  state.enemies = [];
  bus.push('mission-fail');
}

function completeMission(state, bus) {
  const mission = state.mission;
  const reward = MISSION_REWARDS[mission.index] ?? 500;
  state.cash += reward;
  state.stats.missionsDone = Math.max(state.stats.missionsDone, mission.index + 1);
  state.missionIndex = Math.max(state.missionIndex, mission.index + 1);
  say(state, `Mission complete: ${mission.def.title} — +$${reward}.`);
  bus.push('mission-done');
  state.mission = null;
  state.enemies = [];
}

function advanceStep(state, bus) {
  const mission = state.mission;
  mission.step += 1;
  mission.stepTimer = 0;
  if (mission.step >= mission.def.steps.length) {
    completeMission(state, bus);
    return;
  }
  const step = mission.def.steps[mission.step];
  if (step.timed) mission.timer = step.timed;
  if (step.spawnEnemies) {
    for (let i = 0; i < step.spawnEnemies; i += 1) {
      const a = (i / step.spawnEnemies) * Math.PI * 2;
      state.enemies.push({
        x: step.at.x + Math.cos(a) * 150,
        y: step.at.y + Math.sin(a) * 150,
        angle: 0, health: 60, fireT: 1 + i * 0.4,
      });
    }
    say(state, 'Rivals! They are shooting — fight back or run.');
  }
  if (step.type === 'wanted' && state.wanted < step.level) {
    addWanted(state, step.level - state.wanted, bus);
  }
  say(state, step.text);
}

/** The objective marker the HUD and the minimap point at, or null in free roam. */
export function missionTarget(state) {
  const mission = state.mission;
  if (!mission) {
    if (state.missionIndex < MISSIONS.length) {
      return { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: 'Next mission · Rosa\'s Garage', kind: 'start' };
    }
    return null;
  }
  const step = mission.def.steps[mission.step];
  if (!step) return null;
  if (step.at) return { x: step.at.x, y: step.at.y, label: step.text, kind: 'objective' };
  if (step.type === 'car') {
    return { x: state.player.x + 120, y: state.player.y, label: step.text, kind: 'hint' };
  }
  return { x: state.player.x, y: state.player.y, label: step.text, kind: 'hint' };
}

export function updateMission(state, dt, bus) {
  const mission = state.mission;
  if (!mission) return;
  const step = mission.def.steps[mission.step];
  if (!step) return;
  mission.stepTimer += dt;
  if (mission.timer > 0) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      say(state, 'Out of time!');
      abandonMission(state, bus);
      return;
    }
  }
  const player = state.player;
  switch (step.type) {
    case 'car':
      if (!player.onFoot) advanceStep(state, bus);
      break;
    case 'goto':
    case 'pickup':
      if (distance(player.x, player.y, step.at.x, step.at.y) < step.radius) {
        if (step.type === 'pickup') say(state, 'Briefcase secured!');
        advanceStep(state, bus);
      }
      break;
    case 'grab':
      if (distance(player.x, player.y, step.at.x, step.at.y) < step.radius) {
        if (mission.stepTimer >= step.seconds) {
          state.cash += 300;
          say(state, 'Vault cracked — $300 in the bag. Run!');
          advanceStep(state, bus);
        }
      } else {
        mission.stepTimer = 0;
      }
      break;
    case 'wanted':
      if (state.wanted >= step.level) advanceStep(state, bus);
      break;
    case 'survive':
      if (mission.stepTimer >= step.seconds) advanceStep(state, bus);
      break;
    default:
      break;
  }
  // Starting a story mission that needs heat: the bank job brings the PD.
  if (mission.def.id === 'bank-job' && mission.step === 2 && state.wanted < 3) {
    addWanted(state, 3 - state.wanted, bus);
  }
}

/** The text the HUD shows for the current objective. */
export function missionStatus(state) {
  if (state.missionIndex >= MISSIONS.length) return 'Story complete — you run Solmar Bay. Free roam!';
  if (!state.mission) return 'Next mission: head to the yellow ! at Rosa\'s Garage';
  const mission = state.mission;
  const step = mission.def.steps[mission.step];
  let text = `${mission.def.title}: ${step.text}`;
  if (mission.timer > 0) text += ` — ${Math.ceil(mission.timer)}s`;
  if (step.type === 'grab' && mission.stepTimer > 0) {
    text += ` — ${Math.ceil(step.seconds - mission.stepTimer)}s`;
  }
  if (step.type === 'survive') {
    text += ` — ${Math.ceil(step.seconds - mission.stepTimer)}s`;
  }
  return text;
}

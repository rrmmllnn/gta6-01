// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across the 2560x1920 city; the HUD, the minimap and
// the menus are drawn in screen space on top. Flat shapes and canvas text, in a
// sun-soaked palette that reads at a glance when shrunk to a contact sheet.

import { AVENUES, CAR_MODELS, PALETTE, PLAYER, STREETS, VIEW, WORLD } from './config.js';
import { ROAD } from './config.js';
import { missionStatus, missionTarget } from './missions.js';
import { LANDMARKS, ZONE } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { x: VIEW.width - 216, y: 16, w: 200, h: 150 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const cashLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('');
  const speedLabel = cachedLabel('');
  const tokenLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${'system-ui, sans-serif'}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Screen-space point of a world point, for the aim marker and toasts. */
  function toScreen(wx, wy) {
    return { x: (wx - camera.x) * view.scale + view.x, y: (wy - camera.y) * view.scale + view.y };
  }

  const camera = { x: 0, y: 0 };

  function updateCamera(state) {
    camera.x = Math.max(0, Math.min(WORLD.width - VIEW.width, state.player.x - VIEW.width / 2));
    camera.y = Math.max(0, Math.min(WORLD.height - VIEW.height, state.player.y - VIEW.height / 2));
  }

  /** World point under a screen point (mouse aim). */
  function toWorld(sx, sy) {
    return {
      x: (sx - view.x) / view.scale + camera.x,
      y: (sy - view.y) / view.scale + camera.y,
    };
  }

  function drawGround() {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Park block.
    context.fillStyle = PALETTE.park;
    context.fillRect(1648, 320, 320, 320);
    // Beach: sand along the south edge, water beyond it.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, 1808, WORLD.width, 112);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, 1888, WORLD.width, 32);
    context.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < WORLD.width; x += 90) {
      context.fillRect(x + 20, 1902, 46, 4);
    }
    // Docks apron on the east edge.
    context.fillStyle = '#9a8a72';
    context.fillRect(2448, 0, 112, WORLD.height);
  }

  function drawRoads() {
    context.fillStyle = PALETTE.asphalt;
    for (const a of AVENUES) context.fillRect(a - ROAD / 2, 0, ROAD, WORLD.height);
    for (const s of STREETS) context.fillRect(0, s - ROAD / 2, WORLD.width, ROAD);
    // Sidewalks: pale strips along every road.
    context.fillStyle = PALETTE.sidewalk;
    for (const a of AVENUES) {
      context.fillRect(a - ROAD / 2 - 10, 0, 10, WORLD.height);
      context.fillRect(a + ROAD / 2, 0, 10, WORLD.height);
    }
    for (const s of STREETS) {
      context.fillRect(0, s - ROAD / 2 - 10, WORLD.width, 10);
      context.fillRect(0, s + ROAD / 2, WORLD.width, 10);
    }
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const a of AVENUES) {
      for (let y = 24; y < WORLD.height; y += 64) context.fillRect(a - 2, y, 4, 30);
    }
    for (const s of STREETS) {
      for (let x = 24; x < WORLD.width; x += 64) context.fillRect(x, s - 2, 30, 4);
    }
  }

  function drawBuildings() {
    for (const b of world.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      if (b.tall) {
        context.fillStyle = 'rgba(255,255,255,0.35)';
        context.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
        context.fillStyle = 'rgba(20,30,50,0.5)';
        for (let wy = b.y + 26; wy < b.y + b.h - 10; wy += 18) {
          for (let wx = b.x + 10; wx < b.x + b.w - 12; wx += 16) {
            context.fillRect(wx, wy, 8, 10);
          }
        }
      }
    }
    // Palms: trunk dot and a green crown.
    for (const p of world.palms) {
      context.fillStyle = '#6a4a2a';
      context.fillRect(p.x - 2, p.y - 2, 4, 4);
      context.fillStyle = '#4f8a3c';
      context.beginPath();
      context.arc(p.x, p.y, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#5d9a46';
      context.beginPath();
      context.arc(p.x - 3, p.y - 3, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(car) {
    const model = CAR_MODELS[car.model];
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-model.length / 2 + 3, -model.width / 2 + 4, model.length, model.width);
    context.fillStyle = car.color;
    context.fillRect(-model.length / 2, -model.width / 2, model.length, model.width);
    context.fillStyle = '#20242e';
    context.fillRect(-model.length / 2 + 8, -model.width / 2 + 3, 12, model.width - 6);
    context.fillStyle = '#bfe0f2';
    context.fillRect(-2, -model.width / 2 + 3, 12, model.width - 6);
    if (car.model === 'police') {
      context.fillStyle = '#f2f2f2';
      context.fillRect(-model.length / 2 + 2, -model.width / 2, 8, model.width);
      context.fillStyle = '#e5534b';
      context.fillRect(-8, -model.width / 2 - 2, 7, 5);
      context.fillStyle = '#4f9de0';
      context.fillRect(1, -model.width / 2 - 2, 7, 5);
      context.fillStyle = '#f2f2f2';
      context.font = '700 9px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText('PD', 0, 3);
    }
    if (car.model === 'taxi') {
      context.fillStyle = '#20242e';
      context.font = '700 9px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText('TAXI', 0, 3);
    }
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(model.length / 2 - 2, -model.width / 2 + 2, 3, 4);
    context.fillRect(model.length / 2 - 2, model.width / 2 - 6, 3, 4);
    context.restore();
    // Wreck smoke.
    if (car.health < 40) {
      context.fillStyle = 'rgba(60,60,60,0.5)';
      context.beginPath();
      context.arc(car.x - 8, car.y - 8, 8 + (40 - car.health) / 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPed(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.downT > 0) {
      context.rotate(Math.PI / 2);
      context.fillStyle = ped.color;
      context.fillRect(-9, -5, 18, 10);
      context.restore();
      return;
    }
    context.rotate(ped.angle);
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(0, 0, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#20242e';
    context.beginPath();
    context.arc(3, 0, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.onFoot) {
      if (player.health <= 0) return;
      context.save();
      context.translate(player.x, player.y);
      context.rotate(player.angle);
      // Jay Marlowe: teal jacket, dark jeans, always facing his aim.
      context.fillStyle = '#2a9d8f';
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#20242e';
      context.beginPath();
      context.arc(4, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#3a3f4a';
      context.fillRect(8, -2, 10, 4);
      context.restore();
      // Aim reticle.
      context.strokeStyle = 'rgba(242, 237, 226, 0.8)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(player.x + Math.cos(player.angle) * 34, player.y + Math.sin(player.angle) * 34, 7, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawWaypoint(state) {
    const target = missionTarget(state);
    if (!target) return;
    const d = Math.hypot(target.x - state.player.x, target.y - state.player.y);
    if (d < 60 && target.kind !== 'hint') return;
    // Diamond marker on the spot when it is on screen, arrow at the edge when not.
    const sx = target.x;
    const sy = target.y;
    const onScreen = sx > camera.x + 30 && sx < camera.x + VIEW.width - 30
      && sy > camera.y + 30 && sy < camera.y + VIEW.height - 30;
    if (onScreen) {
      const bob = Math.sin(state.time * 4) * 6;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(sx, sy - 26 + bob);
      context.lineTo(sx + 12, sy - 8 + bob);
      context.lineTo(sx, sy + 10 + bob);
      context.lineTo(sx - 12, sy - 8 + bob);
      context.closePath();
      context.fill();
      context.strokeStyle = '#20242e';
      context.lineWidth = 2;
      context.stroke();
      // Keep the label on screen: clamp its centre in world coordinates.
      const labelX = Math.max(camera.x + 120, Math.min(camera.x + VIEW.width - 120, sx));
      text(target.label, labelX, sy - 34 + bob, 13, PALETTE.text, 'center', true);
    } else {
      const cx = Math.max(camera.x + 40, Math.min(camera.x + VIEW.width - 40, sx));
      const cy = Math.max(camera.y + 40, Math.min(camera.y + VIEW.height - 40, sy));
      const a = Math.atan2(sy - state.player.y, sx - state.player.x);
      context.save();
      context.translate(cx, cy);
      context.rotate(a);
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(16, 0);
      context.lineTo(-10, -10);
      context.lineTo(-10, 10);
      context.closePath();
      context.fill();
      context.restore();
      // Keep the label on screen: clamp its centre in world coordinates.
      const labelX = Math.max(camera.x + 150, Math.min(camera.x + VIEW.width - 150, cx));
      text(`${target.label} · ${Math.round(d)}m`, labelX, cy - 18, 13, PALETTE.gold, 'center', true);
    }
  }

  function drawBullets(state) {
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 2;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x, b.y);
      context.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const bob = Math.sin(state.time * 3 + pk.x) * 3;
      if (pk.kind === 'token') {
        context.fillStyle = PALETTE.gold;
        context.beginPath();
        context.arc(pk.x, pk.y + bob, 9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#8a6a1a';
        context.font = '700 11px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('$', pk.x, pk.y + bob + 4);
      } else if (pk.kind === 'medkit') {
        context.fillStyle = '#f2f2f2';
        context.fillRect(pk.x - 9, pk.y - 9 + bob, 18, 18);
        context.fillStyle = '#e5534b';
        context.fillRect(pk.x - 2, pk.y - 6 + bob, 4, 12);
        context.fillRect(pk.x - 6, pk.y - 2 + bob, 12, 4);
      } else {
        context.fillStyle = '#4f9de0';
        context.fillRect(pk.x - 9, pk.y - 6 + bob, 18, 12);
        context.fillStyle = '#f2f2f2';
        context.font = '700 9px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('AMMO', pk.x, pk.y + bob + 3);
      }
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.fillStyle = '#8a2a3c';
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#20242e';
      context.beginPath();
      context.arc(4, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.fillStyle = '#e5534b';
      context.fillRect(e.x - 14, e.y - 22, 28, 4);
      context.fillStyle = '#7ee081';
      context.fillRect(e.x - 14, e.y - 22, 28 * Math.max(0, e.health / 60), 4);
    }
  }

  function drawField(state, showWaypoint = true) {
    updateCamera(state);
    context.save();
    context.translate(-camera.x, -camera.y);
    drawGround();
    drawRoads();
    drawBuildings();
    drawPickups(state);
    if (showWaypoint) drawWaypoint(state);
    for (const car of state.cars) drawCar(car);
    for (const ped of state.peds) drawPed(ped);
    for (const cop of state.cops) {
      context.save();
      context.translate(cop.x, cop.y);
      context.rotate(cop.angle);
      context.fillStyle = '#20242e';
      context.beginPath();
      context.arc(0, 0, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4f9de0';
      context.beginPath();
      context.arc(3, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    drawEnemies(state);
    drawPlayer(state);
    drawBullets(state);
    drawParticles(state);
    context.restore();
  }

  function drawStars(wanted) {
    // Under the cash panel, where the eye already is — never near the minimap.
    for (let i = 0; i < 5; i += 1) {
      const x = 30 + i * 30;
      const y = 118;
      context.font = '26px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = i < wanted ? PALETTE.gold : 'rgba(242,237,226,0.25)';
      context.fillText('★', x, y);
    }
  }

  function drawMinimap(state) {
    const m = MINIMAP;
    const sx = WORLD.width / m.w;
    const sy = WORLD.height / m.h;
    context.fillStyle = 'rgba(16, 20, 28, 0.85)';
    context.fillRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
    context.strokeStyle = PALETTE.panelLine;
    context.lineWidth = 2;
    context.strokeRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
    context.save();
    context.beginPath();
    context.rect(m.x, m.y, m.w, m.h);
    context.clip();
    context.fillStyle = '#5d7a4a';
    context.fillRect(m.x, m.y, m.w, m.h);
    context.fillStyle = '#3b404b';
    for (const a of AVENUES) context.fillRect(m.x + a / sx - 2, m.y, 4, m.h);
    for (const s of STREETS) context.fillRect(m.x, m.y + s / sy - 2, m.w, 4);
    context.fillStyle = '#e6cf9a';
    context.fillRect(m.x, m.y + 1808 / sy, m.w, 8);
    const target = missionTarget(state);
    if (target) {
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(m.x + target.x / sx, m.y + target.y / sy, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#f2f2f2';
    for (const car of state.cars) {
      if (car.driver === 'traffic') context.fillRect(m.x + car.x / sx - 1, m.y + car.y / sy - 1, 2, 2);
    }
    context.fillStyle = '#e5534b';
    for (const car of state.cars) {
      if (car.driver === 'police') {
        context.beginPath();
        context.arc(m.x + car.x / sx, m.y + car.y / sy, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    for (const cop of state.cops) {
      context.beginPath();
      context.arc(m.x + cop.x / sx, m.y + cop.y / sy, 2, 0, Math.PI * 2);
      context.fill();
    }
    // The player: a white triangle that turns with him.
    context.save();
    context.translate(m.x + state.player.x / sx, m.y + state.player.y / sy);
    context.rotate(state.player.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    text('SOLMAR BAY', m.x + m.w / 2, m.y + m.h + 18, 11, PALETTE.muted, 'center', true);
  }

  function drawHud(state, muted) {
    // Top-left: cash, health, ammo.
    context.fillStyle = 'rgba(16, 20, 28, 0.7)';
    context.fillRect(12, 12, 250, 84);
    context.strokeStyle = PALETTE.panelLine;
    context.lineWidth = 1;
    context.strokeRect(12, 12, 250, 84);
    text(cashLabel(state.cash), 24, 44, 28, '#7ee081', 'left', true);
    text(`♥ ${Math.ceil(state.health)}`, 24, 72, 18, state.health < 30 ? '#e5534b' : PALETTE.text, 'left', true);
    context.fillStyle = '#3a4152';
    context.fillRect(24, 80, 120, 8);
    context.fillStyle = state.health < 30 ? '#e5534b' : '#7ee081';
    context.fillRect(24, 80, 120 * Math.max(0, state.health / PLAYER.health), 8);
    const player = state.player;
    if (player.onFoot) {
      text(`Ammo ${ammoLabel(player.ammo)}${player.reloading > 0 ? ' …' : ''}`, 160, 72, 16, PALETTE.text, 'left');
    } else if (player.car) {
      text(speedLabel(`${Math.round(Math.abs(player.car.speed) * 0.36)} km/h`), 160, 72, 16, PALETTE.text, 'left');
    }
    // Wanted stars, top-right above the minimap.
    drawStars(state.wanted);
    drawMinimap(state);
    // Objective bar along the bottom.
    context.fillStyle = 'rgba(16, 20, 28, 0.75)';
    const label = missionStatus(state);
    context.font = '16px system-ui, sans-serif';
    const w = Math.min(VIEW.width - 40, context.measureText(label).width + 32);
    context.fillRect((VIEW.width - w) / 2, VIEW.height - 46, w, 32);
    text(label, VIEW.width / 2, VIEW.height - 24, 16, PALETTE.text, 'center');
    // Tokens and controls hint.
    text(tokenLabel(`◉ ${state.tokens}/${state.tokensTotal}   $ per token $150`), 16, VIEW.height - 14, 13, PALETTE.gold, 'left');
    text(muted ? 'M: sound off' : 'M: mute', VIEW.width - 16, VIEW.height - 14, 13, PALETTE.muted, 'right');
    // Toasts above the objective bar.
    context.textAlign = 'left';
    let ty = VIEW.height - 92;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const age = state.time - state.messages[i].t;
      if (age > 5) continue;
      context.globalAlpha = age > 4 ? 5 - age : 1;
      text(state.messages[i].text, 16, ty, 16, PALETTE.text, 'left');
      ty -= 22;
    }
    context.globalAlpha = 1;
    // Busted warning while a cop closes in.
    if (player.bustT > 0.2) {
      const pulse = 0.6 + 0.4 * Math.sin(state.time * 10);
      context.globalAlpha = pulse;
      text('BUSTED INCOMING — RUN!', VIEW.width / 2, 120, 30, '#e5534b', 'center', true);
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 62, 44, accent || PALETTE.gold, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + 108 + index * 32, 19, PALETTE.text, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 26, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, best, hasSave) {
    drawField(state, false);
    const lines = [
      'Solmar Bay is yours for the taking — on foot or behind the wheel.',
      'Steal cars, dodge the Solmar PD, run Rosa\'s six missions.',
      'WASD move · mouse aim, click to shoot · E enter a car · Shift run',
      'Space brake · R reload · P pause · M mute · progress saves itself',
    ];
    if (hasSave) lines.push(`Welcome back — $${state.cash} in pocket, ${state.missionIndex} of 6 missions done.`);
    drawPanel('SOLMAR BAY', lines, hasSave ? 'Enter: continue the story · Space: free roam' : 'Press Enter or click to start', PALETTE.gold);
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen. */
  function draw(state, screen, extra) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, extra?.best ?? 0, extra?.hasSave ?? false);
      return;
    }
    drawField(state);
    drawHud(state, extra?.muted ?? false);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits. Your wanted level does not fade while paused.'], 'Press P or Enter to keep playing');
    } else if (screen === SCREEN_OVER) {
      const over = state.gameOver;
      if (over === 'busted') {
        drawPanel('BUSTED', [`The Solmar PD caught you.`, `You lost $${Math.min(state.cash, 200)} in fines — and the mission.`], 'Press Enter to try again', '#e5534b');
      } else if (over === 'wasted') {
        drawPanel('WASTED', ['Solmar Bay is a rough town.', 'You wake up at St. Anselm Hospital, lighter by $200.'], 'Press Enter to try again', '#e5534b');
      } else {
        drawPanel('KING OF SOLMAR', ['All six missions done. The bay is yours, Jay.'], 'Press Enter to keep roaming', PALETTE.gold);
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld, toScreen, updateCamera };
}

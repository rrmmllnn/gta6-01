// Keyboard and mouse state for Solmar Bay. The game polls `down(code)` every
// frame and `pressed(code)` for single-fire actions; pressed keys are
// cleared at the end of each frame by the main loop.
export function makeInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, clicked: false, held: false };

  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(event.code);
    down.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
    mouse.held = false;
  });
  canvas.addEventListener('mousemove', toCanvas);
  canvas.addEventListener('mousedown', (event) => {
    toCanvas(event);
    mouse.clicked = true;
    mouse.held = true;
  });
  window.addEventListener('mouseup', () => {
    mouse.held = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    down(code) {
      return down.has(code);
    },
    anyDown(codes) {
      return codes.some((c) => down.has(c));
    },
    pressed(code) {
      return pressed.has(code);
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}

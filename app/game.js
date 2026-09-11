// Pixel Plumber — a tiny Super-Mario-like platformer.
// Pure HTML5 canvas, no dependencies. Works with keyboard or on-screen touch controls.
(() => {
  'use strict';

  // ---------- Canvas setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VW = canvas.width;   // internal logical resolution
  const VH = canvas.height;

  // ---------- Constants ----------
  const GRAVITY = 2200;
  const MOVE_ACCEL = 1400;
  const MOVE_MAX = 230;
  const FRICTION = 1600;
  const JUMP_VELOCITY = -680;
  const STOMP_BOUNCE = -420;
  const GROUND_Y = 418; // top of the ground strip
  const WORLD_H = VH;

  // ---------- Level data ----------
  // Solid rectangles: ground + floating platforms. All in world pixels.
  const solids = [];
  function groundSeg(x1, x2, y = GROUND_Y) {
    solids.push({ x: x1, y, w: x2 - x1, h: WORLD_H - y, type: 'ground' });
  }
  function platform(x, y, w, h = 28) {
    solids.push({ x, y, w, h, type: 'platform' });
  }

  // Ground with a few pits (gaps = instant death if fallen into).
  groundSeg(0, 620);
  groundSeg(720, 1150);
  groundSeg(1250, 1750);
  groundSeg(1850, 2450);
  groundSeg(2540, 3000);
  groundSeg(3080, 3700);

  // Floating platforms / steps
  platform(260, 320, 96);
  platform(420, 250, 64);
  platform(800, 300, 128);
  platform(980, 220, 96);
  platform(1320, 300, 96);
  platform(1500, 230, 96);
  platform(1950, 320, 96);
  platform(2100, 250, 160);
  platform(2600, 300, 96);
  platform(2760, 220, 96);
  platform(3150, 300, 128);
  platform(3350, 230, 96);

  const worldWidth = 3700 + 300; // a bit of margin past the flag

  // Coins: {x, y, r, taken}
  const coins = [];
  function coinAt(x, y) { coins.push({ x, y, r: 9, taken: false }); }
  [ [300, 280], [340, 280], [440, 210], [820, 260], [860, 260], [1000, 180],
    [1340, 260], [1380, 260], [1520, 190], [980, 380], [1300, 400],
    [1970, 280], [2010, 280], [2120, 210], [2160, 210], [2200, 210],
    [2620, 260], [2780, 180], [3170, 260], [3210, 260], [3370, 190],
    [2900, 380], [3550, 350], [3580, 350]
  ].forEach(([x, y]) => coinAt(x, y));

  // Enemies: goombas that patrol a horizontal range on flat ground.
  const enemiesInit = [
    { x: 900, y: GROUND_Y - 26, min: 760, max: 1120, dir: -1 },
    { x: 1450, y: GROUND_Y - 26, min: 1280, max: 1700, dir: 1 },
    { x: 2050, y: GROUND_Y - 26, min: 1900, max: 2400, dir: -1 },
    { x: 2700, y: GROUND_Y - 26, min: 2560, max: 2960, dir: 1 },
    { x: 3200, y: GROUND_Y - 26, min: 3100, max: 3650, dir: -1 },
  ];
  let enemies = [];

  // Flag (goal)
  const flag = { x: 3620, yTop: GROUND_Y - 224, yBottom: GROUND_Y, w: 8 };

  // Clouds / hills (parallax decoration)
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({ x: Math.random() * worldWidth, y: 40 + Math.random() * 120, s: 0.6 + Math.random() * 0.8 });
  }
  const hills = [];
  for (let i = 0; i < 10; i++) {
    hills.push({ x: i * 420 + Math.random() * 100, s: 0.8 + Math.random() * 0.6 });
  }

  const PLAYER_START = { x: 50, y: GROUND_Y - 40 };

  // ---------- Game state ----------
  let player, camX, score, coinCount, lives, state, invulnTimer, winTimer;

  function resetPlayer(x, y) {
    player = {
      x, y, w: 26, h: 40,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      walkT: 0,
    };
  }

  function newGame() {
    resetPlayer(PLAYER_START.x, PLAYER_START.y);
    enemies = enemiesInit.map(e => ({ ...e, alive: true }));
    coins.forEach(c => (c.taken = false));
    camX = 0;
    score = 0;
    coinCount = 0;
    lives = 3;
    invulnTimer = 0;
    winTimer = 0;
    state = 'playing';
    updateHud();
  }

  function respawn() {
    resetPlayer(PLAYER_START.x, PLAYER_START.y);
    camX = 0;
    invulnTimer = 1.5;
  }

  // ---------- Input ----------
  const keys = { left: false, right: false, jump: false };
  let jumpHeld = false;
  let jumpBuffered = false;

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
    if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) {
      if (!jumpHeld) jumpBuffered = true;
      jumpHeld = true;
      e.preventDefault();
    }
    if (e.code === 'Enter' && state !== 'playing') triggerOverlayAction();
  });
  window.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
    if (['ArrowUp', 'KeyW', 'Space'].includes(e.code)) jumpHeld = false;
  });

  function bindHoldButton(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); el.classList.add('pressed'); onDown(); };
    const up = (e) => { e.preventDefault(); el.classList.remove('pressed'); onUp(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindHoldButton(document.getElementById('btn-left'),
    () => (keys.left = true), () => (keys.left = false));
  bindHoldButton(document.getElementById('btn-right'),
    () => (keys.right = true), () => (keys.right = false));
  bindHoldButton(document.getElementById('btn-jump'),
    () => { if (!jumpHeld) jumpBuffered = true; jumpHeld = true; },
    () => { jumpHeld = false; });

  // ---------- HUD ----------
  const hudScore = document.getElementById('hud-score');
  const hudCoins = document.getElementById('hud-coins');
  const hudLives = document.getElementById('hud-lives');
  function updateHud() {
    hudScore.textContent = `SCORE ${score}`;
    hudCoins.textContent = `🪙 ${coinCount}`;
    hudLives.textContent = `❤️ x${Math.max(lives, 0)}`;
  }

  // ---------- Overlay ----------
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const overlayBtn = document.getElementById('overlay-btn');

  function showOverlay(title, msg, btnText) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    overlay.classList.add('hidden');
  }
  function triggerOverlayAction() {
    newGame();
    hideOverlay();
  }
  overlayBtn.addEventListener('click', triggerOverlayAction);
  overlayBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  // Initialize world state so the menu screen has something to render behind the overlay.
  resetPlayer(PLAYER_START.x, PLAYER_START.y);
  enemies = enemiesInit.map(e => ({ ...e, alive: true }));
  camX = 0;
  score = 0;
  coinCount = 0;
  lives = 3;
  invulnTimer = 0;
  state = 'menu';
  updateHud();

  showOverlay('Pixel Plumber', 'Reach the flag, stomp the goombas, grab the coins!', 'Start Game');

  // ---------- Collision helpers ----------
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function moveAndCollide(entity, dx, dy) {
    // Horizontal
    entity.x += dx;
    for (const s of solids) {
      if (!rectsOverlap(entity, s)) continue;
      if (dx > 0) entity.x = s.x - entity.w;
      else if (dx < 0) entity.x = s.x + s.w;
    }
    // Vertical
    entity.y += dy;
    entity.onGround = false;
    for (const s of solids) {
      if (!rectsOverlap(entity, s)) continue;
      if (dy > 0) {
        entity.y = s.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
      } else if (dy < 0) {
        entity.y = s.y + s.h;
        entity.vy = 0;
      }
    }
  }

  // ---------- Update ----------
  function update(dt) {
    if (state !== 'playing') return;

    // Horizontal input
    if (keys.left && !keys.right) {
      player.vx -= MOVE_ACCEL * dt;
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx += MOVE_ACCEL * dt;
      player.facing = 1;
    } else {
      const f = FRICTION * dt;
      if (player.vx > 0) player.vx = Math.max(0, player.vx - f);
      else if (player.vx < 0) player.vx = Math.min(0, player.vx + f);
    }
    player.vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, player.vx));

    // Jump (buffered so a tap always registers)
    if (jumpBuffered) {
      if (player.onGround) {
        player.vy = JUMP_VELOCITY;
        player.onGround = false;
      }
      jumpBuffered = false;
    }
    // Variable jump height: cut upward velocity if button released early
    if (!jumpHeld && player.vy < STOMP_BOUNCE) {
      player.vy = STOMP_BOUNCE;
    }

    player.vy += GRAVITY * dt;
    player.vy = Math.min(player.vy, 1400);

    moveAndCollide(player, player.vx * dt, 0);
    moveAndCollide(player, 0, player.vy * dt);

    player.walkT += Math.abs(player.vx) * dt * 0.02;
    if (player.x < 0) player.x = 0;

    if (invulnTimer > 0) invulnTimer -= dt;

    // Fell into a pit
    if (player.y > WORLD_H + 100) {
      loseLife();
      return;
    }

    // Enemies
    for (const en of enemies) {
      if (!en.alive) continue;
      en.x += en.dir * 70 * dt;
      if (en.x < en.min) { en.x = en.min; en.dir = 1; }
      if (en.x > en.max) { en.x = en.max; en.dir = -1; }

      const eRect = { x: en.x, y: en.y, w: 28, h: 26 };
      if (rectsOverlap(player, eRect)) {
        const playerBottom = player.y + player.h;
        const wasAbove = playerBottom - player.vy * dt <= en.y + 8;
        if (player.vy > 0 && wasAbove) {
          en.alive = false;
          player.vy = STOMP_BOUNCE;
          score += 100;
          updateHud();
        } else if (invulnTimer <= 0) {
          loseLife();
          return;
        }
      }
    }

    // Coins
    for (const c of coins) {
      if (c.taken) continue;
      const dx = (player.x + player.w / 2) - c.x;
      const dy = (player.y + player.h / 2) - c.y;
      if (Math.hypot(dx, dy) < c.r + 16) {
        c.taken = true;
        coinCount += 1;
        score += 10;
        updateHud();
      }
    }

    // Flag / win
    const flagRect = { x: flag.x, y: flag.yTop, w: flag.w + 16, h: flag.yBottom - flag.yTop };
    if (rectsOverlap(player, flagRect)) {
      winGame();
      return;
    }

    // Camera
    camX = Math.max(0, Math.min(player.x - VW / 2, worldWidth - VW));
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    if (lives <= 0) {
      gameOver();
    } else {
      respawn();
    }
  }

  function winGame() {
    state = 'won';
    setTimeout(() => {
      showOverlay('You Win! 🏁', `Score: ${score} — Coins: ${coinCount}`, 'Play Again');
    }, 400);
  }

  function gameOver() {
    state = 'gameover';
    setTimeout(() => {
      showOverlay('Game Over', `Score: ${score} — Coins: ${coinCount}`, 'Try Again');
    }, 400);
  }

  // ---------- Drawing ----------
  function draw() {
    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#6fb3ff');
    grad.addColorStop(1, '#bfe6ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);

    ctx.save();
    ctx.translate(-camX, 0);

    drawHills();
    drawClouds();
    drawSolids();
    drawFlag();
    drawCoins();
    drawEnemies();
    drawPlayer();

    ctx.restore();
  }

  function drawHills() {
    ctx.fillStyle = '#3fae4a';
    for (const h of hills) {
      const w = 260 * h.s, hh = 90 * h.s;
      if (h.x + w < camX || h.x - w > camX + VW) continue;
      ctx.beginPath();
      ctx.moveTo(h.x - w / 2, GROUND_Y);
      ctx.quadraticCurveTo(h.x, GROUND_Y - hh, h.x + w / 2, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds() {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const c of clouds) {
      if (c.x - 60 > camX + VW || c.x + 60 < camX) continue;
      cloudPuff(c.x, c.y, c.s);
    }
  }
  function cloudPuff(x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * s, y + 4 * s, 20 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 22 * s, y + 4 * s, 20 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSolids() {
    for (const s of solids) {
      if (s.x + s.w < camX || s.x > camX + VW) continue;
      if (s.type === 'ground') {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(s.x, s.y, s.w, 10);
        // brick lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        for (let bx = s.x; bx < s.x + s.w; bx += 32) {
          ctx.beginPath(); ctx.moveTo(bx, s.y + 12); ctx.lineTo(bx, s.y + s.h); ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#c97a3d';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(s.x, s.y, s.w, 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        for (let bx = s.x; bx < s.x + s.w; bx += 24) {
          ctx.beginPath(); ctx.moveTo(bx, s.y); ctx.lineTo(bx, s.y + s.h); ctx.stroke();
        }
      }
    }
  }

  function drawCoins() {
    for (const c of coins) {
      if (c.taken) continue;
      if (c.x < camX - 20 || c.x > camX + VW + 20) continue;
      const bob = Math.sin(performance.now() / 200 + c.x) * 3;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + bob, c.r * 0.6, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const en of enemies) {
      if (!en.alive) continue;
      if (en.x < camX - 40 || en.x > camX + VW + 40) continue;
      const x = en.x, y = en.y;
      ctx.fillStyle = '#8b4513';
      ctx.beginPath();
      ctx.ellipse(x + 14, y + 16, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a2d0c';
      ctx.fillRect(x, y + 20, 28, 6);
      // eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(x + 9, y + 12, 3.5, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 19, y + 12, 3.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x + 9, y + 13, 1.6, 0, Math.PI * 2);
      ctx.arc(x + 19, y + 13, 1.6, 0, Math.PI * 2);
      ctx.fill();
      // eyebrows (angry)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x + 5, y + 7); ctx.lineTo(x + 12, y + 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 23, y + 7); ctx.lineTo(x + 16, y + 9); ctx.stroke();
    }
  }

  function drawFlag() {
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(flag.x, flag.yTop, 4, flag.yBottom - flag.yTop);
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(flag.x + 4, flag.yTop + 10);
    ctx.lineTo(flag.x + 34, flag.yTop + 20);
    ctx.lineTo(flag.x + 4, flag.yTop + 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#777';
    ctx.fillRect(flag.x - 10, flag.yBottom - 6, 24, 6);
  }

  function drawPlayer() {
    if (invulnTimer > 0 && Math.floor(invulnTimer * 12) % 2 === 0) return; // blink when invulnerable
    const { x, y, w, h, facing } = player;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(facing, 1);
    ctx.translate(-w / 2, -h / 2);

    // legs (simple walk bob)
    const bob = player.onGround ? Math.sin(player.walkT) * 3 : 0;
    ctx.fillStyle = '#2b3a94';
    ctx.fillRect(2, h - 14 + Math.abs(bob), 9, 14 - Math.abs(bob));
    ctx.fillRect(w - 11, h - 14 - Math.abs(bob), 9, 14 + Math.abs(bob));

    // body (overalls)
    ctx.fillStyle = '#2b3a94';
    ctx.fillRect(2, 16, w - 4, 18);
    // shirt
    ctx.fillStyle = '#e02424';
    ctx.fillRect(0, 8, w, 12);
    // head
    ctx.fillStyle = '#f4c08a';
    ctx.fillRect(4, 0, w - 8, 12);
    // cap
    ctx.fillStyle = '#e02424';
    ctx.fillRect(2, -4, w - 4, 8);
    ctx.fillRect(w - 6, 0, 8, 4);
    // eye
    ctx.fillStyle = '#000';
    ctx.fillRect(w - 10, 4, 3, 3);
    // mustache
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(w - 14, 8, 10, 3);

    ctx.restore();
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 1 / 30); // clamp to avoid big jumps (tab switch etc.)
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Small read-only debug hook (used to verify the physics claims on the
  // project page — e.g. jump apex height — against the live game).
  window.PixelPlumber = {
    getState: () => ({ x: player.x, y: player.y, vy: player.vy, onGround: player.onGround, score, coinCount, lives, state }),
    constants: { GRAVITY, JUMP_VELOCITY, MOVE_MAX },
  };
})();

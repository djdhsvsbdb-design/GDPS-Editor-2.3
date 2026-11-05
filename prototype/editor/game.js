(() => {
  'use strict';

  const overlay = document.getElementById('gameOverlay');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = (selector) => document.querySelector(selector);
  const titleNode = $('#gameTitle');
  const statusNode = $('#gameStatus');
  const progressFill = $('#gameProgressFill');
  const progressText = $('#gameProgressText');
  const pauseButton = $('#gamePauseBtn');
  const message = $('#gameMessage');
  const messageTitle = $('#gameMessageTitle');
  const messageText = $('#gameMessageText');
  const primaryButton = $('#gamePrimary');
  const secondaryButton = $('#gameSecondary');
  const jumpButton = $('#gameJumpBtn');

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GROUND = 500;
  const PLAYER_SIZE = 42;
  const GRAVITY = 2100;
  const JUMP_VELOCITY = -820;
  const BASE_SPEED = 350;
  const PALETTES = {
    violet: { top: '#10091d', bottom: '#32104b', glow: '#bd67ff', accent: '#37dcff', ground: '#9d4de8' },
    blue: { top: '#061624', bottom: '#123b5d', glow: '#28b9f0', accent: '#8cf3ff', ground: '#248fc3' },
    dark: { top: '#090b12', bottom: '#20283c', glow: '#8b91c4', accent: '#65e0d1', ground: '#6572a8' }
  };

  let level = { name: 'Мой уровень', background: 'violet', objects: [] };
  let objects = [];
  let worldEnd = 1900;
  let cameraX = 0;
  let player = null;
  let frameId = 0;
  let lastTime = 0;
  let attempts = 0;
  let mode = 'ready';
  let speedMultiplier = 1;
  let jumpQueued = false;
  let jumpHeld = false;
  let particles = [];
  let elapsed = 0;
  let best = null;
  let active = false;

  function safeObjects(source) {
    if (!Array.isArray(source)) return [];
    const allowed = new Set(['block', 'spike', 'platform', 'orb', 'portal', 'saw']);
    return source.filter((item) => item && allowed.has(item.kind))
      .map((item, index) => ({
        id: Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1,
        kind: item.kind,
        x: clamp(Number(item.x) || 0, 0, 50000),
        y: clamp(Number(item.y) || GROUND - 60, 0, HEIGHT)
      })).sort((a, b) => a.x - b.x);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function start(project) {
    const current = project || {
      name: $('#nameInput')?.value || 'Мой уровень',
      background: $('#bgSelect')?.value || 'violet',
      objects: window.GDPSLevel?.getObjects?.() || []
    };
    level = {
      name: String(current.name || 'Мой уровень').slice(0, 32),
      background: PALETTES[current.background] ? current.background : 'violet',
      objects: safeObjects(current.objects)
    };
    objects = level.objects;
    worldEnd = Math.max(1900, ...objects.map((item) => item.x + 600));
    attempts = 0;
    titleNode.textContent = level.name;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('game-active');
    active = true;
    retry();
  }

  function retry() {
    if (!active) return;
    attempts += 1;
    objects = level.objects.map((item) => ({ ...item, used: false }));
    player = {
      x: 125, y: GROUND - PLAYER_SIZE / 2, vy: 0,
      rotation: 0, grounded: true, alive: true, trail: []
    };
    cameraX = 0;
    speedMultiplier = 1;
    particles = [];
    elapsed = 0;
    jumpQueued = false;
    jumpHeld = false;
    mode = 'running';
    hideMessage();
    statusNode.textContent = 'ПОПЫТКА ' + attempts;
    pauseButton.textContent = 'Ⅱ';
    lastTime = performance.now();
    cancelAnimationFrame(frameId);
    updateProgress();
    frameId = requestAnimationFrame(loop);
  }

  function close() {
    active = false;
    mode = 'closed';
    cancelAnimationFrame(frameId);
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('game-active');
    hideMessage();
    jumpQueued = false;
    jumpHeld = false;
    if ($('#page-editor')?.classList.contains('active')) {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function pause() {
    if (mode !== 'running') return;
    mode = 'paused';
    pauseButton.textContent = '▶';
    showMessage('ПАУЗА', 'Твой прогресс сохранён до следующей попытки.', 'ПРОДОЛЖИТЬ', 'ВЫЙТИ', resume, close);
  }

  function resume() {
    if (mode !== 'paused') return;
    mode = 'running';
    pauseButton.textContent = 'Ⅱ';
    hideMessage();
    lastTime = performance.now();
    frameId = requestAnimationFrame(loop);
  }

  function fail() {
    if (mode !== 'running') return;
    mode = 'failed';
    player.alive = false;
    burst(player.x, player.y, '#ff6f9b', 22);
    showMessage('ПОПЫТКА НЕ УДАЛАСЬ', 'Не останавливайся — попробуй пройти участок ещё раз.', 'ПОВТОРИТЬ', 'ВЫЙТИ', retry, close);
  }

  function complete() {
    if (mode !== 'running') return;
    mode = 'complete';
    const key = 'gdps-editor-best-v1';
    try {
      const records = JSON.parse(localStorage.getItem(key) || '{}');
      const id = level.name.toLowerCase();
      records[id] = Math.min(Number(records[id]) || Infinity, elapsed);
      localStorage.setItem(key, JSON.stringify(records));
    } catch (_) { /* local best time is optional */ }
    showMessage('УРОВЕНЬ ПРОЙДЕН!', 'Финиш достигнут за ' + elapsed.toFixed(2) + ' сек. Отличная работа!', 'ИГРАТЬ ЕЩЁ', 'ВЫЙТИ', retry, close);
    burst(player.x, player.y, '#55edc2', 36);
  }

  function showMessage(heading, detail, primaryLabel, secondaryLabel, primaryAction, secondaryAction) {
    messageTitle.textContent = heading;
    messageText.textContent = detail;
    primaryButton.textContent = primaryLabel;
    secondaryButton.textContent = secondaryLabel;
    primaryButton.onclick = primaryAction;
    secondaryButton.onclick = secondaryAction;
    message.hidden = false;
  }

  function hideMessage() {
    message.hidden = true;
  }

  function queueJump() {
    if (!active || mode !== 'running') return;
    jumpQueued = true;
  }

  function doJump() {
    if (player.grounded) {
      player.vy = JUMP_VELOCITY;
      player.grounded = false;
      burst(player.x - 10, GROUND - 4, '#b86aff', 5);
      return true;
    }
    const nearbyOrb = objects.find((item) =>
      item.kind === 'orb' && !item.used &&
      Math.hypot(item.x - player.x, item.y - player.y) < 92
    );
    if (nearbyOrb) {
      nearbyOrb.used = true;
      player.vy = JUMP_VELOCITY * 1.12;
      burst(nearbyOrb.x, nearbyOrb.y, '#45eaff', 14);
      return true;
    }
    return false;
  }

  function intersectsRect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function playerRect(x = player.x, y = player.y) {
    const half = PLAYER_SIZE * 0.43;
    return { left: x - half, right: x + half, top: y - half, bottom: y + half };
  }

  function triangleHit(rect, triangle) {
    const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0.894, y: 0.447 }, { x: -0.894, y: 0.447 }];
    const corners = [
      { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
      { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }
    ];
    for (const axis of axes) {
      const triDots = triangle.map((point) => point.x * axis.x + point.y * axis.y);
      const boxDots = corners.map((point) => point.x * axis.x + point.y * axis.y);
      if (Math.max(...triDots) < Math.min(...boxDots) || Math.max(...boxDots) < Math.min(...triDots)) return false;
    }
    return true;
  }

  function update(dt) {
    elapsed += dt;
    const previousBottom = player.y + PLAYER_SIZE * 0.43;
    const wasGrounded = player.grounded;
    player.x += BASE_SPEED * speedMultiplier * dt;

    if (jumpQueued) {
      doJump();
      jumpQueued = false;
    }
    player.grounded = false;

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y + PLAYER_SIZE * 0.43 >= GROUND) {
      player.y = GROUND - PLAYER_SIZE * 0.43;
      player.vy = 0;
      player.grounded = true;
    }

    const rect = playerRect();
    for (const item of objects) {
      if (item.x < player.x - 100 || item.x > player.x + 100) continue;
      if (item.kind === 'spike') {
        const triangle = [
          { x: item.x - 25, y: item.y + 25 },
          { x: item.x, y: item.y - 25 },
          { x: item.x + 25, y: item.y + 25 }
        ];
        if (triangleHit(rect, triangle)) { fail(); return; }
      } else if (item.kind === 'saw') {
        const radius = 24;
        const closestX = clamp(item.x, rect.left, rect.right);
        const closestY = clamp(item.y, rect.top, rect.bottom);
        if (Math.hypot(item.x - closestX, item.y - closestY) < radius) { fail(); return; }
      } else if (item.kind === 'block' || item.kind === 'platform') {
        const bounds = item.kind === 'block'
          ? { left: item.x - 25, right: item.x + 25, top: item.y - 25, bottom: item.y + 25 }
          : { left: item.x - 42, right: item.x + 42, top: item.y - 9, bottom: item.y + 9 };
        if (intersectsRect(rect, bounds)) {
          if (player.vy >= 0 && previousBottom <= bounds.top + 13 && rect.bottom >= bounds.top) {
            player.y = bounds.top - PLAYER_SIZE * 0.43;
            player.vy = 0;
            player.grounded = true;
          } else if (item.kind === 'block') {
            fail(); return;
          }
        }
      } else if (item.kind === 'portal' && !item.used && Math.abs(player.x - item.x) < 20 && Math.abs(player.y - item.y) < 45) {
        item.used = true;
        speedMultiplier = Math.min(1.35, speedMultiplier + 0.15);
        burst(item.x, item.y, '#42e8ff', 18);
      }
    }

    if (player.y > HEIGHT + 100) { fail(); return; }
    if (player.grounded) {
      if (!wasGrounded) burst(player.x, GROUND - 3, '#a35bff', 5);
      player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
    } else {
      player.rotation += dt * 7.4;
    }

    player.trail.push({ x: player.x, y: player.y, alpha: 0.5 });
    if (player.trail.length > 7) player.trail.shift();
    particles = particles.filter((particle) => particle.life > 0);
    particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 700 * dt;
      particle.life -= dt;
    });

    cameraX = clamp(player.x - 250, 0, Math.max(0, worldEnd - WIDTH));
    updateProgress();
    if (player.x >= worldEnd - 40) complete();
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 45 + Math.random() * 180;
      particles.push({
        x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force - 35,
        life: 0.35 + Math.random() * 0.45, maxLife: 0.8,
        size: 2 + Math.random() * 4, color
      });
    }
  }

  function updateProgress() {
    const percent = clamp(Math.floor((player?.x || 0) / Math.max(1, worldEnd - 40) * 100), 0, 100);
    progressFill.style.width = percent + '%';
    progressText.textContent = percent + '%';
  }

  function loop(now) {
    if (!active || mode !== 'running') return;
    const dt = clamp((now - lastTime) / 1000, 0, 1 / 30);
    lastTime = now;
    update(dt);
    draw();
    if (mode === 'running') frameId = requestAnimationFrame(loop);
  }

  function draw() {
    const palette = PALETTES[level.background];
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, palette.top);
    gradient.addColorStop(1, palette.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let i = 0; i < 52; i++) {
      const x = ((i * 173 + 37) - cameraX * 0.18) % WIDTH;
      const y = 25 + ((i * 79) % 420);
      ctx.globalAlpha = 0.25 + ((i * 13) % 65) / 100;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect((x + WIDTH) % WIDTH, y, i % 5 === 0 ? 3 : 1.5, i % 5 === 0 ? 3 : 1.5);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(-(cameraX * 0.38) % WIDTH, 0);
    for (let i = -1; i < 4; i++) {
      const x = i * 470;
      ctx.fillStyle = '#ffffff08';
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x + 130, 350);
      ctx.lineTo(x + 280, GROUND);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = '#ffffff0c';
    ctx.lineWidth = 1;
    for (let x = -((cameraX * 0.55) % 80); x < WIDTH; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND); ctx.stroke();
    }

    drawGround(palette);
    drawFinish(palette);
    objects.forEach((item) => drawObject(item, palette));
    drawParticles();
    drawPlayer(palette);
    if (mode === 'failed' || mode === 'complete') {
      ctx.fillStyle = '#08051022';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  function drawGround(palette) {
    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, GROUND, WIDTH, 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0713';
    ctx.fillRect(0, GROUND + 4, WIDTH, HEIGHT - GROUND);
    ctx.strokeStyle = '#ffffff12';
    ctx.lineWidth = 1;
    for (let x = -((cameraX * 0.9) % 42); x < WIDTH; x += 42) {
      ctx.beginPath(); ctx.moveTo(x, GROUND + 5); ctx.lineTo(x - 22, HEIGHT); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFinish(palette) {
    const x = worldEnd - cameraX - 70;
    if (x < -30 || x > WIDTH + 30) return;
    ctx.save();
    ctx.shadowColor = '#55edc2';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#55edc2';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, GROUND); ctx.stroke();
    ctx.shadowBlur = 0;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#172c32' : '#a6ffe5';
        ctx.fillRect(x + 5 + col * 12, 95 + row * 12, 12, 12);
      }
    }
    ctx.restore();
  }

  function drawObject(item, palette) {
    const x = item.x - cameraX;
    if (x < -100 || x > WIDTH + 100) return;
    ctx.save();
    ctx.translate(x, item.y);
    ctx.shadowBlur = 15;
    ctx.shadowColor = palette.glow;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#edd7ff';
    ctx.fillStyle = palette.glow;
    if (item.kind === 'block') {
      ctx.fillRect(-25, -25, 50, 50);
      ctx.strokeRect(-25, -25, 50, 50);
      ctx.fillStyle = '#ffffff25'; ctx.fillRect(-17, -17, 34, 7);
    } else if (item.kind === 'spike') {
      ctx.beginPath(); ctx.moveTo(-25, 25); ctx.lineTo(0, -25); ctx.lineTo(25, 25); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff55'; ctx.fillRect(-3, 0, 6, 18);
    } else if (item.kind === 'platform') {
      ctx.fillRect(-42, -9, 84, 18); ctx.strokeRect(-42, -9, 84, 18);
      ctx.fillStyle = '#ffffff55'; ctx.fillRect(-34, -5, 68, 3);
    } else if (item.kind === 'saw') {
      ctx.rotate(elapsed * 3.2);
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        const radius = i % 2 ? 19 : 30;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#170d28'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    } else if (item.kind === 'orb') {
      ctx.globalAlpha = item.used ? 0.25 : 1;
      ctx.strokeStyle = '#56f1ff'; ctx.fillStyle = '#22c9ed55';
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d7ffff'; ctx.beginPath(); ctx.arc(0, 0, 28 + Math.sin(elapsed * 5) * 3, 0, Math.PI * 2); ctx.stroke();
    } else if (item.kind === 'portal') {
      ctx.strokeStyle = '#55eeff'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(0, 0, 17, 31, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 28, 40, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#55eeff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOOST', 0, 50);
    }
    ctx.restore();
  }

  function drawPlayer(palette) {
    if (!player) return;
    player.trail.forEach((point, index) => {
      const alpha = (index + 1) / player.trail.length * 0.19;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = palette.accent;
      const x = point.x - cameraX;
      ctx.fillRect(x - PLAYER_SIZE / 2, point.y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    });
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(player.x - cameraX, player.y);
    ctx.rotate(player.rotation);
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 22;
    const grad = ctx.createLinearGradient(-22, -22, 22, 22);
    grad.addColorStop(0, '#f4cfff');
    grad.addColorStop(0.45, palette.glow);
    grad.addColorStop(1, '#6420b6');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    ctx.strokeRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#231238';
    ctx.fillRect(-11, -7, 6, 8);
    ctx.fillRect(5, -7, 6, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-10, -7, 2, 2);
    ctx.fillRect(6, -7, 2, 2);
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - cameraX, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
  }

  pauseButton.addEventListener('click', () => mode === 'running' ? pause() : mode === 'paused' ? resume() : null);
  $('#gameBackBtn').addEventListener('click', close);
  jumpButton.addEventListener('pointerdown', (event) => { event.preventDefault(); queueJump(); });
  canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); queueJump(); });
  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) queueJump();
    } else if (event.code === 'Escape') {
      event.preventDefault();
      if (mode === 'running') pause();
      else if (mode === 'paused') resume();
    } else if (event.code === 'KeyR' && (mode === 'failed' || mode === 'complete')) {
      retry();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (active && document.hidden && mode === 'running') pause();
  });

  window.GDPSGame = { start, close, retry, pause };
  // app.js assigns the test button before this file loads; replace its handler.
  if ($('#testBtn')) $('#testBtn').onclick = () => start();
})();
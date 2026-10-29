// ===== SHADOWSTRIKE SOUND SYSTEM =====

const shadowSounds = {
  audioContext: null,

  init() {
    if (!this.audioContext) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }

    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }
  },

  play(frequency, duration = 0.12, type = "sine", volume = 0.08) {
    this.init();

    if (!this.audioContext) return;

    const ctx = this.audioContext;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  },

  start() {
    this.play(440, 0.12, "triangle", 0.07);
    setTimeout(() => this.play(660, 0.18, "triangle", 0.07), 120);
    setTimeout(() => this.play(880, 0.22, "triangle", 0.07), 240);
  },

  collect() {
    this.play(880, 0.08, "sine", 0.045);
    setTimeout(() => this.play(1175, 0.1, "sine", 0.035), 55);
  },

  victory() {
    this.play(523, 0.16, "triangle", 0.07);
    setTimeout(() => this.play(659, 0.16, "triangle", 0.07), 150);
    setTimeout(() => this.play(784, 0.3, "triangle", 0.07), 300);
  },

  explosion() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;

  // 1. Heavy cinematic bass impact
  const bass = audioContext.createOscillator();
  const bassGain = audioContext.createGain();

  bass.type = "sine";
  bass.frequency.setValueAtTime(130, now);
  bass.frequency.exponentialRampToValueAtTime(25, now + 0.8);

  bassGain.gain.setValueAtTime(0.45, now);
  bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  bass.connect(bassGain);
  bassGain.connect(audioContext.destination);
  bass.start(now);
  bass.stop(now + 0.8);

  // 2. Sharp energy shockwave
  const shock = audioContext.createOscillator();
  const shockGain = audioContext.createGain();

  shock.type = "triangle";
  shock.frequency.setValueAtTime(1800, now);
  shock.frequency.exponentialRampToValueAtTime(90, now + 0.4);

  shockGain.gain.setValueAtTime(0.18, now);
  shockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  shock.connect(shockGain);
  shockGain.connect(audioContext.destination);
  shock.start(now);
  shock.stop(now + 0.4);

  // 3. Wide, gritty explosion noise
  const duration = 0.7;
  const bufferSize = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(
    1,
    bufferSize,
    audioContext.sampleRate
  );

  const channel = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    channel[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3500, now);
  filter.frequency.exponentialRampToValueAtTime(180, now + duration);

  const noiseGain = audioContext.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  noise.start(now);
  noise.stop(now + duration);

  // 4. Metallic sci-fi energy tail
  const tail = audioContext.createOscillator();
  const tailGain = audioContext.createGain();

  tail.type = "sine";
  tail.frequency.setValueAtTime(650, now + 0.08);
  tail.frequency.exponentialRampToValueAtTime(75, now + 0.95);

  tailGain.gain.setValueAtTime(0.001, now);
  tailGain.gain.setValueAtTime(0.12, now + 0.08);
  tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

  tail.connect(tailGain);
  tailGain.connect(audioContext.destination);
  tail.start(now + 0.08);
  tail.stop(now + 0.95);

  // Clean up after the sound finishes
  setTimeout(() => audioContext.close(), 1200);
},
};

"use strict";

// ============================================
// SHADOWSTRIKE — MULTIPLAYER GAME CLIENT
// ============================================

const socket = io();

const $ = (id) => document.getElementById(id);

const screens = {
  menu: $("menuScreen"),
  lobby: $("lobbyScreen"),
  game: $("gameScreen"),
  results: $("resultsScreen")
};

const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 700;

let currentRoom = null;
let currentPlayerId = null;
let currentHostId = null;
let gamePlayers = [];
let energyOrbs = [];
let gameMines = [];
let explosions = [];
function createExplosion(x, y) {
  explosions.push({
    x,
    y,
    startTime: performance.now(),
    duration: 500
  });
}

let remainingTime = 120;
let matchRunning = false;
let keys = {};
let lastInput = "";
let animationFrame = null;

const playerColors = [
  "#22d3ee",
  "#a855f7",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#fb7185",
  "#60a5fa",
  "#fb923c"
];

// ============================================
// SCREEN MANAGEMENT
// ============================================

function showScreen(name) {
  Object.values(screens).forEach(screen => {
    screen.classList.remove("active");
  });

  screens[name].classList.add("active");

  if (name === "game") {
    startRendering();
  } else {
    stopRendering();
  }
}

function showMessage(elementId, message, isError = false) {
  const element = $(elementId);

  element.textContent = message;
  element.classList.toggle("error", isError);

  // Restart the animation whenever the message changes
  element.classList.remove("energy-collect-animation");
  void element.offsetWidth;
  element.classList.add("energy-collect-animation");
}

function clearMessages() {
  ["menuMessage", "lobbyMessage", "gameMessage"].forEach(id => {
    showMessage(id, "");
  });
}

// ============================================
// SERVER CONNECTION
// ============================================

function updateConnection(connected) {
  $("connectionDot").classList.toggle("online", connected);

  $("connectionText").textContent = connected
    ? "SERVER CONNECTED"
    : "RECONNECTING...";
}

socket.on("connect", () => {
  currentPlayerId = socket.id;
  updateConnection(true);

  console.log("Connected to ShadowStrike:", socket.id);
});

socket.on("disconnect", () => {
  updateConnection(false);

  matchRunning = false;
  currentRoom = null;

  showScreen("menu");

  showMessage(
    "menuMessage",
    "Connection lost. Reconnect and create or join a room.",
    true
  );
});

socket.on("connect_error", () => {
  updateConnection(false);
});

socket.on("server:ready", data => {
  console.log(data.message);
});

// ============================================
// USERNAME
// ============================================

function getUsername() {
  const username = $("username").value.trim();

  if (!username) {
    showMessage("menuMessage", "Please enter a username.", true);
    $("username").focus();
    return null;
  }

  if (username.length > 16) {
    showMessage("menuMessage", "Username must be 16 characters or fewer.", true);
    return null;
  }

  return username;
}

// ============================================
// CREATE ROOM
// ============================================

$("createRoomButton").addEventListener("click", () => {
  clearMessages();

  if (!socket.connected) {
    showMessage("menuMessage", "Connecting to server. Please wait.", true);
    return;
  }

  const username = getUsername();

  if (!username) return;

  $("createRoomButton").disabled = true;

  socket.timeout(5000).emit(
    "room:create",
    { username },
    (error, response) => {
      $("createRoomButton").disabled = false;

      if (error) {
        showMessage("menuMessage", "Server timeout. Please try again.", true);
        return;
      }

      if (!response || !response.ok) {
        showMessage(
          "menuMessage",
          response?.error || "Unable to create room.",
          true
        );
        return;
      }

      currentRoom = response.room;
      renderLobby(currentRoom);
      showScreen("lobby");
    }
  );
});

// ============================================
// JOIN ROOM
// ============================================

$("roomCode").addEventListener("input", event => {
  event.target.value = event.target.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
});

$("joinRoomButton").addEventListener("click", joinRoom);

$("roomCode").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    joinRoom();
  }
});

function joinRoom() {
  clearMessages();

  if (!socket.connected) {
    showMessage("menuMessage", "Connecting to server. Please wait.", true);
    return;
  }

  const username = getUsername();

  if (!username) return;

  const code = $("roomCode").value.trim().toUpperCase();

  if (code.length !== 4) {
    showMessage("menuMessage", "Enter a valid four-character room code.", true);
    return;
  }

  $("joinRoomButton").disabled = true;

  socket.timeout(5000).emit(
    "room:join",
    { username, code },
    (error, response) => {
      $("joinRoomButton").disabled = false;

      if (error) {
        showMessage("menuMessage", "Server timeout. Please try again.", true);
        return;
      }

      if (!response || !response.ok) {
        showMessage(
          "menuMessage",
          response?.error || "Unable to join room.",
          true
        );
        return;
      }

      currentRoom = response.room;
      renderLobby(currentRoom);
      showScreen("lobby");
    }
  );
}

// ============================================
// LOBBY
// ============================================

function renderLobby(room) {
  if (!room) return;

  currentRoom = room;
  currentHostId = room.hostId;

  $("displayRoomCode").textContent = room.code;
  $("gameRoomCode").textContent = room.code;

  $("playerCount").textContent =
    `${room.players.length}/${room.maxPlayers || 8}`;

  const isHost = currentHostId === currentPlayerId;

  const startButton = $("startMatchButton");

  startButton.disabled =
    !isHost ||
    room.players.length < (room.minPlayers || 2) ||
    room.status !== "waiting";

  startButton.textContent = isHost
    ? room.status === "waiting"
      ? "START MATCH →"
      : "MATCH IN PROGRESS"
    : "WAITING FOR HOST";

  const playerList = $("playerList");
  playerList.replaceChildren();

  room.players.forEach((player, index) => {
    const card = document.createElement("div");
    card.className = "player-card";

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.style.color = player.color || playerColors[index];
    avatar.style.borderColor = player.color || playerColors[index];
    avatar.textContent = player.username.slice(0, 1).toUpperCase();

    const info = document.createElement("div");
    info.className = "player-info";

    const username = document.createElement("strong");
    username.textContent = player.username;

    const status = document.createElement("small");
    status.textContent = "Connected";

    info.append(username, status);

    card.append(avatar, info);

    if (player.id === currentHostId) {
      const hostTag = document.createElement("span");
      hostTag.className = "host-tag";
      hostTag.textContent = "HOST";
      card.append(hostTag);
    }

    playerList.append(card);
  });
}

socket.on("room:update", room => {
  if (!currentRoom || room.code !== currentRoom.code) return;

  currentRoom = room;
  renderLobby(room);
});

$("copyCodeButton").addEventListener("click", async () => {
  if (!currentRoom) return;

  try {
    await navigator.clipboard.writeText(currentRoom.code);

    $("copyCodeButton").textContent = "✓";

    setTimeout(() => {
      $("copyCodeButton").textContent = "⧉";
    }, 1200);
  } catch {
    showMessage(
      "lobbyMessage",
      `Share this room code: ${currentRoom.code}`
    );
  }
});

// ============================================
// START MATCH
// ============================================

$("startMatchButton").addEventListener("click", () => {
  if (!currentRoom) return;

  socket.emit("room:start", response => {
    if (!response || !response.ok) {
      showMessage(
        "lobbyMessage",
        response?.error || "Unable to start match.",
        true
      );
    }
  });
});

socket.on("game:started", data => {
  remainingTime = data.duration || 120;
  matchRunning = true;

  gamePlayers = [];
  energyOrbs = [];

  $("gameTimer").textContent = formatTime(remainingTime);

  showScreen("game");

  // Play the futuristic game-start sound
  shadowSounds.start();
});

// ============================================
// GAME STATE
// ============================================

let previousOrbCount = null;

socket.on("game:state", state => {
  const newOrbs = state.orbs || [];

  // Play a sound when an orb disappears
  if (
    previousOrbCount !== null &&
    newOrbs.length < previousOrbCount &&
    matchRunning
  ) {
    shadowSounds.collect();
  }

  previousOrbCount = newOrbs.length;
 
  gamePlayers = state.players || [];
  energyOrbs = newOrbs;
  gameMines = state.mines || [];

  updateLeaderboard();

});

socket.on("game:timer", time => {
  remainingTime = time;

  $("gameTimer").textContent = formatTime(time);

  if (time <= 10) {
    $("gameTimer").style.color = "#fb7185";
  } else {
    $("gameTimer").style.color = "#22d3ee";
  }
});

socket.on("game:collected", data => {
  // Play the collection sound
  shadowSounds.collect();

  // Show a message only to the player who collected the orb
  if (data.playerId === currentPlayerId) {
    showMessage(
      "gameMessage",
      `+1 ENERGY! Your score: ${data.score}`
    );
  }
});

socket.on("game:hit-mine", data => {
  const hitMine = gameMines.find(
    mine => mine.id === data.mineId
  );

  // Create an explosion at the mine's location
  if (hitMine) {
    createExplosion(hitMine.x, hitMine.y);
    shadowSounds.explosion();

    gameMines = gameMines.filter(
      mine => mine.id !== hitMine.id
    );
  }

  if (data.playerId === currentPlayerId) {
    showMessage(
      "gameMessage",
      "💥 CYBER MINE HIT! YOUR SCORE IS ZERO!",
      true
    );
  } else {
    showMessage(
      "gameMessage",
      `💥 ${data.username} hit a mine!`,
      false
    );
  }
});

// ============================================
// KEYBOARD CONTROLS
// ============================================

const movementKeys = new Set([
  "w", "a", "s", "d",
  "arrowup", "arrowdown", "arrowleft", "arrowright"
]);

window.addEventListener("keydown", event => {
  if (!event.key) return;

  const key = event.key.toLowerCase();

  if (movementKeys.has(key)) {
    event.preventDefault();
  }

  keys[key] = true;
});

window.addEventListener("keyup", event => {
  if (!event.key) return;

  const key = event.key.toLowerCase();
  keys[key] = false;
});

window.addEventListener("blur", () => {
  keys = {};
});


function sendInput() {
  if (!socket.connected || !matchRunning) return;

  const input = {
    up: Boolean(keys.w || keys.arrowup),
    down: Boolean(keys.s || keys.arrowdown),
    left: Boolean(keys.a || keys.arrowleft),
    right: Boolean(keys.d || keys.arrowright)
  };

  const serialized = JSON.stringify(input);

  if (serialized !== lastInput) {
    lastInput = serialized;
    socket.emit("game:input", input);
  }
}

function inputLoop() {
  sendInput();
  requestAnimationFrame(inputLoop);
}

requestAnimationFrame(inputLoop);

// ============================================
// LEADERBOARD
// ============================================

function updateLeaderboard() {
  const sorted = [...gamePlayers].sort((a, b) => b.score - a.score);

  const container = $("leaderboard");
  container.replaceChildren();

  sorted.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "score-row";

    const rank = document.createElement("span");
    rank.className = "score-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent =
      player.id === currentPlayerId
        ? `${player.username} (YOU)`
        : player.username;

    name.style.color = player.color;

    const score = document.createElement("span");
    score.className = "score-points";
    score.textContent = player.score;

    row.append(rank, name, score);
    container.append(row);
  });
}

// ============================================
// CANVAS RENDERING
// ============================================

function drawArena() {
  ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Background
  ctx.fillStyle = "#080816";
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Grid
  ctx.strokeStyle = "rgba(95, 73, 166, 0.16)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= ARENA_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y <= ARENA_HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_WIDTH, y);
    ctx.stroke();
  }

  // Arena border
  ctx.save();

  ctx.strokeStyle = "#8b5cf6";
  ctx.shadowColor = "#8b5cf6";
  ctx.shadowBlur = 18;
  ctx.lineWidth = 3;

  ctx.strokeRect(4, 4, ARENA_WIDTH - 8, ARENA_HEIGHT - 8);

  ctx.restore();

  // Decorative corner marks
  ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
  ctx.lineWidth = 3;

  const corners = [
    [18, 18, 70, 18, 18, 70],
    [ARENA_WIDTH - 18, 18, ARENA_WIDTH - 70, 18, ARENA_WIDTH - 18, 70],
    [18, ARENA_HEIGHT - 18, 70, ARENA_HEIGHT - 18, 18, ARENA_HEIGHT - 70],
    [
      ARENA_WIDTH - 18,
      ARENA_HEIGHT - 18,
      ARENA_WIDTH - 70,
      ARENA_HEIGHT - 18,
      ARENA_WIDTH - 18,
      ARENA_HEIGHT - 70
    ]
  ];

  corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  });

  // Center decoration
  ctx.save();

  ctx.strokeStyle = "rgba(168, 85, 247, 0.17)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 75, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 55, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}


function drawMines() {
  const time = performance.now();

  for (const mine of gameMines) {
    const radius = mine.radius || 22;

    // Smooth pulsing animation
    const pulse = 1 + Math.sin(time * 0.006) * 0.12;
    const rotation = time * 0.0015;
    const glow = 18 + Math.sin(time * 0.008) * 10;

    ctx.save();
    ctx.translate(mine.x, mine.y);

    // Pulsating outer red glow
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = glow;

    // Main mine body
    ctx.beginPath();
    ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = "#3b0718";
    ctx.fill();

    ctx.strokeStyle = "#ff1744";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Rotating outer neon ring
    ctx.save();
    ctx.rotate(rotation);

    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.45, radius * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Small energy nodes on the rotating ring
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i;

      const x = Math.cos(angle) * radius * 1.45;
      const y = Math.sin(angle) * radius * 0.55;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ff9eaa";
      ctx.fill();
    }

    ctx.restore();

    // Inner warning circle
    ctx.shadowColor = "#ff6b81";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "#ff6b81";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // Pulsating warning symbol
    const warningAlpha = 0.65 + Math.sin(time * 0.01) * 0.35;

    ctx.globalAlpha = warningAlpha;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 0);

    ctx.restore();
  }
}

function drawExplosions() {
  const now = performance.now();

  explosions = explosions.filter(explosion => {
    const elapsed = now - explosion.startTime;
    const progress = elapsed / explosion.duration;

    if (progress >= 1) return false;

    const radius = 12 + progress * 65;
    const alpha = 1 - progress;

    ctx.save();

    // Expanding red outer blast
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 30;
    ctx.strokeStyle = "#ff1744";
    ctx.lineWidth = 5 * (1 - progress) + 1;

    ctx.beginPath();
    ctx.arc(
      explosion.x,
      explosion.y,
      radius,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    // Bright inner flash
    ctx.fillStyle = "#ff6b81";
    ctx.globalAlpha = alpha * 0.45;

    ctx.beginPath();
    ctx.arc(
      explosion.x,
      explosion.y,
      radius * 0.45,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Cyan energy ring
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(
      explosion.x,
      explosion.y,
      radius * 0.7,
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.restore();

    return true;
  });
}

function drawOrb(orb, index) {
  const pulse = 1 + Math.sin(Date.now() / 220 + index) * 0.13;
  const radius = 10 * pulse;

  ctx.save();

  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 25;

  ctx.fillStyle = "rgba(34, 211, 238, 0.15)";
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#22d3ee";
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(orb.x - 2, orb.y - 2, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlayer(player) {
  const isMe = player.id === currentPlayerId;
  const color = player.color || "#a855f7";

  ctx.save();
  ctx.translate(player.x, player.y);

  // Neon glow
  ctx.shadowColor = color;
  ctx.shadowBlur = isMe ? 25 : 16;

  // Shadow beneath the character
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 13, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.shadowBlur = 5;
  ctx.fillStyle = "#25243f";

  ctx.beginPath();
  ctx.roundRect(-11, 3, 8, 13, 3);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(3, 3, 8, 13, 3);
  ctx.fill();

  // Neon boots
  ctx.fillStyle = color;
  ctx.fillRect(-12, 12, 10, 4);
  ctx.fillRect(2, 12, 10, 4);

  // Body armor
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#24213d";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.roundRect(-14, -9, 28, 21, 7);
  ctx.fill();
  ctx.stroke();

  // Chest energy core
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#22d3ee";

  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  // Arms
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = "#353252";

  ctx.beginPath();
  ctx.roundRect(-19, -7, 6, 15, 3);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(13, -7, 6, 15, 3);
  ctx.fill();

  // Head
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#f1c7a5";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(0, -17, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cyber helmet
  ctx.fillStyle = "#28243f";

  ctx.beginPath();
  ctx.arc(0, -19, 12, Math.PI, Math.PI * 2);
  ctx.lineTo(11, -17);
  ctx.lineTo(-11, -17);
  ctx.closePath();
  ctx.fill();

  // Glowing visor
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#22d3ee";

  ctx.beginPath();
  ctx.roundRect(-8, -21, 16, 5, 2);
  ctx.fill();

  // Helmet side lights
  ctx.fillStyle = color;
  ctx.fillRect(-13, -19, 3, 6);
  ctx.fillRect(10, -19, 3, 6);

  // Reset glow before drawing text
  ctx.shadowBlur = 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Username
  ctx.font = "600 15px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const label = isMe
    ? `${player.username} (YOU)`
    : player.username;

  const labelWidth = ctx.measureText(label).width;

  ctx.fillStyle = "rgba(8, 8, 22, 0.9)";
  ctx.fillRect(
    player.x - labelWidth / 2 - 7,
    player.y - 48,
    labelWidth + 14,
    22
  );

  ctx.fillStyle = color;
  ctx.fillText(label, player.x, player.y - 29);

  // Score
  ctx.font = "bold 11px Inter, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(String(player.score), player.x, player.y + 34);

  ctx.restore();
}

function renderGame() {
  if (!screens.game.classList.contains("active")) return;

  drawArena();

  energyOrbs.forEach(drawOrb);
  drawMines();
  drawExplosions();
  gamePlayers.forEach(drawPlayer);

  animationFrame = requestAnimationFrame(renderGame);
}

function startRendering() {
  stopRendering();
  animationFrame = requestAnimationFrame(renderGame);
}

function stopRendering() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
}

// ============================================
// RESULTS
// ============================================

socket.on("game:over", data => {
  matchRunning = false;
  keys = {};
  lastInput = "";

  showScreen("results");

  const winnerCard = $("winnerCard");
  winnerCard.replaceChildren();

  const isDraw = data.isDraw === true;

  // Play the victory sound only when there is a winner
  if (!isDraw) {
    shadowSounds.victory();
  }

  const trophy = document.createElement("div");
  trophy.textContent = isDraw ? "🤝" : "🏆";

  const title = document.createElement("span");
  title.textContent = isDraw
    ? "MATCH DRAW"
    : "CHAMPION OF THE ARENA";

  const winnerName = document.createElement("strong");
  winnerName.textContent = isDraw
    ? "IT'S A TIE!"
    : data.winner
      ? data.winner.username
      : "No winner";

  const winnerScore = document.createElement("span");

  if (isDraw && data.ranking && data.ranking.length >= 2) {
    winnerScore.textContent =
      `BOTH PLAYERS SCORED ${data.ranking[0].score} POINTS`;
  } else if (data.winner) {
    winnerScore.textContent = `FINAL SCORE: ${data.winner.score}`;
  } else {
    winnerScore.textContent = "The match ended without a winner.";
  }

  winnerCard.append(trophy, title, winnerName, winnerScore);

  // Build the final leaderboard
  const container = $("finalLeaderboard");
  container.replaceChildren();

  (data.ranking || []).forEach(player => {
    const row = document.createElement("div");
    row.className = "score-row";

    const rank = document.createElement("span");
    rank.className = "score-rank";

    // Show equal positions when the scores are tied
    if (
      data.isDraw &&
      data.ranking.length >= 2 &&
      player.score === data.ranking[0].score
    ) {
      rank.textContent = "01";
    } else {
      rank.textContent = String(player.position).padStart(2, "0");
    }

    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent = player.username;

    const score = document.createElement("span");
    score.className = "score-points";
    score.textContent = player.score;

    row.append(rank, name, score);
    container.append(row);
  });
});

// ============================================
// LEAVING ROOMS
// ============================================

function leaveRoom() {
  if (socket.connected && currentRoom) {
    socket.emit("room:leave");
  }

  currentRoom = null;
  currentHostId = null;
  gamePlayers = [];
  energyOrbs = [];
  matchRunning = false;
  keys = {};
  lastInput = "";

  clearMessages();
  showScreen("menu");
}

$("leaveRoomButton").addEventListener("click", leaveRoom);
$("gameLeaveButton").addEventListener("click", leaveRoom);
$("resultsLeaveButton").addEventListener("click", leaveRoom);

// Play Again button
$("playAgainButton").addEventListener("click", () => {
  console.log("Socket connected:", socket.connected);

  socket.emit("room:playAgain", (response) => {
    console.log("Server response:", response);

    if (!response || !response.ok) {
      alert(response?.error || "Could not restart the match.");
    } else {
      console.log("Rematch started successfully");
    }
  });
});


$("homeButton").addEventListener("click", event => {
  event.preventDefault();

  if (currentRoom) {
    leaveRoom();
  } else {
    showScreen("menu");
  }
});

// ============================================
// UTILITIES
// ============================================

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remainingSeconds).padStart(2, "0")
  );
}

// Initial UI state
updateConnection(socket.connected);
showScreen("menu");




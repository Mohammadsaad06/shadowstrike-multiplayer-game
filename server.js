const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

const ARENA = {
  width: 1200,
  height: 700
};

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const MATCH_DURATION = 120;
const TICK_RATE = 30;

const rooms = new Map();

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ status: "ok", game: "ShadowStrike" });
});

function createId(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";

  for (let i = 0; i < length; i++) {
    id += chars[crypto.randomInt(chars.length)];
  }

  return id;
}

function randomPosition() {
  return {
    x: 60 + Math.random() * (ARENA.width - 120),
    y: 60 + Math.random() * (ARENA.height - 120)
  };
}

function createOrb() {
  return {
    id: crypto.randomUUID(),
    ...randomPosition(),
    value: 1
  };
}

function createMine() {
  return {
    id: crypto.randomUUID(),
    ...randomPosition(),
    radius: 22
  };
}

function createRoom(hostId) {
  let code;

  do {
    code = createId();
  } while (rooms.has(code));

  const room = {
    code,
    hostId,
    status: "waiting",
    players: new Map(),
    orbs: [],
    timeLeft: MATCH_DURATION,
    timer: null,
    tick: null,
    lastTick: Date.now()
  };

  for (let i = 0; i < 15; i++) {
    room.orbs.push(createOrb());
  }

  room.mines = [];

  rooms.set(code, room);
  return room;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    players: [...room.players.values()].map(player => ({
      id: player.id,
      username: player.username,
      score: player.score,
      color: player.color,
      ready: player.ready,
      x: player.x,
      y: player.y
    }))
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function removeRoom(room) {
  if (room.timer) clearInterval(room.timer);
  if (room.tick) clearInterval(room.tick);

  rooms.delete(room.code);
}

function finishMatch(room) {
  if (room.status !== "playing") return;

  room.status = "finished";

  if (room.timer) clearInterval(room.timer);
  if (room.tick) clearInterval(room.tick);

  const ranking = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      id: player.id,
      username: player.username,
      score: player.score,
      position: index + 1
    }));

  let winner = null;
  let isDraw = false;

  if (ranking.length >= 2 && ranking[0].score === ranking[1].score) {
    isDraw = true;
  } else {
    winner = ranking[0] || null;
  }

  io.to(room.code).emit("game:over", {
    winner,
    isDraw,
    ranking
  });

  emitRoom(room);
}

function startMatch(room) {
  if (room.status !== "waiting" && room.status !== "finished") return;

  if (room.players.size < MIN_PLAYERS) {
    return;
  }


  room.status = "playing";
  room.timeLeft = MATCH_DURATION;

  for (const player of room.players.values()) {
    player.score = 0;
    player.x = 60 + Math.random() * (ARENA.width - 120);
    player.y = 60 + Math.random() * (ARENA.height - 120);
  }

  room.orbs = [];

  for (let i = 0; i < 15; i++) {
    room.orbs.push(createOrb());
  }

  room.lastTick = Date.now();

  // Cyber mines spawn one at a time during the match
  room.mines = [];

  if (room.mineSpawner) {
    clearTimeout(room.mineSpawner);
    room.mineSpawner = null;
  }


function scheduleNextMine() {
  if (room.status !== "playing") return;

  // Wait a random 12–18 seconds before spawning
  const delay = 12000 + Math.random() * 6000;

  room.mineSpawner = setTimeout(() => {
    if (room.status !== "playing") return;

    // Allow a maximum of 4 active mines
    if (!room.mines) {
      room.mines = [];
    }

    if (room.mines.length < 4) {
      room.mines.push(createMine());
    }

    // Continue scheduling mines during the match
    scheduleNextMine();
  }, delay);
}


  scheduleNextMine();

  io.to(room.code).emit("game:started", {
    duration: MATCH_DURATION,
    arena: ARENA
  });

  emitRoom(room);

  room.timer = setInterval(() => {
    if (room.status !== "playing") return;

    room.timeLeft = Math.max(0, room.timeLeft - 1);

    io.to(room.code).emit("game:timer", room.timeLeft);

    if (room.timeLeft <= 0) {
      finishMatch(room);
    }
  }, 1000);

  room.tick = setInterval(() => {
    if (room.status !== "playing") return;

    const now = Date.now();
    const delta = Math.min((now - room.lastTick) / 1000, 0.1);
    room.lastTick = now;

    const speed = 240;

    for (const player of room.players.values()) {
      const input = player.input;

      let dx = Number(input.right) - Number(input.left);
      let dy = Number(input.down) - Number(input.up);

      const magnitude = Math.hypot(dx, dy);

      if (magnitude > 0) {
        dx /= magnitude;
        dy /= magnitude;
      }

      player.x = Math.max(
        20,
        Math.min(ARENA.width - 20, player.x + dx * speed * delta)
      );

      player.y = Math.max(
        20,
        Math.min(ARENA.height - 20, player.y + dy * speed * delta)
      );
    }

    for (const orb of [...room.orbs]) {
      for (const player of room.players.values()) {
        const distance = Math.hypot(
          player.x - orb.x,
          player.y - orb.y
        );

        if (distance < 30) {
          player.score += orb.value;

          room.orbs = room.orbs.filter(item => item.id !== orb.id);
          room.orbs.push(createOrb());

          io.to(room.code).emit("game:collected", {
            playerId: player.id,
            username: player.username,
            score: player.score
          });

          break;
        }
      }
    }

  // Cyber mine collision detection
  for (const mine of [...(room.mines || [])]) {
    for (const player of room.players.values()) {
      const distance = Math.hypot(
        player.x - mine.x,
        player.y - mine.y
      );

      if (distance < (mine.radius || 22) + 12) {
        // Reset the player's score
        player.score = 0;
  
        // Remove the triggered mine
        room.mines = room.mines.filter(
          item => item.id !== mine.id
        );

        // Notify everyone in the room
        io.to(room.code).emit("game:hit-mine", {
          playerId: player.id,
          username: player.username,
          score: player.score,
          mineId: mine.id
        });

        // Spawn a replacement mine after a random delay
        setTimeout(() => {
          if (room.status === "playing") {
            room.mines.push(createMine());
          }
        }, 12000 + Math.random() * 6000);

        break;
      }
    }
  }


    io.to(room.code).emit("game:state", {
        players: [...room.players.values()].map(player => ({
        id: player.id,
        username: player.username,
        x: player.x,
        y: player.y,
        score: player.score,
        color: player.color
        })),
        orbs: room.orbs,
        mines: room.mines || []
    });
  }, 1000 / TICK_RATE);
}

function removePlayer(socket) {
  const code = socket.data.roomCode;

  if (!code) return;

  const room = rooms.get(code);

  socket.data.roomCode = null;

  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(code);

  if (room.players.size === 0) {
    removeRoom(room);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }

  if (room.status === "playing") {
    if (room.players.size < MIN_PLAYERS) {
      finishMatch(room);
    }
  }

  emitRoom(room);
}

io.on("connection", socket => {
  socket.emit("server:ready", {
    message: "Connected to ShadowStrike!"
  });

  socket.on("room:create", (payload = {}, callback = () => {}) => {
    if (socket.data.roomCode) {
      return callback({
        ok: false,
        error: "Leave your current room first."
      });
    }

    const username = String(payload.username || "")
      .trim()
      .slice(0, 16);

    if (!username) {
      return callback({
        ok: false,
        error: "Enter a username."
      });
    }

    const room = createRoom(socket.id);

    const player = {
      id: socket.id,
      username,
      score: 0,
      color: "#a855f7",
      ready: true,
      ...randomPosition(),
      input: {
        up: false,
        down: false,
        left: false,
        right: false
      }
    };

    room.players.set(socket.id, player);

    socket.data.roomCode = room.code;
    socket.join(room.code);

    callback({
      ok: true,
      room: publicRoom(room)
    });

    emitRoom(room);
  });

  socket.on("room:join", (payload = {}, callback = () => {}) => {
    if (socket.data.roomCode) {
      return callback({
        ok: false,
        error: "Leave your current room first."
      });
    }

    const code = String(payload.code || "")
      .trim()
      .toUpperCase();

    const username = String(payload.username || "")
      .trim()
      .slice(0, 16);

    const room = rooms.get(code);

    if (!username) {
      return callback({
        ok: false,
        error: "Enter a username."
      });
    }

    if (!room) {
      return callback({
        ok: false,
        error: "Room not found."
      });
    }

    if (room.status !== "waiting") {
      return callback({
        ok: false,
        error: "This match has already started."
      });
    }

    if (room.players.size >= MAX_PLAYERS) {
      return callback({
        ok: false,
        error: "This room is full."
      });
    }

    const player = {
      id: socket.id,
      username,
      score: 0,
      color: [
        "#22d3ee",
        "#a855f7",
        "#f472b6",
        "#facc15",
        "#4ade80",
        "#fb7185",
        "#60a5fa",
        "#fb923c"
      ][room.players.size % MAX_PLAYERS],
      ready: true,
      ...randomPosition(),
      input: {
        up: false,
        down: false,
        left: false,
        right: false
      }
    };

    room.players.set(socket.id, player);

    socket.data.roomCode = room.code;
    socket.join(room.code);

    callback({
      ok: true,
      room: publicRoom(room)
    });

    emitRoom(room);
  });

  socket.on("room:start", (callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) {
      return callback({
        ok: false,
        error: "Join a room first."
      });
    }

    if (room.hostId !== socket.id) {
      return callback({
        ok: false,
        error: "Only the room host can start the match."
      });
    }

    if (room.players.size < MIN_PLAYERS) {
      return callback({
        ok: false,
        error: "At least two players are required."
      });
    }

    startMatch(room);

    callback({
      ok: true
    });
  });

  socket.on("room:playAgain", (callback = () => {}) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) {
      return callback({
        ok: false,
        error: "Join a room first."
      });
    }

    if (room.hostId !== socket.id) {
      return callback({
        ok: false,
        error: "Only the room host can start a rematch."
      });
    }

    if (room.status !== "finished") {
      return callback({
        ok: false,
        error: "The current match has not finished."
      });
    }

    if (room.players.size < MIN_PLAYERS) {
      return callback({
        ok: false,
        error: "At least two players are required."
      });
    }

    startMatch(room);

    callback({
      ok: true
    });
  });

  socket.on("game:input", (input = {}) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "playing") return;

    const player = room.players.get(socket.id);

    if (!player) return;

    for (const key of ["up", "down", "left", "right"]) {
      player.input[key] = input[key] === true;
    }
  });

  socket.on("room:leave", () => {
    removePlayer(socket);
  });

  socket.on("disconnect", () => {
    removePlayer(socket);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ShadowStrike server running on port ${PORT}`);
});
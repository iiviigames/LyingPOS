var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_ws = require("ws");
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var app = (0, import_express.default)();
var server = import_http.default.createServer(app);
var wss = new import_ws.WebSocketServer({ noServer: true });
var PORT = 3e3;
var RANK_VALUES = {
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  "J": 11,
  "Q": 12,
  "K": 13,
  "A": 14,
  "2": 15
};
var RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
var SUITS = ["hearts", "diamonds", "clubs", "spades"];
var rooms = /* @__PURE__ */ new Map();
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: generateId(),
        suit,
        rank,
        value: RANK_VALUES[rank]
      });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function addLog(room, type, message, playerName) {
  const log = {
    id: generateId(),
    timestamp: Date.now(),
    type,
    playerName,
    message
  };
  room.logs.push(log);
  if (room.logs.length > 150) {
    room.logs.shift();
  }
}
function drawCardsToMinimum(room, player) {
  if (room.deck.length === 0) return;
  const currentCount = player.cards.length;
  if (currentCount < 5) {
    const needed = 5 - currentCount;
    const drawn = [];
    for (let i = 0; i < needed; i++) {
      if (room.deck.length > 0) {
        const card = room.deck.pop();
        player.cards.push(card);
        drawn.push(card);
      }
    }
    player.handSize = player.cards.length;
    if (drawn.length > 0) {
      addLog(room, "info", `${player.name} drew ${drawn.length} card(s) from the drawing pile.`, player.name);
    }
  }
}
function broadcastRoomState(room) {
  for (const player of room.players) {
    if (player.isCpu || !player.socket) continue;
    const clientPlayers = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      isCpu: p.isCpu,
      handSize: p.cards.length,
      cards: p.id === player.id ? p.cards : void 0,
      // Only expose client's own cards
      isOffline: p.isOffline,
      offlineRemaining: p.offlineRemaining
    }));
    const clientState = {
      id: room.id,
      players: clientPlayers,
      status: room.status,
      turnIndex: room.turnIndex,
      deckCount: room.deck.length,
      pile: room.pile.map(() => ({ id: "hidden", suit: "hearts", rank: "hidden", value: 0 })),
      // Hide pile details
      pileCalls: room.pileCalls,
      discardPileCount: room.discardPileCount,
      lastPlay: room.lastPlay ? {
        playerId: room.lastPlay.playerId,
        playerName: room.lastPlay.playerName,
        claimRank: room.lastPlay.claimRank,
        count: room.lastPlay.count,
        actualCards: room.lastPlay.actualCards.map(() => ({ id: "hidden", suit: "hearts", rank: "hidden", value: 0 })),
        // Hide details during normal play
        timestamp: room.lastPlay.timestamp
      } : null,
      suspicionActive: room.suspicionActive,
      suspicionResult: room.suspicionResult,
      reactionTimeLeft: room.reactionTimeLeft,
      winnerId: room.winnerId,
      logs: room.logs,
      reconnectBuffer: room.reconnectBuffer
    };
    player.socket.send(JSON.stringify({
      type: "room_state",
      state: clientState
    }));
  }
}
function isValidClaim(claimRank, previousClaimRank) {
  if (!previousClaimRank) return true;
  if (claimRank === "2") return true;
  const val = RANK_VALUES[claimRank];
  const prevVal = RANK_VALUES[previousClaimRank];
  if (val < prevVal) return false;
  if (prevVal === 15 && val !== 15) return false;
  if (val >= 11 && prevVal < 7) {
    return false;
  }
  return true;
}
function checkPileFalls(room) {
  if (room.pileCalls.length === 0) return false;
  const latestCall = room.pileCalls[room.pileCalls.length - 1];
  if (latestCall.claimRank === "10") {
    return true;
  }
  if (latestCall.claimRank === "A") {
    return true;
  }
  let targetRank = latestCall.claimRank;
  let sum = 0;
  for (let i = room.pileCalls.length - 1; i >= 0; i--) {
    const call = room.pileCalls[i];
    if (call.claimRank === targetRank) {
      sum += call.count;
      if (sum >= 4) {
        return true;
      }
    } else {
      break;
    }
  }
  return false;
}
function nextTurn(room) {
  let attempts = 0;
  const originalIndex = room.turnIndex;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    attempts++;
  } while (room.players[room.turnIndex].cards.length === 0 && room.deck.length === 0 && attempts < room.players.length);
  checkWinner(room);
}
function getNextPlayerIndex(room) {
  let idx = room.turnIndex;
  let attempts = 0;
  do {
    idx = (idx + 1) % room.players.length;
    attempts++;
  } while (room.players[idx].cards.length === 0 && room.deck.length === 0 && attempts < room.players.length);
  return idx;
}
function checkWinner(room) {
  if (room.status !== "playing") return;
  if (room.deck.length === 0) {
    const activePlayers = room.players.filter((p) => p.cards.length > 0);
    const finishedPlayers = room.players.filter((p) => p.cards.length === 0);
    if (finishedPlayers.length > 0) {
      const winner = finishedPlayers[0];
      room.winnerId = winner.id;
      room.status = "gameover";
      addLog(room, "win", `\u{1F451} GAME OVER! ${winner.name} has run out of cards and wins the game! \u{1F389}`, winner.name);
      return;
    }
  }
}
function resolveSuspicion(room, accuserPlayerId) {
  if (!room.lastPlay || !room.suspicionActive) return;
  if (room.reactionTimerId) {
    clearInterval(room.reactionTimerId);
    room.reactionTimerId = null;
  }
  if (room.cpuActionTimerId) {
    clearTimeout(room.cpuActionTimerId);
    room.cpuActionTimerId = null;
  }
  room.suspicionActive = false;
  const accuser = room.players.find((p) => p.id === accuserPlayerId);
  const accused = room.players.find((p) => p.id === room.lastPlay.playerId);
  const { claimRank, actualCards } = room.lastPlay;
  const lied = actualCards.some((card) => card.rank !== claimRank);
  const pileCountBefore = room.pile.length;
  if (lied) {
    accused.cards.push(...room.pile);
    accused.handSize = accused.cards.length;
    room.pile = [];
    room.pileCalls = [];
    room.lastPlay = null;
    addLog(room, "suspicion", `\u274C BUSTED! ${accused.name} lied about playing ${claimRank}s! They take all ${pileCountBefore} cards in the pile!`, accused.name);
    nextTurn(room);
  } else {
    accuser.cards.push(...room.pile);
    accuser.handSize = accuser.cards.length;
    room.pile = [];
    room.pileCalls = [];
    room.lastPlay = null;
    addLog(room, "suspicion", `\u2705 TRUTH! ${accused.name} was telling the truth! ${accuser.name} takes all ${pileCountBefore} cards in the pile!`, accused.name);
    drawCardsToMinimum(room, accused);
  }
  room.suspicionResult = {
    accuser: accuser.name,
    accused: accused.name,
    lied,
    actualCards,
    claimRank,
    pileCountBefore
  };
  broadcastRoomState(room);
  setTimeout(() => {
    dismissSuspicionResult(room);
  }, 4e3);
}
function dismissSuspicionResult(room) {
  if (!room.suspicionResult) return;
  room.suspicionResult = null;
  checkWinner(room);
  broadcastRoomState(room);
  triggerCpuIfNeeded(room);
}
function finalizePlay(room) {
  if (!room.lastPlay) return;
  if (room.reactionTimerId) {
    clearInterval(room.reactionTimerId);
    room.reactionTimerId = null;
  }
  room.suspicionActive = false;
  const lastPlayer = room.players.find((p) => p.id === room.lastPlay.playerId);
  const falls = checkPileFalls(room);
  if (falls) {
    const pileCount = room.pile.length;
    room.discardPileCount += pileCount;
    room.pile = [];
    room.pileCalls = [];
    room.lastPlay = null;
    addLog(room, "fall", `\u{1F4A5} BOOM! The pile falls and is cleared! ${lastPlayer.name} gets another turn!`, lastPlayer.name);
    drawCardsToMinimum(room, lastPlayer);
  } else {
    drawCardsToMinimum(room, lastPlayer);
    nextTurn(room);
  }
  room.lastPlay = null;
  broadcastRoomState(room);
  triggerCpuIfNeeded(room);
}
function startReactionTimer(room) {
  if (room.reactionTimerId) {
    clearInterval(room.reactionTimerId);
  }
  room.reactionTimeLeft = 5;
  room.suspicionActive = true;
  room.reactionTimerId = setInterval(() => {
    room.reactionTimeLeft -= 1;
    if (room.reactionTimeLeft <= 0) {
      clearInterval(room.reactionTimerId);
      room.reactionTimerId = null;
      finalizePlay(room);
    } else {
      broadcastRoomState(room);
      triggerCpuSuspicionCheck(room);
    }
  }, 1e3);
}
function triggerCpuIfNeeded(room) {
  if (room.status !== "playing" || room.suspicionActive || room.suspicionResult) return;
  const activePlayer = room.players[room.turnIndex];
  if (!activePlayer.isCpu) return;
  if (room.cpuActionTimerId) {
    clearTimeout(room.cpuActionTimerId);
  }
  room.cpuActionTimerId = setTimeout(() => {
    executeCpuTurn(room, activePlayer);
  }, 2500);
}
function executeCpuTurn(room, cpu) {
  if (room.status !== "playing" || room.suspicionActive || room.suspicionResult) return;
  const prevClaim = room.pileCalls.length > 0 ? room.pileCalls[room.pileCalls.length - 1].claimRank : null;
  let chosenCards = [];
  let claimedRank = "";
  const sortedHand = [...cpu.cards].sort((a, b) => a.value - b.value);
  const legalRanks = RANKS.filter((r) => isValidClaim(r, prevClaim));
  if (legalRanks.length === 0) {
    claimedRank = prevClaim || "3";
  } else {
    const truthfulOptions = sortedHand.filter((c) => isValidClaim(c.rank, prevClaim));
    if (truthfulOptions.length > 0 && Math.random() < 0.75) {
      const groups = {};
      for (const card of truthfulOptions) {
        groups[card.rank] = groups[card.rank] || [];
        groups[card.rank].push(card);
      }
      const chosenRank = Object.keys(groups).sort((a, b) => RANK_VALUES[a] - RANK_VALUES[b])[0];
      chosenCards = groups[chosenRank];
      claimedRank = chosenRank;
    } else {
      claimedRank = legalRanks[0];
      if (Math.random() < 0.3 && legalRanks.includes("10")) claimedRank = "10";
      if (Math.random() < 0.2 && legalRanks.includes("A")) claimedRank = "A";
      const numCards = Math.min(sortedHand.length, Math.floor(Math.random() * 2) + 1);
      chosenCards = sortedHand.slice(0, numCards);
    }
  }
  if (chosenCards.length === 0 && sortedHand.length > 0) {
    chosenCards = [sortedHand[0]];
    if (!claimedRank) {
      claimedRank = legalRanks[0] || prevClaim || "3";
    }
  }
  if (chosenCards.length === 0) {
    nextTurn(room);
    broadcastRoomState(room);
    return;
  }
  const cardIds = chosenCards.map((c) => c.id);
  addLog(room, "play", `\u{1F0CF} ${cpu.name} played ${cardIds.length} card(s) claiming to be: "${claimedRank}"`, cpu.name);
  cpu.cards = cpu.cards.filter((c) => !cardIds.includes(c.id));
  cpu.handSize = cpu.cards.length;
  room.pile.push(...chosenCards);
  const pileCall = {
    playerId: cpu.id,
    playerName: cpu.name,
    claimRank: claimedRank,
    count: cardIds.length,
    actualCards: chosenCards
  };
  room.pileCalls.push(pileCall);
  room.lastPlay = {
    playerId: cpu.id,
    playerName: cpu.name,
    claimRank: claimedRank,
    count: cardIds.length,
    actualCards: chosenCards,
    timestamp: Date.now()
  };
  broadcastRoomState(room);
  startReactionTimer(room);
}
function triggerCpuSuspicionCheck(room) {
  if (!room.lastPlay || !room.suspicionActive) return;
  const lastPlayer = room.players.find((p) => p.id === room.lastPlay.playerId);
  const claimRank = room.lastPlay.claimRank;
  const count = room.lastPlay.count;
  for (const player of room.players) {
    if (!player.isCpu || player.id === lastPlayer.id) continue;
    const sameRankInCpuHand = player.cards.filter((c) => c.rank === claimRank).length;
    const isMathematicallyImpossible = sameRankInCpuHand + count > 4;
    let suspectChance = 0.05;
    if (isMathematicallyImpossible) {
      suspectChance = 1;
    } else if (count === 3) {
      suspectChance = 0.25;
    } else if (count === 4) {
      suspectChance = 0.4;
    } else if (claimRank === "2" && count >= 1) {
      suspectChance = 0.35;
    }
    if (Math.random() < suspectChance) {
      const slapDelay = 800 + Math.random() * 1400;
      setTimeout(() => {
        if (room.lastPlay && room.lastPlay.playerId === lastPlayer.id && room.suspicionActive) {
          resolveSuspicion(room, player.id);
        }
      }, slapDelay);
      break;
    }
  }
}
function setupGame(room) {
  const deck = createDeck();
  room.deck = deck;
  room.pile = [];
  room.pileCalls = [];
  room.discardPileCount = 0;
  room.lastPlay = null;
  room.suspicionActive = false;
  room.suspicionResult = null;
  room.winnerId = null;
  room.status = "playing";
  for (const player of room.players) {
    player.cards = [];
    for (let i = 0; i < 5; i++) {
      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop());
      }
    }
    player.handSize = player.cards.length;
  }
  room.turnIndex = Math.floor(Math.random() * room.players.length);
  room.logs = [];
  addLog(room, "info", `\u{1F680} The game has started! First turn goes to ${room.players[room.turnIndex].name}. Good luck!`);
  broadcastRoomState(room);
  triggerCpuIfNeeded(room);
}
wss.on("connection", (ws) => {
  let currentPlayerId = null;
  let currentRoomCode = null;
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case "create_room": {
          const roomCode = generateRoomCode();
          const playerId = generateId();
          currentPlayerId = playerId;
          currentRoomCode = roomCode;
          const hostPlayer = {
            id: playerId,
            name: msg.name || "Host",
            isHost: true,
            isReady: true,
            isCpu: false,
            handSize: 0,
            cards: [],
            socket: ws
          };
          const room = {
            id: roomCode,
            players: [hostPlayer],
            status: "lobby",
            turnIndex: 0,
            deck: [],
            pile: [],
            pileCalls: [],
            discardPileCount: 0,
            lastPlay: null,
            suspicionActive: false,
            suspicionResult: null,
            reactionTimeLeft: 0,
            reactionTimerId: null,
            winnerId: null,
            logs: [],
            cpuActionTimerId: null,
            reconnectBuffer: 15
          };
          rooms.set(roomCode, room);
          addLog(room, "info", `\u{1F3E0} Room ${roomCode} created by ${hostPlayer.name}.`);
          ws.send(JSON.stringify({
            type: "create_room_success",
            roomCode,
            playerId
          }));
          broadcastRoomState(room);
          break;
        }
        case "join_room": {
          const roomCode = (msg.roomCode || "").toUpperCase();
          const room = rooms.get(roomCode);
          if (!room) {
            ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
            return;
          }
          if (room.status !== "lobby") {
            ws.send(JSON.stringify({ type: "error", message: "Game already in progress." }));
            return;
          }
          if (room.players.length >= 8) {
            ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
            return;
          }
          const playerId = generateId();
          currentPlayerId = playerId;
          currentRoomCode = roomCode;
          const newPlayer = {
            id: playerId,
            name: msg.name || `Player ${room.players.length + 1}`,
            isHost: false,
            isReady: false,
            isCpu: false,
            handSize: 0,
            cards: [],
            socket: ws
          };
          room.players.push(newPlayer);
          addLog(room, "info", `\u{1F44B} ${newPlayer.name} joined the room.`);
          ws.send(JSON.stringify({
            type: "join_room_success",
            roomCode,
            playerId
          }));
          broadcastRoomState(room);
          break;
        }
        case "add_cpu": {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== "lobby" || room.players.length >= 8) return;
          const cpuNames = ["Kalle \u{1F1EB}\u{1F1EE}", "Saku \u{1F1EB}\u{1F1EE}", "Emma \u{1F1FA}\u{1F1F8}", "John \u{1F1FA}\u{1F1F8}", "Matti \u{1F1EB}\u{1F1EE}", "Sarah \u{1F1FA}\u{1F1F8}"];
          const usedNames = room.players.map((p) => p.name);
          const availableNames = cpuNames.filter((n) => !usedNames.includes(n));
          const name = availableNames[Math.floor(Math.random() * availableNames.length)] || `CPU ${room.players.length + 1}`;
          const cpuPlayer = {
            id: generateId(),
            name,
            isHost: false,
            isReady: true,
            isCpu: true,
            handSize: 0,
            cards: [],
            socket: null
          };
          room.players.push(cpuPlayer);
          addLog(room, "info", `\u{1F916} AI player ${cpuPlayer.name} added to the lobby.`);
          broadcastRoomState(room);
          break;
        }
        case "remove_player": {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== "lobby") return;
          const targetPlayerId = msg.playerId;
          const index = room.players.findIndex((p) => p.id === targetPlayerId);
          if (index !== -1) {
            const removed = room.players[index];
            room.players.splice(index, 1);
            addLog(room, "info", `\u{1F6AA} ${removed.name} left the room.`);
            broadcastRoomState(room);
          }
          break;
        }
        case "start_game": {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== "lobby") return;
          const player = room.players.find((p) => p.id === currentPlayerId);
          if (!player || !player.isHost) {
            ws.send(JSON.stringify({ type: "error", message: "Only the host can start the game." }));
            return;
          }
          if (room.players.length < 2) {
            ws.send(JSON.stringify({ type: "error", message: "Need at least 2 players to start." }));
            return;
          }
          setupGame(room);
          break;
        }
        case "play_cards": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== "playing") return;
          let activePlayer = room.players[room.turnIndex];
          let isAuthorized = activePlayer.id === currentPlayerId;
          if (!isAuthorized && room.suspicionActive) {
            const nextIdx = getNextPlayerIndex(room);
            if (room.players[nextIdx]?.id === currentPlayerId) {
              isAuthorized = true;
              finalizePlay(room);
              activePlayer = room.players[room.turnIndex];
            }
          }
          if (!isAuthorized) {
            ws.send(JSON.stringify({ type: "error", message: "It's not your turn!" }));
            return;
          }
          if (activePlayer.id !== currentPlayerId) {
            ws.send(JSON.stringify({ type: "error", message: "The pile fell! The previous player gets another turn." }));
            return;
          }
          const { cardIds, claimRank } = msg;
          if (!cardIds || cardIds.length === 0 || !claimRank) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid turn choices." }));
            return;
          }
          const prevClaim = room.pileCalls.length > 0 ? room.pileCalls[room.pileCalls.length - 1].claimRank : null;
          if (!isValidClaim(claimRank, prevClaim)) {
            ws.send(JSON.stringify({ type: "error", message: `Invalid play! "${claimRank}" cannot be played on "${prevClaim}".` }));
            return;
          }
          const playedCards = activePlayer.cards.filter((c) => cardIds.includes(c.id));
          if (playedCards.length !== cardIds.length) {
            ws.send(JSON.stringify({ type: "error", message: "Card not found in hand." }));
            return;
          }
          if (room.suspicionActive) {
            finalizePlay(room);
            activePlayer = room.players[room.turnIndex];
          }
          activePlayer.cards = activePlayer.cards.filter((c) => !cardIds.includes(c.id));
          activePlayer.handSize = activePlayer.cards.length;
          room.pile.push(...playedCards);
          const pileCall = {
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            claimRank,
            count: cardIds.length,
            actualCards: playedCards
          };
          room.pileCalls.push(pileCall);
          room.lastPlay = {
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            claimRank,
            count: cardIds.length,
            actualCards: playedCards,
            timestamp: Date.now()
          };
          addLog(room, "play", `\u{1F0CF} ${activePlayer.name} played ${cardIds.length} card(s) claiming: "${claimRank}"`, activePlayer.name);
          broadcastRoomState(room);
          startReactionTimer(room);
          break;
        }
        case "slap_suspicion": {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== "playing" || !room.lastPlay || !room.suspicionActive) return;
          if (room.lastPlay.playerId === currentPlayerId) {
            ws.send(JSON.stringify({ type: "error", message: "You cannot cast suspicion on yourself!" }));
            return;
          }
          resolveSuspicion(room, currentPlayerId);
          break;
        }
        case "send_chat": {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;
          const player = room.players.find((p) => p.id === currentPlayerId);
          const name = player ? player.name : "Spectator";
          addLog(room, "chat", msg.message, name);
          broadcastRoomState(room);
          break;
        }
        case "restart_game": {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;
          const player = room.players.find((p) => p.id === currentPlayerId);
          if (player && player.isHost) {
            setupGame(room);
          }
          break;
        }
        case "reconnect_room": {
          const roomCode = (msg.roomCode || "").toUpperCase();
          const playerId = msg.playerId;
          const room = rooms.get(roomCode);
          if (!room) {
            ws.send(JSON.stringify({ type: "error", message: "Room not found or game session has expired." }));
            return;
          }
          const player = room.players.find((p) => p.id === playerId);
          if (!player) {
            ws.send(JSON.stringify({ type: "error", message: "Session expired or not found in this room." }));
            return;
          }
          if (player.disconnectTimerId) {
            clearTimeout(player.disconnectTimerId);
            player.disconnectTimerId = null;
          }
          player.socket = ws;
          player.isOffline = false;
          player.offlineRemaining = void 0;
          player.isCpu = false;
          currentPlayerId = playerId;
          currentRoomCode = roomCode;
          ws.send(JSON.stringify({
            type: "reconnect_success",
            roomCode,
            playerId
          }));
          addLog(room, "info", `\u26A1 ${player.name} reconnected successfully!`);
          broadcastRoomState(room);
          break;
        }
        case "update_settings": {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;
          const player = room.players.find((p) => p.id === currentPlayerId);
          if (player && player.isHost) {
            if (typeof msg.reconnectBuffer === "number") {
              room.reconnectBuffer = Math.max(5, Math.min(300, msg.reconnectBuffer));
              addLog(room, "info", `\u2699\uFE0F Reconnection grace period updated to ${room.reconnectBuffer} seconds.`);
              broadcastRoomState(room);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("WS Error:", err);
    }
  });
  ws.on("close", () => {
    if (currentRoomCode && currentPlayerId) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        const index = room.players.findIndex((p) => p.id === currentPlayerId);
        if (index !== -1) {
          const player = room.players[index];
          if (room.status === "lobby") {
            room.players.splice(index, 1);
            addLog(room, "info", `\u{1F6AA} ${player.name} disconnected.`);
            if (player.isHost && room.players.length > 0) {
              const nextHost = room.players.find((p) => !p.isCpu);
              if (nextHost) {
                nextHost.isHost = true;
                addLog(room, "info", `\u{1F451} ${nextHost.name} is now the host.`);
              }
            }
            broadcastRoomState(room);
          } else {
            player.socket = null;
            player.isOffline = true;
            player.offlineRemaining = room.reconnectBuffer;
            addLog(room, "info", `\u26A0\uFE0F ${player.name} disconnected. Reconnection grace period: ${player.offlineRemaining}s.`);
            if (player.disconnectTimerId) {
              clearTimeout(player.disconnectTimerId);
            }
            const tickRate = 1e3;
            const runCountdown = () => {
              const activeRoom = rooms.get(currentRoomCode);
              if (!activeRoom) return;
              const activePlayer = activeRoom.players.find((p) => p.id === player.id);
              if (!activePlayer || !activePlayer.isOffline) return;
              if (activePlayer.offlineRemaining && activePlayer.offlineRemaining > 1) {
                activePlayer.offlineRemaining -= 1;
                activePlayer.disconnectTimerId = setTimeout(runCountdown, tickRate);
                broadcastRoomState(activeRoom);
              } else {
                activePlayer.isOffline = false;
                activePlayer.offlineRemaining = void 0;
                activePlayer.isCpu = true;
                addLog(activeRoom, "info", `\u{1F916} Reconnection window expired. ${activePlayer.name} is now controlled by AI.`);
                const humanLeft = activeRoom.players.some((p) => !p.isCpu && p.socket !== null && !p.isOffline);
                if (!humanLeft) {
                  if (activeRoom.reactionTimerId) clearInterval(activeRoom.reactionTimerId);
                  if (activeRoom.cpuActionTimerId) clearTimeout(activeRoom.cpuActionTimerId);
                  rooms.delete(currentRoomCode);
                  return;
                }
                triggerCpuIfNeeded(activeRoom);
                broadcastRoomState(activeRoom);
              }
            };
            player.disconnectTimerId = setTimeout(runCountdown, tickRate);
            broadcastRoomState(room);
          }
        }
      }
    }
  });
});
server.on("upgrade", (request, socket, head) => {
  const url = request.url || "";
  const pathname = url.split("?")[0];
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map

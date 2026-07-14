import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Card, Player, LogMessage, PileCall, GameRoom } from './src/types';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = 3000;

// Card rank metadata
const RANK_VALUES: Record<string, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
};
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS: ('hearts' | 'diamonds' | 'clubs' | 'spades')[] = ['hearts', 'diamonds', 'clubs', 'spades'];

// In-memory Server Game State
interface ServerPlayer extends Player {
  cards: Card[];
  socket: WebSocket | null;
  disconnectTimerId?: NodeJS.Timeout | null;
}

interface ServerRoom {
  id: string; // Room Code
  players: ServerPlayer[];
  status: 'lobby' | 'playing' | 'gameover';
  turnIndex: number;
  deck: Card[];
  pile: Card[];
  pileCalls: PileCall[];
  discardPileCount: number;
  lastPlay: {
    playerId: string;
    playerName: string;
    claimRank: string;
    count: number;
    actualCards: Card[];
    timestamp: number;
  } | null;
  suspicionActive: boolean;
  suspicionResult: {
    accuser: string;
    accused: string;
    lied: boolean;
    actualCards: Card[];
    claimRank: string;
    pileCountBefore: number;
  } | null;
  reactionTimeLeft: number; // seconds
  reactionTimerId: NodeJS.Timeout | null;
  winnerId: string | null;
  logs: LogMessage[];
  cpuActionTimerId: NodeJS.Timeout | null;
  reconnectBuffer: number; // duration of disconnection buffer in seconds
}

const rooms = new Map<string, ServerRoom>();

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Generate 4-letter room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a shuffled 52-card deck
function createDeck(): Card[] {
  const deck: Card[] = [];
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
  // Fisher-Yates Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Add a log message to the room
function addLog(room: ServerRoom, type: LogMessage['type'], message: string, playerName?: string) {
  const log: LogMessage = {
    id: generateId(),
    timestamp: Date.now(),
    type,
    playerName,
    message
  };
  room.logs.push(log);
  // Keep last 150 logs
  if (room.logs.length > 150) {
    room.logs.shift();
  }
}

// Draw cards from drawing pile to keep hand size at 5
function drawCardsToMinimum(room: ServerRoom, player: ServerPlayer) {
  if (room.deck.length === 0) return;
  
  const currentCount = player.cards.length;
  if (currentCount < 5) {
    const needed = 5 - currentCount;
    const drawn: Card[] = [];
    for (let i = 0; i < needed; i++) {
      if (room.deck.length > 0) {
        const card = room.deck.pop()!;
        player.cards.push(card);
        drawn.push(card);
      }
    }
    player.handSize = player.cards.length;
    if (drawn.length > 0) {
      addLog(room, 'info', `${player.name} drew ${drawn.length} card(s) from the drawing pile.`, player.name);
    }
  }
}

// Broadcaster to sync room state with clients safely (preventing cheating)
function broadcastRoomState(room: ServerRoom) {
  for (const player of room.players) {
    if (player.isCpu || !player.socket) continue;

    // Filter sensitive cards data
    const clientPlayers: Player[] = room.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      isCpu: p.isCpu,
      handSize: p.cards.length,
      cards: p.id === player.id ? p.cards : undefined, // Only expose client's own cards
      isOffline: p.isOffline,
      offlineRemaining: p.offlineRemaining
    }));

    const clientState: GameRoom = {
      id: room.id,
      players: clientPlayers,
      status: room.status,
      turnIndex: room.turnIndex,
      deckCount: room.deck.length,
      pile: room.pile.map(() => ({ id: 'hidden', suit: 'hearts', rank: 'hidden', value: 0 })), // Hide pile details
      pileCalls: room.pileCalls,
      discardPileCount: room.discardPileCount,
      lastPlay: room.lastPlay ? {
        playerId: room.lastPlay.playerId,
        playerName: room.lastPlay.playerName,
        claimRank: room.lastPlay.claimRank,
        count: room.lastPlay.count,
        actualCards: room.lastPlay.actualCards.map(() => ({ id: 'hidden', suit: 'hearts', rank: 'hidden', value: 0 })), // Hide details during normal play
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
      type: 'room_state',
      state: clientState
    }));
  }
}

// Validate play ranks
function isValidClaim(claimRank: string, previousClaimRank: string | null): boolean {
  if (!previousClaimRank) return true; // Empty pile allows any claim
  
  // Rule: There is a special rule that you can play a 2 on top of anything!
  if (claimRank === '2') return true;

  const val = RANK_VALUES[claimRank];
  const prevVal = RANK_VALUES[previousClaimRank];
  
  // Rule: Play must be of equal or larger value (unless playing a 2, which is handled above)
  if (val < prevVal) return false;
  
  // Rule: You can only play a 2 on top of a 2 (if prev is 2, only another 2 is allowed)
  if (prevVal === 15 && val !== 15) return false;
  
  // Rule: Jacks or higher (J, Q, K, A) can only be played on at least a 7
  if (val >= 11 && prevVal < 7) {
    return false;
  }
  
  return true;
}

// Check if the pile falls
function checkPileFalls(room: ServerRoom): boolean {
  if (room.pileCalls.length === 0) return false;
  
  const latestCall = room.pileCalls[room.pileCalls.length - 1];
  
  // 1. Calling out a 10 immediately falls the pile
  if (latestCall.claimRank === '10') {
    return true;
  }
  
  // 2. Calling out an Ace immediately falls the pile
  if (latestCall.claimRank === 'A') {
    return true;
  }
  
  // 3. 4 cards of the same value called consecutively on top of one another
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
      break; // consecutive chain broken
    }
  }
  
  return false;
}

// Move turn to the next player (clockwise)
function nextTurn(room: ServerRoom) {
  // Find next active player (players with cards, or players who can still draw)
  // Wait, if drawing pile is empty, a player with 0 cards has won, and doesn't participate anymore.
  let attempts = 0;
  const originalIndex = room.turnIndex;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    attempts++;
  } while (
    room.players[room.turnIndex].cards.length === 0 && 
    room.deck.length === 0 && 
    attempts < room.players.length
  );

  // If we couldn't find anyone, or game is over, check winner
  checkWinner(room);
}

// Calculate the next player index without mutating state
function getNextPlayerIndex(room: ServerRoom): number {
  let idx = room.turnIndex;
  let attempts = 0;
  do {
    idx = (idx + 1) % room.players.length;
    attempts++;
  } while (
    room.players[idx].cards.length === 0 && 
    room.deck.length === 0 && 
    attempts < room.players.length
  );
  return idx;
}

// Check if anyone has won
function checkWinner(room: ServerRoom) {
  if (room.status !== 'playing') return;

  // Rule: After DRAWING PILE runs out, player who runs out of cards first wins.
  if (room.deck.length === 0) {
    const activePlayers = room.players.filter(p => p.cards.length > 0);
    const finishedPlayers = room.players.filter(p => p.cards.length === 0);
    
    if (finishedPlayers.length > 0) {
      // Find the first player who finished
      const winner = finishedPlayers[0];
      room.winnerId = winner.id;
      room.status = 'gameover';
      addLog(room, 'win', `👑 GAME OVER! ${winner.name} has run out of cards and wins the game! 🎉`, winner.name);
      return;
    }
  }
}

// Resolve suspicion
function resolveSuspicion(room: ServerRoom, accuserPlayerId: string) {
  if (!room.lastPlay || !room.suspicionActive) return;

  // Clear timers
  if (room.reactionTimerId) {
    clearInterval(room.reactionTimerId);
    room.reactionTimerId = null;
  }
  if (room.cpuActionTimerId) {
    clearTimeout(room.cpuActionTimerId);
    room.cpuActionTimerId = null;
  }

  room.suspicionActive = false;
  const accuser = room.players.find(p => p.id === accuserPlayerId)!;
  const accused = room.players.find(p => p.id === room.lastPlay!.playerId)!;
  const { claimRank, actualCards } = room.lastPlay;

  // Check if player lied
  const lied = actualCards.some(card => card.rank !== claimRank);
  const pileCountBefore = room.pile.length;

  if (lied) {
    // Liar takes all cards from the pile
    accused.cards.push(...room.pile);
    accused.handSize = accused.cards.length;
    
    room.pile = [];
    room.pileCalls = [];
    room.lastPlay = null;

    addLog(room, 'suspicion', `❌ BUSTED! ${accused.name} lied about playing ${claimRank}s! They take all ${pileCountBefore} cards in the pile!`, accused.name);
    
    // Turn goes to the next person (clockwise from accused)
    nextTurn(room);
  } else {
    // Truth teller is safe, accuser takes all cards from the pile
    accuser.cards.push(...room.pile);
    accuser.handSize = accuser.cards.length;

    room.pile = [];
    room.pileCalls = [];
    room.lastPlay = null;

    addLog(room, 'suspicion', `✅ TRUTH! ${accused.name} was telling the truth! ${accuser.name} takes all ${pileCountBefore} cards in the pile!`, accused.name);

    // Turn stays on the same person (accused)
    // Truth teller draws cards to minimum 5
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

  // Broadcast resolved state
  broadcastRoomState(room);

  // Set a brief pause so players can digest the result, then continue (4 seconds)
  setTimeout(() => {
    dismissSuspicionResult(room);
  }, 4000);
}

// Dismiss suspicion overlay and resume play
function dismissSuspicionResult(room: ServerRoom) {
  if (!room.suspicionResult) return;
  room.suspicionResult = null;
  
  // Trigger next step
  checkWinner(room);
  broadcastRoomState(room);
  triggerCpuIfNeeded(room);
}

// Finalize a safe play (suspicion window closed without susp)
function finalizePlay(room: ServerRoom) {
  if (!room.lastPlay) return;

  // Clear timers
  if (room.reactionTimerId) {
    clearInterval(room.reactionTimerId);
    room.reactionTimerId = null;
  }

  room.suspicionActive = false;
  const lastPlayer = room.players.find(p => p.id === room.lastPlay!.playerId)!;

  // Let's check if the pile falls
  const falls = checkPileFalls(room);

  if (falls) {
    // Pile falls!
    const pileCount = room.pile.length;
    room.discardPileCount += pileCount;
    room.pile = [];
    room.pileCalls = [];
    room.lastPlay = null;

    addLog(room, 'fall', `💥 BOOM! The pile falls and is cleared! ${lastPlayer.name} gets another turn!`, lastPlayer.name);

    // Last player draws cards up to 5 and starts another turn (same turnIndex)
    drawCardsToMinimum(room, lastPlayer);
  } else {
    // Normal pass of turn
    // Draw cards for the player who just played
    drawCardsToMinimum(room, lastPlayer);

    // Move turn to the next person
    nextTurn(room);
  }

  room.lastPlay = null;
  broadcastRoomState(room);

  // Trigger CPU if active
  triggerCpuIfNeeded(room);
}

// Start reaction timer for a play
function startReactionTimer(room: ServerRoom) {
  if (room.reactionTimerId) {
    clearInterval(room.reactionTimerId);
  }

  room.reactionTimeLeft = 5; // 5 seconds window
  room.suspicionActive = true;

  room.reactionTimerId = setInterval(() => {
    room.reactionTimeLeft -= 1;
    if (room.reactionTimeLeft <= 0) {
      clearInterval(room.reactionTimerId!);
      room.reactionTimerId = null;
      finalizePlay(room);
    } else {
      broadcastRoomState(room);
      // Trigger CPU suspicion check if reaction time tick
      triggerCpuSuspicionCheck(room);
    }
  }, 1000);
}

// Trigger CPU play when it is a CPU player's turn
function triggerCpuIfNeeded(room: ServerRoom) {
  if (room.status !== 'playing' || room.suspicionActive || room.suspicionResult) return;

  const activePlayer = room.players[room.turnIndex];
  if (!activePlayer.isCpu) return;

  if (room.cpuActionTimerId) {
    clearTimeout(room.cpuActionTimerId);
  }

  // CPU takes 2.5 seconds to decide
  room.cpuActionTimerId = setTimeout(() => {
    executeCpuTurn(room, activePlayer);
  }, 2500);
}

// Execute turn for a CPU player
function executeCpuTurn(room: ServerRoom, cpu: ServerPlayer) {
  if (room.status !== 'playing' || room.suspicionActive || room.suspicionResult) return;

  const prevClaim = room.pileCalls.length > 0 ? room.pileCalls[room.pileCalls.length - 1].claimRank : null;

  // Let's decide which cards to play and what to claim
  let chosenCards: Card[] = [];
  let claimedRank = '';

  // Sort hand to make rational choices
  const sortedHand = [...cpu.cards].sort((a, b) => a.value - b.value);

  // Helper: Find legal claims based on previous play
  const legalRanks = RANKS.filter(r => isValidClaim(r, prevClaim));

  if (legalRanks.length === 0) {
    // Rule state: "If a player cannot play anything legally, they must lie"
    // Since 2 on top of 2 is the only legal play on 2, if cpu has no 2 they must lie and say 2
    claimedRank = prevClaim || '3';
  } else {
    // Choose a target rank.
    // Preferably, truthful play if possible.
    const truthfulOptions = sortedHand.filter(c => isValidClaim(c.rank, prevClaim));
    
    // 70% chance of playing truthfully if has options, otherwise lie
    if (truthfulOptions.length > 0 && Math.random() < 0.75) {
      // Find a rank that matches
      // Group cards by rank
      const groups: Record<string, Card[]> = {};
      for (const card of truthfulOptions) {
        groups[card.rank] = groups[card.rank] || [];
        groups[card.rank].push(card);
      }
      
      // Choose the group with the most cards or lowest value
      const chosenRank = Object.keys(groups).sort((a, b) => RANK_VALUES[a] - RANK_VALUES[b])[0];
      chosenCards = groups[chosenRank];
      claimedRank = chosenRank;
    } else {
      // Lying time!
      // Pick a random legal rank to claim
      // Prefer lower legal ranks or higher ones depending on hand
      claimedRank = legalRanks[0]; // standard next rank
      if (Math.random() < 0.3 && legalRanks.includes('10')) claimedRank = '10'; // try to fall the pile
      if (Math.random() < 0.2 && legalRanks.includes('A')) claimedRank = 'A'; // try to fall the pile
      
      // Choose 1-2 cards to lie with (usually low value cards)
      const numCards = Math.min(sortedHand.length, Math.floor(Math.random() * 2) + 1);
      chosenCards = sortedHand.slice(0, numCards);
    }
  }

  // Fallback: if no chosen cards yet, take 1 from hand
  if (chosenCards.length === 0 && sortedHand.length > 0) {
    chosenCards = [sortedHand[0]];
    if (!claimedRank) {
      claimedRank = legalRanks[0] || prevClaim || '3';
    }
  }

  if (chosenCards.length === 0) {
    // No cards to play? Should not happen if draw works
    nextTurn(room);
    broadcastRoomState(room);
    return;
  }

  // Play the cards
  const cardIds = chosenCards.map(c => c.id);
  
  // Log play
  addLog(room, 'play', `🃏 ${cpu.name} played ${cardIds.length} card(s) claiming to be: "${claimedRank}"`, cpu.name);

  // Apply play
  cpu.cards = cpu.cards.filter(c => !cardIds.includes(c.id));
  cpu.handSize = cpu.cards.length;

  room.pile.push(...chosenCards);
  
  const pileCall: PileCall = {
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

// CPU players can suspect when a human or other CPU makes a play
function triggerCpuSuspicionCheck(room: ServerRoom) {
  if (!room.lastPlay || !room.suspicionActive) return;

  const lastPlayer = room.players.find(p => p.id === room.lastPlay!.playerId)!;
  const claimRank = room.lastPlay.claimRank;
  const count = room.lastPlay.count;

  // Each CPU decides if they want to suspect
  for (const player of room.players) {
    if (!player.isCpu || player.id === lastPlayer.id) continue;

    // CPU hand knowledge check:
    // If CPU has enough cards of this rank to make the play mathematically impossible, they suspect 100%
    const sameRankInCpuHand = player.cards.filter(c => c.rank === claimRank).length;
    const isMathematicallyImpossible = (sameRankInCpuHand + count) > 4;

    let suspectChance = 0.05; // Base 5% random bluff call

    if (isMathematicallyImpossible) {
      suspectChance = 1.0; // 100% sure they are lying!
    } else if (count === 3) {
      suspectChance = 0.25; // Suspicious of 3 of a kind
    } else if (count === 4) {
      suspectChance = 0.40; // Extremely suspicious of 4 of a kind
    } else if (claimRank === '2' && count >= 1) {
      suspectChance = 0.35; // People love lying about playing 2s
    }

    // Adjust chance based on CPU mood or random variance
    if (Math.random() < suspectChance) {
      // Slap suspicion! Delay the slap slightly (between 0.8 and 2.2 seconds) to feel human
      const slapDelay = 800 + Math.random() * 1400;
      setTimeout(() => {
        // Confirm condition still holds
        if (room.lastPlay && room.lastPlay.playerId === lastPlayer.id && room.suspicionActive) {
          resolveSuspicion(room, player.id);
        }
      }, slapDelay);
      break; // Only one CPU slaps at a time
    }
  }
}

// Setup a new game
function setupGame(room: ServerRoom) {
  const deck = createDeck();
  room.deck = deck;
  room.pile = [];
  room.pileCalls = [];
  room.discardPileCount = 0;
  room.lastPlay = null;
  room.suspicionActive = false;
  room.suspicionResult = null;
  room.winnerId = null;
  room.status = 'playing';

  // Deal 5 cards to everyone
  for (const player of room.players) {
    player.cards = [];
    for (let i = 0; i < 5; i++) {
      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop()!);
      }
    }
    player.handSize = player.cards.length;
  }

  // Random starting player index
  room.turnIndex = Math.floor(Math.random() * room.players.length);
  
  room.logs = [];
  addLog(room, 'info', `🚀 The game has started! First turn goes to ${room.players[room.turnIndex].name}. Good luck!`);

  broadcastRoomState(room);

  // Trigger CPU if starting player is CPU
  triggerCpuIfNeeded(room);
}

// WebSocket Connection Handlers
wss.on('connection', (ws: WebSocket) => {
  let currentPlayerId: string | null = null;
  let currentRoomCode: string | null = null;

  ws.on('message', (data: any) => {
    try {
      const msg = JSON.parse(data.toString());
      
      switch (msg.type) {
        case 'create_room': {
          const roomCode = generateRoomCode();
          const playerId = generateId();
          currentPlayerId = playerId;
          currentRoomCode = roomCode;

          const hostPlayer: ServerPlayer = {
            id: playerId,
            name: msg.name || 'Host',
            isHost: true,
            isReady: true,
            isCpu: false,
            handSize: 0,
            cards: [],
            socket: ws
          };

          const room: ServerRoom = {
            id: roomCode,
            players: [hostPlayer],
            status: 'lobby',
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
          addLog(room, 'info', `🏠 Room ${roomCode} created by ${hostPlayer.name}.`);

          ws.send(JSON.stringify({
            type: 'create_room_success',
            roomCode,
            playerId
          }));

          broadcastRoomState(room);
          break;
        }

        case 'join_room': {
          const roomCode = (msg.roomCode || '').toUpperCase();
          const room = rooms.get(roomCode);

          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
            return;
          }

          if (room.status !== 'lobby') {
            ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress.' }));
            return;
          }

          if (room.players.length >= 8) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full.' }));
            return;
          }

          const playerId = generateId();
          currentPlayerId = playerId;
          currentRoomCode = roomCode;

          const newPlayer: ServerPlayer = {
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
          addLog(room, 'info', `👋 ${newPlayer.name} joined the room.`);

          ws.send(JSON.stringify({
            type: 'join_room_success',
            roomCode,
            playerId
          }));

          broadcastRoomState(room);
          break;
        }

        case 'add_cpu': {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== 'lobby' || room.players.length >= 8) return;

          const cpuNames = ['Kalle 🇫🇮', 'Saku 🇫🇮', 'Emma 🇺🇸', 'John 🇺🇸', 'Matti 🇫🇮', 'Sarah 🇺🇸'];
          const usedNames = room.players.map(p => p.name);
          const availableNames = cpuNames.filter(n => !usedNames.includes(n));
          const name = availableNames[Math.floor(Math.random() * availableNames.length)] || `CPU ${room.players.length + 1}`;

          const cpuPlayer: ServerPlayer = {
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
          addLog(room, 'info', `🤖 AI player ${cpuPlayer.name} added to the lobby.`);
          broadcastRoomState(room);
          break;
        }

        case 'remove_player': {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== 'lobby') return;

          const targetPlayerId = msg.playerId;
          const index = room.players.findIndex(p => p.id === targetPlayerId);
          if (index !== -1) {
            const removed = room.players[index];
            room.players.splice(index, 1);
            addLog(room, 'info', `🚪 ${removed.name} left the room.`);
            broadcastRoomState(room);
          }
          break;
        }

        case 'start_game': {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== 'lobby') return;

          // Check if host is starting
          const player = room.players.find(p => p.id === currentPlayerId);
          if (!player || !player.isHost) {
            ws.send(JSON.stringify({ type: 'error', message: 'Only the host can start the game.' }));
            return;
          }

          if (room.players.length < 2) {
            ws.send(JSON.stringify({ type: 'error', message: 'Need at least 2 players to start.' }));
            return;
          }

          setupGame(room);
          break;
        }

        case 'play_cards': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== 'playing') return;

          // Check if it is this player's turn or if they are the next player locking in
          let activePlayer = room.players[room.turnIndex];
          let isAuthorized = activePlayer.id === currentPlayerId;

          if (!isAuthorized && room.suspicionActive) {
            const nextIdx = getNextPlayerIndex(room);
            if (room.players[nextIdx]?.id === currentPlayerId) {
              isAuthorized = true;
              // Player next in line plays, which instantly finalizes the previous play
              finalizePlay(room);
              // Now refresh the active player reference as the turnIndex may have advanced to them
              activePlayer = room.players[room.turnIndex];
            }
          }

          if (!isAuthorized) {
            ws.send(JSON.stringify({ type: 'error', message: "It's not your turn!" }));
            return;
          }

          // If turn remained on someone else (e.g., because the previous play fell the pile), check again
          if (activePlayer.id !== currentPlayerId) {
            ws.send(JSON.stringify({ type: 'error', message: "The pile fell! The previous player gets another turn." }));
            return;
          }

          const { cardIds, claimRank } = msg;
          if (!cardIds || cardIds.length === 0 || !claimRank) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid turn choices.' }));
            return;
          }

          // Check rank validity
          const prevClaim = room.pileCalls.length > 0 ? room.pileCalls[room.pileCalls.length - 1].claimRank : null;
          if (!isValidClaim(claimRank, prevClaim)) {
            ws.send(JSON.stringify({ type: 'error', message: `Invalid play! "${claimRank}" cannot be played on "${prevClaim}".` }));
            return;
          }

          // Extract cards played
          const playedCards = activePlayer.cards.filter(c => cardIds.includes(c.id));
          if (playedCards.length !== cardIds.length) {
            ws.send(JSON.stringify({ type: 'error', message: 'Card not found in hand.' }));
            return;
          }

          // If there was an active suspicion reaction timer running, that means the previous player's turn was just auto-locked in
          if (room.suspicionActive) {
            finalizePlay(room);
            activePlayer = room.players[room.turnIndex];
          }

          // Apply current play
          activePlayer.cards = activePlayer.cards.filter(c => !cardIds.includes(c.id));
          activePlayer.handSize = activePlayer.cards.length;

          room.pile.push(...playedCards);

          const pileCall: PileCall = {
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

          addLog(room, 'play', `🃏 ${activePlayer.name} played ${cardIds.length} card(s) claiming: "${claimRank}"`, activePlayer.name);

          // Broadcast state and start the suspicion reaction window
          broadcastRoomState(room);
          startReactionTimer(room);
          break;
        }

        case 'slap_suspicion': {
          if (!currentRoomCode || !currentPlayerId) return;
          const room = rooms.get(currentRoomCode);
          if (!room || room.status !== 'playing' || !room.lastPlay || !room.suspicionActive) return;

          // Prevent accusing yourself!
          if (room.lastPlay.playerId === currentPlayerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'You cannot cast suspicion on yourself!' }));
            return;
          }

          resolveSuspicion(room, currentPlayerId);
          break;
        }

        case 'send_chat': {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          const player = room.players.find(p => p.id === currentPlayerId);
          const name = player ? player.name : 'Spectator';

          addLog(room, 'chat', msg.message, name);
          broadcastRoomState(room);
          break;
        }

        case 'restart_game': {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          const player = room.players.find(p => p.id === currentPlayerId);
          if (player && player.isHost) {
            setupGame(room);
          }
          break;
        }

        case 'reconnect_room': {
          const roomCode = (msg.roomCode || '').toUpperCase();
          const playerId = msg.playerId;
          const room = rooms.get(roomCode);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found or game session has expired.' }));
            return;
          }

          const player = room.players.find(p => p.id === playerId);
          if (!player) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session expired or not found in this room.' }));
            return;
          }

          // Stop disconnection timer if running
          if (player.disconnectTimerId) {
            clearTimeout(player.disconnectTimerId);
            player.disconnectTimerId = null;
          }

          player.socket = ws;
          player.isOffline = false;
          player.offlineRemaining = undefined;
          player.isCpu = false; // Turn back into human player if they were made CPU!

          // Re-bind current socket identifiers
          currentPlayerId = playerId;
          currentRoomCode = roomCode;

          ws.send(JSON.stringify({
            type: 'reconnect_success',
            roomCode,
            playerId
          }));

          addLog(room, 'info', `⚡ ${player.name} reconnected successfully!`);
          broadcastRoomState(room);
          break;
        }

        case 'update_settings': {
          if (!currentRoomCode) return;
          const room = rooms.get(currentRoomCode);
          if (!room) return;

          const player = room.players.find(p => p.id === currentPlayerId);
          if (player && player.isHost) {
            if (typeof msg.reconnectBuffer === 'number') {
              room.reconnectBuffer = Math.max(5, Math.min(300, msg.reconnectBuffer));
              addLog(room, 'info', `⚙️ Reconnection grace period updated to ${room.reconnectBuffer} seconds.`);
              broadcastRoomState(room);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error('WS Error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoomCode && currentPlayerId) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        const index = room.players.findIndex(p => p.id === currentPlayerId);
        if (index !== -1) {
          const player = room.players[index];
          if (room.status === 'lobby') {
            room.players.splice(index, 1);
            addLog(room, 'info', `🚪 ${player.name} disconnected.`);
            
            // Re-assign host if needed
            if (player.isHost && room.players.length > 0) {
              const nextHost = room.players.find(p => !p.isCpu);
              if (nextHost) {
                nextHost.isHost = true;
                addLog(room, 'info', `👑 ${nextHost.name} is now the host.`);
              }
            }
            broadcastRoomState(room);
          } else {
            // During play: mark as offline and start buffer countdown!
            player.socket = null;
            player.isOffline = true;
            player.offlineRemaining = room.reconnectBuffer;
            addLog(room, 'info', `⚠️ ${player.name} disconnected. Reconnection grace period: ${player.offlineRemaining}s.`);
            
            // Clear any existing disconnect timer for this player
            if (player.disconnectTimerId) {
              clearTimeout(player.disconnectTimerId);
            }
            
            const tickRate = 1000;
            const runCountdown = () => {
              // Ensure we check if the room still exists
              const activeRoom = rooms.get(currentRoomCode);
              if (!activeRoom) return;
              
              // Find player within active room to ensure they didn't completely leave
              const activePlayer = activeRoom.players.find(p => p.id === player.id);
              if (!activePlayer || !activePlayer.isOffline) return; // already reconnected or removed
              
              if (activePlayer.offlineRemaining && activePlayer.offlineRemaining > 1) {
                activePlayer.offlineRemaining -= 1;
                activePlayer.disconnectTimerId = setTimeout(runCountdown, tickRate);
                broadcastRoomState(activeRoom);
              } else {
                // Buffer expired! Turn into CPU bot
                activePlayer.isOffline = false;
                activePlayer.offlineRemaining = undefined;
                activePlayer.isCpu = true;
                addLog(activeRoom, 'info', `🤖 Reconnection window expired. ${activePlayer.name} is now controlled by AI.`);
                
                // If all human players left, delete room
                const humanLeft = activeRoom.players.some(p => !p.isCpu && p.socket !== null && !p.isOffline);
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

// Upgrade server to WebSocket connections
server.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  const pathname = url.split('?')[0];
  
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

// Configure Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

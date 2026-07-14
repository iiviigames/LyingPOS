export interface Card {
  id: string;
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string; // '3', '4', ..., '10', 'J', 'Q', 'K', 'A', '2'
  value: number; // 3 to 15
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  isCpu: boolean;
  handSize: number;
  cards?: Card[]; // Only sent to the owner of the cards
  isOffline?: boolean;
  offlineRemaining?: number; // seconds left to reconnect
}

export interface LogMessage {
  id: string;
  timestamp: number;
  type: 'info' | 'play' | 'suspicion' | 'fall' | 'win' | 'chat';
  playerName?: string;
  message: string;
}

export interface PileCall {
  playerId: string;
  playerName: string;
  claimRank: string;
  count: number;
  actualCards: Card[];
}

export interface GameRoom {
  id: string; // Room Code (e.g. "ABCD")
  players: Player[];
  status: 'lobby' | 'playing' | 'gameover';
  turnIndex: number;
  deckCount: number;
  pile: Card[]; // Face down cards currently in play
  pileCalls: PileCall[]; // History of claims in the current pile
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
  reactionTimeLeft: number; // in seconds for the reaction timer
  winnerId: string | null;
  logs: LogMessage[];
  reconnectBuffer?: number; // setting for disconnect grace period
}

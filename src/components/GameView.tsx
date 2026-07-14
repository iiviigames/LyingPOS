import React, { useState, useEffect, useRef } from 'react';
import { Card, Player, LogMessage, GameRoom } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { sound } from './SoundManager';
import { 
  Send, Users, BookOpen, Volume2, VolumeX, LogOut, RotateCcw, 
  MessageSquare, ChevronLeft, ChevronRight, Zap, Bot, Eye, 
  Sliders, FileText, HelpCircle
} from 'lucide-react';

interface GameViewProps {
  room: GameRoom;
  playerId: string;
  onPlayCards: (cardIds: string[], claimRank: string) => void;
  onSlapSuspicion: () => void;
  onSendChat: (msg: string) => void;
  onRestartGame: () => void;
  onLeaveRoom: () => void;
  onUpdateSettings: (settings: { reconnectBuffer: number }) => void;
}

const RANK_VALUES: Record<string, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
};
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export const GameView: React.FC<GameViewProps> = ({
  room,
  playerId,
  onPlayCards,
  onSlapSuspicion,
  onSendChat,
  onRestartGame,
  onLeaveRoom,
  onUpdateSettings
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [claimRank, setClaimRank] = useState<string>('3');
  const [chatMessage, setChatMessage] = useState<string>('');
  const [muted, setMuted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'rules'>('logs');

  // QOL Card Reorganization and Drag-and-Drop state
  const [localCardOrder, setLocalCardOrder] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // New Collapsible/Tabbed Control Center (Match, Rulebook, Sound settings)
  const [controlDeckTab, setControlDeckTab] = useState<'match' | 'rules' | 'settings' | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const me = room.players.find(p => p.id === playerId);
  const isMyTurn = room.players[room.turnIndex]?.id === playerId;
  const lastPlay = room.lastPlay;
  const prevClaim = room.pileCalls.length > 0 ? room.pileCalls[room.pileCalls.length - 1].claimRank : null;

  // Sync local card order when server hand changes
  useEffect(() => {
    if (!me?.cards) return;
    const cardIds = me.cards.map(c => c.id);
    setLocalCardOrder(prev => {
      // Keep existing sorted cards in position, filter out discarded ones
      const filteredPrev = prev.filter(id => cardIds.includes(id));
      // Add any new cards drawn to the end of the hand
      const newIds = cardIds.filter(id => !filteredPrev.includes(id));
      return [...filteredPrev, ...newIds];
    });
  }, [me?.cards]);

  // Drag and Drop reordering handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    
    const reordered = [...localCardOrder];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(index, 0, removed);
    setLocalCardOrder(reordered);
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Mobile reordering shift buttons
  const shiftCard = (cardId: string, direction: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting/unselecting card when tapping shift arrows
    const index = localCardOrder.indexOf(cardId);
    if (index === -1) return;
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localCardOrder.length) return;
    
    const reordered = [...localCardOrder];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, removed);
    setLocalCardOrder(reordered);
  };

  // Sort me.cards by localCardOrder for beautiful custom rendering
  const sortedMyCards = me?.cards
    ? [...me.cards].sort((a, b) => {
        const idxA = localCardOrder.indexOf(a.id);
        const idxB = localCardOrder.indexOf(b.id);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      })
    : [];

  // Find next player index
  const getNextPlayerIndex = () => {
    let index = room.turnIndex;
    let attempts = 0;
    do {
      index = (index + 1) % room.players.length;
      attempts++;
    } while (
      room.players[index]?.handSize === 0 &&
      room.deckCount === 0 &&
      attempts < room.players.length
    );
    return index;
  };

  const nextPlayerIdx = getNextPlayerIndex();
  const isNextPlayer = room.players[nextPlayerIdx]?.id === playerId;
  const canIPlay = isMyTurn || (room.suspicionActive && isNextPlayer);

  // Sound effects on updates
  useEffect(() => {
    // Detect play events from logs
    if (room.logs.length > 0 && !muted) {
      const latestLog = room.logs[room.logs.length - 1];
      if (latestLog.type === 'play') {
        sound.playCard();
      } else if (latestLog.type === 'suspicion') {
        sound.playSlap();
        setTimeout(() => {
          if (latestLog.message.includes('BUSTED')) {
            sound.playBusted();
          } else {
            sound.playWin();
          }
        }, 150);
      } else if (latestLog.type === 'info' && latestLog.message.includes('drew')) {
        sound.playDraw();
      } else if (latestLog.type === 'info' && latestLog.message.includes('started')) {
        sound.playShuffle();
      } else if (latestLog.type === 'win') {
        sound.playWin();
      }
    }
  }, [room.logs.length, muted]);

  // Scroll chat/logs to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.logs.length, activeTab]);

  // Handle card selection
  const toggleCard = (cardId: string) => {
    if (!canIPlay) return;
    if (!muted) {
      sound.playTick();
    }
    if (selectedCardIds.includes(cardId)) {
      setSelectedCardIds(selectedCardIds.filter(id => id !== cardId));
    } else {
      setSelectedCardIds([...selectedCardIds, cardId]);
    }
  };

  // Get only legal ranks to CLAIM to prevent illegal plays and guide bluffs
  const getLegalClaimRanks = (): string[] => {
    if (!prevClaim) return RANKS;

    return RANKS.filter(r => {
      // Special Rule: 2 can be played on top of anything
      if (r === '2') return true;

      const val = RANK_VALUES[r];
      const prevVal = RANK_VALUES[prevClaim];

      // Play must be same or larger value
      if (val < prevVal) return false;
      // You can only play a 2 on top of a 2 (if prev is 2, only another 2 is allowed)
      if (prevVal === 15 && val !== 15) return false;
      // Jacks or higher (J, Q, K, A) can only be played on >= 7
      if (val >= 11 && prevVal < 7) return false;
      return true;
    });
  };

  const legalClaims = getLegalClaimRanks();

  // Reset claimRank when legal list changes and current rank is no longer legal
  useEffect(() => {
    if (legalClaims.length > 0 && !legalClaims.includes(claimRank)) {
      setClaimRank(legalClaims[0]);
    }
  }, [prevClaim]);

  // Handle playing cards
  const handlePlaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCardIds.length === 0) return;
    onPlayCards(selectedCardIds, claimRank);
    setSelectedCardIds([]);
  };

  // Handle sending chat message
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    onSendChat(chatMessage.trim());
    setChatMessage('');
  };

  // Suit visual helpers
  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return '';
    }
  };

  const getSuitColor = (suit: string) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-zinc-950';
  };

  return (
    <div id="game-arena-container" className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-2 w-full max-w-7xl mx-auto">
      
      {/* LEFT/MIDDLE COLUMN (THE GAME TABLE & HAND) */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        
        {/* TOP STATUS BAR */}
        <div className="bg-[#111] border-l-4 border-red-600 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-black uppercase tracking-widest bg-white/5 border border-white/20 px-3 py-1 text-white">
              ROOM: {room.id}
            </span>
            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest hidden md:flex items-center gap-3">
              <span className="flex items-center gap-1">Draw Pile: <strong className="text-yellow-400 font-mono">{room.deckCount}</strong></span>
              <span className="text-zinc-700">|</span>
              <span className="flex items-center gap-1">Discarded: <strong className="text-white font-mono">{room.discardPileCount}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMuted(!muted)}
              className="p-2 bg-[#0a0a0a] border border-white/10 text-zinc-400 hover:text-white transition-colors"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {me?.isHost && (
              <button
                onClick={onRestartGame}
                className="p-2 bg-[#0a0a0a] border border-white/10 text-zinc-400 hover:text-red-500 transition-colors"
                title="Restart Game"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onLeaveRoom}
              className="p-2 bg-red-600 text-white font-black uppercase text-[10px] tracking-wider transition-colors flex items-center gap-1 px-3 skew-x-[-6deg]"
              title="Leave Room"
            >
              <LogOut className="w-3.5 h-3.5" /> <span>Leave</span>
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE CONTROL DECK & NAVIGATION MENU */}
        <div className="bg-[#111] border border-white/5 p-4 flex flex-col gap-3 shadow-md">
          {/* Tabs row */}
          <div className="flex items-center gap-2 border-b border-white/5 pb-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setControlDeckTab(controlDeckTab === 'match' ? null : 'match')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider skew-x-[-6deg] transition-all flex items-center gap-1.5 ${
                controlDeckTab === 'match'
                  ? 'bg-red-600 text-white'
                  : 'bg-[#151515] text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" /> Match Panel
            </button>
            <button
              onClick={() => setControlDeckTab(controlDeckTab === 'rules' ? null : 'rules')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider skew-x-[-6deg] transition-all flex items-center gap-1.5 ${
                controlDeckTab === 'rules'
                  ? 'bg-red-600 text-white'
                  : 'bg-[#151515] text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Live Rules
            </button>
            <button
              onClick={() => setControlDeckTab(controlDeckTab === 'settings' ? null : 'settings')}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider skew-x-[-6deg] transition-all flex items-center gap-1.5 ${
                controlDeckTab === 'settings'
                  ? 'bg-red-600 text-white'
                  : 'bg-[#151515] text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" /> Sound Deck
            </button>
          </div>

          {/* Active Tab Content Panel */}
          <AnimatePresence>
            {controlDeckTab && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden bg-[#0c0c0c] border border-white/5 p-4 font-mono text-xs text-zinc-400 leading-relaxed"
              >
                {controlDeckTab === 'match' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111] p-3 border border-white/5">
                      <div>
                        <p className="text-white font-black text-xs uppercase tracking-wider">Restart Active Match</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Resets the score, shuffles the deck, and starts a fresh game immediately.</p>
                      </div>
                      {me?.isHost ? (
                        <button
                          onClick={() => {
                            if (!muted) sound.playShuffle();
                            onRestartGame();
                            setControlDeckTab(null);
                          }}
                          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase text-[10px] tracking-wider skew-x-[-6deg] flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                        >
                          <RotateCcw className="w-3.5 h-3.5 stroke-[3px]" /> Restart Match
                        </button>
                      ) : (
                        <span className="text-[9px] bg-white/5 text-zinc-500 font-bold px-2 py-1 uppercase tracking-widest border border-white/5 self-start sm:self-auto">
                          Waiting for Host to Restart
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-[#111] p-2.5 border border-white/5">
                        <span className="text-[8px] text-zinc-600 uppercase tracking-widest block font-bold">Room Code</span>
                        <span className="text-white font-black uppercase tracking-wider text-sm">{room.id}</span>
                      </div>
                      <div className="bg-[#111] p-2.5 border border-white/5">
                        <span className="text-[8px] text-zinc-600 uppercase tracking-widest block font-bold">Remaining Cards</span>
                        <span className="text-yellow-400 font-black tracking-wider text-sm">{room.deckCount} Cards</span>
                      </div>
                      <div className="bg-[#111] p-2.5 border border-white/5 col-span-2 sm:col-span-1">
                        <span className="text-[8px] text-zinc-600 uppercase tracking-widest block font-bold">Lobby Host</span>
                        <span className="text-white font-bold tracking-wider uppercase text-xs">
                          {room.players.find(p => p.isHost)?.name || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {controlDeckTab === 'rules' && (
                  <div className="space-y-4 text-xs font-sans text-zinc-400 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                    <div>
                      <h4 className="font-black text-white text-[10px] uppercase tracking-widest mb-1">👑 Card Hierarchy</h4>
                      <div className="font-mono bg-[#111] p-2 border border-white/5 text-yellow-400 text-center tracking-wider text-[11px] font-bold">
                        3 &lt; 4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9 &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2
                      </div>
                    </div>
                    <div>
                      <h4 className="font-black text-white text-[10px] uppercase tracking-widest mb-1">☝️ Special Mechanics</h4>
                      <ul className="list-disc pl-4 space-y-1 text-[11px]">
                        <li><strong className="text-white">The 7 Rule</strong>: Face/high cards (J, Q, K, A) are restricted unless previous claim was at least 7.</li>
                        <li><strong className="text-white">The 2 Rule</strong>: A <strong className="text-yellow-400 font-bold">2</strong> can be played on top of anything at any time!</li>
                        <li><strong className="text-white">Slapping</strong>: Tap central pile to call suspicion. If they lied they draw pile; if truth, you draw pile.</li>
                        <li><strong className="text-white">Falling Piles</strong>: Any 10, Ace, or 4 of a kind claimed clears the pile and lets you play again!</li>
                      </ul>
                    </div>
                  </div>
                )}

                {controlDeckTab === 'settings' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-[#111] p-3 border border-white/5">
                      <div>
                        <p className="text-white font-black text-xs uppercase tracking-wider">Sound Effects</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Toggle live game audio, slap slaps, card swooshes, and victory trumpets.</p>
                      </div>
                      <button
                        onClick={() => setMuted(!muted)}
                        className={`px-4 py-2 font-black uppercase text-[10px] tracking-wider skew-x-[-6deg] transition-all flex items-center gap-1.5 ${
                          muted
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-white text-black hover:bg-zinc-200'
                        }`}
                      >
                        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        {muted ? 'Sound Muted' : 'Sound Active'}
                      </button>
                    </div>

                    <div className="bg-[#111] p-3 border border-white/5 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-white font-black text-xs uppercase tracking-wider">Disconnect Buffer</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Duration (seconds) players have to reconnect before turning into an AI bot.</p>
                        </div>
                        {me?.isHost ? (
                          <select
                            value={room.reconnectBuffer || 15}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              onUpdateSettings({ reconnectBuffer: val });
                            }}
                            className="bg-[#0c0c0c] text-white border border-white/10 px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-red-600 rounded-none cursor-pointer"
                          >
                            <option value={10}>10 Seconds</option>
                            <option value={15}>15 Seconds</option>
                            <option value={30}>30 Seconds</option>
                            <option value={60}>60 Seconds</option>
                            <option value={120}>120 Seconds</option>
                          </select>
                        ) : (
                          <span className="text-yellow-400 font-mono font-black text-xs uppercase">
                            {room.reconnectBuffer || 15} Seconds
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* THE TABLETOP AREA */}
        <div className="relative bg-[#111] border border-white/5 h-[440px] md:h-[500px] w-full shadow-2xl overflow-hidden flex flex-col items-center justify-between p-4 sm:p-6">
          
          {/* Subtle Radar/Dashed Circles */}
          <div className="absolute w-[300px] h-[300px] md:w-[420px] md:h-[420px] border border-dashed border-white/5 rounded-full animate-pulse pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

          {/* Players Position Circle */}
          <div className="w-full flex items-center justify-between gap-2 overflow-x-auto pb-2 z-10 select-none">
            {room.players.map((p, idx) => {
              const isCurrentTurn = room.turnIndex === idx;
              const isMe = p.id === playerId;
              
              return (
                <div 
                  key={p.id}
                  className={`flex flex-col p-3 border-l-4 transition-all shrink-0 ${
                    isCurrentTurn 
                      ? 'bg-red-600/10 border-red-600 shadow-xl' 
                      : 'bg-[#0a0a0a] border-white/10'
                  }`}
                  style={{ minWidth: '90px' }}
                >
                  <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1">
                    {p.isOffline ? (
                      <span className="text-red-500 font-black animate-pulse">OFFLINE</span>
                    ) : (
                      isMe ? 'YOU' : p.isCpu ? 'AI BOT' : 'OPPONENT'
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mb-1">
                    {!p.isCpu && (
                      <div className={`w-2 h-2 rounded-full ${p.isOffline ? 'bg-red-500 animate-ping' : p.handSize > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
                    )}
                    <span className="text-xs font-black uppercase tracking-tight text-white truncate max-w-[75px]">
                      {p.name}
                    </span>
                  </div>
                  {p.isOffline ? (
                    <div className="text-[8px] font-mono font-bold text-red-400 bg-red-950/40 px-1 py-0.5 border border-red-800/30 mt-1 uppercase tracking-tighter">
                      REJOIN IN <span className="text-yellow-400 font-extrabold">{p.offlineRemaining ?? room.reconnectBuffer ?? 15}S</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-mono text-zinc-400">
                      DECK: <strong className="text-yellow-400 font-bold">{p.handSize}</strong>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* THE PILE ON PLAY (CENTER) */}
          <div className="flex flex-col items-center justify-center relative my-4 w-full z-10">
            <div className="relative w-36 h-48 flex items-center justify-center z-20">
              {room.pile.length === 0 ? (
                /* Empty Pile placeholder */
                <div className="absolute inset-0 border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-4">
                  <span className="text-2xl mb-1 opacity-30">🗂️</span>
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Empty Pile</span>
                </div>
              ) : (
                /* Overlapping Stack of Cards inside the rotated Artistic frame */
                <div className="transform rotate-3 bg-[#1a1a1a] p-2 shadow-2xl">
                  <div className="h-44 w-32 bg-white/5 border border-white/10 flex flex-col items-center justify-center relative">
                    <div className="text-[9px] text-white/40 mb-1 uppercase tracking-widest font-mono">Pile On Play</div>
                    <div className="text-6xl font-black italic text-zinc-400 font-mono leading-none">{room.pile.length}</div>
                    <div className="text-[9px] text-yellow-400 font-mono uppercase mt-2">Active</div>
                    
                    {/* Floating mini cards behind */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 mix-blend-overlay pointer-events-none">
                      <div className="w-24 h-36 bg-white rounded-lg -rotate-12 transform absolute border border-black/20 shadow-lg"></div>
                      <div className="w-24 h-36 bg-white rounded-lg rotate-6 transform absolute border border-black/20 shadow-lg"></div>
                      <div className="w-24 h-36 bg-white rounded-lg -rotate-2 transform absolute border border-black/20 shadow-lg"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SLAP SUSPICION ACTION CONTROLS */}
          <div className="w-full flex flex-col items-center gap-2 z-10">
            {room.suspicionActive && lastPlay && (
              <div className="w-full max-w-sm">
                
                {/* Active Claim Announcement */}
                <div className="text-center mb-3">
                  <span className="text-[9px] font-mono tracking-[0.2em] text-red-500 uppercase font-black bg-red-600/10 px-2.5 py-0.5 border border-red-500/20">
                    SUSPECT DETECTED
                  </span>
                  <div className="text-xs font-bold text-white mt-1 uppercase tracking-tight">
                    "{lastPlay.playerName}" CLAIMED <span className="text-yellow-400 font-mono font-black">{lastPlay.count}x "{lastPlay.claimRank}"</span>
                  </div>
                </div>

                {/* Reaction Timer Slap Meter */}
                <div className="relative h-1.5 w-full bg-[#0a0a0a] border border-white/10 rounded-none overflow-hidden mb-4">
                  <div 
                    className="h-full bg-red-600 transition-all duration-1000 ease-linear"
                    style={{ width: `${(room.reactionTimeLeft / 5) * 100}%` }}
                  />
                </div>

                {/* SLAP BUTTON! */}
                {lastPlay.playerId !== playerId ? (
                  <button
                    id="slap-suspicion-btn"
                    onClick={onSlapSuspicion}
                    className="z-30 bg-red-600 hover:bg-red-500 w-28 h-28 sm:w-32 sm:h-32 rounded-full border-8 border-[#0a0a0a] shadow-2xl flex flex-col items-center justify-center group transition-all duration-150 active:scale-90 absolute bottom-4 right-4 sm:-right-4 animate-bounce"
                  >
                    <span className="text-lg sm:text-xl font-black uppercase italic tracking-tighter text-white transform group-hover:scale-110">SLAP!</span>
                    <span className="text-[8px] text-white/70 font-mono tracking-widest -mt-1">SUSPICION</span>
                  </button>
                ) : (
                  <div className="absolute bottom-4 right-4 bg-[#0a0a0a] border border-white/10 px-4 py-2 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                    YOUR CALL
                  </div>
                )}
              </div>
            )}

            {/* Bottom Claim Overlay Label */}
            {lastPlay && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#0a0a0a] px-6 py-2 border border-white/10 text-center z-30">
                <p className="text-[8px] uppercase tracking-widest text-white/40 mb-0.5">Last Claim</p>
                <p className="text-sm md:text-base font-black italic uppercase text-yellow-400 font-mono leading-none">
                  {lastPlay.count}x "{lastPlay.claimRank}"
                </p>
                <p className="text-[9px] uppercase tracking-wide text-zinc-500 mt-0.5">
                  by {lastPlay.playerName}
                </p>
              </div>
            )}

            {!room.suspicionActive && (
              <div className="text-center">
                <span className="text-xs uppercase tracking-wider font-mono font-semibold">
                  {isMyTurn ? (
                    <span className="text-yellow-400 font-black animate-pulse">👉 IT'S YOUR TURN! DEPLOY CARDS BELOW.</span>
                  ) : (
                    <span className="text-zinc-500">WAITING FOR TURN OF {room.players[room.turnIndex]?.name}...</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ACTIVE PLAYER HAND & CONTROLS */}
        {me && (
          <div className="bg-[#111] border-l-4 border-red-600 p-6 shadow-2xl flex flex-col gap-5">
            
            {/* Hand Header */}
            <div className="flex justify-between items-end border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] uppercase font-black text-red-500 tracking-widest">YOUR DECK</span>
                <p className="text-xs text-zinc-400 mt-0.5">Choose cards to stack, then declare claim value.</p>
              </div>
              <span className="font-mono text-xs text-white font-black bg-white/5 border border-white/10 px-3 py-1">
                {me.cards?.length || 0} CARDS
              </span>
            </div>

            {/* CARDS LIST (Design matched style with QOL Drag & Drop + Reordering chevrons) */}
            <div className="flex gap-3 overflow-x-auto py-5 px-1 min-h-[200px] scrollbar-thin select-none">
              {sortedMyCards.map((card, i) => {
                const isSelected = selectedCardIds.includes(card.id);
                const isDragged = draggedIndex === i;
                const isOver = dragOverIndex === i;
                
                return (
                  <motion.div
                    key={card.id}
                    onClick={() => toggleCard(card.id)}
                    draggable={canIPlay}
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, i)}
                    animate={{ 
                      y: isSelected ? -16 : 0,
                      scale: isDragged ? 0.9 : isOver ? 1.05 : 1,
                      opacity: isDragged ? 0.5 : 1
                    }}
                    whileHover={{ y: isSelected ? -16 : -4 }}
                    className={`group flex-shrink-0 w-28 h-44 bg-white rounded-none p-3 text-zinc-950 shadow-lg relative overflow-hidden select-none cursor-pointer border-l-4 transition-all ${
                      isSelected 
                        ? 'border-yellow-400 -translate-y-4 shadow-[0_10px_20px_rgba(234,179,8,0.25)] bg-yellow-50/10' 
                        : isMyTurn 
                          ? 'border-red-600 hover:-translate-y-2' 
                          : 'border-zinc-300 opacity-40 cursor-not-allowed'
                    } ${isOver ? 'ring-2 ring-red-600 ring-offset-2' : ''}`}
                  >
                    {/* Suit Symbol & Rank Top */}
                    <div className="flex justify-between items-center w-full">
                      <span className="font-black text-xl leading-none italic">{card.rank}</span>
                      <span className={`text-sm leading-none ${isSelected ? 'text-yellow-600' : getSuitColor(card.suit)}`}>
                        {getSuitSymbol(card.suit)}
                      </span>
                    </div>

                    {/* Center giant symbol */}
                    <div className={`text-4xl text-center my-1.5 font-black leading-none ${isSelected ? 'text-yellow-500/80' : getSuitColor(card.suit)}`}>
                      {getSuitSymbol(card.suit)}
                    </div>

                    {/* Suit Symbol & Rank Bottom */}
                    <div className="flex justify-between items-center w-full rotate-180">
                      <span className="font-black text-xl leading-none italic">{card.rank}</span>
                      <span className={`text-sm leading-none ${isSelected ? 'text-yellow-600' : getSuitColor(card.suit)}`}>
                        {getSuitSymbol(card.suit)}
                      </span>
                    </div>

                    {/* Left/Right Shift Buttons (Amazing Mobile Reordering) */}
                    {canIPlay && (
                      <div className="absolute bottom-1 left-0 right-0 flex items-center justify-between px-1.5 bg-black/90 py-0.5 z-20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={(e) => shiftCard(card.id, 'left', e)}
                          className="p-1 text-white hover:text-yellow-400 disabled:opacity-20 disabled:hover:text-white"
                          title="Move Left"
                        >
                          <ChevronLeft className="w-3.5 h-3.5 stroke-[3px]" />
                        </button>
                        <span className="text-[7px] font-mono font-black tracking-widest text-zinc-400 uppercase">MOVE</span>
                        <button
                          type="button"
                          disabled={i === sortedMyCards.length - 1}
                          onClick={(e) => shiftCard(card.id, 'right', e)}
                          className="p-1 text-white hover:text-yellow-400 disabled:opacity-20 disabled:hover:text-white"
                          title="Move Right"
                        >
                          <ChevronRight className="w-3.5 h-3.5 stroke-[3px]" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {(!me.cards || me.cards.length === 0) && (
                <div className="w-full flex items-center justify-center py-6 text-zinc-500 font-bold italic text-xs uppercase tracking-wider">
                  No cards remaining in your hand! Standby for victory or draw hand.
                </div>
              )}
            </div>

            {/* ACTION CONTROLS */}
            <form onSubmit={handlePlaySubmit} className="flex-1 bg-[#1a1a1a] p-4 sm:p-6 flex flex-col justify-center border-t border-white/10 gap-4">
              <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                <div>
                  <p className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-white">
                    {isMyTurn ? "Call Out Declaration" : "Instant Lock-in Play"}
                  </p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                    {isMyTurn ? "Declare the value of cards you are placing" : "Play cards immediately to lock in the previous claim!"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!canIPlay || selectedCardIds.length === 0}
                    className={`px-6 py-2.5 font-black uppercase text-xs skew-x-[-12deg] tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      isMyTurn 
                        ? 'bg-white text-black hover:bg-zinc-200' 
                        : 'bg-yellow-500 text-black hover:bg-yellow-400'
                    }`}
                  >
                    {selectedCardIds.length > 0 
                      ? (isMyTurn ? `CLAIM TRUTH / LIE` : `INSTANT LOCK-IN & PLAY`) 
                      : "SELECT CARDS FIRST"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4 mt-2">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-[10px] uppercase font-black text-white/40 tracking-wider">Amount Selected</span>
                  <span className="font-mono font-black text-white text-sm bg-white/5 border border-white/10 px-3 py-1">
                    {String(selectedCardIds.length).padStart(2, '0')} CARDS
                  </span>
                </div>
                
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-black text-white/40 tracking-wider">Declare Rank (Tap to Select)</span>
                    <span className="text-[10px] uppercase font-mono font-bold text-red-500">
                      CURRENTLY DECLARED: RANK {claimRank}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-7 gap-2 p-2 bg-[#050505] border border-white/5 rounded-none">
                    {legalClaims.map((r) => {
                      const isSelected = claimRank === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          disabled={!canIPlay || selectedCardIds.length === 0}
                          onClick={() => {
                            if (!muted) sound.playTick();
                            setClaimRank(r);
                          }}
                          className={`flex-1 min-w-[44px] h-11 font-mono text-xs font-black transition-all duration-150 flex flex-col items-center justify-center border-2 ${
                            isSelected 
                              ? 'bg-red-600 text-white border-red-500 shadow-[0_0_12px_rgba(220,38,38,0.7)] scale-105 font-extrabold' 
                              : 'bg-[#151515] text-zinc-400 border-white/5 hover:border-white/25 hover:text-white'
                          } disabled:opacity-20 disabled:cursor-not-allowed`}
                        >
                          <span className="text-[7px] tracking-tighter opacity-40 leading-none mb-0.5">RANK</span>
                          <span className="leading-none text-sm font-black">{r}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </form>

            {/* Play Warnings / Guide */}
            {isMyTurn && prevClaim && (
              <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-1">
                ℹ️ PREV CLAIM: "{prevClaim}" | 
                {prevClaim === '2' && <span> MUST DEPLOY "2"</span>}
                {RANK_VALUES[prevClaim] < 7 && <span> JACKS OR LARGER UNAVAILABLE (BELOW 7) | 2 ALWAYS LEGAL</span>}
              </div>
            )}
          </div>
        )}

      </div>

      {/* RIGHT COLUMN (FEED, LOGS, CHAT) */}
      <div className="lg:col-span-4 flex flex-col gap-4 bg-[#111] border-l-4 border-red-600 p-5 shadow-xl h-[600px] lg:h-[750px]">
        
        {/* Tab Selection */}
        <div className="flex border-b border-white/10 pb-2 gap-2">
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all skew-x-[-12deg] ${
              activeTab === 'logs' 
                ? 'bg-red-600 text-white' 
                : 'bg-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Feed / Chat
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all skew-x-[-12deg] ${
              activeTab === 'rules' 
                ? 'bg-red-600 text-white' 
                : 'bg-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Rulebook
          </button>
        </div>

        {/* FEED / CHAT LOGS */}
        {activeTab === 'logs' ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            
            {/* Scrollable messages container */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-2 scrollbar-thin font-mono text-[11px] text-white/60">
              {room.logs.map((log) => {
                let logBorder = 'border-white/5';
                let typeColor = 'text-white/40';
                
                if (log.type === 'play') {
                  logBorder = 'border-yellow-400/30 bg-[#0a0a0a]/50';
                  typeColor = 'text-yellow-400';
                } else if (log.type === 'suspicion') {
                  logBorder = log.message.includes('❌') 
                    ? 'border-red-600 bg-red-950/10' 
                    : 'border-emerald-500 bg-emerald-950/10';
                  typeColor = log.message.includes('❌') ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold';
                } else if (log.type === 'fall') {
                  logBorder = 'border-indigo-500/40 bg-indigo-950/10';
                  typeColor = 'text-indigo-400';
                } else if (log.type === 'win') {
                  logBorder = 'border-yellow-400 bg-yellow-400/10';
                  typeColor = 'text-yellow-400 font-black';
                }

                return (
                  <div key={log.id} className={`p-2.5 border-b ${logBorder} leading-relaxed`}>
                    {log.type === 'chat' ? (
                      <div>
                        <strong className="text-white uppercase tracking-wider">{log.playerName}: </strong>
                        <span className="text-zinc-300">{log.message}</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5">
                        <span className={`font-black uppercase tracking-wider shrink-0 text-[10px] ${typeColor}`}>
                          [{log.type}]
                        </span>
                        <span>{log.message}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendChat} className="flex gap-2 border-t border-white/10 pt-3">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value.slice(0, 100))}
                placeholder="TRASH TALK OR BLUFF COORDINATES..."
                maxLength={100}
                className="flex-1 bg-[#0a0a0a] border border-white/15 px-3 py-2 text-[10px] font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-600"
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-500 text-white p-2.5 transition-all hover:scale-105 skew-x-[-12deg]"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        ) : (
          /* BRIEF RULEBOOK REFERENCING */
          <div className="flex-1 overflow-y-auto space-y-3.5 text-[11px] text-zinc-400 leading-relaxed pr-1 font-mono uppercase tracking-wider">
            <div className="bg-[#0a0a0a] p-3 border border-white/5">
              <h4 className="font-black text-white text-xs mb-1.5">👑 Card Ranks</h4>
              <p className="font-mono text-yellow-400 text-center tracking-widest font-semibold">
                3 &lt; 4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9 &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2
              </p>
            </div>
            <div>
              <h4 className="font-black text-white text-xs mb-1">⚡️ Core Mechanics</h4>
              <p className="text-[10px]">On your turn, play card(s) face down and declare a claim rank. You can lie about the ranks but the count must be exact.</p>
            </div>
            <div>
              <h4 className="font-black text-white text-xs mb-1">☝️ Special Play Conditions</h4>
              <ul className="list-disc pl-3.5 space-y-1 text-[10px]">
                <li>You can only play cards equal or larger in value.</li>
                <li><strong>Jacks or higher (J, Q, K, A)</strong> are restricted from being played unless previous claim is &gt;= 7 (or starting empty pile).</li>
                <li><strong>Special Rule:</strong> A 2 can be played on top of anything at any time!</li>
              </ul>
            </div>
            <div>
              <h4 className="font-black text-white text-xs mb-1">🛑 Slapping Suspicion</h4>
              <p className="text-[10px]">Any player can slam suspicion within 5 seconds. If the player lied, they draw the pile. Otherwise, the accuser draws it.</p>
            </div>
            <div>
              <h4 className="font-black text-white text-xs mb-1">💥 Clearing the Pile</h4>
              <p className="text-[10px]">If anyone calls a 10, an Ace, or a 4th-consecutive same-rank, the pile clears and they immediately go again!</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Player } from '../types';
import { motion } from 'motion/react';
import { Users, Bot, Crown, ArrowRight, Play, Plus, Trash2, HelpCircle } from 'lucide-react';

interface LobbyViewProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  roomCode: string;
  setRoomCode: (code: string) => void;
  players: Player[];
  playerId: string;
  isHost: boolean;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onAddCpu: () => void;
  onRemovePlayer: (id: string) => void;
  onStartGame: () => void;
  error: string | null;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  playerName,
  setPlayerName,
  roomCode,
  setRoomCode,
  players,
  playerId,
  isHost,
  onCreateRoom,
  onJoinRoom,
  onAddCpu,
  onRemovePlayer,
  onStartGame,
  error
}) => {
  const [isJoining, setIsJoining] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoinRoom();
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom();
  };

  const isLobbyActive = players.length > 0;

  return (
    <div id="lobby-container" className="flex flex-col items-center justify-center min-h-[75vh] py-8 px-2 w-full max-w-4xl mx-auto">
      
      {/* Game Brand / Hero Poster */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-10 w-full relative"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-6 -z-10 text-6xl md:text-8xl font-black italic uppercase tracking-tighter opacity-5 select-none pointer-events-none">
          BLUFFING GAME
        </div>
        <div className="inline-block bg-red-600 text-white text-[10px] font-black tracking-[0.25em] px-3 py-1 uppercase mb-3 select-none">
          USA-FINLAND SHOWDOWN
        </div>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-none">
          LYING PIECE OF S***
        </h2>
        <div className="h-1.5 w-24 bg-red-600 mx-auto mt-4 mb-3" />
        <p className="text-xs md:text-sm text-zinc-400 max-w-lg mx-auto font-medium leading-relaxed">
          The ultimate physical-feel card bluffing arena. Draw, deceive, call out suspects with split-second slaps, and dominate the pile.
        </p>
      </motion.div>

      {/* General Error Bar */}
      {error && (
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-red-950/20 border-l-4 border-red-600 text-red-200 px-4 py-3 text-xs font-mono mb-8 shadow-lg flex items-center gap-2"
        >
          <span className="bg-red-600 text-white font-black text-[10px] px-1.5 py-0.5 uppercase tracking-wide shrink-0">FAIL</span>
          <span>{error}</span>
        </motion.div>
      )}

      {/* Left/Right Grid or Stack */}
      {!isLobbyActive ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
          
          {/* Create Room Box */}
          <motion.div 
            initial={{ x: -25, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="bg-[#111] p-6 border-l-4 border-red-600 flex flex-col justify-between relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute top-2 right-2 text-6xl font-black text-white/5 uppercase select-none pointer-events-none">
              HOST
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-red-500 font-bold mb-1">01 / PRIVATE ROOM</div>
              <h3 className="text-xl font-black text-white uppercase mb-3 tracking-tight italic">Host New Game</h3>
              <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
                Spin up a dedicated match on our real-time handshake servers. You can seed AI bots if you lack a second player.
              </p>
              
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Nick Name</label>
                  <input 
                    type="text" 
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value.slice(0, 14))}
                    placeholder="ENTER YOUR NICKNAME"
                    maxLength={14}
                    required
                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-none px-4 py-3 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 uppercase transition-colors"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-white text-black font-black uppercase text-xs py-3.5 px-4 rounded-none hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 tracking-widest skew-x-[-6deg]"
                >
                  Create Room <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                </button>
              </form>
            </div>
          </motion.div>

          {/* Join Room Box */}
          <motion.div 
            initial={{ x: 25, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-[#111] p-6 border-l-4 border-white flex flex-col justify-between relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute top-2 right-2 text-6xl font-black text-white/5 uppercase select-none pointer-events-none">
              JOIN
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mb-1">02 / MATCHMAKING</div>
              <h3 className="text-xl font-black text-white uppercase mb-3 tracking-tight italic">Join Game</h3>
              <p className="text-zinc-400 text-xs mb-6 leading-relaxed">
                Connect directly to an active lobby. Simply input your nickname and your friend's 4-letter room code below.
              </p>

              <form onSubmit={handleJoinSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Nick Name</label>
                    <input 
                      type="text" 
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value.slice(0, 14))}
                      placeholder="NICKNAME"
                      maxLength={14}
                      required
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-none px-4 py-3 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 uppercase transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Room Code</label>
                    <input 
                      type="text" 
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
                      placeholder="ABCD"
                      maxLength={4}
                      required
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-none px-4 py-3 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 uppercase tracking-widest text-center transition-colors"
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-red-600 text-white font-black uppercase text-xs py-3.5 px-4 rounded-none hover:bg-red-500 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 tracking-widest skew-x-[-6deg]"
                >
                  Join Room <ArrowRight className="w-3.5 h-3.5 stroke-[3px]" />
                </button>
              </form>
            </div>
          </motion.div>

        </div>
      ) : (
        /* Lobby State - Room has been joined/created */
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-lg bg-[#111] border-l-4 border-red-600 p-6 shadow-2xl relative"
        >
          {/* Lobby Header */}
          <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-5">
            <div>
              <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Room Code</span>
              <div className="text-4xl font-black text-yellow-400 tracking-wider font-mono leading-none">
                {players[0]?.cards === undefined ? 'LOBBY' : ''}{roomCode}
              </div>
            </div>
            <div className="text-right">
              <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Connected</span>
              <span className="text-lg text-white font-bold flex items-center gap-1.5 justify-end font-mono">
                <Users className="w-4 h-4 text-red-500" />
                {players.length} / 8
              </span>
            </div>
          </div>

          {/* Players List */}
          <div className="space-y-2 mb-6 max-h-60 overflow-y-auto pr-1">
            <span className="text-[10px] uppercase font-black text-zinc-400 tracking-widest block mb-2">Connected Opponents</span>
            {players.map((p) => (
              <div 
                key={p.id}
                className={`flex items-center justify-between px-4 py-3 rounded-none border text-xs font-mono transition-all ${
                  p.id === playerId 
                    ? 'bg-white text-black border-white font-bold' 
                    : 'bg-[#0a0a0a] border-white/5 text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {p.isCpu ? (
                    <Bot className={`w-4 h-4 ${p.id === playerId ? 'text-black' : 'text-red-500'}`} />
                  ) : (
                    <div className={`w-2.5 h-2.5 rounded-full ${p.id === playerId ? 'bg-red-600' : 'bg-emerald-500'} animate-pulse`} />
                  )}
                  <span className="uppercase tracking-wider">{p.name} {p.id === playerId && <span className="text-[10px] opacity-60 font-normal ml-1">(YOU)</span>}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {p.isHost && (
                    <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 flex items-center gap-1 ${p.id === playerId ? 'bg-black text-white' : 'bg-white/10 text-white'}`}>
                      <Crown className="w-2.5 h-2.5" /> Host
                    </span>
                  )}
                  {p.isCpu && (
                    <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 ${p.id === playerId ? 'bg-black text-white' : 'bg-red-500/10 text-red-500'}`}>
                      BOT
                    </span>
                  )}
                  {isHost && p.id !== playerId && (
                    <button 
                      onClick={() => onRemovePlayer(p.id)}
                      className="text-zinc-500 hover:text-red-500 p-1 rounded-none hover:bg-white/5 transition-colors"
                      title="Kick Player"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {isHost ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={onAddCpu}
                    disabled={players.length >= 8}
                    className="bg-transparent hover:bg-white/5 text-white py-3 px-4 border border-white/20 text-xs font-black uppercase tracking-wider transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 skew-x-[-6deg]"
                  >
                    <Bot className="w-4 h-4 text-zinc-400" /> Add AI Bot
                  </button>
                  <button 
                    onClick={onStartGame}
                    disabled={players.length < 2}
                    className="bg-red-600 hover:bg-red-500 text-white py-3 px-4 text-xs font-black uppercase tracking-wider transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 skew-x-[-6deg]"
                  >
                    <Play className="w-4 h-4 fill-white" /> Start Game
                  </button>
                </div>
                {players.length < 2 && (
                  <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest mt-3">
                    Add an AI Bot or wait for players to activate.
                  </p>
                )}
              </>
            ) : (
              <div className="text-center py-3 bg-[#0a0a0a] border border-white/5">
                <span className="text-xs text-zinc-400 uppercase tracking-widest font-mono animate-pulse">
                  Waiting for host to seed players & start...
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Toggleable Rules Accordion - Artistic Red/White styling */}
      <div className="w-full max-w-2xl mt-12">
        <button 
          onClick={() => setShowRules(!showRules)}
          className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors bg-[#111] py-3.5 border-l-4 border-white"
        >
          <HelpCircle className="w-4 h-4 text-red-500" /> 
          {showRules ? 'Hide Play Rules & Card Hierarchy' : 'Show Play Rules & Card Hierarchy'}
        </button>

        {showRules && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-[#111] border border-white/5 rounded-none p-6 mt-3 space-y-4 text-xs text-zinc-400 leading-relaxed max-h-96 overflow-y-auto shadow-inner font-sans border-l-4 border-red-600"
          >
            <div>
              <h4 className="font-black text-white text-xs uppercase tracking-widest mb-1.5">👑 Card Value Hierarchy</h4>
              <p className="font-mono bg-[#0a0a0a] p-3 border border-white/10 text-yellow-400 text-center tracking-wider font-semibold">
                3 &lt; 4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9 &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2 (Highest)
              </p>
            </div>

            <div>
              <h4 className="font-black text-white text-xs uppercase tracking-widest mb-1.5">🎮 How to Play</h4>
              <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                <li>Everyone is dealt 5 cards to start.</li>
                <li>On your turn, play 1 or more cards face down and <strong>CALL OUT</strong> what you played.</li>
                <li>The number of cards you play must match your claim, but <strong>you can lie</strong> about their ranks!</li>
                <li>You can only play cards of <strong>equal or higher value</strong> than the current claim.</li>
                <li><strong>The 7 rule</strong>: Jacks or higher (J, Q, K, A, 2) can only be played if the previous claim was at least a 7! (Unless you start a fresh pile).</li>
                <li><strong>The 2 rule</strong>: A 2 can only be played on top of a 2!</li>
                <li>If you have no legal moves, you MUST lie to make a legal claim!</li>
              </ul>
            </div>

            <div>
              <h4 className="font-black text-white text-xs uppercase tracking-widest mb-1.5">💥 Suspicion & Slapping</h4>
              <p>
                After anyone plays, a <strong>5-second reaction timer</strong> starts. Any other player can click the pile to cast <strong>SUSPICION (SLAP)</strong>.
              </p>
              <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400">
                <li>If the player lied: They must take the entire pile, and turn moves to next player.</li>
                <li>If they told truth: The accuser takes the entire pile, and turn remains on the same player.</li>
                <li>The player next in line can play their cards instantly to "lock in" the previous play, immediately closing the suspicion window!</li>
              </ul>
            </div>

            <div>
              <h4 className="font-black text-white text-xs uppercase tracking-widest mb-1.5">📉 Clearing the Pile (Falling)</h4>
              <p>The pile falls (gets discarded) if any of the following are called:</p>
              <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400">
                <li>An Ace is called</li>
                <li>A Ten is called</li>
                <li>4 cards of the identical rank are called on top of one another consecutively</li>
                <li>If the pile falls, the player who made it fall draws cards up to 5 and gets to start another turn immediately!</li>
              </ul>
            </div>

            <div>
              <h4 className="font-black text-white text-xs uppercase tracking-widest mb-1.5">🏆 Winning the Game</h4>
              <p>
                As long as the drawing pile has cards, players with fewer than 5 cards must draw until they have 5. Once the drawing pile is empty, the first player to successfully run out of cards wins the game!
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

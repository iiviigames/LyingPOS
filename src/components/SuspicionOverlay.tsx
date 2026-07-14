import React, { useEffect } from 'react';
import { Card } from '../types';
import { motion } from 'motion/react';
import { sound } from './SoundManager';
import { Skull, ShieldCheck, ArrowRight } from 'lucide-react';

interface SuspicionOverlayProps {
  result: {
    accuser: string;
    accused: string;
    lied: boolean;
    actualCards: Card[];
    claimRank: string;
    pileCountBefore: number;
  };
  onClose: () => void;
}

export const SuspicionOverlay: React.FC<SuspicionOverlayProps> = ({ result, onClose }) => {
  const { accuser, accused, lied, actualCards, claimRank, pileCountBefore } = result;

  useEffect(() => {
    if (lied) {
      sound.playBusted();
    } else {
      sound.playWin();
    }
  }, [lied]);

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
    <div id="suspicion-overlay" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]/95 border-[16px] border-[#1a1a1a] p-4 sm:p-8 overflow-y-auto">
      {/* Background Pulse / Slash overlay */}
      <div className={`absolute inset-0 opacity-5 transition-all duration-1000 ${lied ? 'bg-red-600' : 'bg-emerald-600'}`} />

      {/* Header Result */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="text-center max-w-xl z-10"
      >
        <span className="text-[10px] font-black tracking-[0.25em] text-red-500 uppercase bg-red-600/10 border border-red-500/20 px-3 py-1">
          SUSPICION SLAM RESOLUTION
        </span>
        
        <h1 className={`text-6xl md:text-8xl font-black tracking-tighter leading-none uppercase italic mt-4 mb-4 flex items-center justify-center gap-3 ${lied ? 'text-red-600' : 'text-emerald-500'}`}>
          {lied ? 'BUSTED!' : 'TRUTHFUL!'}
        </h1>

        <p className="text-sm md:text-base text-zinc-400 font-medium font-mono leading-relaxed max-w-md mx-auto">
          <span className="text-white font-bold bg-white/5 px-1.5 py-0.5">{accuser}</span> SLAPPED SUSPICION ON <span className="text-white font-bold bg-white/5 px-1.5 py-0.5">{accused}</span>'S CLAIM OF <span className="text-yellow-400 font-bold font-mono">{actualCards.length}x "{claimRank}"</span>
        </p>
      </motion.div>

      {/* Comparison Area */}
      <div className="flex flex-col md:flex-row items-stretch justify-center gap-6 my-8 w-full max-w-3xl z-10">
        
        {/* Claim Container */}
        <motion.div 
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col items-center bg-[#111] border-l-4 border-yellow-400 p-6 flex-1 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-2 right-2 text-4xl font-black text-white/5 uppercase select-none pointer-events-none">CLAIM</div>
          <span className="text-[9px] uppercase font-black text-zinc-500 tracking-widest mb-4">The Accused Call Out</span>
          <div className="text-5xl font-black text-yellow-400 mb-1 italic font-mono">{actualCards.length}x</div>
          <div className="text-xl font-black text-white uppercase tracking-tight mb-6 italic">Rank: "{claimRank}"</div>
          
          <div className="flex gap-2 justify-center mt-auto">
            {actualCards.map((_, i) => (
              <div key={i} className="w-12 h-16 bg-[#0a0a0a] border border-dashed border-yellow-400/30 flex flex-col items-center justify-center text-yellow-400/60 font-black text-lg font-mono">
                {claimRank}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Transition Icon (Middle divider) */}
        <div className="flex items-center justify-center">
          <div className="h-0.5 w-12 md:h-12 md:w-0.5 bg-white/10" />
        </div>

        {/* Reality Container */}
        <motion.div 
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={`flex flex-col items-center bg-[#111] p-6 flex-1 text-center shadow-2xl relative overflow-hidden border-l-4 ${lied ? 'border-red-600' : 'border-emerald-500'}`}
        >
          <div className="absolute top-2 right-2 text-4xl font-black text-white/5 uppercase select-none pointer-events-none">REALITY</div>
          <span className="text-[9px] uppercase font-black text-zinc-500 tracking-widest mb-4">Actual Cards Played</span>
          <div className="text-5xl font-black text-white mb-1 italic font-mono">{actualCards.length}x</div>
          <div className={`text-xl font-black uppercase tracking-tight mb-6 italic ${lied ? 'text-red-500' : 'text-emerald-500'}`}>
            {lied ? 'DECEPTION!' : 'HONESTY!'}
          </div>

          {/* Actual cards values! */}
          <div className="flex gap-2.5 justify-center flex-wrap mt-auto">
            {actualCards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: (i - (actualCards.length - 1) / 2) * 6 }}
                transition={{ delay: 0.3 + i * 0.08, type: 'spring' }}
                className="w-14 h-20 bg-white shadow-xl flex flex-col justify-between p-2 text-zinc-950 border border-zinc-200 select-none relative overflow-hidden"
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-black text-sm leading-none italic">{card.rank}</span>
                  <span className={`text-xs leading-none ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
                </div>
                <div className={`text-2xl self-center font-black leading-none ${getSuitColor(card.suit)}`}>
                  {getSuitSymbol(card.suit)}
                </div>
                <div className="flex justify-between items-center w-full rotate-180">
                  <span className="font-black text-sm leading-none italic">{card.rank}</span>
                  <span className={`text-xs leading-none ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </div>

      {/* Fine Print / Explanation */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center max-w-xl z-10 bg-[#111] p-5 border-t-2 border-white/10"
      >
        <p className="text-zinc-300 text-xs md:text-sm leading-relaxed font-mono">
          {lied ? (
            <>
              🔴 Since <span className="font-bold text-white">{accused}</span> lied, they draw <span className="text-red-500 font-bold font-mono text-base">{pileCountBefore} cards</span>. The turn passes to next player.
            </>
          ) : (
            <>
              🟢 Since <span className="font-bold text-white">{accused}</span> was truthful, accuser <span className="font-bold text-white">{accuser}</span> draws <span className="text-emerald-500 font-bold font-mono text-base">{pileCountBefore} cards</span>. Turn stays on <span className="font-bold text-white">{accused}</span>!
            </>
          )}
        </p>

        {/* Loading / Dismiss Info */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="w-48 h-1 bg-[#222] overflow-hidden relative border border-white/5">
            <motion.div 
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 4, ease: "linear" }}
              className={`h-full ${lied ? 'bg-red-600' : 'bg-emerald-500'}`}
            />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase mt-2 animate-pulse">
            Resuming match automatically...
          </span>
        </div>
      </motion.div>
    </div>
  );
};

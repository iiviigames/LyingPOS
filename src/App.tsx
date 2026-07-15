import { useState, useEffect, useRef } from 'react';
import { GameRoom, Player } from './types';
import { LobbyView } from './components/LobbyView';
import { GameView } from './components/GameView';
import { SuspicionOverlay } from './components/SuspicionOverlay';
import { Users, AlertTriangle, ShieldCheck, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('lpos_playerName') || '';
  });
  const [roomCode, setRoomCode] = useState<string>(() => {
    return localStorage.getItem('lpos_roomCode') || '';
  });
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return localStorage.getItem('lpos_playerId') || null;
  });
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [customWsUrl, setCustomWsUrl] = useState<string>(() => {
    return localStorage.getItem('lpos_custom_ws_url') || '';
  });

  const handleSetCustomWsUrl = (url: string) => {
    setCustomWsUrl(url);
    if (url) {
      localStorage.setItem('lpos_custom_ws_url', url);
    } else {
      localStorage.removeItem('lpos_custom_ws_url');
    }
    // Close existing connection if any, so it connects to the newly configured URL
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const wsRef = useRef<WebSocket | null>(null);

  // Sync player name to local storage
  useEffect(() => {
    localStorage.setItem('lpos_playerName', playerName);
  }, [playerName]);

  // Handle manual reconnect on load if session exists
  const handleReconnect = (savedRoomCode: string, savedPlayerId: string) => {
    connectWS((socket) => {
      socket.send(JSON.stringify({
        type: 'reconnect_room',
        roomCode: savedRoomCode,
        playerId: savedPlayerId
      }));
    });
  };

  useEffect(() => {
    const savedRoomCode = localStorage.getItem('lpos_roomCode');
    const savedPlayerId = localStorage.getItem('lpos_playerId');
    if (savedRoomCode && savedPlayerId && !wsRef.current) {
      handleReconnect(savedRoomCode, savedPlayerId);
    }
  }, []);

  // Establish WebSocket Connection
  const connectWS = (onConnected: (ws: WebSocket) => void) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      onConnected(wsRef.current);
      return;
    }

    setConnecting(true);
    setError(null);

    // Determine secure or unsecure WebSocket URL with fallback for external hosting (e.g., GitHub Pages)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = '';

    if (customWsUrl) {
      wsUrl = customWsUrl;
    } else if (import.meta.env.VITE_WS_URL) {
      wsUrl = import.meta.env.VITE_WS_URL;
    } else {
      const hostname = window.location.hostname;
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      const isCloudRun = hostname.endsWith('.run.app');

      if (!isLocalhost && !isCloudRun) {
        // Fallback to the live deployed Google Cloud Run production server when hosted on GitHub Pages
        wsUrl = 'wss://ais-pre-h344mpng2swgs6has63slb-387021431209.us-east1.run.app/ws';
      } else {
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }
    }

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setConnecting(false);
      onConnected(socket);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'create_room_success':
            setRoomCode(msg.roomCode);
            setPlayerId(msg.playerId);
            localStorage.setItem('lpos_roomCode', msg.roomCode);
            localStorage.setItem('lpos_playerId', msg.playerId);
            break;
            
          case 'join_room_success':
            setRoomCode(msg.roomCode);
            setPlayerId(msg.playerId);
            localStorage.setItem('lpos_roomCode', msg.roomCode);
            localStorage.setItem('lpos_playerId', msg.playerId);
            break;

          case 'reconnect_success':
            setRoomCode(msg.roomCode);
            setPlayerId(msg.playerId);
            localStorage.setItem('lpos_roomCode', msg.roomCode);
            localStorage.setItem('lpos_playerId', msg.playerId);
            setError(null);
            break;
            
          case 'room_state':
            setRoom(msg.state);
            setError(null);
            break;
            
          case 'error':
            setError(msg.message);
            // If the session was expired on the server, clear local storage
            if (msg.message.includes('expired') || msg.message.includes('not found')) {
              localStorage.removeItem('lpos_roomCode');
              localStorage.removeItem('lpos_playerId');
              setRoomCode('');
              setPlayerId(null);
              setRoom(null);
            }
            break;
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    socket.onerror = () => {
      setError('Connection error. Failed to reach the real-time game server.');
      setConnecting(false);
    };

    socket.onclose = () => {
      wsRef.current = null;
      setConnecting(false);
      
      // Attempt auto-reconnection in 2 seconds if a valid room session is stored
      const savedRoomCode = localStorage.getItem('lpos_roomCode');
      const savedPlayerId = localStorage.getItem('lpos_playerId');
      if (savedRoomCode && savedPlayerId) {
        setTimeout(() => {
          const stillSavedRoomCode = localStorage.getItem('lpos_roomCode');
          const stillSavedPlayerId = localStorage.getItem('lpos_playerId');
          if (stillSavedRoomCode && stillSavedPlayerId && !wsRef.current) {
            handleReconnect(stillSavedRoomCode, stillSavedPlayerId);
          }
        }, 2000);
      } else {
        setRoom(null);
        setPlayerId(null);
      }
    };
  };

  // Create Room
  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter a display name first.');
      return;
    }
    connectWS((socket) => {
      socket.send(JSON.stringify({
        type: 'create_room',
        name: playerName.trim()
      }));
    });
  };

  // Join Room
  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter a display name first.');
      return;
    }
    if (!roomCode.trim() || roomCode.length !== 4) {
      setError('Please enter a valid 4-letter room code.');
      return;
    }
    connectWS((socket) => {
      socket.send(JSON.stringify({
        type: 'join_room',
        name: playerName.trim(),
        roomCode: roomCode.trim().toUpperCase()
      }));
    });
  };

  // Add CPU bot
  const handleAddCpu = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'add_cpu' }));
    }
  };

  // Remove player / AI bot
  const handleRemovePlayer = (targetPlayerId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'remove_player',
        playerId: targetPlayerId
      }));
    }
  };

  // Start game
  const handleStartGame = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start_game' }));
    }
  };

  // Play cards
  const handlePlayCards = (cardIds: string[], claimRank: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'play_cards',
        cardIds,
        claimRank
      }));
    }
  };

  // Slap suspicion
  const handleSlapSuspicion = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'slap_suspicion' }));
    }
  };

  // Send chat message
  const handleSendChat = (message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'send_chat',
        message
      }));
    }
  };

  // Restart game
  const handleRestartGame = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'restart_game' }));
    }
  };

  // Update server settings
  const handleUpdateSettings = (settings: { reconnectBuffer: number }) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_settings',
        reconnectBuffer: settings.reconnectBuffer
      }));
    }
  };

  // Leave room
  const handleLeaveRoom = () => {
    localStorage.removeItem('lpos_roomCode');
    localStorage.removeItem('lpos_playerId');
    if (wsRef.current) {
      wsRef.current.close();
    }
    setRoom(null);
    setPlayerId(null);
    setRoomCode('');
  };

  // Host verification helper
  const isHost = room ? room.players.find(p => p.id === playerId)?.isHost || false : false;

  return (
    <div id="main-app" className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0] flex flex-col font-sans select-none antialiased border-[8px] sm:border-[16px] border-[#1a1a1a] selection:bg-red-600/30 selection:text-white relative">
      
      {/* Subtle monochrome ambient lights */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-white/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-red-600/5 rounded-full filter blur-[150px] pointer-events-none" />

      {/* HEADER / NAVIGATION BAR */}
      <header className="border-b-4 border-[#1a1a1a] bg-[#0a0a0a]/90 sticky top-0 z-30 px-4 md:px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="relative">
            <div className="absolute -top-6 -left-2 text-4xl sm:text-6xl md:text-7xl font-black tracking-tighter leading-none italic uppercase opacity-10 pointer-events-none select-none">
              Lying Piece
            </div>
            <div className="flex items-baseline gap-2 relative z-10">
              <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 animate-pulse shrink-0" />
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter leading-none uppercase text-white">
                Of S***
              </h1>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="bg-red-600 text-white text-[10px] font-black tracking-[0.25em] px-2 py-0.5 uppercase mb-1">GLOBAL SERVER</span>
              <span className="border border-white/20 text-zinc-400 text-[10px] font-black tracking-[0.2em] px-2 py-0.5 uppercase mb-1">
                {room ? `LOBBY: ${room.code}` : "STANDBY"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-zinc-900/55 pt-3 md:pt-0">
            {room && (
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-mono font-bold text-red-500 leading-none tracking-tighter">
                  {room.players.length} PLAYERS
                </div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Active Connection</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-xl sm:text-2xl font-mono font-bold text-yellow-400 leading-none tracking-tighter">
                {room && room.status === 'playing' ? `PILE: ${room.pile.length}` : 'READY'}
              </div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
                {room && room.status === 'playing' ? 'Cards in center' : 'System Status'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT GATEWAY */}
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4">
        {connecting ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs uppercase tracking-widest font-mono text-zinc-400">CONNECTING TO SHIELDED GAME SERVERS...</p>
          </div>
        ) : !room || room.status === 'lobby' ? (
          <LobbyView
            playerName={playerName}
            setPlayerName={setPlayerName}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            players={room ? room.players : []}
            playerId={playerId || ''}
            isHost={isHost}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onAddCpu={handleAddCpu}
            onRemovePlayer={handleRemovePlayer}
            onStartGame={handleStartGame}
            error={error}
            customWsUrl={customWsUrl}
            setCustomWsUrl={handleSetCustomWsUrl}
          />
        ) : (
          <GameView
            room={room}
            playerId={playerId || ''}
            onPlayCards={handlePlayCards}
            onSlapSuspicion={handleSlapSuspicion}
            onSendChat={handleSendChat}
            onRestartGame={handleRestartGame}
            onLeaveRoom={handleLeaveRoom}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* SUSPICION OVERLAY EFFECT */}
      <AnimatePresence>
        {room?.suspicionResult && (
          <SuspicionOverlay
            result={room.suspicionResult}
            onClose={() => {}}
          />
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="border-t-4 border-[#1a1a1a] bg-[#0a0a0a] py-6 text-center text-xs text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 uppercase tracking-wider text-[10px]">
          <span>&copy; 2026 Lying Piece of Shit. All handshakes active.</span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-red-600 animate-pulse" /> Shielded Handshake Handlers
          </span>
        </div>
      </footer>

    </div>
  );
}

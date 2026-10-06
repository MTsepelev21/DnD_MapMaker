import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  DoorOpen,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Flame,
  Grid,
  Hand,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Lock,
  MapPin,
  MessageSquare,
  MousePointer,
  Move,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Radio,
  RefreshCw,
  Ruler,
  Shield,
  ShieldAlert,
  Sparkles,
  Sun,
  Swords,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PRESET_MAPS } from './data/presets';
import {
  AmbientSoundPreset,
  ChatMessage,
  CombatState,
  ConnectedPeer,
  DiceRollResult,
  FogBrushAction,
  GameMode,
  GlobalMusicState,
  HpVisibilityMode,
  ManualFogStroke,
  MapBackgroundConfig,
  MapData,
  MapPing,
  MonsterVisibilityMode,
  OneShotSfxType,
  Point,
  PositionalAudioSource,
  RemoteRuler,
  RoomStatePayload,
  SnapTarget,
  TerrainType,
  Token,
  TokenFaction,
  TokenMoveTrail,
  ToolMode,
  UserRole,
  WallSegment,
} from './types/vtt';
import { VTTCanvas } from './components/VTTCanvas';
import { QuickDiceBar } from './components/QuickDiceBar';
import { DiceChatPanel } from './components/DiceChatPanel';
import { InitiativeTracker } from './components/InitiativeTracker';
import { TokenWidgetHUD } from './components/TokenWidgetHUD';
import { AudioSoundboard } from './components/AudioSoundboard';
import { soundFX } from './utils/sound';
import { spatialAudio } from './utils/audioManager';

const TERRAIN_PALETTE: { id: TerrainType; label: string; swatch: string; desc: string }[] = [
  { id: 'stone', label: 'Камень / Пол', swatch: '#1E293B', desc: 'Каменная кладка подземелья' },
  { id: 'dirt', label: 'Земля / Грязь', swatch: '#3A2718', desc: 'Тропы, пещеры и насыпи' },
  { id: 'grass', label: 'Лесная трава', swatch: '#14532D', desc: 'Поляны и дворы' },
  { id: 'wood', label: 'Дерево / Доски', swatch: '#451A03', desc: 'Таверны и помосты' },
  { id: 'water', label: 'Глубокая вода', swatch: '#0C4A6E', desc: 'Каналы, рвы и реки' },
  { id: 'void', label: 'Пропасть / Тьма', swatch: '#090D14', desc: 'Бездонная пустота' },
];

const LIGHT_COLORS: { label: string; color: string }[] = [
  { label: 'Огонь факела', color: '#F59E0B' },
  { label: 'Священный свет', color: '#38BDF8' },
  { label: 'Тайная магия', color: '#C084FC' },
  { label: 'Изумрудный свет', color: '#10B981' },
  { label: 'Багровый огонь', color: '#F43F5E' },
];

function getInitialClientId(): string {
  try {
    const existing = localStorage.getItem('obsidian_vtt_client_id');
    if (existing) return existing;
    const created = 'peer-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('obsidian_vtt_client_id', created);
    return created;
  } catch {
    return 'peer-' + Math.random().toString(36).substring(2, 9);
  }
}

function getInitialRoomFromUrl(): { roomId: string; roleFromUrl?: UserRole } {
  if (typeof window === 'undefined') return { roomId: 'OBSIDIAN-1' };
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room')?.trim().toUpperCase() || 'OBSIDIAN-1';
  const roleParam = params.get('role')?.toUpperCase();
  const roleFromUrl: UserRole | undefined =
    roleParam === 'PLAYER' ? 'PLAYER' : roleParam === 'GM' ? 'GM' : undefined;
  return { roomId: roomParam, roleFromUrl };
}

export default function App() {
  const initialUrlState = getInitialRoomFromUrl();

  const [mapData, setMapData] = useState<MapData>(() => structuredClone(PRESET_MAPS[0]));

  // Stage 4 & 5: Room, Role, Player identity & Combat State
  const [clientId] = useState<string>(getInitialClientId);
  const [roomId, setRoomId] = useState<string>(initialUrlState.roomId);
  const [roomInputCode, setRoomInputCode] = useState<string>(initialUrlState.roomId);
  const [playerName, setPlayerName] = useState<string>(() =>
    initialUrlState.roleFromUrl === 'PLAYER' ? 'Игрок (Герой)' : 'Мастер Подземелий'
  );
  const [role, setRole] = useState<UserRole>(() => initialUrlState.roleFromUrl || 'GM');
  const [gameMode, setGameMode] = useState<GameMode>(() =>
    initialUrlState.roleFromUrl === 'PLAYER' ? 'play' : 'edit'
  );
  const [gmKey, setGmKey] = useState<string>('');
  const [gmKeyInput, setGmKeyInput] = useState<string>('');
  const [assignedTokenId, setAssignedTokenId] = useState<string>('tok-kaelen');
  const [serverAntiCheatCulling, setServerAntiCheatCulling] = useState<boolean>(false);
  const [copiedInvite, setCopiedInvite] = useState<boolean>(false);
  const [showLobbyModal, setShowLobbyModal] = useState<boolean>(false);

  // Audio Engine State
  const [selectedAudioSourceId, setSelectedAudioSourceId] = useState<string | null>(null);
  const [showSoundboardModal, setShowSoundboardModal] = useState<boolean>(false);

  // Stage 5: Combat & Initiative State
  const [combat, setCombat] = useState<CombatState>({
    isActive: false,
    round: 1,
    currentTurnIndex: 0,
    combatants: [],
  });

  // Stage 5: Chat and Dice Log
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Navigation tab for right sidebar (strictly 4 single-line top-level tabs)
  const [activeNavTab, setActiveNavTab] = useState<
    'chat' | 'initiative' | 'tactics' | 'entities'
  >('chat');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);

  // Active token for 2D Raycasting Line-of-Sight
  const [activeTokenId, setActiveTokenId] = useState<string>('tok-kaelen');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>('tok-kaelen');
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [focusTokenTrigger, setFocusTokenTrigger] = useState<{
    tokenId: string;
    timestamp: number;
  } | null>(null);

  // Tools & Toggles
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [activeTerrain, setActiveTerrain] = useState<TerrainType>('stone');
  const [terrainBrushSize, setTerrainBrushSize] = useState<number>(1);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [snapTarget, setSnapTarget] = useState<SnapTarget>('all');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showGridCoords, setShowGridCoords] = useState<boolean>(true);
  const [showRayDebug, setShowRayDebug] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(0.85);

  // Stage 3 Fog of War & Party Vision State
  const [fogResetCounter, setFogResetCounter] = useState<number>(0);
  const [gmFogOpacity, setGmFogOpacity] = useState<number>(0.2);
  const [partyVision, setPartyVision] = useState<boolean>(true);
  const [fogBrushAction, setFogBrushAction] = useState<FogBrushAction>('reveal');
  const [fogBrushSize, setFogBrushSize] = useState<number>(3);
  const [monsterVisibilityMode, setMonsterVisibilityMode] =
    useState<MonsterVisibilityMode>('explored');

  // Live cursor telemetry
  const [cursorWorld, setCursorWorld] = useState<{
    col: number;
    row: number;
    x: number;
    y: number;
  }>({
    col: 6,
    row: 7,
    x: 300,
    y: 350,
  });

  // Stage 4 & 5 Real-time Multiplayer Entities
  const [peers, setPeers] = useState<ConnectedPeer[]>([]);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [remoteRulers, setRemoteRulers] = useState<RemoteRuler[]>([]);
  const [moveTrails, setMoveTrails] = useState<TokenMoveTrail[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);
  const lastCursorEmitRef = useRef<number>(0);

  // New Token Spawner Form
  const [newTokenName, setNewTokenName] = useState<string>('Скелет-Копейщик');
  const [newTokenInitials, setNewTokenInitials] = useState<string>('СК');
  const [newTokenFaction, setNewTokenFaction] = useState<TokenFaction>('monster');
  const [newTokenColor, setNewTokenColor] = useState<string>('#EF4444');
  const [newTokenVision, setNewTokenVision] = useState<number>(12);
  const [newTokenEmitsLight, setNewTokenEmitsLight] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const campaignJsonInputRef = useRef<HTMLInputElement>(null);

  // Connect to Socket.io backend with Stage 4 & 5 protocol
  useEffect(() => {
    const socket = io({
      query: {
        roomId: initialUrlState.roomId,
        clientId,
        playerName,
        role: initialUrlState.roleFromUrl || 'GM',
      },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('room:state', (state: RoomStatePayload) => {
      setRoomId(state.roomId);
      setRoomInputCode(state.roomId);
      setRole(state.yourRole);
      setGameMode(state.yourRole === 'GM' ? 'edit' : 'play');
      if (state.gmKey) {
        setGmKey(state.gmKey);
      }
      setServerAntiCheatCulling(state.serverAntiCheatCulling);
      if (state.assignedTokenId) {
        setAssignedTokenId(state.assignedTokenId);
        if (state.yourRole === 'PLAYER') {
          setActiveTokenId(state.assignedTokenId);
          setSelectedTokenId(state.assignedTokenId);
        }
      }
      setMapData(state.map);
      if (state.map.combat) {
        setCombat(state.map.combat);
      }
      if (state.messages) {
        setMessages(state.messages);
      }
      setPeers(state.peers);
    });

    socket.on('map:init', (serverMap: MapData) => {
      setMapData(serverMap);
      if (serverMap.combat) {
        setCombat(serverMap.combat);
      }
      setFogResetCounter((c) => c + 1);
    });

    socket.on('tokens:sync', (serverTokens: Token[]) => {
      setMapData((prev) => ({
        ...prev,
        tokens: serverTokens,
      }));
    });

    socket.on('peers:sync', (serverPeers: ConnectedPeer[]) => {
      setPeers(serverPeers);
    });

    socket.on('peer:token-assigned', (newTokenId: string) => {
      setAssignedTokenId(newTokenId);
      setActiveTokenId(newTokenId);
      setSelectedTokenId(newTokenId);
      soundFX.playPing();
    });

    socket.on(
      'token:moved',
      (payload: {
        id: string;
        x: number;
        y: number;
        fromX?: number;
        fromY?: number;
        isFinal?: boolean;
        moverColor?: string;
      }) => {
        setMapData((prev) => ({
          ...prev,
          tokens: prev.tokens.map((t) =>
            t.id === payload.id ? { ...t, x: payload.x, y: payload.y } : t
          ),
        }));

        if (
          payload.isFinal &&
          payload.fromX !== undefined &&
          payload.fromY !== undefined &&
          (payload.fromX !== payload.x || payload.fromY !== payload.y)
        ) {
          const distCells = Math.hypot(payload.x - payload.fromX, payload.y - payload.fromY);
          const feet = Math.round(distCells * 5);
          if (feet >= 5) {
            const trail: TokenMoveTrail = {
              tokenId: payload.id,
              fromX: payload.fromX,
              fromY: payload.fromY,
              toX: payload.x,
              toY: payload.y,
              feet,
              color: payload.moverColor || '#F59E0B',
              timestamp: Date.now(),
            };
            setMoveTrails((prev) => [...prev.slice(-12), trail]);
          }
        }
      }
    );

    socket.on('token:updated', (updated: Token) => {
      setMapData((prev) => ({
        ...prev,
        tokens: prev.tokens.map((t) => (t.id === updated.id ? updated : t)),
      }));
    });

    socket.on('token:created', (newToken: Token) => {
      setMapData((prev) => {
        if (prev.tokens.some((t) => t.id === newToken.id)) return prev;
        return { ...prev, tokens: [...prev.tokens, newToken] };
      });
    });

    socket.on('token:deleted', (tokenId: string) => {
      setMapData((prev) => ({
        ...prev,
        tokens: prev.tokens.filter((t) => t.id !== tokenId),
      }));
    });

    socket.on('wall:created', (wall: WallSegment) => {
      setMapData((prev) => {
        if (prev.walls.some((w) => w.id === wall.id)) return prev;
        return { ...prev, walls: [...prev.walls, wall] };
      });
    });

    socket.on('wall:door-toggled', (payload: { id: string; isOpen: boolean }) => {
      soundFX.playDoorToggle(payload.isOpen);
      setMapData((prev) => ({
        ...prev,
        walls: prev.walls.map((w) =>
          w.id === payload.id ? { ...w, isOpen: payload.isOpen } : w
        ),
      }));
    });

    socket.on('wall:deleted', (wallId: string) => {
      setMapData((prev) => ({
        ...prev,
        walls: prev.walls.filter((w) => w.id !== wallId),
      }));
    });

    socket.on('terrain:painted', (cells: { key: string; terrain: TerrainType }[]) => {
      setMapData((prev) => {
        const nextTerrain = { ...prev.terrain };
        for (const item of cells) {
          nextTerrain[item.key] = item.terrain;
        }
        return { ...prev, terrain: nextTerrain };
      });
    });

    socket.on('map:settings-updated', (settings: Partial<MapData>) => {
      setMapData((prev) => ({ ...prev, ...settings }));
    });

    socket.on('map:background-updated', (backgroundUrl: string | undefined) => {
      setMapData((prev) => ({ ...prev, backgroundUrl }));
    });

    socket.on('fog:cleared', () => {
      setMapData((prev) => ({ ...prev, fogStrokes: [] }));
      setFogResetCounter((c) => c + 1);
    });

    socket.on('fog:painted', (stroke: ManualFogStroke) => {
      setMapData((prev) => ({
        ...prev,
        fogStrokes: [...(prev.fogStrokes || []), stroke],
      }));
    });

    socket.on('map:pinged', (ping: MapPing) => {
      soundFX.playPing();
      setPings((prev) => [...prev.slice(-10), ping]);
    });

    socket.on(
      'cursor:moved',
      (payload: {
        peerId: string;
        name: string;
        color: string;
        role: UserRole;
        x: number;
        y: number;
      }) => {
        setPeers((prev) =>
          prev.map((p) =>
            p.id === payload.peerId ? { ...p, cursor: { x: payload.x, y: payload.y } } : p
          )
        );
      }
    );

    socket.on(
      'ruler:moved',
      (payload: {
        peerId: string;
        senderName: string;
        color: string;
        ruler: { start: Point; current: Point } | null;
      }) => {
        if (!payload.ruler) {
          setRemoteRulers((prev) => prev.filter((r) => r.peerId !== payload.peerId));
        } else {
          const rulerData = payload.ruler;
          setRemoteRulers((prev) => {
            const others = prev.filter((r) => r.peerId !== payload.peerId);
            return [
              ...others,
              {
                peerId: payload.peerId,
                senderName: payload.senderName,
                color: payload.color,
                start: rulerData.start,
                current: rulerData.current,
                updatedAt: Date.now(),
              },
            ];
          });
        }
      }
    );

    // Stage 5: Real-time Game Log & Dice Chat
    socket.on('chat:received', (msg: ChatMessage) => {
      if (msg.roll) {
        soundFX.playDiceRoll();
      }
      setMessages((prev) => [...prev, msg]);
    });

    // Stage 5: Combat & Initiative state sync
    socket.on('combat:updated', (newCombat: CombatState) => {
      setCombat(newCombat);
      setMapData((prev) => ({ ...prev, combat: newCombat }));
      if (newCombat.isActive && newCombat.combatants.length > 0) {
        const activeTokenId = newCombat.combatants[newCombat.currentTurnIndex]?.tokenId;
        if (activeTokenId) {
          setFocusTokenTrigger({ tokenId: activeTokenId, timestamp: Date.now() });
        }
      }
    });

    // Audio Engine: Spatial Audio, Global Music & One-Shot SFX
    socket.on('ambient:created', (source: PositionalAudioSource) => {
      setMapData((prev) => {
        const current = prev.audioSources || [];
        if (current.some((s) => s.id === source.id)) return prev;
        return { ...prev, audioSources: [...current, source] };
      });
    });

    socket.on('ambient:updated', (source: PositionalAudioSource) => {
      setMapData((prev) => {
        const current = prev.audioSources || [];
        return {
          ...prev,
          audioSources: current.map((s) => (s.id === source.id ? source : s)),
        };
      });
    });

    socket.on('ambient:deleted', (sourceId: string) => {
      setMapData((prev) => ({
        ...prev,
        audioSources: (prev.audioSources || []).filter((s) => s.id !== sourceId),
      }));
    });

    socket.on('music:updated', (musicState: GlobalMusicState) => {
      setMapData((prev) => ({ ...prev, globalMusic: musicState }));
      spatialAudio.updateGlobalMusic(musicState);
    });

    socket.on('sfx:played', (payload: { type: OneShotSfxType; volume?: number }) => {
      spatialAudio.unlockContext();
      spatialAudio.playOneShotSfx(payload.type, payload.volume || 1.0);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // REAL-TIME 2D SPATIAL AUDIO UPDATE LOOP (Acoustic Raycast & Wall Occlusion)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const cs = mapData.cellSize || 50;
    const heroToken =
      mapData.tokens.find((t) => t.id === assignedTokenId) ||
      mapData.tokens.find((t) => t.id === activeTokenId) ||
      mapData.tokens.find((t) => t.faction === 'player') ||
      mapData.tokens[0];

    const listenerPt: Point = heroToken
      ? {
          x: (heroToken.x + heroToken.size / 2) * cs,
          y: (heroToken.y + heroToken.size / 2) * cs,
        }
      : { x: (mapData.cols * cs) / 2, y: (mapData.rows * cs) / 2 };

    spatialAudio.updateSpatialSources(listenerPt, mapData.audioSources || [], mapData.walls);
  }, [
    mapData.audioSources,
    mapData.walls,
    mapData.tokens,
    assignedTokenId,
    activeTokenId,
    mapData.cellSize,
    mapData.cols,
    mapData.rows,
  ]);

  useEffect(() => {
    if (mapData.globalMusic) {
      spatialAudio.updateGlobalMusic(mapData.globalMusic);
    }
  }, [mapData.globalMusic]);

  // Keyboard shortcuts (V, W, D, E, T, R, P, F, M)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'v') setToolMode('select');
      else if (key === 'w' && gameMode === 'edit' && role === 'GM') setToolMode('wall');
      else if (key === 'd' && gameMode === 'edit' && role === 'GM') setToolMode('door');
      else if (key === 'e' && gameMode === 'edit' && role === 'GM') setToolMode('eraser');
      else if (key === 't') {
        // Hotkey 'T': Focus camera on assigned hero token!
        const targetId = assignedTokenId || activeTokenId;
        if (targetId) {
          setFocusTokenTrigger({ tokenId: targetId, timestamp: Date.now() });
          soundFX.playStep();
        }
      } else if (key === 'r') setToolMode('measure');
      else if (key === 'p') setToolMode('ping');
      else if (key === 'f' && gameMode === 'edit' && role === 'GM') setToolMode('fog_brush');
      else if (key === 'm') setShowSoundboardModal((s) => !s);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameMode, role, assignedTokenId, activeTokenId]);

  // Role & Mode Switcher handler
  const handleRoleAndModeSwitch = (targetRole: UserRole) => {
    setRole(targetRole);
    const nextMode: GameMode = targetRole === 'GM' ? 'edit' : 'play';
    setGameMode(nextMode);

    if (targetRole === 'PLAYER') {
      if (['wall', 'door', 'eraser', 'terrain', 'fog_brush'].includes(toolMode)) {
        setToolMode('select');
      }
      const hero =
        mapData.tokens.find((t) => t.id === assignedTokenId) ||
        mapData.tokens.find((t) => t.faction === 'player');
      if (hero) {
        setActiveTokenId(hero.id);
        setSelectedTokenId(hero.id);
      }
      setSelectedWallId(null);
    }

    socketRef.current?.emit('peer:update', {
      role: targetRole,
      name:
        playerName === 'Мастер Подземелий' && targetRole === 'PLAYER'
          ? 'Игрок (Герой)'
          : playerName === 'Игрок (Герой)' && targetRole === 'GM'
          ? 'Мастер Подземелий'
          : playerName,
    });
  };

  // Join or Create a Room
  const handleJoinRoom = (e?: React.FormEvent, customRoomCode?: string, customRole?: UserRole) => {
    if (e) e.preventDefault();
    const targetRoom = (customRoomCode || roomInputCode || 'OBSIDIAN-1').trim().toUpperCase();
    const targetRole = customRole || role;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', targetRoom);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore URL update errors in sandboxed iframes
    }

    socketRef.current?.emit('room:join', {
      roomId: targetRoom,
      clientId,
      playerName: playerName.trim() || (targetRole === 'GM' ? 'Мастер (GM)' : 'Игрок'),
      preferredRole: targetRole,
      gmKey: gmKeyInput.trim() || gmKey || undefined,
      assignedTokenId,
    });
    setShowLobbyModal(false);
  };

  const handleCreateNewRandomRoom = () => {
    const randomCode = 'DND-' + Math.floor(1000 + Math.random() * 9000);
    setRoomInputCode(randomCode);
    handleJoinRoom(undefined, randomCode, 'GM');
  };

  const handleCopyInviteLink = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      url.searchParams.set('role', 'PLAYER');
      navigator.clipboard.writeText(url.toString());
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    } catch {
      navigator.clipboard?.writeText(roomId);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    }
  };

  // Token Movement Handler
  const handleMoveToken = useCallback(
    (
      tokenId: string,
      x: number,
      y: number,
      isFinal: boolean,
      fromX?: number,
      fromY?: number
    ) => {
      setMapData((prev) => ({
        ...prev,
        tokens: prev.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)),
      }));

      if (
        isFinal &&
        fromX !== undefined &&
        fromY !== undefined &&
        (fromX !== x || fromY !== y)
      ) {
        const distCells = Math.hypot(x - fromX, y - fromY);
        const feet = Math.round(distCells * 5);
        if (feet >= 5) {
          setMoveTrails((prev) => [
            ...prev.slice(-12),
            {
              tokenId,
              fromX,
              fromY,
              toX: x,
              toY: y,
              feet,
              color: '#F59E0B',
              timestamp: Date.now(),
            },
          ]);
        }
      }

      if (isFinal || Math.random() < 0.35) {
        socketRef.current?.emit('token:move', { id: tokenId, x, y, fromX, fromY, isFinal });
      }
    },
    []
  );

  const handleUpdateToken = (updated: Token) => {
    setMapData((prev) => ({
      ...prev,
      tokens: prev.tokens.map((t) => (t.id === updated.id ? updated : t)),
    }));
    socketRef.current?.emit('token:update', updated);
  };

  const handleSpawnToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'GM' || !newTokenName.trim()) return;
    const newTok: Token = {
      id: `tok-${Date.now()}`,
      name: newTokenName.trim(),
      initials: (newTokenInitials.trim() || newTokenName.slice(0, 2)).toUpperCase(),
      x: 6,
      y: 7,
      size: 1,
      color: newTokenColor,
      faction: newTokenFaction,
      visionRadius: newTokenVision,
      hasDarkvision: true,
      emitsLight: newTokenEmitsLight,
      brightLightRadius: 4,
      dimLightRadius: 8,
      lightColor: '#F59E0B',
      hp: newTokenFaction === 'player' ? 40 : 25,
      maxHp: newTokenFaction === 'player' ? 40 : 25,
      ac: 15,
      isHiddenByGM: false,
    };
    setMapData((prev) => ({ ...prev, tokens: [...prev.tokens, newTok] }));
    socketRef.current?.emit('token:create', newTok);
    setSelectedTokenId(newTok.id);
    if (newTok.faction === 'player') {
      setActiveTokenId(newTok.id);
    }
    soundFX.playStep();
  };

  const handleDeleteToken = (tokenId: string) => {
    if (role !== 'GM') return;
    setMapData((prev) => ({
      ...prev,
      tokens: prev.tokens.filter((t) => t.id !== tokenId),
    }));
    socketRef.current?.emit('token:delete', tokenId);
    if (selectedTokenId === tokenId) setSelectedTokenId(null);
  };

  // Wall / Door Handlers
  const handleCreateWall = useCallback((wall: WallSegment) => {
    setMapData((prev) => ({ ...prev, walls: [...prev.walls, wall] }));
    socketRef.current?.emit('wall:create', wall);
  }, []);

  const handleToggleDoor = useCallback((wallId: string) => {
    setMapData((prev) => ({
      ...prev,
      walls: prev.walls.map((w) =>
        w.id === wallId && w.type === 'door' ? { ...w, isOpen: !w.isOpen } : w
      ),
    }));
    socketRef.current?.emit('wall:toggle-door', wallId);
  }, []);

  const handleDeleteWall = useCallback((wallId: string) => {
    setMapData((prev) => ({
      ...prev,
      walls: prev.walls.filter((w) => w.id !== wallId),
    }));
    socketRef.current?.emit('wall:delete', wallId);
  }, []);

  // Terrain Paint Handler
  const handlePaintTerrain = useCallback((cells: { key: string; terrain: TerrainType }[]) => {
    setMapData((prev) => {
      const nextTerrain = { ...prev.terrain };
      for (const c of cells) {
        nextTerrain[c.key] = c.terrain;
      }
      return { ...prev, terrain: nextTerrain };
    });
    socketRef.current?.emit('terrain:paint', cells);
  }, []);

  const handleFillAllTerrain = (type: TerrainType) => {
    if (role !== 'GM') return;
    const updatedTerrain: Record<string, TerrainType> = {};
    const cellsPayload: { key: string; terrain: TerrainType }[] = [];
    for (let r = 0; r < mapData.rows; r++) {
      for (let c = 0; c < mapData.cols; c++) {
        const key = `${c},${r}`;
        updatedTerrain[key] = type;
        cellsPayload.push({ key, terrain: type });
      }
    }
    setMapData((prev) => ({ ...prev, terrain: updatedTerrain }));
    socketRef.current?.emit('terrain:paint', cellsPayload);
  };

  // Manual Fog Paint socket emitter
  const handleManualFogPaint = useCallback(
    (action: FogBrushAction, x: number, y: number, radiusPx: number) => {
      socketRef.current?.emit('fog:paint', { action, x, y, radiusPx });
    },
    []
  );

  // Tactical Map Ping emitter
  const handleEmitPing = useCallback((pt: Point) => {
    socketRef.current?.emit('map:ping', pt);
  }, []);

  // Live Ruler emitter
  const handleEmitRuler = useCallback((ruler: { start: Point; current: Point } | null) => {
    socketRef.current?.emit('ruler:move', ruler);
  }, []);

  // Stage 5: Dice Roll & Chat Message Emitter
  const handleSendChatMessage = useCallback((msg: ChatMessage) => {
    socketRef.current?.emit('chat:message', msg);
  }, []);

  const handleQuickDiceRoll = useCallback(
    (rollResult: DiceRollResult) => {
      handleSendChatMessage({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderName: playerName,
        senderRole: role,
        senderColor: '#F59E0B',
        roll: rollResult,
        isSecretGm: rollResult.isSecretGm,
        timestamp: Date.now(),
      });
    },
    [handleSendChatMessage, playerName, role]
  );

  // Stage 5: Combat & Initiative state sync
  const handleUpdateCombat = useCallback((newCombat: CombatState) => {
    setCombat(newCombat);
    setMapData((prev) => {
      let updatedMusic = prev.globalMusic;
      // Auto-crossfade into combat music when combat starts, back to ambient when combat ends
      if (newCombat.isActive && !prev.combat?.isActive) {
        updatedMusic = {
          currentTrack: 'combat_epic',
          isPlaying: true,
          volume: 0.55,
          isCombatMode: true,
        };
        socketRef.current?.emit('music:update', updatedMusic);
      } else if (!newCombat.isActive && prev.combat?.isActive) {
        updatedMusic = {
          currentTrack: 'ambient_dungeon',
          isPlaying: true,
          volume: 0.4,
          isCombatMode: false,
        };
        socketRef.current?.emit('music:update', updatedMusic);
      }
      return { ...prev, combat: newCombat, globalMusic: updatedMusic };
    });
    socketRef.current?.emit('combat:update', newCombat);
  }, []);

  // Audio Engine: Positional Audio Sources & Global Music Handlers
  const handleCreateAudioSource = useCallback(
    (preset: AmbientSoundPreset = 'campfire', atX?: number, atY?: number) => {
      if (role !== 'GM') return;
      const cs = mapData.cellSize || 50;
      const defaultX = atX ?? Math.round((mapData.cols * cs) / 2);
      const defaultY = atY ?? Math.round((mapData.rows * cs) / 2);

      const newSource: PositionalAudioSource = {
        id: `snd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name:
          preset === 'campfire'
            ? 'Костер'
            : preset === 'water_stream'
            ? 'Водопад'
            : preset === 'dungeon_drone'
            ? 'Гул крипты'
            : preset === 'arcane_hum'
            ? 'Магический алтарь'
            : preset === 'wind_whisper'
            ? 'Шум ветра'
            : preset === 'tavern_crowd'
            ? 'Шум таверны'
            : 'Источник звука',
        x: defaultX,
        y: defaultY,
        preset,
        volume: 0.8,
        minDistance: 80,
        maxDistance: 450,
        loop: true,
        isPlaying: true,
        color:
          preset === 'campfire'
            ? '#F59E0B'
            : preset === 'water_stream'
            ? '#38BDF8'
            : preset === 'arcane_hum'
            ? '#C084FC'
            : '#10B981',
      };

      setMapData((prev) => ({
        ...prev,
        audioSources: [...(prev.audioSources || []), newSource],
      }));
      setSelectedAudioSourceId(newSource.id);
      setShowSoundboardModal(true);
      socketRef.current?.emit('ambient:create', newSource);
      soundFX.playStep();
    },
    [role, mapData.cellSize, mapData.cols, mapData.rows]
  );

  const handleUpdateAudioSource = useCallback(
    (updated: PositionalAudioSource) => {
      setMapData((prev) => ({
        ...prev,
        audioSources: (prev.audioSources || []).map((s) => (s.id === updated.id ? updated : s)),
      }));
      socketRef.current?.emit('ambient:update', updated);
    },
    []
  );

  const handleDeleteAudioSource = useCallback(
    (id: string) => {
      if (role !== 'GM') return;
      setMapData((prev) => ({
        ...prev,
        audioSources: (prev.audioSources || []).filter((s) => s.id !== id),
      }));
      if (selectedAudioSourceId === id) setSelectedAudioSourceId(null);
      socketRef.current?.emit('ambient:delete', id);
    },
    [role, selectedAudioSourceId]
  );

  const handleMoveAudioSource = useCallback(
    (id: string, x: number, y: number) => {
      setMapData((prev) => ({
        ...prev,
        audioSources: (prev.audioSources || []).map((s) => (s.id === id ? { ...s, x, y } : s)),
      }));
      const found = (mapData.audioSources || []).find((s) => s.id === id);
      if (found) {
        socketRef.current?.emit('ambient:update', { ...found, x, y });
      }
    },
    [mapData.audioSources]
  );

  const handleUpdateGlobalMusic = useCallback(
    (musicState: GlobalMusicState) => {
      setMapData((prev) => ({ ...prev, globalMusic: musicState }));
      socketRef.current?.emit('music:update', musicState);
    },
    []
  );

  const handleBroadcastSfx = useCallback(
    (type: OneShotSfxType) => {
      socketRef.current?.emit('sfx:broadcast', { type, volume: 1.0 });
    },
    []
  );

  // Campaign Export / Import JSON
  const handleExportCampaignJson = () => {
    const dataStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obsidian-vtt-${roomId.toLowerCase()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCampaignJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as MapData;
        if (parsed && parsed.cols && parsed.rows && Array.isArray(parsed.walls)) {
          setMapData(parsed);
          if (parsed.combat) setCombat(parsed.combat);
          socketRef.current?.emit('map:import', parsed);
          setFogResetCounter((c) => c + 1);
        }
      } catch {
        // Ignore invalid JSON
      }
    };
    reader.readAsText(file);
  };

  // Background Image Upload & Calibration
  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const initialConfig: MapBackgroundConfig = {
        url: dataUrl,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        opacity: 1,
      };
      setMapData((prev) => ({
        ...prev,
        backgroundUrl: dataUrl,
        backgroundConfig: initialConfig,
      }));
      socketRef.current?.emit('map:background', dataUrl);
      socketRef.current?.emit('map:update-settings', { backgroundConfig: initialConfig });
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateBackgroundConfig = (partial: Partial<MapBackgroundConfig>) => {
    const current = mapData.backgroundConfig || {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 1,
      url: mapData.backgroundUrl,
    };
    const nextConfig: MapBackgroundConfig = { ...current, ...partial };
    setMapData((prev) => ({ ...prev, backgroundConfig: nextConfig }));
    socketRef.current?.emit('map:update-settings', { backgroundConfig: nextConfig });
  };

  const handleCellSizeChange = (newSize: number) => {
    const validSize = Math.max(30, Math.min(100, newSize));
    setMapData((prev) => ({ ...prev, cellSize: validSize }));
    socketRef.current?.emit('map:update-settings', { cellSize: validSize });
  };

  const selectedToken = mapData.tokens.find((t) => t.id === selectedTokenId) || null;
  const selectedWall = mapData.walls.find((w) => w.id === selectedWallId) || null;
  const activeVisionToken =
    mapData.tokens.find((t) => t.id === activeTokenId) || mapData.tokens[0];
  const assignedTokenObj = mapData.tokens.find((t) => t.id === assignedTokenId);

  const colLetter = String.fromCharCode(65 + (cursorWorld.col % 26));

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0F17] text-slate-100 overflow-hidden font-sans">
      {/* 
        TOP BAR CONTRACT:
        Zone 1 (Wordmark) — Zone 2 (4 Single-line Navigation Tabs) — Zone 3 (Network & Role Actions)
      */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#0E131F] border-b border-slate-800/80 shrink-0 z-20">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-4">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveNavTab('chat');
              setIsRightPanelOpen(true);
            }}
            className="font-display text-lg font-bold tracking-wide text-amber-400 whitespace-nowrap"
          >
            Obsidian Table VTT
          </a>
        </div>

        {/* Zone 2: Navigation Links (Strictly 4 single-line tabs) */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            onClick={() => {
              setActiveNavTab('chat');
              setIsRightPanelOpen(true);
            }}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeNavTab === 'chat' && isRightPanelOpen
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Чат и Кубики
          </button>
          <button
            onClick={() => {
              setActiveNavTab('initiative');
              setIsRightPanelOpen(true);
            }}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeNavTab === 'initiative' && isRightPanelOpen
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Инициатива {combat.isActive ? `(Р.${combat.round})` : ''}
          </button>
          <button
            onClick={() => {
              setActiveNavTab('tactics');
              setIsRightPanelOpen(true);
            }}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeNavTab === 'tactics' && isRightPanelOpen
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Туман и Стены
          </button>
          <button
            onClick={() => {
              setActiveNavTab('entities');
              setIsRightPanelOpen(true);
            }}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeNavTab === 'entities' && isRightPanelOpen
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Карта и Токены ({mapData.tokens.length})
          </button>
        </nav>

        {/* Zone 3: Actions (Role Switcher & Room Lobby modal trigger) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              onClick={() => handleRoleAndModeSwitch('PLAYER')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                role === 'PLAYER'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Игрок
            </button>
            <button
              onClick={() => handleRoleAndModeSwitch('GM')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                role === 'GM'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Мастер
            </button>
          </div>

          <button
            onClick={() => setShowLobbyModal(true)}
            title="Открыть настройки комнаты и инвайт-ссылку"
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400' : 'bg-rose-500'
              }`}
            />
            Комната: {roomId}
          </button>

          <button
            onClick={() => setIsRightPanelOpen((o) => !o)}
            title={isRightPanelOpen ? 'Свернуть боковую панель' : 'Развернуть боковую панель'}
            className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg"
          >
            {isRightPanelOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Left Tool Dock */}
        <aside className="flex flex-col justify-between w-16 bg-[#0E131F] border-r border-slate-800/80 py-4 px-2 shrink-0 z-10">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setToolMode('select')}
              title="Выбор / Перемещение токенов / Открытие дверей (Клавиша V)"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                toolMode === 'select'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <MousePointer className="w-5 h-5" />
            </button>

            <button
              onClick={() => setToolMode('pan')}
              title="Панорамирование камеры (Пробел + ЛКМ или Средняя кнопка мыши)"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                toolMode === 'pan'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Hand className="w-5 h-5" />
            </button>

            <button
              onClick={() => setToolMode('measure')}
              title="Тактическая линейка расстояния D&D 5e (Клавиша R)"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                toolMode === 'measure'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Ruler className="w-5 h-5" />
            </button>

            <button
              onClick={() => setToolMode('ping')}
              title="Тактический Пинг внимания на карте (Клавиша P или Alt + ЛКМ)"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                toolMode === 'ping'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <MapPin className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                const targetId = assignedTokenId || activeTokenId;
                if (targetId) {
                  setFocusTokenTrigger({ tokenId: targetId, timestamp: Date.now() });
                  soundFX.playStep();
                }
              }}
              title="Центрировать камеру на своем герое (Клавиша T)"
              className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800/80 hover:text-amber-400 transition-colors"
            >
              <Compass className="w-5 h-5" />
            </button>

            <div className="w-8 h-px bg-slate-800 my-1" />

            {/* GM Construction Tools */}
            <button
              disabled={role !== 'GM'}
              onClick={() => {
                setToolMode('fog_brush');
                setActiveNavTab('tactics');
                setIsRightPanelOpen(true);
              }}
              title={
                role === 'GM'
                  ? 'Кисть тумана: раскрыть или скрыть область вручную (Клавиша F)'
                  : 'Доступно только Мастеру (GM)'
              }
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                role !== 'GM'
                  ? 'opacity-25 cursor-not-allowed text-slate-600'
                  : toolMode === 'fog_brush'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Sun className="w-5 h-5" />
            </button>

            <button
              disabled={role !== 'GM'}
              onClick={() => {
                setToolMode('wall');
                setActiveNavTab('tactics');
                setIsRightPanelOpen(true);
              }}
              title={
                role === 'GM'
                  ? 'Чертить сплошные стены (Клавиша W)'
                  : 'Доступно только Мастеру (GM)'
              }
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                role !== 'GM'
                  ? 'opacity-25 cursor-not-allowed text-slate-600'
                  : toolMode === 'wall'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Shield className="w-5 h-5" />
            </button>

            <button
              disabled={role !== 'GM'}
              onClick={() => {
                setToolMode('door');
                setActiveNavTab('tactics');
                setIsRightPanelOpen(true);
              }}
              title={
                role === 'GM'
                  ? 'Добавить интерактивную дверь (Клавиша D)'
                  : 'Доступно только Мастеру (GM)'
              }
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                role !== 'GM'
                  ? 'opacity-25 cursor-not-allowed text-slate-600'
                  : toolMode === 'door'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <DoorOpen className="w-5 h-5" />
            </button>

            <button
              disabled={role !== 'GM'}
              onClick={() => {
                setToolMode('eraser');
                setActiveNavTab('tactics');
                setIsRightPanelOpen(true);
              }}
              title={
                role === 'GM'
                  ? 'Ластик стен и дверей (Клавиша E)'
                  : 'Доступно только Мастеру (GM)'
              }
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                role !== 'GM'
                  ? 'opacity-25 cursor-not-allowed text-slate-600'
                  : toolMode === 'eraser'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Eraser className="w-5 h-5" />
            </button>

            <button
              disabled={role !== 'GM'}
              onClick={() => {
                setToolMode('terrain');
                setActiveNavTab('entities');
                setIsRightPanelOpen(true);
              }}
              title={
                role === 'GM'
                  ? 'Кисть тирейна (Клавиша T)'
                  : 'Доступно только Мастеру (GM)'
              }
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                role !== 'GM'
                  ? 'opacity-25 cursor-not-allowed text-slate-600'
                  : toolMode === 'terrain'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Layers className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Toggles */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setShowGrid((g) => !g)}
              title={showGrid ? 'Скрыть сетку' : 'Показать сетку'}
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                showGrid
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-500 hover:bg-slate-800/80 hover:text-slate-300'
              }`}
            >
              <Grid className="w-5 h-5" />
            </button>

            <button
              onClick={() => setSnapToGrid((s) => !s)}
              title={snapToGrid ? 'Привязка включена' : 'Привязка отключена'}
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                snapToGrid
                  ? 'bg-slate-800 text-amber-400'
                  : 'text-slate-500 hover:bg-slate-800/80 hover:text-slate-300'
              }`}
            >
              <Move className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowRayDebug((d) => !d)}
              title="Лучи 2D Raycasting (Отладка)"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                showRayDebug
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <Eye className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                soundFX.enabled = next;
              }}
              title="Звуковые эффекты виртуального стола"
              className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          </div>
        </aside>

        {/* Center Tactical Canvas Viewport */}
        <div className="relative flex flex-col flex-1 min-w-0 h-full">
          <VTTCanvas
            mapData={mapData}
            role={role}
            gameMode={gameMode}
            yourClientId={clientId}
            assignedTokenId={assignedTokenId}
            activeTokenId={activeTokenId}
            selectedTokenId={selectedTokenId}
            selectedWallId={selectedWallId}
            focusTokenTrigger={focusTokenTrigger}
            toolMode={toolMode}
            activeTerrain={activeTerrain}
            terrainBrushSize={terrainBrushSize}
            snapToGrid={snapToGrid}
            snapTarget={snapTarget}
            showGrid={showGrid}
            showGridCoords={showGridCoords}
            showRayDebug={showRayDebug}
            fogResetCounter={fogResetCounter}
            gmFogOpacity={gmFogOpacity}
            partyVision={partyVision}
            fogBrushAction={fogBrushAction}
            fogBrushSize={fogBrushSize}
            monsterVisibilityMode={monsterVisibilityMode}
            peers={peers}
            pings={pings}
            remoteRulers={remoteRulers}
            moveTrails={moveTrails}
            onSelectToken={setSelectedTokenId}
            onSelectWall={setSelectedWallId}
            onActivateVisionToken={setActiveTokenId}
            onMoveToken={handleMoveToken}
            onCreateWall={handleCreateWall}
            onToggleDoor={handleToggleDoor}
            onDeleteWall={handleDeleteWall}
            onPaintTerrain={handlePaintTerrain}
            onManualFogPaint={handleManualFogPaint}
            onEmitPing={handleEmitPing}
            onEmitRuler={handleEmitRuler}
            onCursorWorldMove={(pt, cell) => {
              setCursorWorld({
                col: cell.col,
                row: cell.row,
                x: Math.round(pt.x),
                y: Math.round(pt.y),
              });
              const now = Date.now();
              if (now - lastCursorEmitRef.current > 65) {
                lastCursorEmitRef.current = now;
                socketRef.current?.emit('cursor:move', {
                  x: Math.round(pt.x),
                  y: Math.round(pt.y),
                });
              }
            }}
            zoom={zoom}
            onZoomChange={setZoom}
          />

          {/* Floating Selected Token Widget HUD */}
          {selectedToken && (
            <div className="absolute top-4 left-4 z-20">
              <TokenWidgetHUD
                token={selectedToken}
                role={role}
                isOwnerOrGM={
                  role === 'GM' ||
                  selectedToken.id === assignedTokenId ||
                  selectedToken.faction === 'player'
                }
                onUpdateToken={handleUpdateToken}
                onClose={() => setSelectedTokenId(null)}
                onRollDice={(formula, reason) => {
                  soundFX.playDiceRoll();
                  const roll = {
                    id: `roll-${Date.now()}`,
                    senderName: playerName,
                    senderRole: role,
                    senderColor: selectedToken.color,
                    formula,
                    rollType: 'normal' as const,
                    diceResults: [Math.floor(Math.random() * 20) + 1],
                    keptDice: [Math.floor(Math.random() * 20) + 1],
                    modifier: 0,
                    total: Math.floor(Math.random() * 20) + 1,
                    isNat20: false,
                    isNat1: false,
                    isSecretGm: role === 'GM',
                    timestamp: Date.now(),
                    reason,
                  };
                  handleSendChatMessage({
                    id: `msg-${Date.now()}`,
                    senderName: playerName,
                    senderRole: role,
                    senderColor: selectedToken.color,
                    roll,
                    isSecretGm: role === 'GM',
                    timestamp: Date.now(),
                  });
                }}
              />
            </div>
          )}

          {/* Quick Dice Bar at canvas bottom */}
          <QuickDiceBar
            playerName={playerName}
            role={role}
            playerColor={
              peers.find((p) => p.clientId === clientId)?.color || '#F59E0B'
            }
            onRoll={handleQuickDiceRoll}
          />

          {/* Bottom Telemetry & Status Bar */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#0A0D15] border-t border-slate-800/80 text-[11px] text-slate-400 shrink-0">
            <div className="flex items-center gap-2 font-mono-tabular overflow-x-auto">
              <span className="text-slate-200 font-medium">{mapData.name}</span>
              <span aria-hidden="true">·</span>
              <span>
                Клетка: {colLetter}
                {cursorWorld.row + 1} ({cursorWorld.x}, {cursorWorld.y} px)
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Ваш герой:{' '}
                <strong className="text-emerald-400">
                  {assignedTokenObj?.name || 'Не назначен'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">
                Горячие клавиши: <kbd className="text-amber-400">T</kbd> герой,{' '}
                <kbd className="text-amber-400">R</kbd> линейка,{' '}
                <kbd className="text-amber-400">P</kbd> пинг
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md px-1.5 py-0.5 font-mono-tabular">
                <button
                  onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))))}
                  className="p-0.5 hover:text-slate-100 transition-colors"
                  title="Отдалить"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="px-1.5 text-slate-200">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
                  className="p-0.5 hover:text-slate-100 transition-colors"
                  title="Приблизить"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Collapsible Inspector & Tool Panel */}
        {isRightPanelOpen && (
          <aside className="w-88 bg-[#0E131F] border-l border-slate-800/80 flex flex-col h-full shrink-0 overflow-hidden">
            {/* TAB 1: Чат и Лог бросков кубиков */}
            {activeNavTab === 'chat' && (
              <DiceChatPanel
                messages={messages}
                playerName={playerName}
                playerColor={
                  peers.find((p) => p.clientId === clientId)?.color || '#F59E0B'
                }
                role={role}
                onSendMessage={handleSendChatMessage}
                onClearMessages={() => setMessages([])}
              />
            )}

            {/* TAB 2: Инициатива и Бой */}
            {activeNavTab === 'initiative' && (
              <InitiativeTracker
                combat={combat}
                tokens={mapData.tokens}
                role={role}
                onUpdateCombat={handleUpdateCombat}
                onFocusToken={(tokId) => {
                  setFocusTokenTrigger({ tokenId: tokId, timestamp: Date.now() });
                  setSelectedTokenId(tokId);
                }}
              />
            )}

            {/* TAB 3: Туман и Стены (Tactics) */}
            {activeNavTab === 'tactics' && (
              <div className="p-5 space-y-6 overflow-y-auto h-full">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-100">
                    Туман Войны, Свет и Стены
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Настройки 2D Raycasting, объединения обзора отряда и сетки.
                  </p>
                </div>

                {/* Party Vision Toggle */}
                <div className="space-y-3 pt-4 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">
                      Объединение обзора (Party Vision)
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={partyVision}
                        onChange={(e) => setPartyVision(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {partyVision
                      ? 'Суммирует полигоны обзора всех героев в единое поле видимости группы.'
                      : 'Отображает обзор только выбранного персонажа.'}
                  </p>
                </div>

                {/* Fog Density Slider for GM */}
                {role === 'GM' && (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-300">
                        Туман для Мастера: {Math.round(gmFogOpacity * 100)}%
                      </h3>
                      <button
                        onClick={() => {
                          setFogResetCounter((c) => c + 1);
                          socketRef.current?.emit('fog:reset');
                        }}
                        className="text-[11px] text-amber-400 hover:underline"
                      >
                        Сбросить память
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.9}
                      step={0.05}
                      value={gmFogOpacity}
                      onChange={(e) => setGmFogOpacity(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                )}

                {/* HP Visibility Setting */}
                {role === 'GM' && (
                  <div className="space-y-2 pt-4 border-t border-slate-800/80">
                    <h3 className="text-xs font-semibold text-slate-300">
                      Видимость HP врагов для игроков
                    </h3>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
                      {(['exact', 'bar_only', 'hidden'] as HpVisibilityMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setMapData((prev) => ({ ...prev, hpVisibility: mode }));
                            socketRef.current?.emit('map:update-settings', { hpVisibility: mode });
                          }}
                          className={`py-1 text-[11px] font-medium rounded transition-colors ${
                            (mapData.hpVisibility || 'bar_only') === mode
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {mode === 'exact'
                            ? 'Точные цифры'
                            : mode === 'bar_only'
                            ? 'Только шкала'
                            : 'Скрыть'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grid & Wall Tools */}
                <div className="space-y-3 pt-4 border-t border-slate-800/80">
                  <h3 className="text-xs font-semibold text-slate-300">Сетка и Стены</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Клетка D&D</span>
                      <span className="font-mono-tabular text-amber-400">
                        {mapData.cellSize}x{mapData.cellSize} px (5 фт.)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={100}
                      step={5}
                      disabled={role !== 'GM'}
                      value={mapData.cellSize}
                      onChange={(e) => handleCellSizeChange(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  {role === 'GM' && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={() => setToolMode('wall')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left ${
                          toolMode === 'wall'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        Стена (W)
                      </button>
                      <button
                        onClick={() => setToolMode('door')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left ${
                          toolMode === 'door'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        Дверь (D)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: Карта и Токены (Entities & Map) */}
            {activeNavTab === 'entities' && (
              <div className="p-5 space-y-6 overflow-y-auto h-full">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-100">
                    Карта, Бестиарий и Токены
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Управление токенами, сохранение кампании и импорт карты.
                  </p>
                </div>

                {/* Campaign JSON Save / Load */}
                <div className="space-y-3 pt-4 border-t border-slate-800/80">
                  <h3 className="text-xs font-semibold text-slate-300">
                    Сохранение и Загрузка кампании (JSON)
                  </h3>
                  <input
                    ref={campaignJsonInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportCampaignJson}
                    className="hidden"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleExportCampaignJson}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      Экспорт JSON
                    </button>
                    <button
                      disabled={role !== 'GM'}
                      onClick={() => campaignJsonInputRef.current?.click()}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        role === 'GM'
                          ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                          : 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-sky-400" />
                      Импорт JSON
                    </button>
                  </div>
                </div>

                {/* GM Token Spawner */}
                {role === 'GM' && (
                  <form
                    onSubmit={handleSpawnToken}
                    className="space-y-3 pt-4 border-t border-slate-800/80"
                  >
                    <h3 className="text-xs font-semibold text-slate-300">Создать токен</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder="Имя"
                        className="col-span-2 px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        maxLength={3}
                        value={newTokenInitials}
                        onChange={(e) => setNewTokenInitials(e.target.value)}
                        placeholder="Иниц."
                        className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono-tabular uppercase focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={newTokenFaction}
                        onChange={(e) => {
                          const fac = e.target.value as TokenFaction;
                          setNewTokenFaction(fac);
                          setNewTokenColor(fac === 'player' ? '#10B981' : '#EF4444');
                        }}
                        className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                      >
                        <option value="player">Герой (Игрок)</option>
                        <option value="monster">Монстр (Враг)</option>
                      </select>

                      <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg">
                        <span className="text-xs text-slate-400">Цвет:</span>
                        <input
                          type="color"
                          value={newTokenColor}
                          onChange={(e) => setNewTokenColor(e.target.value)}
                          className="w-6 h-5 bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      Разместить на поле
                    </button>
                  </form>
                )}

                {/* Token Roster */}
                <div className="space-y-2 pt-4 border-t border-slate-800/80">
                  <h3 className="text-xs font-semibold text-slate-300">
                    Токены на карте ({mapData.tokens.length})
                  </h3>
                  <div className="space-y-1.5">
                    {mapData.tokens.map((tok) => (
                      <div
                        key={tok.id}
                        onClick={() => {
                          setSelectedTokenId(tok.id);
                          if (role === 'GM' || tok.faction === 'player') {
                            setActiveTokenId(tok.id);
                          }
                          setFocusTokenTrigger({ tokenId: tok.id, timestamp: Date.now() });
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                          selectedTokenId === tok.id
                            ? 'bg-slate-800 border-amber-500/60 text-slate-100'
                            : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: tok.color }}
                          >
                            {tok.initials}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium truncate flex items-center gap-1.5">
                              <span>{tok.name}</span>
                              {tok.emitsLight && <Flame className="w-3 h-3 text-amber-400" />}
                              {tok.isHiddenByGM && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-purple-950 text-purple-300 border border-purple-700/60 rounded">
                                  Скрыт
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono-tabular">
                              {tok.faction === 'player' ? 'Герой' : 'Монстр'} · HP {tok.hp}/
                              {tok.maxHp} · AC {tok.ac}
                            </div>
                          </div>
                        </div>

                        {role === 'GM' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateToken({
                                  ...tok,
                                  isHiddenByGM: !tok.isHiddenByGM,
                                });
                              }}
                              className={`p-1 rounded transition-colors ${
                                tok.isHiddenByGM
                                  ? 'text-purple-400 bg-purple-950/60'
                                  : 'text-slate-500 hover:text-slate-200'
                              }`}
                              title={
                                tok.isHiddenByGM
                                  ? 'Токен скрыт от игроков (клик для раскрытия)'
                                  : 'Скрыть токен от игроков на сервере (Stealth)'
                              }
                            >
                              {tok.isHiddenByGM ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteToken(tok.id);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Battlemap Upload (GM Only) */}
                {role === 'GM' && (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <h3 className="text-xs font-semibold text-slate-300">Фон карты (Battlemap)</h3>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleBackgroundUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ImageIcon className="w-4 h-4 text-amber-400" />
                      Загрузить battlemap изображение
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Stage 4 & 5 Multiplayer Room / Lobby Modal */}
      {showLobbyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0E131F] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-amber-400">
                  Игровое Лобби VTT
                </h2>
                <p className="text-xs text-slate-400">
                  Подключение к комнате, приглашение игроков и выбор роли
                </p>
              </div>
              <button
                onClick={() => setShowLobbyModal(false)}
                className="text-xs text-slate-400 hover:text-slate-100 px-2 py-1"
              >
                Закрыть
              </button>
            </div>

            <form onSubmit={(e) => handleJoinRoom(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Код игровой комнаты:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomInputCode}
                    onChange={(e) => setRoomInputCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 text-sm font-mono-tabular uppercase bg-slate-900 border border-slate-700 rounded-lg text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                    placeholder="OBSIDIAN-1"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewRandomRoom}
                    className="px-3 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg whitespace-nowrap"
                  >
                    Новая комната
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Имя игрока / Мастера:
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Выберите роль:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('PLAYER')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      role === 'PLAYER'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">Игрок (Player)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      Управляет своим героем, видит сквозь туман войны
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('GM')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      role === 'GM'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">Мастер (GM)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      Полный контроль карты, стен, монстров и тумана
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Назначенный персонаж:
                </label>
                <select
                  value={assignedTokenId}
                  onChange={(e) => setAssignedTokenId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
                >
                  {mapData.tokens
                    .filter((t) => role === 'GM' || t.faction === 'player')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.faction === 'player' ? 'Герой' : 'Монстр'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors shadow-md"
                >
                  Подключиться к комнате {roomInputCode}
                </button>

                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="w-full py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {copiedInvite ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Ссылка приглашения скопирована!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Скопировать инвайт-ссылку для игроков
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { PRESET_MAPS } from './src/data/presets';
import { computeVisibilityPolygon, isInFieldOfView } from './src/engine/raycaster';
import {
  ChatMessage,
  CombatState,
  ConnectedPeer,
  FogSyncPayload,
  ManualFogStroke,
  MapData,
  MapPing,
  Point,
  RoomJoinPayload,
  RoomStatePayload,
  TerrainType,
  Token,
  TokenMovePayload,
  UserRole,
  WallSegment,
  PositionalAudioSource,
  GlobalMusicState,
  OneShotSfxType,
} from './src/types/vtt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomSession {
  roomId: string;
  gmKey: string;
  gmClientId: string | null;
  serverAntiCheatCulling: boolean;
  map: MapData;
  peers: Map<string, ConnectedPeer>; // key: socket.id
  clientAssignments: Map<string, string>; // clientId -> assignedTokenId
  clientRoles: Map<string, UserRole>; // clientId -> role
  messages: ChatMessage[];
}

const PEER_COLORS = [
  '#F59E0B', // Amber
  '#38BDF8', // Sky
  '#10B981', // Emerald
  '#A855F7', // Purple
  '#F43F5E', // Rose
  '#EC4899', // Pink
  '#14B8A6', // Teal
];

function generateGmKey(): string {
  return 'GM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e7, // 10MB for custom battlemap uploads
  });

  app.use(express.json({ limit: '10mb' }));

  const rooms = new Map<string, RoomSession>();

  const getOrCreateRoom = (roomId: string): RoomSession => {
    const cleanId = (roomId || 'OBSIDIAN-1').trim().toUpperCase();
    if (!rooms.has(cleanId)) {
      const initialMap = structuredClone(PRESET_MAPS[0]);
      initialMap.fogStrokes = [];
      rooms.set(cleanId, {
        roomId: cleanId,
        gmKey: generateGmKey(),
        gmClientId: null,
        serverAntiCheatCulling: false, // Can be toggled by GM for strict network-level LOS monster culling
        map: initialMap,
        peers: new Map(),
        clientAssignments: new Map(),
        clientRoles: new Map(),
        messages: [],
      });
    }
    return rooms.get(cleanId)!;
  };

  /**
   * Computes which tokens a specific peer is allowed to receive over the network.
   * - GM always receives 100% of tokens.
   * - Players NEVER receive tokens with `isHiddenByGM: true`.
   * - If `room.serverAntiCheatCulling` is enabled, Players ONLY receive monster tokens
   *   that are currently inside the 2D Raycasting Visibility Polygon of player tokens
   *   (or revealed by GM manual fog strokes).
   */
  const getFilteredMapForRole = (room: RoomSession, role: UserRole): MapData => {
    if (role === 'GM') {
      return room.map;
    }

    const cs = room.map.cellSize || 50;
    const mapWidth = room.map.cols * cs;
    const mapHeight = room.map.rows * cs;

    // Compute combined player visibility polygons on the server if strict anti-cheat is active
    let playerPolygons: Point[][] = [];
    if (room.serverAntiCheatCulling) {
      const playerTokens = room.map.tokens.filter((t) => t.faction === 'player');
      playerPolygons = playerTokens.map((pt) => {
        const origin: Point = {
          x: (pt.x + pt.size / 2) * cs,
          y: (pt.y + pt.size / 2) * cs,
        };
        const baseVision = pt.visionRadius || 12;
        const lightCells = pt.emitsLight
          ? Math.max(pt.dimLightRadius || 8, pt.brightLightRadius || 4)
          : 0;
        const effectiveCells = Math.max(baseVision, lightCells);
        const radiusPx =
          room.map.ambientLight === 'bright'
            ? Math.max(mapWidth, mapHeight) * 1.5
            : effectiveCells * cs;

        return computeVisibilityPolygon(
          origin,
          radiusPx,
          room.map.walls,
          mapWidth,
          mapHeight
        ).polygon;
      });
    }

    const visibleTokens = room.map.tokens.filter((token) => {
      // 1. GM explicitly hidden tokens are never sent to players
      if (token.isHiddenByGM) return false;

      // 2. Player & friendly tokens are always sent to party members
      if (token.faction === 'player') return true;

      // 3. If strict server-side LOS culling is enabled, check mathematical raycast polygon
      if (room.serverAntiCheatCulling) {
        const cx = (token.x + token.size / 2) * cs;
        const cy = (token.y + token.size / 2) * cs;
        const tokenRadius = token.size * cs * 0.38;

        const inLos = isInFieldOfView(cx, cy, playerPolygons, tokenRadius);
        if (inLos) return true;

        // Also check if inside a GM manual reveal stroke
        const strokes = room.map.fogStrokes || [];
        let manuallyRevealed = false;
        for (const s of strokes) {
          const dist = Math.hypot(cx - s.x, cy - s.y);
          if (dist <= s.radiusPx) {
            manuallyRevealed = s.action === 'reveal';
          }
        }
        return manuallyRevealed;
      }

      return true;
    });

    return {
      ...room.map,
      tokens: visibleTokens,
    };
  };

  /**
   * Broadcasts tailored room state or token list to every connected peer in the room
   * respecting their role (GM vs PLAYER) and anti-cheat visibility rules.
   */
  const broadcastFilteredTokens = (room: RoomSession) => {
    for (const [socketId, peer] of room.peers.entries()) {
      const filteredMap = getFilteredMapForRole(room, peer.role);
      io.to(socketId).emit('tokens:sync', filteredMap.tokens);
    }
  };

  const broadcastFullRoomState = (room: RoomSession) => {
    const peersList = Array.from(room.peers.values());
    for (const [socketId, peer] of room.peers.entries()) {
      const payload: RoomStatePayload = {
        roomId: room.roomId,
        yourRole: peer.role,
        yourClientId: peer.clientId,
        gmKey: peer.role === 'GM' ? room.gmKey : undefined,
        assignedTokenId: peer.assignedTokenId,
        serverAntiCheatCulling: room.serverAntiCheatCulling,
        map: getFilteredMapForRole(room, peer.role),
        peers: peersList,
        messages:
          peer.role === 'GM'
            ? room.messages
            : room.messages.filter((m) => !m.isSecretGm && !(m.senderRole === 'GM' && m.roll)),
      };
      io.to(socketId).emit('room:state', payload);
    }
  };

  // REST API Endpoints for Lobby Inspection
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      activeRooms: rooms.size,
      rooms: Array.from(rooms.values()).map((r) => ({
        roomId: r.roomId,
        peersCount: r.peers.size,
        mapName: r.map.name,
      })),
    });
  });

  io.on('connection', (socket: Socket) => {
    let currentRoomId = ((socket.handshake.query.roomId as string) || 'OBSIDIAN-1')
      .trim()
      .toUpperCase();

    const joinRoomSession = (payload: RoomJoinPayload) => {
      // Leave previous room if switching
      if (currentRoomId && currentRoomId !== payload.roomId.trim().toUpperCase()) {
        const prevRoom = rooms.get(currentRoomId);
        if (prevRoom) {
          prevRoom.peers.delete(socket.id);
          io.to(currentRoomId).emit('peers:sync', Array.from(prevRoom.peers.values()));
        }
        socket.leave(currentRoomId);
      }

      const targetRoomId = (payload.roomId || 'OBSIDIAN-1').trim().toUpperCase();
      currentRoomId = targetRoomId;
      socket.join(targetRoomId);

      const room = getOrCreateRoom(targetRoomId);
      const clientId = payload.clientId || `client-${socket.id}`;

      // Determine Role:
      // 1. First person to claim GM when no GM exists becomes GM
      // 2. Returning GM with matching clientId or valid gmKey becomes GM
      // 3. Explicit preferredRole === 'GM' in sandbox/demo or with gmKey
      let assignedRole: UserRole = 'PLAYER';
      if (!room.gmClientId) {
        assignedRole = payload.preferredRole || 'GM';
        if (assignedRole === 'GM') {
          room.gmClientId = clientId;
        }
      } else if (
        room.gmClientId === clientId ||
        (payload.gmKey && payload.gmKey === room.gmKey) ||
        payload.preferredRole === 'GM'
      ) {
        assignedRole = payload.preferredRole || 'GM';
        if (assignedRole === 'GM' && !room.gmClientId) {
          room.gmClientId = clientId;
        }
      } else if (room.clientRoles.has(clientId)) {
        assignedRole = room.clientRoles.get(clientId)!;
      }

      room.clientRoles.set(clientId, assignedRole);

      // Determine Assigned Hero Token
      const playerTokens = room.map.tokens.filter((t) => t.faction === 'player');
      let assignedTokenId =
        payload.assignedTokenId ||
        room.clientAssignments.get(clientId) ||
        playerTokens[room.peers.size % Math.max(1, playerTokens.length)]?.id ||
        room.map.tokens[0]?.id ||
        '';

      room.clientAssignments.set(clientId, assignedTokenId);

      const colorIndex = room.peers.size % PEER_COLORS.length;
      const peer: ConnectedPeer = {
        id: socket.id,
        clientId,
        name: payload.playerName?.trim() || (assignedRole === 'GM' ? 'Мастер (GM)' : `Игрок-${socket.id.slice(0, 4)}`),
        color: PEER_COLORS[colorIndex],
        role: assignedRole,
        assignedTokenId,
        connectedAt: Date.now(),
      };

      room.peers.set(socket.id, peer);

      // Send authoritative state to the joining client
      const statePayload: RoomStatePayload = {
        roomId: room.roomId,
        yourRole: peer.role,
        yourClientId: peer.clientId,
        gmKey: peer.role === 'GM' ? room.gmKey : undefined,
        assignedTokenId: peer.assignedTokenId,
        serverAntiCheatCulling: room.serverAntiCheatCulling,
        map: getFilteredMapForRole(room, peer.role),
        peers: Array.from(room.peers.values()),
        messages: peer.role === 'GM' ? room.messages : room.messages.filter((m) => !m.isSecretGm),
      };
      socket.emit('room:state', statePayload);

      // Legacy compatibility event
      socket.emit('map:init', statePayload.map);

      // Notify all peers in room of updated player roster
      io.to(targetRoomId).emit('peers:sync', Array.from(room.peers.values()));
    };

    // Initial auto-join on socket connection using handshake query
    joinRoomSession({
      roomId: currentRoomId,
      clientId: (socket.handshake.query.clientId as string) || `client-${socket.id}`,
      playerName: (socket.handshake.query.playerName as string) || '',
      preferredRole: (socket.handshake.query.role as UserRole) || undefined,
      gmKey: (socket.handshake.query.gmKey as string) || undefined,
    });

    // Explicit room join / switch room / change character
    socket.on('room:join', (payload: RoomJoinPayload) => {
      joinRoomSession(payload);
    });

    // Peer profile or role update (e.g. switching role for testing or changing name/token)
    socket.on('peer:update', (partial: Partial<ConnectedPeer> & { gmKey?: string }) => {
      const room = getOrCreateRoom(currentRoomId);
      const existing = room.peers.get(socket.id);
      if (!existing) return;

      if (partial.role) {
        existing.role = partial.role;
        room.clientRoles.set(existing.clientId, partial.role);
      }
      if (partial.name !== undefined) {
        existing.name = partial.name;
      }
      if (partial.assignedTokenId !== undefined) {
        existing.assignedTokenId = partial.assignedTokenId;
        room.clientAssignments.set(existing.clientId, partial.assignedTokenId);
      }
      if (partial.color !== undefined) {
        existing.color = partial.color;
      }

      io.to(currentRoomId).emit('peers:sync', Array.from(room.peers.values()));

      // Re-send filtered map state if role changed
      const statePayload: RoomStatePayload = {
        roomId: room.roomId,
        yourRole: existing.role,
        yourClientId: existing.clientId,
        gmKey: existing.role === 'GM' ? room.gmKey : undefined,
        assignedTokenId: existing.assignedTokenId,
        serverAntiCheatCulling: room.serverAntiCheatCulling,
        map: getFilteredMapForRole(room, existing.role),
        peers: Array.from(room.peers.values()),
      };
      socket.emit('room:state', statePayload);
    });

    // GM assigns a token to a specific connected player
    socket.on('peer:assign-token', (payload: { targetClientId: string; tokenId: string }) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.clientAssignments.set(payload.targetClientId, payload.tokenId);
      for (const peer of room.peers.values()) {
        if (peer.clientId === payload.targetClientId) {
          peer.assignedTokenId = payload.tokenId;
          io.to(peer.id).emit('peer:token-assigned', payload.tokenId);
        }
      }
      io.to(currentRoomId).emit('peers:sync', Array.from(room.peers.values()));
    });

    // GM toggles strict server-side anti-cheat monster culling
    socket.on('room:toggle-anticheat', (enabled: boolean) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.serverAntiCheatCulling = enabled;
      broadcastFullRoomState(room);
    });

    // Token movement with server-side permission validation
    socket.on('token:move', (payload: TokenMovePayload) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      const token = room.map.tokens.find((t) => t.id === payload.id);
      if (!token) return;

      // Permission check:
      // GM can move any token.
      // PLAYER can move their assigned token, or any player-faction token not locked to someone else.
      const isAllowed =
        sender.role === 'GM' ||
        sender.assignedTokenId === token.id ||
        token.controlledBy === sender.clientId ||
        token.controlledBy === 'all' ||
        token.faction === 'player';

      if (!isAllowed) {
        // Reject unauthorized movement and snap client back
        socket.emit('token:moved', {
          id: token.id,
          x: token.x,
          y: token.y,
          isFinal: true,
        });
        return;
      }

      // Clamp to map bounds
      const maxCol = Math.max(0, room.map.cols - token.size);
      const maxRow = Math.max(0, room.map.rows - token.size);
      const prevX = token.x;
      const prevY = token.y;
      token.x = Math.max(0, Math.min(maxCol, payload.x));
      token.y = Math.max(0, Math.min(maxRow, payload.y));

      // Compute player visibility polygons if moving a monster
      let playerPolygons: Point[][] = [];
      if (token.faction === 'monster') {
        const cs = room.map.cellSize || 50;
        const mapWidth = room.map.cols * cs;
        const mapHeight = room.map.rows * cs;
        const playerTokens = room.map.tokens.filter((t) => t.faction === 'player');
        playerPolygons = playerTokens.map((pt) => {
          const origin: Point = {
            x: (pt.x + pt.size / 2) * cs,
            y: (pt.y + pt.size / 2) * cs,
          };
          const baseVision = pt.visionRadius || 12;
          const lightCells = pt.emitsLight
            ? Math.max(pt.dimLightRadius || 8, pt.brightLightRadius || 4)
            : 0;
          const effectiveCells = Math.max(baseVision, lightCells);
          const radiusPx =
            room.map.ambientLight === 'bright'
              ? Math.max(mapWidth, mapHeight) * 1.5
              : effectiveCells * cs;
          return computeVisibilityPolygon(origin, radiusPx, room.map.walls, mapWidth, mapHeight).polygon;
        });
      }

      const cs = room.map.cellSize || 50;
      const destX = (token.x + token.size / 2) * cs;
      const destY = (token.y + token.size / 2) * cs;
      const srcX = ((payload.fromX ?? prevX) + token.size / 2) * cs;
      const srcY = ((payload.fromY ?? prevY) + token.size / 2) * cs;
      const tokenRadius = token.size * cs * 0.38;

      const isDestInSight =
        token.faction !== 'monster' ||
        isInFieldOfView(destX, destY, playerPolygons, tokenRadius);
      const isSrcInSight =
        token.faction !== 'monster' ||
        isInFieldOfView(srcX, srcY, playerPolygons, tokenRadius);

      // Targeted broadcast to each peer respecting role and darkness
      for (const [peerSocketId, peer] of room.peers.entries()) {
        if (peerSocketId === socket.id) continue;

        if (peer.role === 'PLAYER') {
          // Never send GM-hidden tokens to players
          if (token.isHiddenByGM) continue;

          // If it is a monster moving entirely in the dark, do NOT send to players
          if (token.faction === 'monster' && !isDestInSight && !isSrcInSight) {
            continue;
          }
        }

        io.to(peerSocketId).emit('token:moved', {
          id: token.id,
          x: token.x,
          y: token.y,
          fromX: payload.fromX ?? prevX,
          fromY: payload.fromY ?? prevY,
          isFinal: payload.isFinal,
          moverColor: sender.color,
        });
      }

      // If movement finished and token is a monster, re-sync visible tokens for players
      if (token.faction === 'monster' && payload.isFinal) {
        broadcastFilteredTokens(room);
      }
    });

    // Token update (HP, visionRadius, light, stealth isHiddenByGM, etc.)
    socket.on('token:update', (updatedToken: Token) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      // Players can only update their own token's light/HP; GM can update anything
      if (
        sender.role !== 'GM' &&
        sender.assignedTokenId !== updatedToken.id &&
        updatedToken.faction !== 'player'
      ) {
        return;
      }

      const idx = room.map.tokens.findIndex((t) => t.id === updatedToken.id);
      if (idx !== -1) {
        // Prevent non-GM from un-hiding a GM-hidden token
        if (sender.role !== 'GM') {
          updatedToken.isHiddenByGM = room.map.tokens[idx].isHiddenByGM;
        }
        room.map.tokens[idx] = updatedToken;
        broadcastFilteredTokens(room);
      }
    });

    // Token creation (GM only)
    socket.on('token:create', (newToken: Token) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (!room.map.tokens.some((t) => t.id === newToken.id)) {
        room.map.tokens.push(newToken);
        broadcastFilteredTokens(room);
      }
    });

    // Token deletion (GM only)
    socket.on('token:delete', (tokenId: string) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.map.tokens = room.map.tokens.filter((t) => t.id !== tokenId);
      io.to(currentRoomId).emit('token:deleted', tokenId);
    });

    // Wall / Door creation (GM only)
    socket.on('wall:create', (wall: WallSegment) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (!room.map.walls.some((w) => w.id === wall.id)) {
        room.map.walls.push(wall);
        io.to(currentRoomId).emit('wall:created', wall);
        if (room.serverAntiCheatCulling) {
          broadcastFilteredTokens(room);
        }
      }
    });

    // Door open/close toggle (Both GM and Players can interact with doors!)
    socket.on('wall:toggle-door', (wallId: string) => {
      const room = getOrCreateRoom(currentRoomId);
      const wall = room.map.walls.find((w) => w.id === wallId && w.type === 'door');
      if (wall) {
        wall.isOpen = !wall.isOpen;
        io.to(currentRoomId).emit('wall:door-toggled', { id: wall.id, isOpen: !!wall.isOpen });
        if (room.serverAntiCheatCulling) {
          broadcastFilteredTokens(room);
        }
      }
    });

    // Wall deletion (GM only)
    socket.on('wall:delete', (wallId: string) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.map.walls = room.map.walls.filter((w) => w.id !== wallId);
      io.to(currentRoomId).emit('wall:deleted', wallId);
      if (room.serverAntiCheatCulling) {
        broadcastFilteredTokens(room);
      }
    });

    // Batch terrain paint (GM only)
    socket.on('terrain:paint', (cells: { key: string; terrain: TerrainType }[]) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      for (const item of cells) {
        room.map.terrain[item.key] = item.terrain;
      }
      socket.to(currentRoomId).emit('terrain:painted', cells);
    });

    // Background image update (GM only)
    socket.on('map:background', (backgroundUrl: string | undefined) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.map.backgroundUrl = backgroundUrl;
      io.to(currentRoomId).emit('map:background-updated', backgroundUrl);
    });

    // Map settings update (GM only)
    socket.on('map:update-settings', (settings: Partial<MapData>) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      Object.assign(room.map, settings);
      io.to(currentRoomId).emit('map:settings-updated', settings);
      if (room.serverAntiCheatCulling) {
        broadcastFilteredTokens(room);
      }
    });

    // Import full campaign JSON (GM only)
    socket.on('map:import', (importedMap: MapData) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (importedMap && importedMap.cols && importedMap.rows && Array.isArray(importedMap.walls)) {
        room.map = structuredClone(importedMap);
        if (!room.map.fogStrokes) room.map.fogStrokes = [];
        broadcastFullRoomState(room);
      }
    });

    // Reset map to preset or clear walls (GM only)
    socket.on('map:reset', (mode: 'preset' | 'clear_walls') => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (mode === 'preset') {
        const fresh = structuredClone(PRESET_MAPS[0]);
        fresh.fogStrokes = [];
        room.map = fresh;
        broadcastFullRoomState(room);
        io.to(currentRoomId).emit('fog:cleared');
      } else if (mode === 'clear_walls') {
        room.map.walls = [];
        broadcastFullRoomState(room);
      }
    });

    // Fog of War memory reset broadcast (GM only)
    socket.on('fog:reset', () => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.map.fogStrokes = [];
      io.to(currentRoomId).emit('fog:cleared');
      if (room.serverAntiCheatCulling) {
        broadcastFilteredTokens(room);
      }
    });

    // Manual Fog of War brush action (GM only, persisted in room.map.fogStrokes)
    socket.on(
      'fog:paint',
      (payload: { action: 'reveal' | 'hide'; x: number; y: number; radiusPx: number }) => {
        const room = getOrCreateRoom(currentRoomId);
        const sender = room.peers.get(socket.id);
        if (!sender || sender.role !== 'GM') return;

        const stroke: ManualFogStroke = {
          id: `fog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action: payload.action,
          x: payload.x,
          y: payload.y,
          radiusPx: payload.radiusPx,
        };
        if (!room.map.fogStrokes) room.map.fogStrokes = [];
        room.map.fogStrokes.push(stroke);
        if (room.map.fogStrokes.length > 300) {
          room.map.fogStrokes.shift();
        }

        socket.to(currentRoomId).emit('fog:painted', stroke);
        if (room.serverAntiCheatCulling) {
          broadcastFilteredTokens(room);
        }
      }
    );

    // Tactical Map Ping (Both GM and Players!)
    socket.on('map:ping', (pt: Point) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      const ping: MapPing = {
        id: `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: pt.x,
        y: pt.y,
        color: sender.color,
        senderName: sender.name,
        createdAt: Date.now(),
      };
      io.to(currentRoomId).emit('map:pinged', ping);
    });

    // Live Pointer Cursor Synchronization
    socket.on('cursor:move', (pt: Point) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      sender.cursor = pt;
      socket.to(currentRoomId).emit('cursor:moved', {
        peerId: socket.id,
        name: sender.name,
        color: sender.color,
        role: sender.role,
        x: pt.x,
        y: pt.y,
      });
    });

    // Live Tactical Ruler Synchronization
    socket.on('ruler:move', (ruler: { start: Point; current: Point } | null) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      socket.to(currentRoomId).emit('ruler:moved', {
        peerId: socket.id,
        senderName: sender.name,
        color: sender.color,
        ruler,
      });
    });

    // Stage 5: Game Log & Dice Roll Chat
    socket.on('chat:message', (msg: ChatMessage) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      const messageWithMeta: ChatMessage = {
        ...msg,
        id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderName: sender.name,
        senderRole: sender.role,
        senderColor: sender.color,
        timestamp: Date.now(),
      };

      room.messages.push(messageWithMeta);
      if (room.messages.length > 200) {
        room.messages.shift();
      }

      const isGmSecret = messageWithMeta.isSecretGm || (sender.role === 'GM' && !!messageWithMeta.roll);
      if (isGmSecret) {
        messageWithMeta.isSecretGm = true;
        // Secret GM roll: broadcast only to GM peers and sender
        for (const [peerSocketId, peer] of room.peers.entries()) {
          if (peer.role === 'GM' || peerSocketId === socket.id) {
            io.to(peerSocketId).emit('chat:received', messageWithMeta);
          }
        }
      } else {
        io.to(currentRoomId).emit('chat:received', messageWithMeta);
      }
    });

    // Stage 5: Combat & Turn Initiative Tracker
    socket.on('combat:update', (combat: CombatState) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;

      room.map.combat = combat;
      io.to(currentRoomId).emit('combat:updated', combat);
    });

    // Stage 5: Quick Token HP / Conditions update
    socket.on(
      'token:update-hp',
      (payload: { tokenId: string; hp: number; tempHp?: number; conditions?: any[] }) => {
        const room = getOrCreateRoom(currentRoomId);
        const token = room.map.tokens.find((t) => t.id === payload.tokenId);
        if (token) {
          token.hp = payload.hp;
          if (payload.tempHp !== undefined) token.tempHp = payload.tempHp;
          if (payload.conditions !== undefined) token.conditions = payload.conditions;
          io.to(currentRoomId).emit('token:updated', token);
        }
      }
    );

    // Audio Engine: Positional Audio Sources Sync (GM only)
    socket.on('ambient:create', (source: PositionalAudioSource) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (!room.map.audioSources) room.map.audioSources = [];
      if (!room.map.audioSources.some((s) => s.id === source.id)) {
        room.map.audioSources.push(source);
        io.to(currentRoomId).emit('ambient:created', source);
      }
    });

    socket.on('ambient:update', (source: PositionalAudioSource) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (!room.map.audioSources) room.map.audioSources = [];
      const idx = room.map.audioSources.findIndex((s) => s.id === source.id);
      if (idx !== -1) {
        room.map.audioSources[idx] = source;
        io.to(currentRoomId).emit('ambient:updated', source);
      }
    });

    socket.on('ambient:delete', (sourceId: string) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      if (room.map.audioSources) {
        room.map.audioSources = room.map.audioSources.filter((s) => s.id !== sourceId);
      }
      io.to(currentRoomId).emit('ambient:deleted', sourceId);
    });

    // Audio Engine: Global Background Ambience & Combat Music (GM only)
    socket.on('music:update', (musicState: GlobalMusicState) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== 'GM') return;

      room.map.globalMusic = musicState;
      io.to(currentRoomId).emit('music:updated', musicState);
    });

    // Audio Engine: One-Shot SFX Broadcast (Both GM & Players)
    socket.on('sfx:broadcast', (payload: { type: OneShotSfxType; volume?: number }) => {
      io.to(currentRoomId).emit('sfx:played', payload);
    });

    socket.on('disconnect', () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.peers.delete(socket.id);
        io.to(currentRoomId).emit('peers:sync', Array.from(room.peers.values()));
        io.to(currentRoomId).emit('peer:Left', socket.id);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Obsidian Table VTT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

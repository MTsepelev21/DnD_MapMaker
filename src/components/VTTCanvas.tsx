import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ConnectedPeer,
  DND_CONDITIONS,
  FogBrushAction,
  GameMode,
  MapBackgroundConfig,
  MapData,
  MapPing,
  MonsterVisibilityMode,
  Point,
  RaycastResult,
  RemoteRuler,
  SnapTarget,
  TerrainType,
  Token,
  TokenMoveTrail,
  ToolMode,
  UserRole,
  WallSegment,
} from '../types/vtt';
import { SpellTemplate, SpellCastEffect } from '../types/spells';
import { computeVisibilityPolygon, isInFieldOfView } from '../engine/raycaster';
import { SpellTemplateManager, drawSpellTemplate } from '../engine/spellTemplates';
import { soundFX } from '../utils/sound';

interface VTTCanvasProps {
  mapData: MapData;
  role: UserRole;
  gameMode: GameMode;
  yourClientId: string;
  activeTokenId: string;
  selectedTokenId: string | null;
  selectedWallId: string | null;
  focusTokenTrigger?: { tokenId: string; timestamp: number } | null;
  toolMode: ToolMode;
  activeTerrain: TerrainType;
  terrainBrushSize: number;
  snapToGrid: boolean;
  snapTarget: SnapTarget;
  showGrid: boolean;
  showGridCoords: boolean;
  showRayDebug: boolean;
  fogResetCounter: number;
  gmFogOpacity: number; // 0 (disabled) to 1.0 (full darkness)
  partyVision: boolean; // Stage 3: Merge visibility polygons of all player heroes
  fogBrushAction: FogBrushAction; // Stage 3: 'reveal' or 'hide'
  fogBrushSize: number; // In grid cells (e.g. 1..5)
  monsterVisibilityMode: MonsterVisibilityMode; // Control monster visibility
  peers: ConnectedPeer[];
  pings: MapPing[];
  remoteRulers: RemoteRuler[];
  moveTrails: TokenMoveTrail[];
  onSelectToken: (tokenId: string | null) => void;
  onSelectWall: (wallId: string | null) => void;
  onActivateVisionToken: (tokenId: string) => void;
  onMoveToken: (
    tokenId: string,
    x: number,
    y: number,
    isFinal: boolean,
    fromX?: number,
    fromY?: number
  ) => void;
  onCreateWall: (wall: WallSegment) => void;
  onToggleDoor: (wallId: string) => void;
  onDeleteWall: (wallId: string) => void;
  onPaintTerrain: (cells: { key: string; terrain: TerrainType }[]) => void;
  onManualFogPaint?: (action: FogBrushAction, x: number, y: number, radiusPx: number) => void;
  onEmitPing?: (pt: Point) => void;
  onEmitRuler?: (ruler: { start: Point; current: Point } | null) => void;
  onCursorWorldMove?: (pt: Point, gridCell: { col: number; row: number }) => void;
  onUpdateBackgroundConfig?: (config: MapBackgroundConfig) => void;
  selectedAudioSourceId?: string | null;
  onSelectAudioSource?: (id: string | null) => void;
  onMoveAudioSource?: (id: string, x: number, y: number) => void;
  onCreateAudioSourceAt?: (x: number, y: number) => void;
  activeSpellPreview?: SpellTemplate | null;
  placedSpellTemplates?: SpellTemplate[];
  affectedTokenIds?: string[];
  selectedSpellTemplateId?: string | null;
  onPlaceSpellTemplate?: (template: SpellTemplate) => void;
  onMoveSpellTemplate?: (template: SpellTemplate) => void;
  onSelectSpellTemplate?: (id: string | null) => void;
  onDeleteSpellTemplate?: (id: string) => void;
  activeCastEffects?: SpellCastEffect[];
  zoom: number;
  onZoomChange: (newZoom: number) => void;
}

// Distance from point to line segment
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// Hex color to RGB string helper for light auras
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((char) => char + char).join('');
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export const VTTCanvas: React.FC<VTTCanvasProps> = ({
  mapData,
  role,
  gameMode,
  yourClientId,
  activeTokenId,
  selectedTokenId,
  selectedWallId,
  focusTokenTrigger,
  toolMode,
  activeTerrain,
  terrainBrushSize,
  snapToGrid,
  snapTarget,
  showGrid,
  showGridCoords,
  showRayDebug,
  fogResetCounter,
  gmFogOpacity,
  partyVision,
  fogBrushAction,
  fogBrushSize,
  monsterVisibilityMode,
  peers,
  pings,
  remoteRulers,
  moveTrails,
  selectedAudioSourceId,
  onSelectToken,
  onSelectWall,
  onSelectAudioSource,
  onMoveAudioSource,
  onCreateAudioSourceAt,
  activeSpellPreview,
  placedSpellTemplates = [],
  affectedTokenIds = [],
  selectedSpellTemplateId,
  onPlaceSpellTemplate,
  onMoveSpellTemplate,
  onSelectSpellTemplate,
  onDeleteSpellTemplate,
  activeCastEffects = [],
  onActivateVisionToken,
  onMoveToken,
  onCreateWall,
  onToggleDoor,
  onDeleteWall,
  onPaintTerrain,
  onManualFogPaint,
  onEmitPing,
  onEmitRuler,
  onCursorWorldMove,
  zoom,
  onZoomChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingAudioSourceRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const smoothSpellAngleRef = useRef<number>(0);
  const draggingSpellTemplateRef = useRef<{
    id: string;
    isRotating: boolean;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Stage 3: Two-layer Fog of War offscreen canvases
  const exploredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogCompositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const appliedFogStrokeIdsRef = useRef<Set<string>>(new Set());

  // Background battlemap image cache
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgLoadedUrlRef = useRef<string | null>(null);

  // Virtual Camera State: pan offset in screen pixels
  const [pan, setPan] = useState<Point>({ x: 60, y: 50 });
  const isSpacePressedRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });

  // Sequential click-by-click chain wall builder state
  const [chainStart, setChainStart] = useState<Point | null>(null);
  const mouseWorldPosRef = useRef<Point>({ x: 0, y: 0 });

  // Live token dragging state (for smooth 60 FPS raycasting recomputation)
  const draggingTokenRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    worldX: number;
    worldY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Tactical Distance Ruler state
  const rulerRef = useRef<{ start: Point; current: Point } | null>(null);

  // Continuous terrain painting state
  const isPaintingTerrainRef = useRef<boolean>(false);
  const paintedInStrokeRef = useRef<Set<string>>(new Set());

  // Continuous GM Fog brush painting state
  const isPaintingFogRef = useRef<boolean>(false);

  // Interactive hover highlight for walls/doors
  const hoveredWallIdRef = useRef<string | null>(null);

  const cs = mapData.cellSize || 50;
  const mapWidth = mapData.cols * cs;
  const mapHeight = mapData.rows * cs;

  // =========================================================================
  // 1. PURE VIRTUAL CAMERA COORDINATE TRANSFORM FUNCTIONS
  // =========================================================================

  const screenToWorld = useCallback(
    (sx: number, sy: number): Point => {
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number): Point => {
      return {
        x: wx * zoom + pan.x,
        y: wy * zoom + pan.y,
      };
    },
    [pan.x, pan.y, zoom]
  );

  // =========================================================================
  // 2. GRID SNAPPING CALCULATOR
  // =========================================================================
  const snapPoint = useCallback(
    (pt: Point, target: SnapTarget = snapTarget): Point => {
      if (!snapToGrid || target === 'none') return pt;

      const cellSize = mapData.cellSize || 50;
      const nodeX = Math.round(pt.x / cellSize) * cellSize;
      const nodeY = Math.round(pt.y / cellSize) * cellSize;

      const centerX = Math.floor(pt.x / cellSize) * cellSize + cellSize / 2;
      const centerY = Math.floor(pt.y / cellSize) * cellSize + cellSize / 2;

      if (target === 'nodes') {
        return { x: nodeX, y: nodeY };
      }
      if (target === 'centers') {
        return { x: centerX, y: centerY };
      }

      const halfStep = cellSize / 2;
      return {
        x: Math.round(pt.x / halfStep) * halfStep,
        y: Math.round(pt.y / halfStep) * halfStep,
      };
    },
    [snapToGrid, snapTarget, mapData.cellSize]
  );

  // Smooth camera centering on focused token (hotkey 'T' or next combat turn)
  useEffect(() => {
    if (!focusTokenTrigger) return;
    const tok = mapData.tokens.find((t) => t.id === focusTokenTrigger.tokenId);
    const canvas = canvasRef.current;
    if (!tok || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const viewW = canvas.width / dpr;
    const viewH = canvas.height / dpr;

    const halfCells = (tok.size * cs) / 2;
    const worldX = tok.x * cs + halfCells;
    const worldY = tok.y * cs + halfCells;

    setPan({
      x: viewW / 2 - worldX * zoom,
      y: viewH / 2 - worldY * zoom,
    });
  }, [focusTokenTrigger, mapData.tokens, cs, zoom]);

  // Load / Update background battlemap image
  useEffect(() => {
    const bgUrl = mapData.backgroundConfig?.url || mapData.backgroundUrl;
    if (!bgUrl) {
      bgImageRef.current = null;
      bgLoadedUrlRef.current = null;
      return;
    }
    if (bgLoadedUrlRef.current === bgUrl && bgImageRef.current) {
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      bgImageRef.current = img;
      bgLoadedUrlRef.current = bgUrl;
    };
    img.src = bgUrl;
  }, [mapData.backgroundUrl, mapData.backgroundConfig]);

  // Manual Fog Paint Stamp Helper
  const applyManualFogStamp = useCallback(
    (action: FogBrushAction, wx: number, wy: number, radiusPx: number) => {
      const expCanvas = exploredCanvasRef.current;
      if (!expCanvas) return;
      const expCtx = expCanvas.getContext('2d');
      if (!expCtx) return;

      expCtx.save();
      if (action === 'reveal') {
        expCtx.globalCompositeOperation = 'source-over';
        expCtx.fillStyle = '#FFFFFF';
        expCtx.beginPath();
        expCtx.arc(wx, wy, radiusPx, 0, Math.PI * 2);
        expCtx.fill();
      } else {
        expCtx.globalCompositeOperation = 'destination-out';
        expCtx.beginPath();
        expCtx.arc(wx, wy, radiusPx, 0, Math.PI * 2);
        expCtx.fill();
      }
      expCtx.restore();
    },
    []
  );

  // Stage 3: Offscreen Fog of War Memory Canvas Initialization & Reset
  useEffect(() => {
    if (!exploredCanvasRef.current) {
      exploredCanvasRef.current = document.createElement('canvas');
    }
    if (!fogCompositeCanvasRef.current) {
      fogCompositeCanvasRef.current = document.createElement('canvas');
    }
    const expCanvas = exploredCanvasRef.current;
    expCanvas.width = mapWidth;
    expCanvas.height = mapHeight;
    const expCtx = expCanvas.getContext('2d');
    if (expCtx) {
      expCtx.clearRect(0, 0, mapWidth, mapHeight);
    }
    appliedFogStrokeIdsRef.current.clear();

    // Replay any server-persisted fog strokes
    if (mapData.fogStrokes && mapData.fogStrokes.length > 0) {
      for (const stroke of mapData.fogStrokes) {
        applyManualFogStamp(stroke.action, stroke.x, stroke.y, stroke.radiusPx);
        appliedFogStrokeIdsRef.current.add(stroke.id);
      }
    }

    const fogCanvas = fogCompositeCanvasRef.current;
    fogCanvas.width = mapWidth;
    fogCanvas.height = mapHeight;
  }, [mapWidth, mapHeight, fogResetCounter, applyManualFogStamp]);

  // Sync incremental fogStrokes arriving from remote GM over Socket.io
  useEffect(() => {
    if (!mapData.fogStrokes) return;
    for (const stroke of mapData.fogStrokes) {
      if (!appliedFogStrokeIdsRef.current.has(stroke.id)) {
        applyManualFogStamp(stroke.action, stroke.x, stroke.y, stroke.radiusPx);
        appliedFogStrokeIdsRef.current.add(stroke.id);
      }
    }
  }, [mapData.fogStrokes, applyManualFogStamp]);

  // Helper: check if a point has been visited / explored on the offscreen canvas
  const isPointExplored = useCallback(
    (wx: number, wy: number): boolean => {
      const exp = exploredCanvasRef.current;
      if (!exp) return false;
      const ctx = exp.getContext('2d');
      if (!ctx) return false;
      try {
        const px = Math.floor(Math.max(0, Math.min(mapWidth - 1, wx)));
        const py = Math.floor(Math.max(0, Math.min(mapHeight - 1, wy)));
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        return pixel[3] > 20;
      } catch {
        return false;
      }
    },
    [mapWidth, mapHeight]
  );

  // Check if current client is allowed to drag a given token
  const canControlToken = useCallback(
    (tok: Token): boolean => {
      if (role === 'GM') return true;
      // Player role: can control any player-faction token or tokens shared with this client
      if (tok.controlledBy === yourClientId || tok.controlledBy === 'all') return true;
      if (tok.faction === 'player') return true;
      return false;
    },
    [role, yourClientId]
  );

  // Keyboard listeners for Spacebar & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        isSpacePressedRef.current = true;
      } else if (e.code === 'Escape') {
        if (chainStart) {
          setChainStart(null);
        }
        onSelectWall(null);
        onSelectToken(null);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (gameMode === 'edit' && role === 'GM' && selectedWallId) {
          onDeleteWall(selectedWallId);
          onSelectWall(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        isPanningRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [chainStart, gameMode, role, selectedWallId, onDeleteWall, onSelectWall, onSelectToken]);

  // HiDPI Canvas Resizing
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // =========================================================================
  // 3. MAIN 60 FPS RENDER LOOP WITH STAGE 3 FOG & STAGE 4 MULTIPLAYER OVERLAYS
  // =========================================================================
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const viewW = canvas.width / dpr;
      const viewH = canvas.height / dpr;
      const now = Date.now();

      ctx.save();
      ctx.scale(dpr, dpr);

      // Clear viewport background
      ctx.fillStyle = '#070A10';
      ctx.fillRect(0, 0, viewW, viewH);

      // Apply Virtual Camera Transform (Pan & Zoom)
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // -----------------------------------------------------------------------
      // LAYER 1: BACKGROUND BATTLEMAP & TERRAIN LAYER
      // -----------------------------------------------------------------------
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, mapWidth, mapHeight);

      const bgConfig = mapData.backgroundConfig || {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        opacity: 1,
      };

      if (bgImageRef.current) {
        ctx.save();
        ctx.globalAlpha = bgConfig.opacity ?? 1;
        const img = bgImageRef.current;
        const drawW = img.width * (bgConfig.scale || 1);
        const drawH = img.height * (bgConfig.scale || 1);
        ctx.drawImage(img, bgConfig.offsetX || 0, bgConfig.offsetY || 0, drawW, drawH);
        ctx.restore();
      }

      for (let r = 0; r < mapData.rows; r++) {
        for (let c = 0; c < mapData.cols; c++) {
          const tType = mapData.terrain[`${c},${r}`] || 'stone';
          const x = c * cs;
          const y = r * cs;

          if (bgImageRef.current && !mapData.terrain[`${c},${r}`]) {
            continue;
          }

          if (tType === 'stone') {
            ctx.fillStyle = (c + r) % 2 === 0 ? '#1C2433' : '#17202D';
            ctx.fillRect(x, y, cs, cs);
            ctx.strokeStyle = 'rgba(255,255,255,0.035)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 3, y + 3, cs - 6, cs - 6);
          } else if (tType === 'dirt') {
            ctx.fillStyle = (c + r) % 2 === 0 ? '#3A2718' : '#332114';
            ctx.fillRect(x, y, cs, cs);
            ctx.fillStyle = 'rgba(217, 119, 6, 0.12)';
            ctx.fillRect(x + 10, y + 12, 3, 3);
            ctx.fillRect(x + 28, y + 32, 3, 3);
          } else if (tType === 'grass') {
            ctx.fillStyle = (c + r) % 2 === 0 ? '#143324' : '#102A1E';
            ctx.fillRect(x, y, cs, cs);
            ctx.fillStyle = 'rgba(52, 211, 153, 0.14)';
            ctx.fillRect(x + 12, y + 14, 3, 3);
            ctx.fillRect(x + 32, y + 28, 3, 3);
          } else if (tType === 'wood') {
            ctx.fillStyle = (c + r) % 2 === 0 ? '#422814' : '#382110';
            ctx.fillRect(x, y, cs, cs);
            ctx.strokeStyle = 'rgba(0,0,0,0.32)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + cs * 0.5);
            ctx.lineTo(x + cs, y + cs * 0.5);
            ctx.stroke();
          } else if (tType === 'water') {
            ctx.fillStyle = (c + r) % 2 === 0 ? '#0F2C4A' : '#0B243D';
            ctx.fillRect(x, y, cs, cs);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 8, y + cs * 0.5);
            ctx.quadraticCurveTo(x + cs * 0.5, y + cs * 0.38, x + cs - 8, y + cs * 0.5);
            ctx.stroke();
          } else {
            ctx.fillStyle = '#070A10';
            ctx.fillRect(x, y, cs, cs);
          }
        }
      }

      // -----------------------------------------------------------------------
      // LAYER 2: SQUARE TACTICAL GRID LAYER
      // -----------------------------------------------------------------------
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.085)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 0; c <= mapData.cols; c++) {
          ctx.moveTo(c * cs, 0);
          ctx.lineTo(c * cs, mapHeight);
        }
        for (let r = 0; r <= mapData.rows; r++) {
          ctx.moveTo(0, r * cs);
          ctx.lineTo(mapWidth, r * cs);
        }
        ctx.stroke();

        if (showGridCoords && zoom >= 0.45) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.32)';
          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          for (let r = 0; r < mapData.rows; r++) {
            for (let c = 0; c < mapData.cols; c++) {
              const colLetter = String.fromCharCode(65 + (c % 26));
              ctx.fillText(`${colLetter}${r + 1}`, c * cs + 3, r * cs + 3);
            }
          }
        }
      }

      // -----------------------------------------------------------------------
      // LAYER 3: STAGE 3 DYNAMIC LIGHTING, PARTY VISION & FOG OF WAR
      // -----------------------------------------------------------------------
      let visionTokens: Token[] = [];
      if (partyVision) {
        visionTokens = mapData.tokens.filter((t) => t.faction === 'player');
        if (visionTokens.length === 0 && mapData.tokens.length > 0) {
          visionTokens = [mapData.tokens[0]];
        }
      } else {
        const singleTok =
          mapData.tokens.find((t) => t.id === activeTokenId) ||
          mapData.tokens.find((t) => t.id === selectedTokenId) ||
          mapData.tokens.find((t) => t.faction === 'player') ||
          mapData.tokens[0];
        if (singleTok) visionTokens = [singleTok];
      }

      const activeRaycastResults: RaycastResult[] = [];

      for (const tok of visionTokens) {
        const halfCells = (tok.size * cs) / 2;
        let origin: Point;
        if (draggingTokenRef.current && draggingTokenRef.current.id === tok.id) {
          origin = {
            x: draggingTokenRef.current.worldX,
            y: draggingTokenRef.current.worldY,
          };
        } else {
          origin = {
            x: tok.x * cs + halfCells,
            y: tok.y * cs + halfCells,
          };
        }

        const maxVisionPx = (tok.visionRadius || 12) * cs;
        const brightPx = (tok.brightLightRadius || 4) * cs;
        const dimPx = (tok.dimLightRadius || 8) * cs;
        const lightColor = tok.lightColor || '#F59E0B';

        const res = computeVisibilityPolygon(
          origin,
          maxVisionPx,
          mapData.walls,
          mapWidth,
          mapHeight,
          72,
          brightPx,
          dimPx,
          lightColor,
          tok.id
        );
        activeRaycastResults.push(res);
      }

      const activeSightPolygons = activeRaycastResults.map((r) => r.polygon);

      // Render Warm Torchlight Radial Gradients inside each visibility polygon
      for (const res of activeRaycastResults) {
        if (res.polygon.length < 3) continue;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(res.polygon[0].x, res.polygon[0].y);
        for (let i = 1; i < res.polygon.length; i++) {
          ctx.lineTo(res.polygon[i].x, res.polygon[i].y);
        }
        ctx.closePath();
        ctx.clip();

        const colorRgb = hexToRgb(res.lightColor || '#F59E0B');
        const brightR = res.brightRadiusPx || cs * 3;
        const dimR = res.dimRadiusPx || cs * 6;
        const maxR = res.radiusPx;

        const torchGrad = ctx.createRadialGradient(
          res.origin.x,
          res.origin.y,
          cs * 0.2,
          res.origin.x,
          res.origin.y,
          maxR
        );

        torchGrad.addColorStop(0, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.28)`);
        torchGrad.addColorStop(
          Math.min(0.65, brightR / maxR),
          `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.16)`
        );
        torchGrad.addColorStop(
          Math.min(0.9, dimR / maxR),
          `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.05)`
        );
        torchGrad.addColorStop(1, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0.0)`);

        ctx.fillStyle = torchGrad;
        ctx.fillRect(res.origin.x - maxR, res.origin.y - maxR, maxR * 2, maxR * 2);
        ctx.restore();
      }

      // Stage 3 Two-Layer Fog of War Compositing
      const expCanvas = exploredCanvasRef.current;
      const fogCanvas = fogCompositeCanvasRef.current;
      const isFogActive = role === 'PLAYER' || gameMode === 'play' || gmFogOpacity > 0.05;

      if (expCanvas && fogCanvas && isFogActive) {
        const expCtx = expCanvas.getContext('2d');
        if (expCtx) {
          expCtx.save();
          expCtx.fillStyle = '#FFFFFF';
          expCtx.globalCompositeOperation = 'source-over';
          for (const poly of activeSightPolygons) {
            if (poly.length < 3) continue;
            expCtx.beginPath();
            expCtx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
              expCtx.lineTo(poly[i].x, poly[i].y);
            }
            expCtx.closePath();
            expCtx.fill();
          }
          expCtx.restore();
        }

        const fogCtx = fogCanvas.getContext('2d');
        if (fogCtx) {
          fogCtx.clearRect(0, 0, mapWidth, mapHeight);

          const isPlayerView = role === 'PLAYER' || gameMode === 'play';
          const baseDarkAlpha = isPlayerView ? 0.99 : gmFogOpacity;
          fogCtx.globalCompositeOperation = 'source-over';
          fogCtx.fillStyle = `rgba(5, 8, 15, ${baseDarkAlpha})`;
          fogCtx.fillRect(0, 0, mapWidth, mapHeight);

          fogCtx.globalCompositeOperation = 'destination-out';
          fogCtx.globalAlpha = isPlayerView ? 0.35 : Math.min(0.55, gmFogOpacity * 0.7);
          fogCtx.drawImage(expCanvas, 0, 0);

          fogCtx.globalAlpha = 1.0;
          for (const poly of activeSightPolygons) {
            if (poly.length < 3) continue;
            fogCtx.beginPath();
            fogCtx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
              fogCtx.lineTo(poly[i].x, poly[i].y);
            }
            fogCtx.closePath();
            fogCtx.fill();
          }

          fogCtx.globalCompositeOperation = 'source-over';
        }

        ctx.drawImage(fogCanvas, 0, 0);
      }

      // Draw subtle warm contour around active line-of-sight boundaries
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
      ctx.lineWidth = 1.5;
      for (const poly of activeSightPolygons) {
        if (poly.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // -----------------------------------------------------------------------
      // LAYER 4: WALLS & DOORS LAYER
      // -----------------------------------------------------------------------
      for (const wall of mapData.walls) {
        const isHovered = hoveredWallIdRef.current === wall.id && gameMode === 'edit' && role === 'GM';
        const isSelected = selectedWallId === wall.id && gameMode === 'edit' && role === 'GM';
        ctx.save();
        ctx.lineCap = 'round';

        if (wall.type === 'wall') {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          let strokeColor = '#94A3B8';
          if (isSelected) {
            strokeColor = '#38BDF8';
          } else if (isHovered) {
            strokeColor = toolMode === 'eraser' ? '#EF4444' : '#F59E0B';
          }
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isSelected ? 5.5 : 4.5;
          ctx.beginPath();
          ctx.moveTo(wall.x1, wall.y1);
          ctx.lineTo(wall.x2, wall.y2);
          ctx.stroke();

          if (gameMode === 'edit' && role === 'GM') {
            ctx.fillStyle = isSelected ? '#38BDF8' : '#CBD5E1';
            ctx.beginPath();
            ctx.arc(wall.x1, wall.y1, 3.5, 0, Math.PI * 2);
            ctx.arc(wall.x2, wall.y2, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (wall.type === 'door') {
          const midX = (wall.x1 + wall.x2) / 2;
          const midY = (wall.y1 + wall.y2) / 2;

          if (wall.isOpen) {
            ctx.strokeStyle = isHovered ? '#34D399' : '#10B981';
            ctx.lineWidth = 3.5;
            ctx.setLineDash([7, 6]);
            ctx.beginPath();
            ctx.moveTo(wall.x1, wall.y1);
            ctx.lineTo(wall.x2, wall.y2);
            ctx.stroke();
            ctx.setLineDash([]);

            const dx = wall.x2 - wall.x1;
            const dy = wall.y2 - wall.y1;
            const len = Math.hypot(dx, dy);
            const perpX = (-dy / len) * 12;
            const perpY = (dx / len) * 12;

            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(wall.x1, wall.y1);
            ctx.lineTo(wall.x1 + dx * 0.3 + perpX, wall.y1 + dy * 0.3 + perpY);
            ctx.stroke();

            ctx.fillStyle = '#064E3B';
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(midX, midY, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.strokeStyle = isHovered ? '#FCD34D' : '#D97706';
            ctx.lineWidth = isSelected ? 6.5 : 5.5;
            ctx.beginPath();
            ctx.moveTo(wall.x1, wall.y1);
            ctx.lineTo(wall.x2, wall.y2);
            ctx.stroke();

            ctx.fillStyle = '#78350F';
            ctx.strokeStyle = isHovered ? '#FDE68A' : '#FBBF24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(midX, midY, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          if (gameMode === 'edit' && role === 'GM') {
            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.arc(wall.x1, wall.y1, 3.5, 0, Math.PI * 2);
            ctx.arc(wall.x2, wall.y2, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // Chain wall builder preview
      if (chainStart && role === 'GM' && (toolMode === 'wall' || toolMode === 'door')) {
        const targetPt = snapPoint(mouseWorldPosRef.current);
        ctx.save();
        ctx.strokeStyle = toolMode === 'door' ? '#F59E0B' : '#38BDF8';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(chainStart.x, chainStart.y);
        ctx.lineTo(targetPt.x, targetPt.y);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(chainStart.x, chainStart.y, 4.5, 0, Math.PI * 2);
        ctx.arc(targetPt.x, targetPt.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // -----------------------------------------------------------------------
      // LAYER 5: 2D RAYCASTING DEBUG RAYS & TACTICAL MOVEMENT TRAILS
      // -----------------------------------------------------------------------
      if (showRayDebug) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
        ctx.lineWidth = 1;
        for (const res of activeRaycastResults) {
          for (let i = 0; i < res.rays.length; i++) {
            const r = res.rays[i];
            ctx.beginPath();
            ctx.moveTo(res.origin.x, res.origin.y);
            ctx.lineTo(r.x, r.y);
            ctx.stroke();
          }
          ctx.fillStyle = '#EF4444';
          for (let i = 0; i < res.polygon.length; i++) {
            const pt = res.polygon[i];
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // Render recent Token Movement Trails (fade out over 4 seconds)
      for (const trail of moveTrails) {
        const age = now - trail.timestamp;
        if (age > 4000) continue;

        const trailTok = mapData.tokens.find((t) => t.id === trail.tokenId);

        // Visibility check: players must NOT see movement trails of enemies when they are in darkness!
        if (role === 'PLAYER' || gameMode === 'play') {
          // 1. Never show trails of tokens marked hidden by GM
          if (trailTok?.isHiddenByGM) {
            continue;
          }

          // 2. If it is an enemy / monster (or token culled from player state)
          const isMonster = !trailTok || trailTok.faction === 'monster';
          if (isMonster) {
            const x1 = (trail.fromX + 0.5) * cs;
            const y1 = (trail.fromY + 0.5) * cs;
            const x2 = (trail.toX + 0.5) * cs;
            const y2 = (trail.toY + 0.5) * cs;

            const radius = cs * 0.42;
            const destInLOS = isInFieldOfView(x2, y2, activeSightPolygons, radius);
            const origInLOS = isInFieldOfView(x1, y1, activeSightPolygons, radius);

            // If the enemy ends up in the dark, players do NOT see where it moved!
            // If both origin and destination are outside active light (in the dark), hide completely.
            let isTrailVisible = false;
            if (monsterVisibilityMode === 'always') {
              isTrailVisible = true;
            } else if (destInLOS) {
              // Enemy arrived into direct player vision/light
              isTrailVisible = true;
            } else if (origInLOS && monsterVisibilityMode === 'explored') {
              // Started in sight and fled, but only if destination was explored
              isTrailVisible = isPointExplored(x2, y2);
            }

            if (!isTrailVisible) {
              // Enemy is in the dark: skip rendering movement trail
              continue;
            }
          }
        }

        const alpha = Math.max(0, 1 - age / 4000);
        const x1 = (trail.fromX + 0.5) * cs;
        const y1 = (trail.fromY + 0.5) * cs;
        const x2 = (trail.toX + 0.5) * cs;
        const y2 = (trail.toY + 0.5) * cs;

        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = trail.color || '#F59E0B';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = trail.color || '#F59E0B';
        ctx.beginPath();
        ctx.arc(x1, y1, 4, 0, Math.PI * 2);
        ctx.fill();

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - 10;
        const text = `${trail.feet} фт.`;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(11, 15, 23, 0.9)';
        ctx.fillRect(midX - tw / 2 - 4, midY - 7, tw + 8, 14);
        ctx.fillStyle = '#FDE68A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, midX, midY);
        ctx.restore();
      }

      // -----------------------------------------------------------------------
      // LAYER 6: STAGE 3 & 4 ENTITY CULLING & TOKEN RENDERING
      // -----------------------------------------------------------------------
      for (const token of mapData.tokens) {
        // Players never see tokens explicitly hidden by GM
        if (token.isHiddenByGM && role !== 'GM') {
          continue;
        }

        const tokenSpan = token.size * cs;
        const radius = tokenSpan * 0.42;

        let centerX = token.x * cs + tokenSpan / 2;
        let centerY = token.y * cs + tokenSpan / 2;

        if (draggingTokenRef.current && draggingTokenRef.current.id === token.id) {
          centerX = draggingTokenRef.current.worldX;
          centerY = draggingTokenRef.current.worldY;

          const snapCol = Math.max(
            0,
            Math.min(mapData.cols - token.size, Math.round((centerX - tokenSpan / 2) / cs))
          );
          const snapRow = Math.max(
            0,
            Math.min(mapData.rows - token.size, Math.round((centerY - tokenSpan / 2) / cs))
          );
          ctx.save();
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
          ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.fillRect(snapCol * cs + 2, snapRow * cs + 2, tokenSpan - 4, tokenSpan - 4);
          ctx.strokeRect(snapCol * cs + 2, snapRow * cs + 2, tokenSpan - 4, tokenSpan - 4);
          ctx.restore();
        }

        const inLOS =
          token.faction === 'player' ||
          isInFieldOfView(centerX, centerY, activeSightPolygons, radius * 0.9);

        let isVisible = true;
        if (token.faction === 'monster') {
          if (role === 'GM' && gameMode === 'edit') {
            isVisible = true;
          } else if (monsterVisibilityMode === 'always') {
            isVisible = true;
          } else if (inLOS) {
            isVisible = true;
          } else if (monsterVisibilityMode === 'explored') {
            isVisible = isPointExplored(centerX, centerY);
          } else {
            isVisible = false;
          }
        }

        if (!isVisible) {
          continue;
        }

        ctx.save();
        if ((token.faction === 'monster' && !inLOS) || token.isHiddenByGM) {
          ctx.globalAlpha = role === 'GM' ? 0.62 : 0.75;
        }

        const isSelected = token.id === selectedTokenId;
        const isVisionSource = token.id === activeTokenId;

        // AoE Spell Target Detection Highlight (Red for enemies, Emerald for allies)
        const isSpellTarget = affectedTokenIds.includes(token.id);
        if (isSpellTarget) {
          const pulse = (Math.sin(now / 120) + 1) / 2;
          const targetColor = token.faction === 'player' ? '#10B981' : '#EF4444';
          ctx.strokeStyle = targetColor;
          ctx.lineWidth = 3.5 + pulse * 2;
          ctx.shadowColor = targetColor;
          ctx.shadowBlur = 12 + pulse * 8;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 7 + pulse * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Stage 5: Combat Active Turn Aura
        const isCombatTurn =
          !!mapData.combat?.isActive &&
          mapData.combat.combatants[mapData.combat.currentTurnIndex]?.tokenId === token.id;

        if (isCombatTurn) {
          const pulse = (Math.sin(now / 180) + 1) / 2;
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.7 + pulse * 0.3})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 8 + pulse * 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Halo
        if (token.isHiddenByGM) {
          ctx.strokeStyle = '#A855F7';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (isVisionSource) {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isSelected) {
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(centerX, centerY + 3, radius, 0, Math.PI * 2);
        ctx.fill();

        // Token Body Circle
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner colored radial gradient
        const grad = ctx.createRadialGradient(
          centerX - radius * 0.25,
          centerY - radius * 0.25,
          radius * 0.1,
          centerX,
          centerY,
          radius
        );
        grad.addColorStop(0, token.color);
        grad.addColorStop(1, '#0F172A');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
        ctx.fill();

        // Metallic Rim
        ctx.strokeStyle = token.faction === 'player' ? '#FBBF24' : '#F43F5E';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 1, 0, Math.PI * 2);
        ctx.stroke();

        // Torch indicator badge on token if emitting light
        if (token.emitsLight) {
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(centerX + radius * 0.65, centerY - radius * 0.65, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Token Initials
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 ${Math.round(radius * 0.72)}px "Cinzel", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token.initials, centerX, centerY + 1);

        // Stage 5: AC Shield Badge on lower left
        if (token.ac) {
          const acX = centerX - radius * 0.7;
          const acY = centerY + radius * 0.7;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(acX, acY, 8.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#F8FAFC';
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(token.ac), acX, acY);
        }

        // Stage 5: D&D 5e Conditions Icons on top right
        if (token.conditions && token.conditions.length > 0) {
          const displayedConds = token.conditions.slice(0, 3);
          for (let ci = 0; ci < displayedConds.length; ci++) {
            const condDef = DND_CONDITIONS.find((d) => d.id === displayedConds[ci]);
            if (!condDef) continue;
            const condX = centerX + radius * 0.55 + ci * 12;
            const condY = centerY - radius * 0.75;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(condDef.icon, condX, condY);
          }
        }

        // HP Bar
        const barW = tokenSpan * 0.8;
        const barH = 5;
        const barX = centerX - barW / 2;
        const barY = centerY - radius - 10;
        const hpRatio = Math.max(0, Math.min(1, token.hp / Math.max(1, token.maxHp)));

        const showHpNumbers =
          role === 'GM' ||
          mapData.hpVisibility === 'exact' ||
          (token.faction === 'player' && mapData.hpVisibility !== 'hidden');

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle =
          hpRatio > 0.5 ? '#10B981' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // Temp HP extra indicator
        if (token.tempHp && token.tempHp > 0) {
          const tempRatio = Math.min(1, token.tempHp / token.maxHp);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(barX, barY - 2.5, barW * tempRatio, 2);
        }

        // Optional numeric HP text over bar
        if (showHpNumbers && zoom >= 0.7) {
          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.fillStyle = '#F8FAFC';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(
            `${token.hp}/${token.maxHp}${token.tempHp ? ` (+${token.tempHp})` : ''}`,
            centerX,
            barY - 1
          );
        }

        // Nameplate
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        let labelText = token.name;
        if (token.isHiddenByGM) {
          labelText = `${token.name} [СКРЫТ GM]`;
        } else if (role === 'GM' && token.faction === 'monster' && !inLOS) {
          labelText = `${token.name} (Вне обзора)`;
        }
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillStyle = token.isHiddenByGM ? 'rgba(59, 7, 100, 0.9)' : 'rgba(11, 15, 23, 0.85)';
        ctx.fillRect(centerX - textWidth / 2 - 4, centerY + radius + 3, textWidth + 8, 15);
        ctx.fillStyle = token.isHiddenByGM ? '#E9D5FF' : '#E2E8F0';
        ctx.fillText(labelText, centerX, centerY + radius + 11);

        // Turn indicator badge above HP if active combat turn
        if (isCombatTurn) {
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(centerX - 16, barY - 15, 32, 12);
          ctx.fillStyle = '#090D14';
          ctx.font = '800 9px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('ХОД', centerX, barY - 9);
        }

        ctx.restore();
      }

      // -----------------------------------------------------------------------
      // LAYER 6.C: POSITIONAL 2D AUDIO SOURCES (GM VIEW)
      // -----------------------------------------------------------------------
      if (role === 'GM' && mapData.audioSources && mapData.audioSources.length > 0) {
        for (const src of mapData.audioSources) {
          const isSelected = src.id === selectedAudioSourceId;
          const isSourcePlaying = src.isPlaying;
          const color = src.color || '#F59E0B';

          ctx.save();
          // 1. Max Distance Outer Ring (Audible boundary)
          ctx.strokeStyle = isSelected ? '#F59E0B' : color;
          ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.05)' : 'rgba(56, 189, 248, 0.03)';
          ctx.lineWidth = isSelected ? 2 : 1.2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.arc(src.x, src.y, src.maxDistance, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          // 2. Min Distance Inner Ring (100% volume boundary)
          ctx.strokeStyle = isSelected ? '#FBBF24' : '#38BDF8';
          ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(src.x, src.y, src.minDistance, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // 3. Dynamic Animated Acoustic Waves when Playing
          if (isSourcePlaying) {
            const waveProgress = ((now % 1600) / 1600);
            const waveR = src.minDistance + waveProgress * (src.maxDistance - src.minDistance);
            ctx.strokeStyle = color;
            ctx.globalAlpha = (1 - waveProgress) * 0.7;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(src.x, src.y, waveR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          }

          // 4. Center Speaker Beacon
          ctx.fillStyle = isSelected ? '#F59E0B' : '#0F172A';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(src.x, src.y, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Beacon Inner Dot / Symbol
          ctx.fillStyle = isSelected ? '#0F172A' : color;
          ctx.beginPath();
          ctx.arc(src.x, src.y, 5, 0, Math.PI * 2);
          ctx.fill();

          // Label Nameplate
          ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
          const label = `🔊 ${src.name} (${Math.round(src.volume * 100)}%)`;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(11, 15, 23, 0.9)';
          ctx.fillRect(src.x - tw / 2 - 4, src.y + 18, tw + 8, 15);
          ctx.fillStyle = isSelected ? '#FDE68A' : '#E2E8F0';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, src.x, src.y + 25);

          ctx.restore();
        }
      }

      // -----------------------------------------------------------------------
      // LAYER 7: TACTICAL RULER, REMOTE CURSORS, PINGS & OVERLAYS
      // -----------------------------------------------------------------------

      // 7.A. Local Tactical Ruler
      if (rulerRef.current) {
        const { start, current } = rulerRef.current;
        const distPx = Math.hypot(current.x - start.x, current.y - start.y);
        const cells = distPx / cs;
        const feet = Math.round(cells * 5);

        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
        ctx.arc(current.x, current.y, 4, 0, Math.PI * 2);
        ctx.fill();

        const label = `${feet} фт. (${cells.toFixed(1)} кл.)`;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        const tw = ctx.measureText(label).width;
        const midX = (start.x + current.x) / 2;
        const midY = (start.y + current.y) / 2 - 14;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1;
        ctx.fillRect(midX - tw / 2 - 6, midY - 10, tw + 12, 20);
        ctx.strokeRect(midX - tw / 2 - 6, midY - 10, tw + 12, 20);
        ctx.fillStyle = '#F8FAFC';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);
        ctx.restore();
      }

      // 7.B. Remote Peers' Tactical Rulers
      for (const rr of remoteRulers) {
        if (now - rr.updatedAt > 5000) continue;
        const distPx = Math.hypot(rr.current.x - rr.start.x, rr.current.y - rr.start.y);
        const cells = distPx / cs;
        const feet = Math.round(cells * 5);

        ctx.save();
        ctx.strokeStyle = rr.color || '#F59E0B';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(rr.start.x, rr.start.y);
        ctx.lineTo(rr.current.x, rr.current.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = `${rr.senderName}: ${feet} фт.`;
        ctx.font = '600 11px "JetBrains Mono", monospace';
        const tw = ctx.measureText(label).width;
        const midX = (rr.start.x + rr.current.x) / 2;
        const midY = (rr.start.y + rr.current.y) / 2 - 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(midX - tw / 2 - 5, midY - 9, tw + 10, 18);
        ctx.fillStyle = rr.color || '#F59E0B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);
        ctx.restore();
      }

      // 7.C. Animated Tactical Map Pings (expanding sonar rings)
      for (const ping of pings) {
        const age = now - ping.createdAt;
        if (age > 3200) continue;
        const progress = age / 3200;
        const alpha = Math.max(0, 1 - progress);

        ctx.save();
        // Outer expanding wave 1
        const r1 = 8 + progress * cs * 1.6;
        ctx.strokeStyle = ping.color || '#F59E0B';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, r1, 0, Math.PI * 2);
        ctx.stroke();

        // Second harmonic wave
        const p2 = ((age % 1000) / 1000);
        const r2 = 4 + p2 * cs * 0.95;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, r2, 0, Math.PI * 2);
        ctx.stroke();

        // Center beacon dot
        ctx.fillStyle = ping.color || '#F59E0B';
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Sender badge
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        const label = `📍 ${ping.senderName}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(11, 15, 23, 0.9)';
        ctx.fillRect(ping.x - tw / 2 - 5, ping.y - 28, tw + 10, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, ping.x, ping.y - 20);
        ctx.restore();
      }

      // 7.D. Placed AoE Spell Templates (Persistent on map) with raycast wall clipping
      for (const spell of placedSpellTemplates) {
        const isSel = spell.id === selectedSpellTemplateId;
        SpellTemplateManager.drawTemplate(
          ctx,
          spell,
          cs,
          now,
          false,
          isSel,
          mapData.walls,
          mapWidth,
          mapHeight
        );
      }

      // 7.E. Active AoE Spell Preview (Follows mouse cursor / caster)
      if (activeSpellPreview) {
        // Smoothly interpolate angle for cone/line in requestAnimationFrame loop to eliminate jitter
        if (activeSpellPreview.shape === 'cone' || activeSpellPreview.shape === 'line') {
          let diff = activeSpellPreview.angle - smoothSpellAngleRef.current;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          smoothSpellAngleRef.current += diff * 0.32;
        }

        const previewToDraw = {
          ...activeSpellPreview,
          angle:
            activeSpellPreview.shape === 'cone' || activeSpellPreview.shape === 'line'
              ? smoothSpellAngleRef.current
              : activeSpellPreview.angle,
        };

        SpellTemplateManager.drawTemplate(
          ctx,
          previewToDraw,
          cs,
          now,
          true,
          false,
          mapData.walls,
          mapWidth,
          mapHeight
        );
      }

      // 7.E-2. Spell Cast Visual Effects (expanding shockwaves and burst particles)
      if (activeCastEffects && activeCastEffects.length > 0) {
        for (const effect of activeCastEffects) {
          SpellTemplateManager.drawCastEffect(ctx, effect, now);
        }
      }

      // 7.F. Remote Connected Players' Live Cursors
      for (const peer of peers) {
        if (peer.clientId === yourClientId || !peer.cursor) continue;
        const { x, y } = peer.cursor;
        ctx.save();
        ctx.fillStyle = peer.color || '#38BDF8';
        ctx.strokeStyle = '#090D14';
        ctx.lineWidth = 1.5;

        // Draw tactical pointer triangle
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y + 4);
        ctx.lineTo(x + 5, y + 6);
        ctx.lineTo(x + 4, y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Name tag
        ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
        const tag = peer.role === 'GM' ? `👑 ${peer.name}` : peer.name;
        const tw = ctx.measureText(tag).width;
        ctx.fillStyle = 'rgba(11, 15, 23, 0.88)';
        ctx.fillRect(x + 10, y + 10, tw + 8, 14);
        ctx.fillStyle = peer.color || '#38BDF8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, x + 14, y + 17);
        ctx.restore();
      }

      // Stage 3: GM Fog Brush Preview Indicator
      if (gameMode === 'edit' && role === 'GM' && toolMode === 'fog_brush') {
        const radiusPx = (fogBrushSize * cs) / 2;
        ctx.save();
        ctx.strokeStyle = fogBrushAction === 'reveal' ? '#38BDF8' : '#EF4444';
        ctx.fillStyle =
          fogBrushAction === 'reveal' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(239, 68, 68, 0.18)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(mouseWorldPosRef.current.x, mouseWorldPosRef.current.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Snap point ghost dot when drawing walls
      if (
        gameMode === 'edit' &&
        role === 'GM' &&
        snapToGrid &&
        (toolMode === 'wall' || toolMode === 'door')
      ) {
        const snappedPt = snapPoint(mouseWorldPosRef.current);
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(snappedPt.x, snappedPt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore(); // camera pan/zoom restore
      ctx.restore(); // dpr scale restore

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    mapData,
    role,
    gameMode,
    yourClientId,
    activeTokenId,
    selectedTokenId,
    selectedWallId,
    toolMode,
    activeTerrain,
    snapToGrid,
    snapTarget,
    showGrid,
    showGridCoords,
    showRayDebug,
    gmFogOpacity,
    partyVision,
    fogBrushAction,
    fogBrushSize,
    monsterVisibilityMode,
    peers,
    pings,
    remoteRulers,
    moveTrails,
    chainStart,
    pan,
    zoom,
    mapWidth,
    mapHeight,
    cs,
    snapPoint,
    isPointExplored,
  ]);

  // =========================================================================
  // 4. MOUSE & WHEEL INTERACTION HANDLERS
  // =========================================================================

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.2, Math.min(3.0, Number((zoom * factor).toFixed(3))));
    if (newZoom === zoom) return;

    const worldBefore = screenToWorld(mouseScreenX, mouseScreenY);
    const newPanX = mouseScreenX - worldBefore.x * newZoom;
    const newPanY = mouseScreenY - worldBefore.y * newZoom;

    setPan({ x: newPanX, y: newPanY });
    onZoomChange(newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = screenToWorld(sx, sy);

    // Pan via Middle Mouse or Space + LMB or Pan Tool
    if (e.button === 1 || isSpacePressedRef.current || toolMode === 'pan') {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    // Right-Click (ПКМ)
    if (e.button === 2) {
      e.preventDefault();
      if (chainStart) {
        setChainStart(null);
        return;
      }
      // Right-Click on a placed spell template deletes it
      if (placedSpellTemplates.length > 0) {
        for (let i = placedSpellTemplates.length - 1; i >= 0; i--) {
          const sp = placedSpellTemplates[i];
          const rangePx = (sp.radiusFt / 5) * cs;
          if (Math.hypot(worldPt.x - sp.x, worldPt.y - sp.y) <= Math.max(25, rangePx)) {
            soundFX.playWallBuild();
            onDeleteSpellTemplate?.(sp.id);
            return;
          }
        }
      }

      if (gameMode === 'edit' && role === 'GM') {
        const hitWall = mapData.walls.find(
          (w) => distToSegment(worldPt.x, worldPt.y, w.x1, w.y1, w.x2, w.y2) <= 10
        );
        if (hitWall) {
          soundFX.playWallBuild();
          onDeleteWall(hitWall.id);
          if (selectedWallId === hitWall.id) onSelectWall(null);
          return;
        }
      }
      return;
    }

    if (e.button !== 0) return;

    // Tactical Ping via Alt + Left Click or 'ping' tool
    if (e.altKey || toolMode === 'ping') {
      soundFX.playPing();
      onEmitPing?.(worldPt);
      return;
    }

    // Measure tool
    if (toolMode === 'measure') {
      rulerRef.current = { start: worldPt, current: worldPt };
      onEmitRuler?.(rulerRef.current);
      return;
    }

    // AoE Spell Template Placer Tool: Place and fixate template on map
    if (toolMode === 'spell') {
      if (activeSpellPreview) {
        soundFX.playPing();
        onPlaceSpellTemplate?.(activeSpellPreview);
      }
      return;
    }

    // Stage 3: GM Fog of War Brush Tool
    if (gameMode === 'edit' && role === 'GM' && toolMode === 'fog_brush') {
      isPaintingFogRef.current = true;
      const radiusPx = (fogBrushSize * cs) / 2;
      applyManualFogStamp(fogBrushAction, worldPt.x, worldPt.y, radiusPx);
      onManualFogPaint?.(fogBrushAction, worldPt.x, worldPt.y, radiusPx);
      return;
    }

    // Wall & Door Builder Tool (GM Edit Mode)
    if (gameMode === 'edit' && role === 'GM' && (toolMode === 'wall' || toolMode === 'door')) {
      const snapped = snapPoint(worldPt);
      if (!chainStart) {
        setChainStart(snapped);
      } else {
        const len = Math.hypot(snapped.x - chainStart.x, snapped.y - chainStart.y);
        if (len >= 8) {
          soundFX.playWallBuild();
          onCreateWall({
            id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            x1: chainStart.x,
            y1: chainStart.y,
            x2: snapped.x,
            y2: snapped.y,
            type: toolMode === 'door' ? 'door' : 'wall',
            isOpen: false,
          });
          setChainStart(snapped);
        }
      }
      return;
    }

    // Eraser Tool (GM Edit Mode)
    if (gameMode === 'edit' && role === 'GM' && toolMode === 'eraser') {
      const hitWall = mapData.walls.find(
        (w) => distToSegment(worldPt.x, worldPt.y, w.x1, w.y1, w.x2, w.y2) <= 10
      );
      if (hitWall) {
        soundFX.playWallBuild();
        onDeleteWall(hitWall.id);
        if (selectedWallId === hitWall.id) onSelectWall(null);
      }
      return;
    }

    // Terrain Brush Tool (GM Edit Mode)
    if (gameMode === 'edit' && role === 'GM' && toolMode === 'terrain') {
      const baseCol = Math.floor(worldPt.x / cs);
      const baseRow = Math.floor(worldPt.y / cs);
      isPaintingTerrainRef.current = true;
      paintedInStrokeRef.current.clear();

      const cellsToPaint: { key: string; terrain: TerrainType }[] = [];
      const halfB = Math.floor(terrainBrushSize / 2);
      for (let dr = -halfB; dr <= halfB; dr++) {
        for (let dc = -halfB; dc <= halfB; dc++) {
          const c = baseCol + dc;
          const r = baseRow + dr;
          if (c >= 0 && c < mapData.cols && r >= 0 && r < mapData.rows) {
            const key = `${c},${r}`;
            paintedInStrokeRef.current.add(key);
            cellsToPaint.push({ key, terrain: activeTerrain });
          }
        }
      }
      if (cellsToPaint.length > 0) {
        onPaintTerrain(cellsToPaint);
      }
      return;
    }

    // Audio Tool: Place new positional audio source on click (GM Mode)
    if (gameMode === 'edit' && role === 'GM' && toolMode === 'audio') {
      soundFX.playStep();
      onCreateAudioSourceAt?.(Math.round(worldPt.x), Math.round(worldPt.y));
      return;
    }

    // Select Mode:
    // 0. In GM mode, check if clicked on an Audio Source Beacon
    if (role === 'GM' && mapData.audioSources) {
      for (let i = mapData.audioSources.length - 1; i >= 0; i--) {
        const src = mapData.audioSources[i];
        if (Math.hypot(worldPt.x - src.x, worldPt.y - src.y) <= 18) {
          onSelectAudioSource?.(src.id);
          onSelectToken(null);
          onSelectWall(null);
          draggingAudioSourceRef.current = {
            id: src.id,
            offsetX: worldPt.x - src.x,
            offsetY: worldPt.y - src.y,
          };
          return;
        }
      }
    }

    // 0.5. Check if user clicked on a Placed Spell Template (Drag body or Rotate handle)
    if (placedSpellTemplates.length > 0 && toolMode !== 'wall' && toolMode !== 'door' && toolMode !== 'fog_brush') {
      // Check rotation tip of selected template first
      const selectedTemplate = placedSpellTemplates.find((t) => t.id === selectedSpellTemplateId);
      if (
        selectedTemplate &&
        (selectedTemplate.shape === 'cone' || selectedTemplate.shape === 'line')
      ) {
        const rangePx = (selectedTemplate.radiusFt / 5) * cs;
        const tipX = selectedTemplate.x + Math.cos(selectedTemplate.angle) * (rangePx + 15);
        const tipY = selectedTemplate.y + Math.sin(selectedTemplate.angle) * (rangePx + 15);
        if (Math.hypot(worldPt.x - tipX, worldPt.y - tipY) <= 15) {
          draggingSpellTemplateRef.current = {
            id: selectedTemplate.id,
            isRotating: true,
            offsetX: 0,
            offsetY: 0,
          };
          return;
        }
      }

      // Check clicking template center / body
      for (let i = placedSpellTemplates.length - 1; i >= 0; i--) {
        const sp = placedSpellTemplates[i];
        const rangePx = (sp.radiusFt / 5) * cs;
        const isInside =
          sp.shape === 'circle'
            ? Math.hypot(worldPt.x - sp.x, worldPt.y - sp.y) <= rangePx
            : Math.hypot(worldPt.x - sp.x, worldPt.y - sp.y) <= Math.max(26, rangePx * 0.7);

        if (isInside) {
          onSelectSpellTemplate?.(sp.id);
          onSelectToken(null);
          onSelectWall(null);
          onSelectAudioSource?.(null);
          draggingSpellTemplateRef.current = {
            id: sp.id,
            isRotating: false,
            offsetX: worldPt.x - sp.x,
            offsetY: worldPt.y - sp.y,
          };
          return;
        }
      }
    }

    // 1. Check if user clicked on a Door
    const clickedDoor = mapData.walls.find(
      (w) =>
        w.type === 'door' &&
        distToSegment(worldPt.x, worldPt.y, w.x1, w.y1, w.x2, w.y2) <= 12
    );
    if (clickedDoor) {
      soundFX.playDoorToggle(!clickedDoor.isOpen);
      onToggleDoor(clickedDoor.id);
      return;
    }

    // 2. Check if user clicked on a Token
    for (let i = mapData.tokens.length - 1; i >= 0; i--) {
      const tok = mapData.tokens[i];
      if (tok.isHiddenByGM && role !== 'GM') continue;

      const span = tok.size * cs;
      const cx = tok.x * cs + span / 2;
      const cy = tok.y * cs + span / 2;
      const dist = Math.hypot(worldPt.x - cx, worldPt.y - cy);

      if (dist <= span * 0.48) {
        onSelectToken(tok.id);
        onSelectWall(null);
        onSelectAudioSource?.(null);

        if (tok.faction === 'player' || role === 'GM') {
          onActivateVisionToken(tok.id);
        }

        // Enforce Stage 4 Role Permission before starting drag
        if (!canControlToken(tok)) {
          return;
        }

        draggingTokenRef.current = {
          id: tok.id,
          startX: tok.x,
          startY: tok.y,
          worldX: cx,
          worldY: cy,
          offsetX: worldPt.x - cx,
          offsetY: worldPt.y - cy,
        };
        return;
      }
    }

    // 3. Edit Mode: check wall selection
    if (gameMode === 'edit' && role === 'GM') {
      const hitWall = mapData.walls.find(
        (w) => distToSegment(worldPt.x, worldPt.y, w.x1, w.y1, w.x2, w.y2) <= 8
      );
      if (hitWall) {
        onSelectWall(hitWall.id);
        onSelectToken(null);
        onSelectAudioSource?.(null);
        return;
      }
    }

    // Clicked empty void
    onSelectToken(null);
    onSelectWall(null);
    onSelectAudioSource?.(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = screenToWorld(sx, sy);
    mouseWorldPosRef.current = worldPt;

    const col = Math.max(0, Math.min(mapData.cols - 1, Math.floor(worldPt.x / cs)));
    const row = Math.max(0, Math.min(mapData.rows - 1, Math.floor(worldPt.y / cs)));
    onCursorWorldMove?.(worldPt, { col, row });

    // Handle Pan
    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    // Handle Measure
    if (rulerRef.current) {
      rulerRef.current = { ...rulerRef.current, current: worldPt };
      onEmitRuler?.(rulerRef.current);
      return;
    }

    // Stage 3: Handle continuous GM Fog Painting
    if (isPaintingFogRef.current && gameMode === 'edit' && role === 'GM' && toolMode === 'fog_brush') {
      const radiusPx = (fogBrushSize * cs) / 2;
      applyManualFogStamp(fogBrushAction, worldPt.x, worldPt.y, radiusPx);
      onManualFogPaint?.(fogBrushAction, worldPt.x, worldPt.y, radiusPx);
      return;
    }

    // Handle Continuous Terrain Paint
    if (isPaintingTerrainRef.current && gameMode === 'edit' && role === 'GM' && toolMode === 'terrain') {
      const baseCol = Math.floor(worldPt.x / cs);
      const baseRow = Math.floor(worldPt.y / cs);
      const halfB = Math.floor(terrainBrushSize / 2);
      const newCells: { key: string; terrain: TerrainType }[] = [];

      for (let dr = -halfB; dr <= halfB; dr++) {
        for (let dc = -halfB; dc <= halfB; dc++) {
          const c = baseCol + dc;
          const r = baseRow + dr;
          if (c >= 0 && c < mapData.cols && r >= 0 && r < mapData.rows) {
            const key = `${c},${r}`;
            if (!paintedInStrokeRef.current.has(key)) {
              paintedInStrokeRef.current.add(key);
              newCells.push({ key, terrain: activeTerrain });
            }
          }
        }
      }
      if (newCells.length > 0) {
        onPaintTerrain(newCells);
      }
      return;
    }

    // Handle Placed Spell Template Dragging or Rotating
    if (draggingSpellTemplateRef.current) {
      const drag = draggingSpellTemplateRef.current;
      const sp = placedSpellTemplates.find((t) => t.id === drag.id);
      if (sp) {
        if (drag.isRotating) {
          const newAngle = Math.atan2(worldPt.y - sp.y, worldPt.x - sp.x);
          onMoveSpellTemplate?.({ ...sp, angle: newAngle });
        } else {
          const nx = Math.max(20, Math.min(mapWidth - 20, worldPt.x - drag.offsetX));
          const ny = Math.max(20, Math.min(mapHeight - 20, worldPt.y - drag.offsetY));
          onMoveSpellTemplate?.({ ...sp, x: Math.round(nx), y: Math.round(ny) });
        }
      }
      return;
    }

    // Handle Audio Source Dragging by GM
    if (draggingAudioSourceRef.current) {
      const drag = draggingAudioSourceRef.current;
      const nx = Math.max(20, Math.min(mapWidth - 20, worldPt.x - drag.offsetX));
      const ny = Math.max(20, Math.min(mapHeight - 20, worldPt.y - drag.offsetY));
      onMoveAudioSource?.(drag.id, Math.round(nx), Math.round(ny));
      return;
    }

    // Handle Token Dragging with 60 FPS Raycasting update
    if (draggingTokenRef.current) {
      const drag = draggingTokenRef.current;
      const tok = mapData.tokens.find((t) => t.id === drag.id);
      if (!tok) return;
      const span = tok.size * cs;

      const nx = Math.max(span / 2, Math.min(mapWidth - span / 2, worldPt.x - drag.offsetX));
      const ny = Math.max(span / 2, Math.min(mapHeight - span / 2, worldPt.y - drag.offsetY));
      draggingTokenRef.current.worldX = nx;
      draggingTokenRef.current.worldY = ny;

      const floatCol = (nx - span / 2) / cs;
      const floatRow = (ny - span / 2) / cs;
      onMoveToken(
        drag.id,
        Number(floatCol.toFixed(2)),
        Number(floatRow.toFixed(2)),
        false,
        drag.startX,
        drag.startY
      );
      return;
    }

    // Update hovered wall highlight
    const hoverCandidate = mapData.walls.find((w) => {
      if (toolMode === 'eraser' && gameMode === 'edit') {
        return distToSegment(worldPt.x, worldPt.y, w.x1, w.y1, w.x2, w.y2) <= 10;
      }
      return distToSegment(worldPt.x, worldPt.y, w.x1, w.y1, w.x2, w.y2) <= 8;
    });
    hoveredWallIdRef.current = hoverCandidate ? hoverCandidate.id : null;
  };

  const handleMouseUp = () => {
    if (draggingSpellTemplateRef.current) {
      draggingSpellTemplateRef.current = null;
      return;
    }
    if (draggingAudioSourceRef.current) {
      draggingAudioSourceRef.current = null;
      return;
    }
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (rulerRef.current) {
      rulerRef.current = null;
      onEmitRuler?.(null);
      return;
    }

    if (isPaintingFogRef.current) {
      isPaintingFogRef.current = false;
      return;
    }

    if (isPaintingTerrainRef.current) {
      isPaintingTerrainRef.current = false;
      paintedInStrokeRef.current.clear();
      return;
    }

    if (draggingTokenRef.current) {
      const drag = draggingTokenRef.current;
      const tok = mapData.tokens.find((t) => t.id === drag.id);
      draggingTokenRef.current = null;
      if (tok) {
        const span = tok.size * cs;
        let finalCol = (drag.worldX - span / 2) / cs;
        let finalRow = (drag.worldY - span / 2) / cs;

        if (snapToGrid) {
          finalCol = Math.round(finalCol);
          finalRow = Math.round(finalRow);
        } else {
          finalCol = Number(finalCol.toFixed(2));
          finalRow = Number(finalRow.toFixed(2));
        }

        finalCol = Math.max(0, Math.min(mapData.cols - tok.size, finalCol));
        finalRow = Math.max(0, Math.min(mapData.rows - tok.size, finalRow));

        soundFX.playStep();
        onMoveToken(tok.id, finalCol, finalRow, true, drag.startX, drag.startY);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full overflow-hidden bg-[#070A10] select-none"
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`block w-full h-full ${
          isPanningRef.current || toolMode === 'pan'
            ? 'cursor-grab active:cursor-grabbing'
            : toolMode === 'wall' || toolMode === 'door' || toolMode === 'measure' || toolMode === 'ping'
            ? 'cursor-crosshair'
            : toolMode === 'fog_brush'
            ? 'cursor-crosshair'
            : toolMode === 'eraser'
            ? 'cursor-pointer'
            : 'cursor-default'
        }`}
      />
    </div>
  );
};

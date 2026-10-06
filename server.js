// server.ts
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

// src/data/presets.ts
function buildDungeonTerrain(cols, rows) {
  const terrain = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      terrain[`${c},${r}`] = "stone";
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= 3; c++) {
      terrain[`${c},${r}`] = (c + r) % 3 === 0 ? "dirt" : "grass";
    }
  }
  for (let r = 6; r <= 8; r++) {
    for (let c = 0; c <= 4; c++) {
      terrain[`${c},${r}`] = "dirt";
    }
  }
  for (let r = 5; r <= 9; r++) {
    for (let c = 6; c <= 10; c++) {
      terrain[`${c},${r}`] = "wood";
    }
  }
  for (let r = 2; r <= 13; r++) {
    for (let c = 15; c <= 16; c++) {
      if (r !== 7 && r !== 8) {
        terrain[`${c},${r}`] = "water";
      } else {
        terrain[`${c},${r}`] = "wood";
      }
    }
  }
  return terrain;
}
var CELL = 50;
var PRESET_MAPS = [
  {
    id: "crypt-of-whispers",
    name: "\u041A\u0440\u0438\u043F\u0442\u0430 \u0428\u0435\u043F\u0447\u0443\u0449\u0438\u0445 \u0422\u0435\u043D\u0435\u0439 (D&D 5e \xB7 \u0421\u0435\u0442\u043A\u0430 50px)",
    cols: 26,
    rows: 16,
    cellSize: CELL,
    ambientLight: "pitch_dark",
    backgroundConfig: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 1
    },
    terrain: buildDungeonTerrain(26, 16),
    walls: [
      // Outer dungeon perimeter wall separating courtyard (col 4)
      { id: "w-ext-top", x1: 4 * CELL, y1: 1 * CELL, x2: 4 * CELL, y2: 6 * CELL, type: "wall" },
      { id: "d-main-gate", x1: 4 * CELL, y1: 6 * CELL, x2: 4 * CELL, y2: 8 * CELL, type: "door", isOpen: false },
      { id: "w-ext-bot", x1: 4 * CELL, y1: 8 * CELL, x2: 4 * CELL, y2: 15 * CELL, type: "wall" },
      // Top & Bottom dungeon bounds
      { id: "w-top-bound", x1: 4 * CELL, y1: 1 * CELL, x2: 24 * CELL, y2: 1 * CELL, type: "wall" },
      { id: "w-bot-bound", x1: 4 * CELL, y1: 15 * CELL, x2: 24 * CELL, y2: 15 * CELL, type: "wall" },
      { id: "w-right-bound", x1: 24 * CELL, y1: 1 * CELL, x2: 24 * CELL, y2: 15 * CELL, type: "wall" },
      // Guard Room (North-West inside)
      { id: "w-guard-h", x1: 4 * CELL, y1: 5 * CELL, x2: 9 * CELL, y2: 5 * CELL, type: "wall" },
      { id: "d-guard-door", x1: 9 * CELL, y1: 5 * CELL, x2: 11 * CELL, y2: 5 * CELL, type: "door", isOpen: true },
      { id: "w-guard-v", x1: 11 * CELL, y1: 1 * CELL, x2: 11 * CELL, y2: 5 * CELL, type: "wall" },
      // Armory (South-West inside)
      { id: "w-armory-h1", x1: 4 * CELL, y1: 11 * CELL, x2: 7 * CELL, y2: 11 * CELL, type: "wall" },
      { id: "d-armory-door", x1: 7 * CELL, y1: 11 * CELL, x2: 9 * CELL, y2: 11 * CELL, type: "door", isOpen: false },
      { id: "w-armory-h2", x1: 9 * CELL, y1: 11 * CELL, x2: 12 * CELL, y2: 11 * CELL, type: "wall" },
      { id: "w-armory-v", x1: 12 * CELL, y1: 11 * CELL, x2: 12 * CELL, y2: 15 * CELL, type: "wall" },
      // Central Stone Pillars (casting dynamic shadows in the main hall!)
      // Pillar 1 (col 7..8, row 7..8)
      { id: "p1-n", x1: 7 * CELL, y1: 7 * CELL, x2: 8 * CELL, y2: 7 * CELL, type: "wall" },
      { id: "p1-e", x1: 8 * CELL, y1: 7 * CELL, x2: 8 * CELL, y2: 8 * CELL, type: "wall" },
      { id: "p1-s", x1: 8 * CELL, y1: 8 * CELL, x2: 7 * CELL, y2: 8 * CELL, type: "wall" },
      { id: "p1-w", x1: 7 * CELL, y1: 8 * CELL, x2: 7 * CELL, y2: 7 * CELL, type: "wall" },
      // Pillar 2 (col 12..13, row 6..7)
      { id: "p2-n", x1: 12 * CELL, y1: 6 * CELL, x2: 13 * CELL, y2: 6 * CELL, type: "wall" },
      { id: "p2-e", x1: 13 * CELL, y1: 6 * CELL, x2: 13 * CELL, y2: 7 * CELL, type: "wall" },
      { id: "p2-s", x1: 13 * CELL, y1: 7 * CELL, x2: 12 * CELL, y2: 7 * CELL, type: "wall" },
      { id: "p2-w", x1: 12 * CELL, y1: 7 * CELL, x2: 12 * CELL, y2: 6 * CELL, type: "wall" },
      // Pillar 3 (col 12..13, row 9..10)
      { id: "p3-n", x1: 12 * CELL, y1: 9 * CELL, x2: 13 * CELL, y2: 9 * CELL, type: "wall" },
      { id: "p3-e", x1: 13 * CELL, y1: 9 * CELL, x2: 13 * CELL, y2: 10 * CELL, type: "wall" },
      { id: "p3-s", x1: 13 * CELL, y1: 10 * CELL, x2: 12 * CELL, y2: 10 * CELL, type: "wall" },
      { id: "p3-w", x1: 12 * CELL, y1: 10 * CELL, x2: 12 * CELL, y2: 9 * CELL, type: "wall" },
      // Eastern Sanctum Wall & Doors (col 18)
      { id: "w-sanctum-1", x1: 18 * CELL, y1: 1 * CELL, x2: 18 * CELL, y2: 7 * CELL, type: "wall" },
      { id: "d-sanctum-door", x1: 18 * CELL, y1: 7 * CELL, x2: 18 * CELL, y2: 9 * CELL, type: "door", isOpen: false },
      { id: "w-sanctum-2", x1: 18 * CELL, y1: 9 * CELL, x2: 18 * CELL, y2: 15 * CELL, type: "wall" },
      // Diagonal Ritual Altar Baffle inside Sanctum
      { id: "w-altar-diag1", x1: 20 * CELL, y1: 4 * CELL, x2: 22 * CELL, y2: 6 * CELL, type: "wall" },
      { id: "w-altar-diag2", x1: 22 * CELL, y1: 10 * CELL, x2: 20 * CELL, y2: 12 * CELL, type: "wall" }
    ],
    tokens: [
      {
        id: "tok-kaelen",
        name: "\u041A\u0430\u044D\u043B\u0435\u043D (\u0421\u043B\u0435\u0434\u043E\u043F\u044B\u0442)",
        initials: "\u041A\u041B",
        x: 6,
        y: 7,
        size: 1,
        color: "#F59E0B",
        faction: "player",
        visionRadius: 12,
        // 60 ft D&D 5e darkvision/vision
        hasDarkvision: true,
        emitsLight: true,
        brightLightRadius: 4,
        // 20 ft bright torchlight
        dimLightRadius: 8,
        // 40 ft dim torchlight
        lightColor: "#F59E0B",
        hp: 44,
        maxHp: 48,
        ac: 16,
        controlledBy: "all"
      },
      {
        id: "tok-lyra",
        name: "\u041B\u0438\u0440\u0430 (\u0416\u0440\u0438\u0446\u0430 \u0421\u0432\u0435\u0442\u0430)",
        initials: "\u041B\u0420",
        x: 5,
        y: 8,
        size: 1,
        color: "#38BDF8",
        faction: "player",
        visionRadius: 10,
        // 50 ft
        hasDarkvision: true,
        emitsLight: true,
        brightLightRadius: 5,
        // 25 ft sacred light
        dimLightRadius: 9,
        // 45 ft sacred aura
        lightColor: "#38BDF8",
        hp: 38,
        maxHp: 38,
        ac: 18,
        controlledBy: "all"
      },
      {
        id: "tok-goblin-1",
        name: "\u0413\u043E\u0431\u043B\u0438\u043D-\u0427\u0430\u0441\u043E\u0432\u043E\u0439",
        initials: "\u0413\u0427",
        x: 8,
        y: 2,
        size: 1,
        color: "#EF4444",
        faction: "monster",
        visionRadius: 6,
        hasDarkvision: true,
        emitsLight: false,
        hp: 12,
        maxHp: 12,
        ac: 14
      },
      {
        id: "tok-skeleton-1",
        name: "\u0421\u043A\u0435\u043B\u0435\u0442-\u0421\u0442\u0440\u0430\u0436",
        initials: "\u0421\u0421",
        x: 7,
        y: 13,
        size: 1,
        color: "#F43F5E",
        faction: "monster",
        visionRadius: 6,
        hasDarkvision: true,
        emitsLight: false,
        hp: 19,
        maxHp: 22,
        ac: 13
      },
      {
        id: "tok-lich",
        name: "\u041C\u043E\u0440\u0434\u0440\u0435\u0434 \u041F\u043E\u0432\u0435\u043B\u0438\u0442\u0435\u043B\u044C \u041F\u0435\u043F\u043B\u0430",
        initials: "\u041C\u041F",
        x: 21,
        y: 7,
        size: 2,
        // Large boss token (2x2 cells = 10x10 ft)
        color: "#A855F7",
        faction: "monster",
        visionRadius: 12,
        hasDarkvision: true,
        emitsLight: true,
        brightLightRadius: 3,
        dimLightRadius: 8,
        lightColor: "#C084FC",
        hp: 135,
        maxHp: 135,
        ac: 17
      }
    ],
    audioSources: [
      {
        id: "snd-campfire",
        name: "\u041A\u043E\u0441\u0442\u0435\u0440 \u043B\u0430\u0433\u0435\u0440\u044F \u043F\u0440\u0438\u043A\u043B\u044E\u0447\u0435\u043D\u0446\u0435\u0432",
        x: 100,
        y: 350,
        preset: "campfire",
        volume: 0.85,
        minDistance: 80,
        maxDistance: 420,
        loop: true,
        isPlaying: true,
        color: "#F59E0B"
      },
      {
        id: "snd-waterfall",
        name: "\u041F\u043E\u0434\u0437\u0435\u043C\u043D\u044B\u0439 \u043A\u0430\u043D\u0430\u043B \u0438 \u0432\u043E\u0434\u043E\u043F\u0430\u0434",
        x: 775,
        y: 350,
        preset: "water_stream",
        volume: 0.75,
        minDistance: 70,
        maxDistance: 380,
        loop: true,
        isPlaying: true,
        color: "#38BDF8"
      },
      {
        id: "snd-altar",
        name: "\u0410\u043B\u0442\u0430\u0440\u044C \u0428\u0435\u043F\u0447\u0443\u0449\u0438\u0445 \u0422\u0435\u043D\u0435\u0439",
        x: 1075,
        y: 400,
        preset: "arcane_hum",
        volume: 0.85,
        minDistance: 100,
        maxDistance: 500,
        loop: true,
        isPlaying: true,
        color: "#C084FC"
      }
    ],
    globalMusic: {
      currentTrack: "ambient_dungeon",
      isPlaying: true,
      volume: 0.4,
      isCombatMode: false
    }
  }
];

// src/engine/raycaster.ts
function getRaySegmentIntersection(ox, oy, dx, dy, x1, y1, x2, y2) {
  const r_px = ox;
  const r_py = oy;
  const r_dx = dx;
  const r_dy = dy;
  const s_px = x1;
  const s_py = y1;
  const s_dx = x2 - x1;
  const s_dy = y2 - y1;
  const denom = s_dx * r_dy - s_dy * r_dx;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const u = ((r_px - s_px) * r_dy - (r_py - s_py) * r_dx) / denom;
  if (u < -1e-7 || u > 1 + 1e-7) {
    return null;
  }
  const t = ((s_px - r_px) * s_dy - (s_py - r_py) * s_dx) / -denom;
  if (t < 0) {
    return null;
  }
  return {
    x: r_px + r_dx * t,
    y: r_py + r_dy * t,
    paramT: t
  };
}
function computeVisibilityPolygon(origin, radiusPx, walls, mapWidth, mapHeight, perimeterSteps = 72, brightRadiusPx, dimRadiusPx, lightColor, tokenId) {
  const ox = origin.x;
  const oy = origin.y;
  const maxRSq = (radiusPx + 4) * (radiusPx + 4);
  const activeSegments = [
    // Map outer boundary segments
    { x1: 0, y1: 0, x2: mapWidth, y2: 0 },
    { x1: mapWidth, y1: 0, x2: mapWidth, y2: mapHeight },
    { x1: mapWidth, y1: mapHeight, x2: 0, y2: mapHeight },
    { x1: 0, y1: mapHeight, x2: 0, y2: 0 }
  ];
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.type === "window") continue;
    if (w.type === "door" && w.isOpen) continue;
    const minX = Math.min(w.x1, w.x2);
    const maxX = Math.max(w.x1, w.x2);
    const minY = Math.min(w.y1, w.y2);
    const maxY = Math.max(w.y1, w.y2);
    const closestX = Math.max(minX, Math.min(ox, maxX));
    const closestY = Math.max(minY, Math.min(oy, maxY));
    const distSq = (closestX - ox) ** 2 + (closestY - oy) ** 2;
    if (distSq <= maxRSq) {
      activeSegments.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
    }
  }
  const angles = [];
  const EPSILON = 12e-5;
  for (let i = 0; i < perimeterSteps; i++) {
    const a = -Math.PI + i * 2 * Math.PI / perimeterSteps;
    angles.push(a);
  }
  const seenVertices = /* @__PURE__ */ new Set();
  for (let i = 0; i < activeSegments.length; i++) {
    const seg = activeSegments[i];
    const pts = [
      { x: seg.x1, y: seg.y1 },
      { x: seg.x2, y: seg.y2 }
    ];
    for (const pt of pts) {
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.y * 10)}`;
      if (seenVertices.has(key)) continue;
      seenVertices.add(key);
      const dx = pt.x - ox;
      const dy = pt.y - oy;
      if (dx * dx + dy * dy <= maxRSq * 1.35) {
        const baseAngle = Math.atan2(dy, dx);
        angles.push(baseAngle - EPSILON, baseAngle, baseAngle + EPSILON);
      }
    }
    const circleHits = getCircleSegmentIntersections(ox, oy, radiusPx, seg.x1, seg.y1, seg.x2, seg.y2);
    for (const ch of circleHits) {
      const a = Math.atan2(ch.y - oy, ch.x - ox);
      angles.push(a - EPSILON, a, a + EPSILON);
    }
  }
  const rays = [];
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let minT = radiusPx;
    let closestX = ox + dx * radiusPx;
    let closestY = oy + dy * radiusPx;
    for (let j = 0; j < activeSegments.length; j++) {
      const seg = activeSegments[j];
      const hit = getRaySegmentIntersection(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2);
      if (hit && hit.paramT < minT) {
        minT = hit.paramT;
        closestX = hit.x;
        closestY = hit.y;
      }
    }
    const normalizedAngle = Math.atan2(dy, dx);
    rays.push({
      x: closestX,
      y: closestY,
      angle: normalizedAngle,
      dist: minT
    });
  }
  rays.sort((a, b) => a.angle - b.angle);
  const polygon = [];
  for (let i = 0; i < rays.length; i++) {
    const curr = rays[i];
    if (polygon.length > 0) {
      const prev = polygon[polygon.length - 1];
      const dSq = (curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2;
      if (dSq < 0.05) continue;
    }
    polygon.push({ x: curr.x, y: curr.y });
  }
  return {
    polygon,
    rays,
    origin: { x: ox, y: oy },
    radiusPx,
    brightRadiusPx,
    dimRadiusPx,
    lightColor,
    tokenId
  };
}
function getCircleSegmentIntersections(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);
  const pts = [];
  if (t1 >= 0 && t1 <= 1) {
    pts.push({ x: x1 + t1 * dx, y: y1 + t1 * dy });
  }
  if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 1e-6) {
    pts.push({ x: x1 + t2 * dx, y: y1 + t2 * dy });
  }
  return pts;
}
function isPointInPolygon(pt, polygon) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function isInFieldOfView(entityX, entityY, sightPolygons, radiusTolerance = 14) {
  if (!sightPolygons) return false;
  let polygons;
  if (!Array.isArray(sightPolygons) || sightPolygons.length === 0) {
    return false;
  }
  const firstElem = sightPolygons[0];
  if (Array.isArray(firstElem)) {
    polygons = sightPolygons;
  } else if (firstElem && typeof firstElem.x === "number") {
    polygons = [sightPolygons];
  } else {
    return false;
  }
  if (polygons.length === 0) return false;
  const r = Math.max(8, radiusTolerance);
  const testPoints = [
    { x: entityX, y: entityY },
    { x: entityX - r, y: entityY },
    { x: entityX + r, y: entityY },
    { x: entityX, y: entityY - r },
    { x: entityX, y: entityY + r },
    { x: entityX - r * 0.7, y: entityY - r * 0.7 },
    { x: entityX + r * 0.7, y: entityY + r * 0.7 },
    { x: entityX - r * 0.7, y: entityY + r * 0.7 },
    { x: entityX + r * 0.7, y: entityY - r * 0.7 }
  ];
  for (let p = 0; p < polygons.length; p++) {
    const poly = polygons[p];
    if (!poly || poly.length < 3) continue;
    for (let t = 0; t < testPoints.length; t++) {
      if (isPointInPolygon(testPoints[t], poly)) {
        return true;
      }
    }
  }
  return false;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PEER_COLORS = [
  "#F59E0B",
  // Amber
  "#38BDF8",
  // Sky
  "#10B981",
  // Emerald
  "#A855F7",
  // Purple
  "#F43F5E",
  // Rose
  "#EC4899",
  // Pink
  "#14B8A6"
  // Teal
];
function generateGmKey() {
  return "GM-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}
async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e7
    // 10MB for custom battlemap uploads
  });
  app.use(express.json({ limit: "10mb" }));
  const rooms = /* @__PURE__ */ new Map();
  const getOrCreateRoom = (roomId) => {
    const cleanId = (roomId || "OBSIDIAN-1").trim().toUpperCase();
    if (!rooms.has(cleanId)) {
      const initialMap = structuredClone(PRESET_MAPS[0]);
      initialMap.fogStrokes = [];
      rooms.set(cleanId, {
        roomId: cleanId,
        gmKey: generateGmKey(),
        gmClientId: null,
        serverAntiCheatCulling: false,
        // Can be toggled by GM for strict network-level LOS monster culling
        map: initialMap,
        peers: /* @__PURE__ */ new Map(),
        clientAssignments: /* @__PURE__ */ new Map(),
        clientRoles: /* @__PURE__ */ new Map(),
        messages: []
      });
    }
    return rooms.get(cleanId);
  };
  const getFilteredMapForRole = (room, role) => {
    if (role === "GM") {
      return room.map;
    }
    const cs = room.map.cellSize || 50;
    const mapWidth = room.map.cols * cs;
    const mapHeight = room.map.rows * cs;
    let playerPolygons = [];
    if (room.serverAntiCheatCulling) {
      const playerTokens = room.map.tokens.filter((t) => t.faction === "player");
      playerPolygons = playerTokens.map((pt) => {
        const origin = {
          x: (pt.x + pt.size / 2) * cs,
          y: (pt.y + pt.size / 2) * cs
        };
        const baseVision = pt.visionRadius || 12;
        const lightCells = pt.emitsLight ? Math.max(pt.dimLightRadius || 8, pt.brightLightRadius || 4) : 0;
        const effectiveCells = Math.max(baseVision, lightCells);
        const radiusPx = room.map.ambientLight === "bright" ? Math.max(mapWidth, mapHeight) * 1.5 : effectiveCells * cs;
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
      if (token.isHiddenByGM) return false;
      if (token.faction === "player") return true;
      if (room.serverAntiCheatCulling) {
        const cx = (token.x + token.size / 2) * cs;
        const cy = (token.y + token.size / 2) * cs;
        const tokenRadius = token.size * cs * 0.38;
        const inLos = isInFieldOfView(cx, cy, playerPolygons, tokenRadius);
        if (inLos) return true;
        const strokes = room.map.fogStrokes || [];
        let manuallyRevealed = false;
        for (const s of strokes) {
          const dist = Math.hypot(cx - s.x, cy - s.y);
          if (dist <= s.radiusPx) {
            manuallyRevealed = s.action === "reveal";
          }
        }
        return manuallyRevealed;
      }
      return true;
    });
    return {
      ...room.map,
      tokens: visibleTokens
    };
  };
  const broadcastFilteredTokens = (room) => {
    for (const [socketId, peer] of room.peers.entries()) {
      const filteredMap = getFilteredMapForRole(room, peer.role);
      io.to(socketId).emit("tokens:sync", filteredMap.tokens);
    }
  };
  const broadcastFullRoomState = (room) => {
    const peersList = Array.from(room.peers.values());
    for (const [socketId, peer] of room.peers.entries()) {
      const payload = {
        roomId: room.roomId,
        yourRole: peer.role,
        yourClientId: peer.clientId,
        gmKey: peer.role === "GM" ? room.gmKey : void 0,
        assignedTokenId: peer.assignedTokenId,
        serverAntiCheatCulling: room.serverAntiCheatCulling,
        map: getFilteredMapForRole(room, peer.role),
        peers: peersList,
        messages: peer.role === "GM" ? room.messages : room.messages.filter((m) => !m.isSecretGm && !(m.senderRole === "GM" && m.roll))
      };
      io.to(socketId).emit("room:state", payload);
    }
  };
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      activeRooms: rooms.size,
      rooms: Array.from(rooms.values()).map((r) => ({
        roomId: r.roomId,
        peersCount: r.peers.size,
        mapName: r.map.name
      }))
    });
  });
  io.on("connection", (socket) => {
    let currentRoomId = (socket.handshake.query.roomId || "OBSIDIAN-1").trim().toUpperCase();
    const joinRoomSession = (payload) => {
      if (currentRoomId && currentRoomId !== payload.roomId.trim().toUpperCase()) {
        const prevRoom = rooms.get(currentRoomId);
        if (prevRoom) {
          prevRoom.peers.delete(socket.id);
          io.to(currentRoomId).emit("peers:sync", Array.from(prevRoom.peers.values()));
        }
        socket.leave(currentRoomId);
      }
      const targetRoomId = (payload.roomId || "OBSIDIAN-1").trim().toUpperCase();
      currentRoomId = targetRoomId;
      socket.join(targetRoomId);
      const room = getOrCreateRoom(targetRoomId);
      const clientId = payload.clientId || `client-${socket.id}`;
      let assignedRole = "PLAYER";
      if (!room.gmClientId) {
        assignedRole = payload.preferredRole || "GM";
        if (assignedRole === "GM") {
          room.gmClientId = clientId;
        }
      } else if (room.gmClientId === clientId || payload.gmKey && payload.gmKey === room.gmKey || payload.preferredRole === "GM") {
        assignedRole = payload.preferredRole || "GM";
        if (assignedRole === "GM" && !room.gmClientId) {
          room.gmClientId = clientId;
        }
      } else if (room.clientRoles.has(clientId)) {
        assignedRole = room.clientRoles.get(clientId);
      }
      room.clientRoles.set(clientId, assignedRole);
      const playerTokens = room.map.tokens.filter((t) => t.faction === "player");
      let assignedTokenId = payload.assignedTokenId || room.clientAssignments.get(clientId) || playerTokens[room.peers.size % Math.max(1, playerTokens.length)]?.id || room.map.tokens[0]?.id || "";
      room.clientAssignments.set(clientId, assignedTokenId);
      const colorIndex = room.peers.size % PEER_COLORS.length;
      const peer = {
        id: socket.id,
        clientId,
        name: payload.playerName?.trim() || (assignedRole === "GM" ? "\u041C\u0430\u0441\u0442\u0435\u0440 (GM)" : `\u0418\u0433\u0440\u043E\u043A-${socket.id.slice(0, 4)}`),
        color: PEER_COLORS[colorIndex],
        role: assignedRole,
        assignedTokenId,
        connectedAt: Date.now()
      };
      room.peers.set(socket.id, peer);
      const statePayload = {
        roomId: room.roomId,
        yourRole: peer.role,
        yourClientId: peer.clientId,
        gmKey: peer.role === "GM" ? room.gmKey : void 0,
        assignedTokenId: peer.assignedTokenId,
        serverAntiCheatCulling: room.serverAntiCheatCulling,
        map: getFilteredMapForRole(room, peer.role),
        peers: Array.from(room.peers.values()),
        messages: peer.role === "GM" ? room.messages : room.messages.filter((m) => !m.isSecretGm)
      };
      socket.emit("room:state", statePayload);
      socket.emit("map:init", statePayload.map);
      io.to(targetRoomId).emit("peers:sync", Array.from(room.peers.values()));
    };
    joinRoomSession({
      roomId: currentRoomId,
      clientId: socket.handshake.query.clientId || `client-${socket.id}`,
      playerName: socket.handshake.query.playerName || "",
      preferredRole: socket.handshake.query.role || void 0,
      gmKey: socket.handshake.query.gmKey || void 0
    });
    socket.on("room:join", (payload) => {
      joinRoomSession(payload);
    });
    socket.on("peer:update", (partial) => {
      const room = getOrCreateRoom(currentRoomId);
      const existing = room.peers.get(socket.id);
      if (!existing) return;
      if (partial.role) {
        existing.role = partial.role;
        room.clientRoles.set(existing.clientId, partial.role);
      }
      if (partial.name !== void 0) {
        existing.name = partial.name;
      }
      if (partial.assignedTokenId !== void 0) {
        existing.assignedTokenId = partial.assignedTokenId;
        room.clientAssignments.set(existing.clientId, partial.assignedTokenId);
      }
      if (partial.color !== void 0) {
        existing.color = partial.color;
      }
      io.to(currentRoomId).emit("peers:sync", Array.from(room.peers.values()));
      const statePayload = {
        roomId: room.roomId,
        yourRole: existing.role,
        yourClientId: existing.clientId,
        gmKey: existing.role === "GM" ? room.gmKey : void 0,
        assignedTokenId: existing.assignedTokenId,
        serverAntiCheatCulling: room.serverAntiCheatCulling,
        map: getFilteredMapForRole(room, existing.role),
        peers: Array.from(room.peers.values())
      };
      socket.emit("room:state", statePayload);
    });
    socket.on("peer:assign-token", (payload) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.clientAssignments.set(payload.targetClientId, payload.tokenId);
      for (const peer of room.peers.values()) {
        if (peer.clientId === payload.targetClientId) {
          peer.assignedTokenId = payload.tokenId;
          io.to(peer.id).emit("peer:token-assigned", payload.tokenId);
        }
      }
      io.to(currentRoomId).emit("peers:sync", Array.from(room.peers.values()));
    });
    socket.on("room:toggle-anticheat", (enabled) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.serverAntiCheatCulling = enabled;
      broadcastFullRoomState(room);
    });
    socket.on("token:move", (payload) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      const token = room.map.tokens.find((t) => t.id === payload.id);
      if (!token) return;
      const isAllowed = sender.role === "GM" || sender.assignedTokenId === token.id || token.controlledBy === sender.clientId || token.controlledBy === "all" || token.faction === "player";
      if (!isAllowed) {
        socket.emit("token:moved", {
          id: token.id,
          x: token.x,
          y: token.y,
          isFinal: true
        });
        return;
      }
      const maxCol = Math.max(0, room.map.cols - token.size);
      const maxRow = Math.max(0, room.map.rows - token.size);
      const prevX = token.x;
      const prevY = token.y;
      token.x = Math.max(0, Math.min(maxCol, payload.x));
      token.y = Math.max(0, Math.min(maxRow, payload.y));
      let playerPolygons = [];
      if (token.faction === "monster") {
        const cs2 = room.map.cellSize || 50;
        const mapWidth = room.map.cols * cs2;
        const mapHeight = room.map.rows * cs2;
        const playerTokens = room.map.tokens.filter((t) => t.faction === "player");
        playerPolygons = playerTokens.map((pt) => {
          const origin = {
            x: (pt.x + pt.size / 2) * cs2,
            y: (pt.y + pt.size / 2) * cs2
          };
          const baseVision = pt.visionRadius || 12;
          const lightCells = pt.emitsLight ? Math.max(pt.dimLightRadius || 8, pt.brightLightRadius || 4) : 0;
          const effectiveCells = Math.max(baseVision, lightCells);
          const radiusPx = room.map.ambientLight === "bright" ? Math.max(mapWidth, mapHeight) * 1.5 : effectiveCells * cs2;
          return computeVisibilityPolygon(origin, radiusPx, room.map.walls, mapWidth, mapHeight).polygon;
        });
      }
      const cs = room.map.cellSize || 50;
      const destX = (token.x + token.size / 2) * cs;
      const destY = (token.y + token.size / 2) * cs;
      const srcX = ((payload.fromX ?? prevX) + token.size / 2) * cs;
      const srcY = ((payload.fromY ?? prevY) + token.size / 2) * cs;
      const tokenRadius = token.size * cs * 0.38;
      const isDestInSight = token.faction !== "monster" || isInFieldOfView(destX, destY, playerPolygons, tokenRadius);
      const isSrcInSight = token.faction !== "monster" || isInFieldOfView(srcX, srcY, playerPolygons, tokenRadius);
      for (const [peerSocketId, peer] of room.peers.entries()) {
        if (peerSocketId === socket.id) continue;
        if (peer.role === "PLAYER") {
          if (token.isHiddenByGM) continue;
          if (token.faction === "monster" && !isDestInSight && !isSrcInSight) {
            continue;
          }
        }
        io.to(peerSocketId).emit("token:moved", {
          id: token.id,
          x: token.x,
          y: token.y,
          fromX: payload.fromX ?? prevX,
          fromY: payload.fromY ?? prevY,
          isFinal: payload.isFinal,
          moverColor: sender.color
        });
      }
      if (token.faction === "monster" && payload.isFinal) {
        broadcastFilteredTokens(room);
      }
    });
    socket.on("token:update", (updatedToken) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      if (sender.role !== "GM" && sender.assignedTokenId !== updatedToken.id && updatedToken.faction !== "player") {
        return;
      }
      const idx = room.map.tokens.findIndex((t) => t.id === updatedToken.id);
      if (idx !== -1) {
        if (sender.role !== "GM") {
          updatedToken.isHiddenByGM = room.map.tokens[idx].isHiddenByGM;
        }
        room.map.tokens[idx] = updatedToken;
        broadcastFilteredTokens(room);
      }
    });
    socket.on("token:create", (newToken) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (!room.map.tokens.some((t) => t.id === newToken.id)) {
        room.map.tokens.push(newToken);
        broadcastFilteredTokens(room);
      }
    });
    socket.on("token:delete", (tokenId) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.map.tokens = room.map.tokens.filter((t) => t.id !== tokenId);
      io.to(currentRoomId).emit("token:deleted", tokenId);
    });
    socket.on("wall:create", (wall) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (!room.map.walls.some((w) => w.id === wall.id)) {
        room.map.walls.push(wall);
        io.to(currentRoomId).emit("wall:created", wall);
        if (room.serverAntiCheatCulling) {
          broadcastFilteredTokens(room);
        }
      }
    });
    socket.on("wall:toggle-door", (wallId) => {
      const room = getOrCreateRoom(currentRoomId);
      const wall = room.map.walls.find((w) => w.id === wallId && w.type === "door");
      if (wall) {
        wall.isOpen = !wall.isOpen;
        io.to(currentRoomId).emit("wall:door-toggled", { id: wall.id, isOpen: !!wall.isOpen });
        if (room.serverAntiCheatCulling) {
          broadcastFilteredTokens(room);
        }
      }
    });
    socket.on("wall:delete", (wallId) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.map.walls = room.map.walls.filter((w) => w.id !== wallId);
      io.to(currentRoomId).emit("wall:deleted", wallId);
      if (room.serverAntiCheatCulling) {
        broadcastFilteredTokens(room);
      }
    });
    socket.on("terrain:paint", (cells) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      for (const item of cells) {
        room.map.terrain[item.key] = item.terrain;
      }
      socket.to(currentRoomId).emit("terrain:painted", cells);
    });
    socket.on("map:background", (backgroundUrl) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.map.backgroundUrl = backgroundUrl;
      io.to(currentRoomId).emit("map:background-updated", backgroundUrl);
    });
    socket.on("map:update-settings", (settings) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      Object.assign(room.map, settings);
      io.to(currentRoomId).emit("map:settings-updated", settings);
      if (room.serverAntiCheatCulling) {
        broadcastFilteredTokens(room);
      }
    });
    socket.on("map:import", (importedMap) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (importedMap && importedMap.cols && importedMap.rows && Array.isArray(importedMap.walls)) {
        room.map = structuredClone(importedMap);
        if (!room.map.fogStrokes) room.map.fogStrokes = [];
        broadcastFullRoomState(room);
      }
    });
    socket.on("map:reset", (mode) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (mode === "preset") {
        const fresh = structuredClone(PRESET_MAPS[0]);
        fresh.fogStrokes = [];
        room.map = fresh;
        broadcastFullRoomState(room);
        io.to(currentRoomId).emit("fog:cleared");
      } else if (mode === "clear_walls") {
        room.map.walls = [];
        broadcastFullRoomState(room);
      }
    });
    socket.on("fog:reset", () => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.map.fogStrokes = [];
      io.to(currentRoomId).emit("fog:cleared");
      if (room.serverAntiCheatCulling) {
        broadcastFilteredTokens(room);
      }
    });
    socket.on(
      "fog:paint",
      (payload) => {
        const room = getOrCreateRoom(currentRoomId);
        const sender = room.peers.get(socket.id);
        if (!sender || sender.role !== "GM") return;
        const stroke = {
          id: `fog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action: payload.action,
          x: payload.x,
          y: payload.y,
          radiusPx: payload.radiusPx
        };
        if (!room.map.fogStrokes) room.map.fogStrokes = [];
        room.map.fogStrokes.push(stroke);
        if (room.map.fogStrokes.length > 300) {
          room.map.fogStrokes.shift();
        }
        socket.to(currentRoomId).emit("fog:painted", stroke);
        if (room.serverAntiCheatCulling) {
          broadcastFilteredTokens(room);
        }
      }
    );
    socket.on("map:ping", (pt) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      const ping = {
        id: `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: pt.x,
        y: pt.y,
        color: sender.color,
        senderName: sender.name,
        createdAt: Date.now()
      };
      io.to(currentRoomId).emit("map:pinged", ping);
    });
    socket.on("cursor:move", (pt) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      sender.cursor = pt;
      socket.to(currentRoomId).emit("cursor:moved", {
        peerId: socket.id,
        name: sender.name,
        color: sender.color,
        role: sender.role,
        x: pt.x,
        y: pt.y
      });
    });
    socket.on("ruler:move", (ruler) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      socket.to(currentRoomId).emit("ruler:moved", {
        peerId: socket.id,
        senderName: sender.name,
        color: sender.color,
        ruler
      });
    });
    socket.on("chat:message", (msg) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      const messageWithMeta = {
        ...msg,
        id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderName: sender.name,
        senderRole: sender.role,
        senderColor: sender.color,
        timestamp: Date.now()
      };
      room.messages.push(messageWithMeta);
      if (room.messages.length > 200) {
        room.messages.shift();
      }
      const isGmSecret = messageWithMeta.isSecretGm || sender.role === "GM" && !!messageWithMeta.roll;
      if (isGmSecret) {
        messageWithMeta.isSecretGm = true;
        for (const [peerSocketId, peer] of room.peers.entries()) {
          if (peer.role === "GM" || peerSocketId === socket.id) {
            io.to(peerSocketId).emit("chat:received", messageWithMeta);
          }
        }
      } else {
        io.to(currentRoomId).emit("chat:received", messageWithMeta);
      }
    });
    socket.on("combat:update", (combat) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender) return;
      room.map.combat = combat;
      io.to(currentRoomId).emit("combat:updated", combat);
    });
    socket.on(
      "token:update-hp",
      (payload) => {
        const room = getOrCreateRoom(currentRoomId);
        const token = room.map.tokens.find((t) => t.id === payload.tokenId);
        if (token) {
          token.hp = payload.hp;
          if (payload.tempHp !== void 0) token.tempHp = payload.tempHp;
          if (payload.conditions !== void 0) token.conditions = payload.conditions;
          io.to(currentRoomId).emit("token:updated", token);
        }
      }
    );
    socket.on("ambient:create", (source) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (!room.map.audioSources) room.map.audioSources = [];
      if (!room.map.audioSources.some((s) => s.id === source.id)) {
        room.map.audioSources.push(source);
        io.to(currentRoomId).emit("ambient:created", source);
      }
    });
    socket.on("ambient:update", (source) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (!room.map.audioSources) room.map.audioSources = [];
      const idx = room.map.audioSources.findIndex((s) => s.id === source.id);
      if (idx !== -1) {
        room.map.audioSources[idx] = source;
        io.to(currentRoomId).emit("ambient:updated", source);
      }
    });
    socket.on("ambient:delete", (sourceId) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      if (room.map.audioSources) {
        room.map.audioSources = room.map.audioSources.filter((s) => s.id !== sourceId);
      }
      io.to(currentRoomId).emit("ambient:deleted", sourceId);
    });
    socket.on("music:update", (musicState) => {
      const room = getOrCreateRoom(currentRoomId);
      const sender = room.peers.get(socket.id);
      if (!sender || sender.role !== "GM") return;
      room.map.globalMusic = musicState;
      io.to(currentRoomId).emit("music:updated", musicState);
    });
    socket.on("sfx:broadcast", (payload) => {
      io.to(currentRoomId).emit("sfx:played", payload);
    });
    socket.on("disconnect", () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.peers.delete(socket.id);
        io.to(currentRoomId).emit("peers:sync", Array.from(room.peers.values()));
        io.to(currentRoomId).emit("peer:Left", socket.id);
      }
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const PORT = 3e3;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Obsidian Table VTT server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();

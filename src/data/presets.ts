import { MapData, TerrainType } from '../types/vtt';

function buildDungeonTerrain(cols: number, rows: number): Record<string, TerrainType> {
  const terrain: Record<string, TerrainType> = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Default stone floor inside dungeon rooms
      terrain[`${c},${r}`] = 'stone';
    }
  }
  // Courtyard & outer trail on the left (cols 0..3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= 3; c++) {
      terrain[`${c},${r}`] = (c + r) % 3 === 0 ? 'dirt' : 'grass';
    }
  }
  // Dirt path entering the dungeon gate
  for (let r = 6; r <= 8; r++) {
    for (let c = 0; c <= 4; c++) {
      terrain[`${c},${r}`] = 'dirt';
    }
  }
  // Wooden platform in central hall (cols 6..10, rows 5..9)
  for (let r = 5; r <= 9; r++) {
    for (let c = 6; c <= 10; c++) {
      terrain[`${c},${r}`] = 'wood';
    }
  }
  // Underground canal / water moat (cols 15..16, rows 2..13)
  for (let r = 2; r <= 13; r++) {
    for (let c = 15; c <= 16; c++) {
      if (r !== 7 && r !== 8) {
        terrain[`${c},${r}`] = 'water';
      } else {
        terrain[`${c},${r}`] = 'wood'; // Wooden bridge across moat
      }
    }
  }
  return terrain;
}

// Default cell size = 50px (equivalent to 5 feet in D&D)
const CELL = 50;

export const PRESET_MAPS: MapData[] = [
  {
    id: 'crypt-of-whispers',
    name: 'Крипта Шепчущих Теней (D&D 5e · Сетка 50px)',
    cols: 26,
    rows: 16,
    cellSize: CELL,
    ambientLight: 'pitch_dark',
    backgroundConfig: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 1,
    },
    terrain: buildDungeonTerrain(26, 16),
    walls: [
      // Outer dungeon perimeter wall separating courtyard (col 4)
      { id: 'w-ext-top', x1: 4 * CELL, y1: 1 * CELL, x2: 4 * CELL, y2: 6 * CELL, type: 'wall' },
      { id: 'd-main-gate', x1: 4 * CELL, y1: 6 * CELL, x2: 4 * CELL, y2: 8 * CELL, type: 'door', isOpen: false },
      { id: 'w-ext-bot', x1: 4 * CELL, y1: 8 * CELL, x2: 4 * CELL, y2: 15 * CELL, type: 'wall' },

      // Top & Bottom dungeon bounds
      { id: 'w-top-bound', x1: 4 * CELL, y1: 1 * CELL, x2: 24 * CELL, y2: 1 * CELL, type: 'wall' },
      { id: 'w-bot-bound', x1: 4 * CELL, y1: 15 * CELL, x2: 24 * CELL, y2: 15 * CELL, type: 'wall' },
      { id: 'w-right-bound', x1: 24 * CELL, y1: 1 * CELL, x2: 24 * CELL, y2: 15 * CELL, type: 'wall' },

      // Guard Room (North-West inside)
      { id: 'w-guard-h', x1: 4 * CELL, y1: 5 * CELL, x2: 9 * CELL, y2: 5 * CELL, type: 'wall' },
      { id: 'd-guard-door', x1: 9 * CELL, y1: 5 * CELL, x2: 11 * CELL, y2: 5 * CELL, type: 'door', isOpen: true },
      { id: 'w-guard-v', x1: 11 * CELL, y1: 1 * CELL, x2: 11 * CELL, y2: 5 * CELL, type: 'wall' },

      // Armory (South-West inside)
      { id: 'w-armory-h1', x1: 4 * CELL, y1: 11 * CELL, x2: 7 * CELL, y2: 11 * CELL, type: 'wall' },
      { id: 'd-armory-door', x1: 7 * CELL, y1: 11 * CELL, x2: 9 * CELL, y2: 11 * CELL, type: 'door', isOpen: false },
      { id: 'w-armory-h2', x1: 9 * CELL, y1: 11 * CELL, x2: 12 * CELL, y2: 11 * CELL, type: 'wall' },
      { id: 'w-armory-v', x1: 12 * CELL, y1: 11 * CELL, x2: 12 * CELL, y2: 15 * CELL, type: 'wall' },

      // Central Stone Pillars (casting dynamic shadows in the main hall!)
      // Pillar 1 (col 7..8, row 7..8)
      { id: 'p1-n', x1: 7 * CELL, y1: 7 * CELL, x2: 8 * CELL, y2: 7 * CELL, type: 'wall' },
      { id: 'p1-e', x1: 8 * CELL, y1: 7 * CELL, x2: 8 * CELL, y2: 8 * CELL, type: 'wall' },
      { id: 'p1-s', x1: 8 * CELL, y1: 8 * CELL, x2: 7 * CELL, y2: 8 * CELL, type: 'wall' },
      { id: 'p1-w', x1: 7 * CELL, y1: 8 * CELL, x2: 7 * CELL, y2: 7 * CELL, type: 'wall' },

      // Pillar 2 (col 12..13, row 6..7)
      { id: 'p2-n', x1: 12 * CELL, y1: 6 * CELL, x2: 13 * CELL, y2: 6 * CELL, type: 'wall' },
      { id: 'p2-e', x1: 13 * CELL, y1: 6 * CELL, x2: 13 * CELL, y2: 7 * CELL, type: 'wall' },
      { id: 'p2-s', x1: 13 * CELL, y1: 7 * CELL, x2: 12 * CELL, y2: 7 * CELL, type: 'wall' },
      { id: 'p2-w', x1: 12 * CELL, y1: 7 * CELL, x2: 12 * CELL, y2: 6 * CELL, type: 'wall' },

      // Pillar 3 (col 12..13, row 9..10)
      { id: 'p3-n', x1: 12 * CELL, y1: 9 * CELL, x2: 13 * CELL, y2: 9 * CELL, type: 'wall' },
      { id: 'p3-e', x1: 13 * CELL, y1: 9 * CELL, x2: 13 * CELL, y2: 10 * CELL, type: 'wall' },
      { id: 'p3-s', x1: 13 * CELL, y1: 10 * CELL, x2: 12 * CELL, y2: 10 * CELL, type: 'wall' },
      { id: 'p3-w', x1: 12 * CELL, y1: 10 * CELL, x2: 12 * CELL, y2: 9 * CELL, type: 'wall' },

      // Eastern Sanctum Wall & Doors (col 18)
      { id: 'w-sanctum-1', x1: 18 * CELL, y1: 1 * CELL, x2: 18 * CELL, y2: 7 * CELL, type: 'wall' },
      { id: 'd-sanctum-door', x1: 18 * CELL, y1: 7 * CELL, x2: 18 * CELL, y2: 9 * CELL, type: 'door', isOpen: false },
      { id: 'w-sanctum-2', x1: 18 * CELL, y1: 9 * CELL, x2: 18 * CELL, y2: 15 * CELL, type: 'wall' },

      // Diagonal Ritual Altar Baffle inside Sanctum
      { id: 'w-altar-diag1', x1: 20 * CELL, y1: 4 * CELL, x2: 22 * CELL, y2: 6 * CELL, type: 'wall' },
      { id: 'w-altar-diag2', x1: 22 * CELL, y1: 10 * CELL, x2: 20 * CELL, y2: 12 * CELL, type: 'wall' },
    ],
    tokens: [
      {
        id: 'tok-kaelen',
        name: 'Каэлен (Следопыт)',
        initials: 'КЛ',
        x: 6,
        y: 7,
        size: 1,
        color: '#F59E0B',
        faction: 'player',
        visionRadius: 12, // 60 ft D&D 5e darkvision/vision
        hasDarkvision: true,
        emitsLight: true,
        brightLightRadius: 4, // 20 ft bright torchlight
        dimLightRadius: 8, // 40 ft dim torchlight
        lightColor: '#F59E0B',
        hp: 44,
        maxHp: 48,
        ac: 16,
        controlledBy: 'all',
      },
      {
        id: 'tok-lyra',
        name: 'Лира (Жрица Света)',
        initials: 'ЛР',
        x: 5,
        y: 8,
        size: 1,
        color: '#38BDF8',
        faction: 'player',
        visionRadius: 10, // 50 ft
        hasDarkvision: true,
        emitsLight: true,
        brightLightRadius: 5, // 25 ft sacred light
        dimLightRadius: 9, // 45 ft sacred aura
        lightColor: '#38BDF8',
        hp: 38,
        maxHp: 38,
        ac: 18,
        controlledBy: 'all',
      },
      {
        id: 'tok-goblin-1',
        name: 'Гоблин-Часовой',
        initials: 'ГЧ',
        x: 8,
        y: 2,
        size: 1,
        color: '#EF4444',
        faction: 'monster',
        visionRadius: 6,
        hasDarkvision: true,
        emitsLight: false,
        hp: 12,
        maxHp: 12,
        ac: 14,
      },
      {
        id: 'tok-skeleton-1',
        name: 'Скелет-Страж',
        initials: 'СС',
        x: 7,
        y: 13,
        size: 1,
        color: '#F43F5E',
        faction: 'monster',
        visionRadius: 6,
        hasDarkvision: true,
        emitsLight: false,
        hp: 19,
        maxHp: 22,
        ac: 13,
      },
      {
        id: 'tok-lich',
        name: 'Мордред Повелитель Пепла',
        initials: 'МП',
        x: 21,
        y: 7,
        size: 2, // Large boss token (2x2 cells = 10x10 ft)
        color: '#A855F7',
        faction: 'monster',
        visionRadius: 12,
        hasDarkvision: true,
        emitsLight: true,
        brightLightRadius: 3,
        dimLightRadius: 8,
        lightColor: '#C084FC',
        hp: 135,
        maxHp: 135,
        ac: 17,
      },
    ],
    audioSources: [
      {
        id: 'snd-campfire',
        name: 'Костер лагеря приключенцев',
        x: 100,
        y: 350,
        preset: 'campfire',
        volume: 0.85,
        minDistance: 80,
        maxDistance: 420,
        loop: true,
        isPlaying: true,
        color: '#F59E0B',
      },
      {
        id: 'snd-waterfall',
        name: 'Подземный канал и водопад',
        x: 775,
        y: 350,
        preset: 'water_stream',
        volume: 0.75,
        minDistance: 70,
        maxDistance: 380,
        loop: true,
        isPlaying: true,
        color: '#38BDF8',
      },
      {
        id: 'snd-altar',
        name: 'Алтарь Шепчущих Теней',
        x: 1075,
        y: 400,
        preset: 'arcane_hum',
        volume: 0.85,
        minDistance: 100,
        maxDistance: 500,
        loop: true,
        isPlaying: true,
        color: '#C084FC',
      },
    ],
    globalMusic: {
      currentTrack: 'ambient_dungeon',
      isPlaying: true,
      volume: 0.4,
      isCombatMode: false,
    },
  },
];

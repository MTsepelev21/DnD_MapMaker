import { SpellCardData, SpellTemplate } from './spells';

export interface Point {
  x: number;
  y: number;
}

export type WallType = 'wall' | 'door' | 'window';

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: WallType;
  isOpen?: boolean; // For doors: when true, light and movement pass through
}

export type TerrainType = 'stone' | 'dirt' | 'grass' | 'wood' | 'water' | 'void';

export type TokenFaction = 'player' | 'monster' | 'neutral';

export type ConditionType =
  | 'blinded'      // Ослеплен
  | 'charmed'      // Очарован
  | 'poisoned'     // Отравлен
  | 'unconscious'  // Без сознания
  | 'burning'      // Горит
  | 'restrained'   // Опутан
  | 'frightened'   // Испуган
  | 'stunned'      // Оглушен
  | 'prone'        // Сбит с ног
  | 'invisible';   // Невидимый

export interface ConditionDef {
  id: ConditionType;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const DND_CONDITIONS: ConditionDef[] = [
  { id: 'blinded', label: 'Ослеплен', icon: '👁️‍🗨️', color: '#64748B', description: 'Не может видеть, автопровал проверок зрения' },
  { id: 'charmed', label: 'Очарован', icon: '💖', color: '#EC4899', description: 'Не может атаковать пленителя, преимущество на соц. проверки' },
  { id: 'poisoned', label: 'Отравлен', icon: '🧪', color: '#10B981', description: 'Помеха на броски атаки и проверки характеристик' },
  { id: 'unconscious', label: 'Без сознания', icon: '💀', color: '#94A3B8', description: 'Недееспособен, роняет предметы, крит с 5 футов' },
  { id: 'burning', label: 'Горит', icon: '🔥', color: '#F97316', description: 'Получает периодический урон огнем в начале хода' },
  { id: 'restrained', label: 'Опутан', icon: '⛓️', color: '#A855F7', description: 'Скорость 0, помеха на ловкость, атаки по нему с преимуществом' },
  { id: 'frightened', label: 'Испуган', icon: '😱', color: '#EAB308', description: 'Помеха на проверки пока источник страха в поле зрения' },
  { id: 'stunned', label: 'Оглушен', icon: '⚡', color: '#38BDF8', description: 'Недееспособен, провал спасбросков СИЛ и ЛОВ' },
  { id: 'prone', label: 'Сбит с ног', icon: '🛡️', color: '#78716C', description: 'Может только ползти, атаки вблизи с преимуществом' },
  { id: 'invisible', label: 'Невидимый', icon: '✨', color: '#06B6D4', description: 'Невозможно увидеть без магии, атаки с преимуществом' },
];

export type HpVisibilityMode = 'exact' | 'bar_only' | 'hidden';

export interface Token {
  id: string;
  name: string;
  initials: string;
  x: number; // Grid cell X (0-indexed) or floating world-cell X
  y: number; // Grid cell Y (0-indexed) or floating world-cell Y
  size: number; // In grid cells (1 = Medium 5ft, 2 = Large 10ft)
  color: string;
  faction: TokenFaction;
  visionRadius: number; // Max vision radius in grid cells (e.g. 12 cells = 60 ft)
  hasDarkvision: boolean;
  emitsLight?: boolean; // Torch / lantern / magical light
  brightLightRadius?: number; // In grid cells (e.g. 4 cells = 20 ft bright light)
  dimLightRadius?: number; // In grid cells (e.g. 8 cells = 40 ft dim light)
  lightColor?: string; // Hex color for light aura (e.g. '#F59E0B' for warm torch fire)
  hp: number;
  maxHp: number;
  tempHp?: number;
  ac: number;
  initiative?: number;
  conditions?: ConditionType[];
  notes?: string;
  avatarUrl?: string;
  controlledBy?: string; // 'all', player name, or peer clientId
  isHiddenByGM?: boolean; // GM forced stealth (never sent to players)
}

export type ToolMode =
  | 'select'      // Select & drag tokens, click doors to toggle
  | 'pan'         // Pan camera
  | 'wall'        // Click-by-click chain wall builder
  | 'door'        // Place interactive doors
  | 'eraser'      // Delete walls/doors on click
  | 'terrain'     // Paint grid cell terrain
  | 'measure'     // Measure distance in feet (5ft per square)
  | 'ping'        // Emit attention ping on map (also Alt + Left Click)
  | 'fog_brush'   // GM manual Fog of War brush (reveal / hide)
  | 'audio'       // GM positional audio source placer
  | 'spell';      // AoE Spell template placer & aimer

export type FogBrushAction = 'reveal' | 'hide';
export type GameMode = 'play' | 'edit';
export type UserRole = 'GM' | 'PLAYER';
export type SnapTarget = 'nodes' | 'centers' | 'all' | 'none';
export type MonsterVisibilityMode = 'los_only' | 'explored' | 'always';

export interface RaycastResult {
  polygon: Point[];
  rays: { x: number; y: number; angle: number; dist: number }[];
  origin: Point;
  radiusPx: number;
  brightRadiusPx?: number;
  dimRadiusPx?: number;
  lightColor?: string;
  tokenId?: string;
}

export interface MapBackgroundConfig {
  url?: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  opacity: number;
}

export interface ManualFogStroke {
  id: string;
  action: FogBrushAction;
  x: number;
  y: number;
  radiusPx: number;
}

// Stage 5: Combat & Initiative Tracker
export interface Combatant {
  tokenId: string;
  name: string;
  initiative: number;
  faction: TokenFaction;
  color: string;
  hp: number;
  maxHp: number;
  tempHp?: number;
  ac: number;
  conditions?: ConditionType[];
}

export interface CombatState {
  isActive: boolean;
  round: number;
  currentTurnIndex: number;
  combatants: Combatant[];
}

export type AmbientSoundPreset =
  | 'campfire'      // Потрескивающий костер / факелы
  | 'water_stream'  // Шум ручья / фонтан / водопад
  | 'dungeon_drone' // Зловещий гул подземелья
  | 'tavern_crowd'  // Шум таверны и звон кружек
  | 'wind_whisper'  // Завывание ветра в расщелине
  | 'arcane_hum'    // Магический портал / алтарь
  | 'custom';       // Ссылка на пользовательский URL или загруженный файл

export interface PositionalAudioSource {
  id: string;
  name: string;
  x: number; // World X in pixels
  y: number; // World Y in pixels
  preset: AmbientSoundPreset;
  url?: string; // Optional custom audio URL / Data URL
  volume: number; // 0.0 to 1.0
  minDistance: number; // 100% volume inner radius in pixels (e.g. 100px)
  maxDistance: number; // Max audible outer radius in pixels (e.g. 450px)
  loop: boolean;
  isPlaying: boolean;
  color?: string; // Color on GM canvas
}

export type GlobalMusicTrack =
  | 'ambient_dungeon'   // Глубины подземелья
  | 'ambient_tavern'    // Уютная таверна
  | 'ambient_forest'    // Ночной лес
  | 'ambient_rain'      // Дождь и гроза
  | 'combat_standard'   // Бой: Звон клинков
  | 'combat_epic'       // Бой: Эпическая битва с боссом
  | 'none';

export interface GlobalMusicState {
  currentTrack: GlobalMusicTrack;
  isPlaying: boolean;
  volume: number; // 0.0 to 1.0
  isCombatMode: boolean; // True when combat battle theme is active
  customUrl?: string;
}

export type OneShotSfxType =
  | 'sword_clash'
  | 'fireball'
  | 'door_creak'
  | 'monster_roar'
  | 'bow_shot'
  | 'heal_spell'
  | 'magic_teleport'
  | 'thunderclap';

export interface MapData {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cellSize: number; // Default 50px (5ft)
  ambientLight: 'pitch_dark' | 'dim' | 'bright';
  backgroundUrl?: string;
  backgroundConfig?: MapBackgroundConfig;
  terrain: Record<string, TerrainType>; // key: "col,row"
  walls: WallSegment[];
  tokens: Token[];
  fogStrokes?: ManualFogStroke[];
  hpVisibility?: HpVisibilityMode;
  combat?: CombatState;
  audioSources?: PositionalAudioSource[];
  globalMusic?: GlobalMusicState;
  spellTemplates?: SpellTemplate[];
}

export interface ConnectedPeer {
  id: string; // Socket ID
  clientId: string; // Persistent browser session ID for reconnects
  name: string;
  color: string;
  role: UserRole;
  assignedTokenId: string;
  cursor?: Point;
  connectedAt: number;
}

export interface MapPing {
  id: string;
  x: number; // World X in pixels
  y: number; // World Y in pixels
  color: string;
  senderName: string;
  createdAt: number;
}

export interface RemoteRuler {
  peerId: string;
  senderName: string;
  color: string;
  start: Point;
  current: Point;
  updatedAt: number;
}

export interface TokenMoveTrail {
  tokenId: string;
  fromX: number; // Grid cell X
  fromY: number; // Grid cell Y
  toX: number;   // Grid cell X
  toY: number;   // Grid cell Y
  feet: number;
  color: string;
  timestamp: number;
}

// Stage 5: Dice Roller & Game Chat Types
export type DiceAdvantageMode = 'normal' | 'advantage' | 'disadvantage';

export interface DiceRollResult {
  id: string;
  senderName: string;
  senderRole: UserRole;
  senderColor: string;
  formula: string; // e.g. "1d20+5"
  rollType: DiceAdvantageMode;
  diceResults: number[]; // All raw dice rolls
  keptDice: number[]; // Kept dice after adv/dis
  modifier: number;
  total: number;
  isNat20: boolean;
  isNat1: boolean;
  isSecretGm: boolean;
  timestamp: number;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: UserRole;
  senderColor: string;
  text?: string;
  roll?: DiceRollResult;
  spellCard?: SpellCardData;
  isSecretGm?: boolean;
  timestamp: number;
}

// Stage 4 & 5 WebSocket Contract Payloads
export interface RoomJoinPayload {
  roomId: string;
  clientId: string;
  playerName: string;
  preferredRole?: UserRole;
  gmKey?: string;
  assignedTokenId?: string;
}

export interface RoomStatePayload {
  roomId: string;
  yourRole: UserRole;
  yourClientId: string;
  gmKey?: string;
  assignedTokenId: string;
  serverAntiCheatCulling: boolean;
  map: MapData;
  peers: ConnectedPeer[];
  messages?: ChatMessage[];
}

export interface TokenMovePayload {
  id: string;
  x: number;
  y: number;
  fromX?: number;
  fromY?: number;
  isFinal: boolean;
}

export interface TokenUpdatePayload {
  action: 'create' | 'update' | 'delete';
  token?: Token;
  tokenId?: string;
}

export interface WallSyncPayload {
  action: 'create' | 'delete' | 'clear' | 'replace_all';
  wall?: WallSegment;
  wallId?: string;
  walls?: WallSegment[];
}

export interface FogSyncPayload {
  action: 'reveal' | 'hide' | 'reset';
  stroke?: ManualFogStroke;
}

/**
 * State View Types
 *
 * A state-based visualization system where:
 * - Telemetry events are processed into state changes
 * - State has a defined shape
 * - State changes trigger animations/transitions
 */

// =============================================================================
// Core Event Types
// =============================================================================

/**
 * A state event extracted from telemetry (OTEL spans, etc.)
 */
export interface StateEvent<TPayload = Record<string, unknown>> {
  /** Event type identifier */
  type: string;
  /** When this event occurred */
  timestamp: number;
  /** Event-specific data */
  payload: TPayload;
  /** Optional trace correlation */
  traceId?: string;
  spanId?: string;
}

/**
 * Source of events - can be live (IPC/WebSocket) or replay (from storage)
 */
export interface EventSource<TEvent extends StateEvent = StateEvent> {
  /** Subscribe to events, returns unsubscribe function */
  subscribe(handler: (event: TEvent) => void): () => void;
  /** Optional: current mode */
  mode?: 'live' | 'replay';
}

// =============================================================================
// State Types
// =============================================================================

/**
 * A reducer that applies events to state
 */
export type StateReducer<TState, TEvent extends StateEvent> = (
  state: TState,
  event: TEvent
) => TState;

/**
 * Describes what changed between two states (for animations)
 */
export interface StateDiff<TState> {
  /** Previous state */
  prev: TState;
  /** New state */
  next: TState;
  /** Which paths changed (dot notation) */
  changedPaths: string[];
  /** The event that caused this change */
  event: StateEvent;
}

// =============================================================================
// Animation/Transition Types
// =============================================================================

export type AnimationType =
  | 'pulse'
  | 'glow'
  | 'flash'
  | 'shake'
  | 'slide-in'
  | 'slide-out'
  | 'fade-in'
  | 'fade-out'
  | 'particle-flow'
  | 'increment'
  | 'decrement'
  | 'bar-change';

export interface TransitionDefinition {
  /** Condition: which state path to watch */
  watch: string;
  /** Condition type */
  condition: 'changed' | 'increased' | 'decreased' | 'added' | 'removed';
  /** Animation to trigger */
  animate: AnimationType;
  /** Target element (CSS selector or element ID) */
  target?: string;
  /** Duration in ms */
  duration?: number;
  /** Additional params */
  params?: Record<string, unknown>;
}

export interface ActiveAnimation {
  id: string;
  type: AnimationType;
  target: string;
  startTime: number;
  duration: number;
  params?: Record<string, unknown>;
}

// =============================================================================
// Replay Types
// =============================================================================

export interface ReplayControls {
  /** Current playback state */
  state: 'playing' | 'paused' | 'stopped';
  /** Playback speed multiplier */
  speed: number;
  /** Current replay time (event time, not wall time) */
  currentTime: number;
  /** Start of replay range */
  startTime: number;
  /** End of replay range */
  endTime: number;
  /** Control methods */
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
}

// =============================================================================
// Pipeline View Specific Types (Case Study 1)
// =============================================================================

export interface PipelineStage {
  id: string;
  label: string;
  lastEventTime: number | null;
  isActive: boolean;
  count?: number;
}

export interface PipelineRepoState {
  path: string;
  lastEventTime: number;
  lastEventType: string;
}

export interface PipelineState {
  stages: Record<string, PipelineStage>;
  repos: Map<string, PipelineRepoState>;
  totalEvents: number;
}

export type PipelineEventType =
  | 'FS_CHANGE'
  | 'WATCH_DETECTED'
  | 'CACHE_REBUILD'
  | 'CACHE_HIT'
  | 'EVENT_BROADCAST';

export interface PipelineEvent extends StateEvent {
  type: PipelineEventType;
  payload: {
    repo?: string;
    stage?: string;
    slice?: string;
    eventType?: string;
  };
}

// =============================================================================
// Activity View Specific Types (Case Study 2)
// =============================================================================

export interface RoomState {
  id: string;
  userCount: number;
  users: Set<string>;
}

export interface ActivityState {
  rooms: Map<string, RoomState>;
  totalUsers: number;
  syncRatePerMinute: number;
  recentSyncs: number[];
}

export type ActivityEventType =
  | 'ROOM_JOIN'
  | 'ROOM_LEAVE'
  | 'SYNC_BROADCAST';

export interface ActivityEvent extends StateEvent {
  type: ActivityEventType;
  payload: {
    roomId?: string;
    userId?: string;
    userLogin?: string;
    syncType?: string;
  };
}

// =============================================================================
// Quota View Specific Types (Case Study 3)
// =============================================================================

export interface UserQuotaState {
  userId: number;
  userLogin: string;
  remaining: number;
  limit: number;
  resetTime: number;
  callsThisHour: number;
  cacheHits: number;
  byOperation: Map<string, { total: number; apiCalls: number }>;
  byRepo: Map<string, { total: number; apiCalls: number }>;
}

export interface QuotaDistributionState {
  users: Map<number, UserQuotaState>;
  serverRemaining: number;
  serverResetTime: number;
}

export type QuotaEventType = 'GITHUB_REQUEST';

export interface QuotaEvent extends StateEvent {
  type: QuotaEventType;
  payload: {
    userId?: number;
    userLogin?: string;
    tokenType: 'user' | 'server';
    operation: string;
    repoOwner?: string;
    repoName?: string;
    cacheHit: boolean;
    cacheTier?: string;
    ratelimitRemaining?: number;
    ratelimitLimit?: number;
    ratelimitReset?: number;
  };
}

// =============================================================================
// View Definition (Schema)
// =============================================================================

export interface StateViewDefinition<TState, TEvent extends StateEvent> {
  id: string;
  name: string;
  description?: string;

  /** Initial state */
  initialState: TState;

  /** Reducer function or reference */
  reducer: StateReducer<TState, TEvent>;

  /** Transition definitions for animations */
  transitions?: TransitionDefinition[];
}

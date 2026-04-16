import type { Segment } from '../track/TrackEditor.js'

// ── Circuit payload (serialisable to JSON) ────────────────────────────────────

export type CircuitPayload =
  | { kind: 'preset';  index: number }
  | { kind: 'simple';  segments: Segment[] }
  | { kind: 'switch';
      prefix:  Segment[]
      pathA:   Segment[]
      pathB:   Segment[]
      forkPos: { x: number; y: number; z: number }
    }

// ── Database row shapes ───────────────────────────────────────────────────────

export interface CircuitRow {
  id:          string
  name:        string
  creator:     string
  payload:     CircuitPayload
  preview_url: string | null
  description: string | null
  created_at:  string
  /** Injected client-side after fetching ratings */
  avgScore?:   number
  ratingCount?: number
}

export interface RatingRow {
  id:         string
  circuit_id: string
  voter_id:   string
  score:      number
  comment:    string | null
  created_at: string
}

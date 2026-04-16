import { supabase, getVoterId } from './client.js'
import type { CircuitPayload, CircuitRow, RatingRow } from './types.js'

// ── Circuits ──────────────────────────────────────────────────────────────────

export interface ShareParams {
  name:        string
  creator:     string
  description: string
  payload:     CircuitPayload
  previewDataUrl: string | null   // canvas toDataURL result
}

export async function shareCircuit(params: ShareParams): Promise<CircuitRow> {
  let preview_url: string | null = null

  // Upload preview image to Storage if provided
  if (params.previewDataUrl) {
    const blob   = dataUrlToBlob(params.previewDataUrl)
    const path   = `previews/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supabase.storage
      .from('previews')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

    if (!upErr) {
      const { data } = supabase.storage.from('previews').getPublicUrl(path)
      preview_url = data.publicUrl
    }
  }

  const { data, error } = await supabase
    .from('circuits')
    .insert({
      name:        params.name,
      creator:     params.creator,
      description: params.description || null,
      payload:     params.payload,
      preview_url,
    })
    .select()
    .single()

  if (error) throw error
  return data as CircuitRow
}

export async function listCircuits(
  limit  = 20,
  offset = 0,
): Promise<CircuitRow[]> {
  const { data, error } = await supabase
    .from('circuits')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  const rows = (data ?? []) as CircuitRow[]

  // Attach avg score + count from ratings
  const ids = rows.map(r => r.id)
  if (ids.length === 0) return rows

  const { data: rData } = await supabase
    .from('ratings')
    .select('circuit_id, score')
    .in('circuit_id', ids)

  const scoreMap = new Map<string, number[]>()
  for (const r of (rData ?? [])) {
    if (!scoreMap.has(r.circuit_id)) scoreMap.set(r.circuit_id, [])
    scoreMap.get(r.circuit_id)!.push(r.score)
  }

  for (const row of rows) {
    const scores = scoreMap.get(row.id) ?? []
    row.ratingCount = scores.length
    row.avgScore    = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      : 0
  }

  return rows
}

export async function getCircuit(id: string): Promise<CircuitRow | null> {
  const { data, error } = await supabase
    .from('circuits')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as CircuitRow
}

// ── Ratings ───────────────────────────────────────────────────────────────────

export async function submitRating(
  circuitId: string,
  score:     number,
  comment:   string,
): Promise<void> {
  const voter_id = getVoterId()

  // Upsert: update if the voter already rated, insert otherwise
  const { error } = await supabase
    .from('ratings')
    .upsert(
      { circuit_id: circuitId, voter_id, score, comment: comment || null },
      { onConflict: 'circuit_id,voter_id' },
    )

  if (error) throw error
}

export async function getMyRating(circuitId: string): Promise<RatingRow | null> {
  const voter_id = getVoterId()
  const { data } = await supabase
    .from('ratings')
    .select('*')
    .eq('circuit_id', circuitId)
    .eq('voter_id', voter_id)
    .single()

  return (data as RatingRow) ?? null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)![1]
  const bin  = atob(b64)
  const arr  = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

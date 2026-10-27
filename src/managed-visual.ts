// Pure verdict for a completed independent vision response. Provider I/O,
// screenshots and artifact custody remain with the control plane.
export interface ManagedVisualScore { criterion: string; score: number; reason: string }
export interface ManagedVisualVerdict {
  complete: boolean; passed: boolean; scores: ManagedVisualScore[]; summary: string;
  error?: 'incomplete_response' | 'invalid_review';
}
export function evaluateManagedVisualReview(input: { criteria: string[]; text: string; stopReason: string | null }): ManagedVisualVerdict {
  const refused = (error: 'incomplete_response' | 'invalid_review'): ManagedVisualVerdict => ({ complete: false, passed: false, scores: [], summary: error === 'incomplete_response' ? 'The independent visual review did not finish; no design verdict was issued.' : 'The independent visual review did not match the frozen rubric; no design verdict was issued.', error });
  if (input.stopReason !== 'end_turn') return refused('incomplete_response');
  if (!input.criteria.length || input.criteria.length > 20 || input.text.length > 128000) return refused('invalid_review');
  let parsed: unknown;
  try { parsed = JSON.parse(input.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { return refused('invalid_review'); }
  if (!parsed || typeof parsed !== 'object') return refused('invalid_review');
  const review = parsed as { scores?: unknown; summary?: unknown };
  if (!Array.isArray(review.scores) || review.scores.length !== input.criteria.length || typeof review.summary !== 'string') return refused('invalid_review');
  const scores: ManagedVisualScore[] = [];
  for (let index = 0; index < review.scores.length; index++) {
    const score = review.scores[index] as Partial<ManagedVisualScore> | null;
    if (!score || typeof score.criterion !== 'string' || score.criterion !== input.criteria[index] || !Number.isInteger(score.score) || score.score! < 1 || score.score! > 5 || typeof score.reason !== 'string' || !score.reason.trim()) return refused('invalid_review');
    scores.push({criterion: score.criterion, score: score.score!, reason: score.reason.slice(0, 2000)});
  }
  return {complete: true, passed: scores.every(score => score.score >= 4), scores, summary: review.summary.slice(0, 4000)};
}

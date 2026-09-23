import { alphaSightsAvailabilityStarts, alphaSightsStateMatches } from './alphasights-availability.js';
import { ExternalFormEvidenceSchema, ExternalFormPlanSchema, ExternalPacketSchema, sha256,
  type ExternalPacket, type ExternalFormPlan } from '@ctx/contracts';

export interface CurrentFact { item_id: string; revision: number; body: string; active: boolean }
/** Re-read memory versions immediately before authorization AND dispatch. */
export function externalPacketProblems(packet: ExternalPacket, facts: CurrentFact[], now: number, options: { require_owner_review?: boolean } = {}): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const answer of packet.answers) {
    if (keys.has(answer.key)) problems.push(`Duplicate answer: ${answer.key}`);
    keys.add(answer.key);
    if (options.require_owner_review && !answer.owner_confirmed) problems.push(`Owner review required: ${answer.key}`);
    if (!answer.value.trim()) problems.push(`Missing answer: ${answer.key}`);
    if (answer.personal_attestation && !answer.owner_confirmed) problems.push(`Current owner answer required: ${answer.key}`);
    if (!answer.facts.length && !answer.owner_confirmed) problems.push(`Unsupported answer: ${answer.key}`);
    for (const source of answer.facts) {
      const current = facts.find(f => f.item_id === source.item_id);
      if (!current?.active || current.revision !== source.revision || !current.body.includes(source.excerpt)
        || Date.parse(source.valid_until) <= now) problems.push(`Stale or missing source: ${answer.key}:${source.item_id}`);
    }
  }
  return problems;
}

export function externalTargetAllowed(url: string, expected: string): boolean {
  try {
    const actual = new URL(url); const target = new URL(expected);
    return actual.protocol === 'https:' && !actual.username && !actual.password
      && actual.origin === target.origin && actual.pathname === target.pathname && actual.search === target.search;
  } catch { return false; }
}

/** No caller-supplied passed flag. All bindings and exact field readbacks matter. */
export async function externalFormEvidencePassed(raw: unknown, packetRaw: unknown, planRaw: unknown,
  expected: { operation_id: string; not_before: string; now: number; require_fresh?: boolean }): Promise<boolean> {
  const e = ExternalFormEvidenceSchema.parse(raw);
  const packet = ExternalPacketSchema.parse(packetRaw);
  const plan = ExternalFormPlanSchema.parse(planRaw);
  let confirmed: boolean;
  if ('kind' in plan.confirmation) {
    const read=e.availability_readback;
    try {
      const starts=alphaSightsAvailabilityStarts(packet,plan);
      confirmed=!!read && read.url===plan.confirmation.url && read.status===200 && e.readback_context==='fresh'
        && Date.parse(read.observed_at)>=Date.parse(expected.not_before)
        && Date.parse(read.observed_at)<=Date.parse(e.observed_at)
        && Date.parse(plan.confirmation.baseline.observed_at)<=Date.parse(read.observed_at)
        && alphaSightsStateMatches(read,plan.confirmation,starts,read.observed_at);
    }catch{confirmed=false;}
  } else confirmed=e.confirmation_text.trim()===plan.confirmation.text;
  return e.operation_id === expected.operation_id
    && e.packet_digest === await sha256(packet) && e.plan_digest === await sha256(plan)
    && Date.parse(e.observed_at) >= Date.parse(expected.not_before)
    && Date.parse(e.observed_at) <= expected.now + 60000 && expected.now - Date.parse(e.observed_at) <= 10 * 60000
    && externalTargetAllowed(e.url, plan.url) && e.identity_text.trim() === plan.identity.text
    && ['submitted', 'reconciled'].includes(e.phase) && !e.errors.length
    && confirmed
    && (!expected.require_fresh || e.readback_context === 'fresh')
    && (!(plan.submit_confirmation || plan.fields.some(f => f.control === 'toggle')) || e.readback_context === 'fresh')
    && exactFormAnswers(packet, plan, e.values);
}

export function exactFormAnswers(packet: ExternalPacket, plan: ExternalFormPlan, values: Record<string, string>): boolean {
  const keys = packet.answers.map(a => a.key);
  return new Set(keys).size === keys.length && new Set(plan.fields.map(f => f.key)).size === keys.length
    && plan.fields.length === keys.length && Object.keys(values).length === keys.length
    && packet.answers.every(a => plan.fields.some(f => f.key === a.key) && values[a.key] === a.value);
}

export interface BookingEvidence {
  id: string; iCalUID: string; status: string;
  summary?: string; description?: string;
  organizer: { email: string }; attendees: { email: string; responseStatus?: string }[];
  start: { dateTime?: string }; end: { dateTime?: string }; htmlLink?: string;
}
/** A proposed slot / all-day event / declined or cancelled invitation is not a booking. */
export function externalBookingPassed(event: BookingEvidence, expected: { uid: string; owner: string; organizer_domain: string; now: number; require_client_consultation?: boolean }) {
  const start = Date.parse(event.start.dateTime ?? ''); const end = Date.parse(event.end.dateTime ?? '');
  const organizer = event.organizer.email.toLowerCase().split('@');
  return Boolean(expected.uid) && event.iCalUID === expected.uid && event.status === 'confirmed'
    && organizer.length === 2 && organizer[1] === expected.organizer_domain.toLowerCase()
    && event.attendees.some(a => a.email.toLowerCase() === expected.owner.toLowerCase() && a.responseStatus !== 'declined')
    && start > expected.now && end > start
    && (!expected.require_client_consultation || clientConsultation(event));
}

/** A provider-domain invitation alone cannot distinguish screening from the paid call. */
function clientConsultation(event: BookingEvidence): boolean {
  const title = event.summary ?? '';
  const text = `${title}\n${event.description ?? ''}`;
  return /\b(?:consultation|client (?:call|discussion|interview))\b/i.test(title)
    && !/\b(?:introductory|introduction|alignment|vetting|screening|coordinator|pre[- ]?call)\b/i.test(text)
    && Date.parse(event.end.dateTime ?? '') - Date.parse(event.start.dateTime ?? '') >= 30 * 60000;
}

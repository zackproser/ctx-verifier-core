import { ExternalAvailabilityStateSchema, type AlphaSightsAvailabilityConfirmation,
  type ExternalAvailabilityState, type ExternalFormPlan, type ExternalPacket } from '@ctx/contracts';

const instant = (raw: string) => {
  const value = Date.parse(raw);
  if (!Number.isFinite(value) || new Date(value).toISOString() !== raw) throw new Error('Expected canonical UTC availability');
  return value;
};
const intervals = (slots: ExternalAvailabilityState['slots']) => slots.map(s => {
  const a=instant(s.starts_at), b=instant(s.ends_at);
  if(b<=a)throw new Error('Availability interval must have positive duration');
  return [a,b] as [number,number];
});
const union = (values: [number,number][]) => {
  const result: [number,number][]=[];
  for(const [a,b] of values.sort((x,y)=>x[0]-y[0] || x[1]-y[1])) {
    const last=result.at(-1);
    if(last && a<=last[1])last[1]=Math.max(last[1],b);else result.push([a,b]);
  }
  return result;
};
/** Decode only the observed provider response, dropping non-authoritative slot metadata. */
export function decodeAlphaSightsAvailability(raw: unknown): ExternalAvailabilityState {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Invalid availability response');
  const data=raw as Record<string,unknown>;
  if(Object.keys(data).some(k=>!['advisor_name','timezone','slots'].includes(k)) || !Array.isArray(data.slots) || data.slots.length>1000)
    throw new Error('Unrecognized availability response');
  const slots=data.slots.map(slot=>{
    if(!slot || typeof slot!=='object' || Array.isArray(slot))throw new Error('Invalid availability slot');
    const s=slot as Record<string,unknown>;
    if(Object.keys(s).some(k=>!['starts_at','ends_at','updated_at','user_type','user_id','app_name'].includes(k)))throw new Error('Unrecognized slot field');
    return {starts_at:s.starts_at,ends_at:s.ends_at};
  });
  const state=ExternalAvailabilityStateSchema.parse({...data,slots});intervals(state.slots);return state;
}
export function alphaSightsAvailabilityEndpoint(pageUrl: string, endpoint: string): boolean {
  try {
    const page=new URL(pageUrl), api=new URL(endpoint);
    return page.protocol==='https:' && page.hostname==='quick-availability.alphasights.com' && !page.port && !page.username && !page.password
      && api.origin===page.origin && !api.username && !api.password && !api.search && !api.hash
      && /^\/proxy\/availability\/availability\/advisors\/[A-Za-z0-9_-]+$/.test(api.pathname);
  }catch{return false;}
}
export function alphaSightsReadbackTarget(plan: ExternalFormPlan): boolean {
  return 'kind' in plan.confirmation && alphaSightsAvailabilityEndpoint(plan.url, plan.confirmation.url);
}
/** Current/future availability is an exact interval union; expired data may be pruned. */
export function availabilityChangeMatches(baseline: ExternalAvailabilityState['slots'], actual: ExternalAvailabilityState['slots'], starts: string[], at: string): boolean {
  try {
    const now=instant(at), old=intervals(baseline), next=intervals(actual);
    if(new Set(starts).size!==starts.length)return false;
    const added=starts.map(start=>{const a=instant(start);return [a,a+3600000] as [number,number];});
    if(added.some(([,b])=>b<=now))return false;
    const expired=next.filter(([,b])=>b<=now);
    if(expired.some(([a,b])=>!old.some(([x,y])=>x===a&&y===b)))return false;
    return JSON.stringify(union(next.filter(([,b])=>b>now)))===JSON.stringify(union([...old,...added].filter(([,b])=>b>now)));
  }catch{return false;}
}
export function alphaSightsAvailabilityStarts(packet: ExternalPacket, plan: ExternalFormPlan): string[] {
  if(!alphaSightsReadbackTarget(plan) || packet.purpose!=='availability' || packet.answers.length>12
    || plan.fields.some(f=>f.control!=='toggle') || packet.answers.some(a=>a.value!=='true' || !a.owner_confirmed || !a.key.startsWith('start:')))
    throw new Error('Readback requires an authorized additive availability packet');
  const starts=packet.answers.map(a=>a.key.slice(6));
  const baseline=(plan.confirmation as AlphaSightsAvailabilityConfirmation).baseline;
  if(new Set(starts).size!==starts.length || starts.some(s=>instant(s)<=Date.parse(baseline.observed_at)))throw new Error('Invalid offered hours');
  return starts;
}
export function alphaSightsStateMatches(state: ExternalAvailabilityState, confirmation: AlphaSightsAvailabilityConfirmation, starts: string[], at: string): boolean {
  return state.advisor_name===confirmation.baseline.advisor_name && state.timezone===confirmation.baseline.timezone
    && availabilityChangeMatches(confirmation.baseline.slots,state.slots,starts,at);
}
/** Validate the exact outgoing PUT before forwarding any mutation to the provider. */
export function alphaSightsSaveMatches(raw: unknown, confirmation: AlphaSightsAvailabilityConfirmation, starts: string[], at: string): boolean {
  try {
    if(starts.some(s=>instant(s)<=instant(at)))return false;
    if(!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).length!==1 || !('slots' in raw))return false;
    const state=decodeAlphaSightsAvailability({advisor_name:confirmation.baseline.advisor_name, timezone:confirmation.baseline.timezone, slots:(raw as {slots:unknown}).slots});
    return alphaSightsStateMatches(state,confirmation,starts,at);
  }catch{return false;}
}

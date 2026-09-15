import { expect, it } from 'vitest';
import { sha256, ExternalFormPlanSchema, ExternalPacketSchema } from '@ctx/contracts';
import { externalFormEvidencePassed, externalPacketProblems, externalBookingPassed } from '../src/external-work.js';
const id = '10000000-0000-4000-8000-000000000001';
const packet = ExternalPacketSchema.parse({contract:'ctx.external-packet.v1',case_id:id,purpose:'compliance',version:1,answers:[{key:'x',question:'Experience',value:'Built CTX',facts:[],owner_confirmed:true}]});
const plan = ExternalFormPlanSchema.parse({contract:'ctx.external-form-plan.v1',url:'https://portal.example/42',identity:{locator:{by:'testId',testId:'project'},text:'42'},fields:[{key:'x',locator:{by:'label',label:'Experience'},control:'text'}],submit:{by:'text',text:'Submit'},confirmation:{locator:{by:'testId',testId:'receipt'},text:'Saved'},errors:[{by:'role',role:'alert'}]});
const now = Date.parse('2026-09-14T15:00:00Z');
const expected = {operation_id:id,not_before:'2026-09-14T14:59:00Z',now};
async function evidence() { return {contract:'ctx.external-form-evidence.v1',operation_id:id,packet_digest:await sha256(packet),plan_digest:await sha256(plan),observed_at:'2026-09-14T15:00:00Z',url:plan.url,identity_text:'42',confirmation_text:'Saved',values:{x:'Built CTX'},errors:[],phase:'submitted'}; }
it('accepts only bound, fresh, exact provider readback', async () => {
  expect(await externalFormEvidencePassed(await evidence(),packet,plan,expected)).toBe(true);
  for (const patch of [{url:'https://evil.example/42'},{url:'https://portal.example/43'}, {identity_text:'43'}, {confirmation_text:''}, {values:{x:'Different'}}, {errors:['Something went wrong']}, {phase:'inspected'}, {packet_digest:'f'.repeat(64)}, {plan_digest:'f'.repeat(64)}, {observed_at:'2026-09-14T14:00:00Z'}, {operation_id:'20000000-0000-4000-8000-000000000002'}]) {
    expect(await externalFormEvidencePassed({...await evidence(),...patch},packet,plan,expected),JSON.stringify(patch)).toBe(false);
  }
});
it('requires supported current sources or a current owner answer', () => {
  const p = structuredClone(packet); p.answers[0]!.owner_confirmed=false;
  expect(externalPacketProblems(p,[],now)).toContain('Unsupported answer: x');
  p.answers[0]!.facts=[{item_id:id,revision:1,excerpt:'Built CTX',valid_until:'2027-01-01T00:00:00Z'}];
  const facts=[{item_id:id,revision:1,body:'Built CTX',active:true}];
  expect(externalPacketProblems(p,facts,now)).toEqual([]);
  expect(externalPacketProblems(p,[{...facts[0]!,revision:2}],now)).toHaveLength(1);
  p.answers[0]!.personal_attestation=true;
  expect(externalPacketProblems(p,facts,now)).toContain('Current owner answer required: x');
});
it('requires a correlated future organizer invitation, and handles cancellation and DST offsets', () => {
  const e={id:'event1',iCalUID:'uid1',status:'confirmed',organizer:{email:'x@alphasights.com'},attendees:[{email:'owner@example.com'}],start:{dateTime:'2026-11-02T09:00:00-05:00'},end:{dateTime:'2026-11-02T09:30:00-05:00'}};
  const x={uid:'uid1',owner:'owner@example.com',organizer_domain:'alphasights.com',now};
  expect(externalBookingPassed(e,x)).toBe(true);
  for (const patch of [{status:'cancelled'}, {iCalUID:'other'}, {organizer:{email:'x@alphasights.com.evil'}}, {attendees:[{email:'owner@example.com',responseStatus:'declined'}]}, {start:{dateTime:'2025-01-01T00:00:00Z'},end:{dateTime:'2025-01-01T01:00:00Z'}}]) expect(externalBookingPassed({...e,...patch},x)).toBe(false);
});

it('requires a fresh context for toggle readback, even when a reload retained the same draft', async () => {
  const p = ExternalPacketSchema.parse({ ...packet, purpose: 'availability', answers: [{ ...packet.answers[0], value: 'true' }] });
  const target = ExternalFormPlanSchema.parse({ ...plan, fields: [{ key: 'x', control: 'toggle', locator: { by: 'role', role: 'button', name: '01:00 PM' }, selected: { attribute: 'class', value: 'tab-active' } }] });
  const e = { ...await evidence(), packet_digest: await sha256(p), plan_digest: await sha256(target), values: { x: 'true' } };
  expect(await externalFormEvidencePassed(e, p, target, expected)).toBe(false);
  expect(await externalFormEvidencePassed({ ...e, readback_context: 'fresh' }, p, target, expected)).toBe(true);
});

it('does not count coordinator, screening, short, or unidentified meetings as client consultations', () => {
  const e = { id:'client', iCalUID:'uid', status:'confirmed', summary:'Hosting Platforms consultation', organizer:{email:'expert@alphasights.com'}, attendees:[{email:'owner@example.com'}], start:{dateTime:'2026-09-16T13:00:00-04:00'}, end:{dateTime:'2026-09-16T14:00:00-04:00'} };
  const x = { uid:'uid', owner:'owner@example.com', organizer_domain:'alphasights.com', now, require_client_consultation:true };
  expect(externalBookingPassed(e,x)).toBe(true);
  for(const patch of [{summary:'Coordinator alignment'}, {description:'Initial vetting call'}, {summary:undefined}, {end:{dateTime:'2026-09-16T13:05:00-04:00'}}]) expect(externalBookingPassed({...e,...patch},x)).toBe(false);
});

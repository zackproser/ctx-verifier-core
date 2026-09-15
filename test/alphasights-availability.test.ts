import { expect, it } from 'vitest';
import { ExternalFormPlanSchema, ExternalPacketSchema, sha256 } from '@ctx/contracts';
import { externalFormEvidencePassed, decodeAlphaSightsAvailability, availabilityChangeMatches,
  alphaSightsReadbackTarget, alphaSightsAvailabilityStarts, alphaSightsSaveMatches } from '../src/index.js';
const slot=(a:string,b:string)=>({starts_at:`2026-09-16T${a}:00.000Z`,ends_at:`2026-09-16T${b}:00.000Z`});
const baseline={advisor_name:'Fixture Advisor',timezone:'UTC',observed_at:'2026-09-15T12:00:00.000Z',slots:[slot('12:00','13:00')]};
const start='2026-09-16T13:00:00.000Z';
const packet=ExternalPacketSchema.parse({contract:'ctx.external-packet.v1',case_id:'10000000-0000-4000-8000-000000000001',version:1,purpose:'availability',answers:[{key:`start:${start}`,question:'Offer one hour',value:'true',facts:[],owner_confirmed:true}]});
const plan=ExternalFormPlanSchema.parse({contract:'ctx.external-form-plan.v1',url:'https://quick-availability.alphasights.com/project',identity:{locator:{by:'text',text:'My Availability'},text:'My Availability'},fields:[{key:`start:${start}`,control:'toggle',locator:{by:'text',text:'01:00 PM'},selected:{attribute:'class',value:'selected'}}],submit:{by:'testId',testId:'save'},confirmation:{kind:'alphasights-availability',url:'https://quick-availability.alphasights.com/proxy/availability/availability/advisors/fixture',baseline},errors:[{by:'role',role:'alert'}]});
const confirmation=plan.confirmation;if(!('kind' in confirmation))throw new Error('wrong fixture');
const at='2026-09-15T12:01:00.000Z';
it('normalizes only the observed response and validates exact UTC ranges',()=>{
  expect(decodeAlphaSightsAvailability({advisor_name:baseline.advisor_name,timezone:'UTC',slots:[{...baseline.slots[0],app_name:'Delivery',user_type:'associate',user_id:123,updated_at:at}]})).toEqual({advisor_name:baseline.advisor_name,timezone:'UTC',slots:baseline.slots});
  for(const raw of [[],{}, {advisor_name:'Fixture Advisor',timezone:'UTC',slots:[slot('13:00','12:00')]}, {advisor_name:'Fixture Advisor',timezone:'UTC',slots:[],extra:true}])expect(()=>decodeAlphaSightsAvailability(raw)).toThrow();
});
it('compares exact unions including merged hours and preserved current/future availability',()=>{
  expect(availabilityChangeMatches(baseline.slots,[slot('12:00','14:00')],[start],at)).toBe(true);
  expect(availabilityChangeMatches(baseline.slots,[slot('13:00','14:00')],[start],at)).toBe(false);
  expect(availabilityChangeMatches(baseline.slots,[slot('12:00','15:00')],[start],at)).toBe(false);
  expect(availabilityChangeMatches(baseline.slots,baseline.slots,[start],at)).toBe(false);
  expect(availabilityChangeMatches(baseline.slots,[slot('12:00','14:00')],[start,start],at)).toBe(false);
  expect(availabilityChangeMatches(baseline.slots,baseline.slots,[],at)).toBe(true);
  const expired={starts_at:'2026-09-14T12:00:00.000Z',ends_at:'2026-09-14T13:00:00.000Z'};
  expect(availabilityChangeMatches([...baseline.slots,expired],[slot('12:00','14:00')],[start],at)).toBe(true);
  expect(availabilityChangeMatches(baseline.slots,[slot('12:00','14:00'),expired],[start],at)).toBe(false);
  expect(availabilityChangeMatches(baseline.slots,[],[start],'2026-09-17T12:00:00.000Z')).toBe(false);
});
it('restricts endpoint and packet authority and rejects unexpected payload effects',()=>{
  expect(alphaSightsReadbackTarget(plan)).toBe(true);expect(alphaSightsAvailabilityStarts(packet,plan)).toEqual([start]);
  for(const url of ['https://evil.example/proxy/availability/availability/advisors/fixture',confirmation.url+'?action=save',confirmation.url+'/other'])
    expect(alphaSightsReadbackTarget({...plan,confirmation:{...confirmation,url}})).toBe(false);
  expect(()=>alphaSightsAvailabilityStarts({...packet,purpose:'compliance'},plan)).toThrow();
  expect(()=>alphaSightsAvailabilityStarts({...packet,answers:packet.answers.map(a=>({...a,owner_confirmed:false}))},plan)).toThrow();
  expect(alphaSightsSaveMatches({slots:[slot('12:00','14:00')]},confirmation,[start],at)).toBe(true);
  for(const payload of [{slots:[slot('13:00','14:00')]},{slots:[slot('12:00','15:00')]},{slots:[slot('12:00','14:00')],delete_all:true},{slots:[{...slot('12:00','14:00'),share:true}]}])expect(alphaSightsSaveMatches(payload,confirmation,[start],at)).toBe(false);
});
it('requires fresh bound provider state, never a success banner or a supplied verdict',async()=>{
  const expected={operation_id:'20000000-0000-4000-8000-000000000002',not_before:at,now:Date.parse(at)+1000};
  const evidence={contract:'ctx.external-form-evidence.v1',operation_id:expected.operation_id,packet_digest:await sha256(packet),plan_digest:await sha256(plan),observed_at:at,url:plan.url,identity_text:plan.identity.text,confirmation_text:'',values:{[`start:${start}`]:'true'},errors:[],readback_context:'fresh',phase:'submitted',availability_readback:{url:confirmation.url,status:200,advisor_name:baseline.advisor_name,timezone:'UTC',slots:[slot('12:00','14:00')],observed_at:at}};
  expect(await externalFormEvidencePassed(evidence,packet,plan,expected)).toBe(true);
  expect(await externalFormEvidencePassed({...evidence,phase:'reconciled'},packet,plan,expected)).toBe(true);
  for(const patch of [{readback_context:undefined},{availability_readback:undefined,confirmation_text:'Saved'},{plan_digest:'0'.repeat(64)},{errors:['Provider rejected save']}])expect(await externalFormEvidencePassed({...evidence,...patch},packet,plan,expected)).toBe(false);
  for(const patch of [{url:confirmation.url+'-other'},{advisor_name:'Other advisor'},{timezone:'America/New_York'},{slots:[slot('13:00','14:00')]},{observed_at:baseline.observed_at},{observed_at:'2026-09-15T12:02:00.000Z'}])expect(await externalFormEvidencePassed({...evidence,availability_readback:{...evidence.availability_readback,...patch}},packet,plan,expected)).toBe(false);
});

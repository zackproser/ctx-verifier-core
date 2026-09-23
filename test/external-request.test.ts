import { expect, it } from 'vitest';
import { ExternalPacketSchema, ExternalFormPlanSchema } from '@ctx/contracts';
import { externalFormRequestBody, externalFormRequestMatches, externalDeclarationKind, externalPacketProblems } from '../src/index.js';
const packet = ExternalPacketSchema.parse({contract:'ctx.external-packet.v1',case_id:'10000000-0000-4000-8000-000000000001',purpose:'compliance',version:1,answers:[{key:'x',question:'Experience',value:'Built CTX',facts:[],owner_confirmed:true}]});
const plan = ExternalFormPlanSchema.parse({contract:'ctx.external-form-plan.v1',url:'https://portal.example/42',identity:{locator:{by:'testId',testId:'project'},text:'42'},fields:[{key:'x',locator:{by:'label',label:'Experience'},control:'text'}],submit:{by:'text',text:'Submit'},confirmation:{locator:{by:'testId',testId:'receipt'},text:'Saved'},errors:[{by:'role',role:'alert'}],request:{url:'https://portal.example/save',method:'POST',encoding:'json',answer_fields:[{key:'x',field:'experience'}],static_fields:{project:'42'}}});
const request = {url:plan.request!.url,method:'POST',content_type:'application/json',body:JSON.stringify({experience:'Built CTX',project:'42'})};
it('requires the exact endpoint, method, content type and full reviewed payload', () => {
  expect(externalFormRequestMatches(packet,plan,request)).toBe(true);
  for (const patch of [{url:request.url+'?other'}, {url:'https://evil.example/save'}, {method:'PATCH'}, {content_type:'text/plain'}, {body:null},
    {body:JSON.stringify({experience:'Built more',project:'42'})}, {body:JSON.stringify({experience:'Built CTX',project:'42',hidden:'exfiltration'})},
    {body:'{"experience":"Built CTX","experience":"Built CTX","project":"42"}'},
    {body:'{"experience":"Built CTX","\\u0065xperience":"Built CTX","project":"42"}'}, {body:'[]'}])
    expect(externalFormRequestMatches(packet,plan,{...request,...patch}),JSON.stringify(patch)).toBe(false);
});
it('rejects unbound, overlapping, duplicate and cross-origin request declarations', () => {
  for (const patch of [{request:undefined}, {request:{...plan.request!,url:'https://evil.example/save'}},
    {request:{...plan.request!,static_fields:{experience:'override'}}}, {request:{...plan.request!,answer_fields:[{key:'other',field:'experience'}]}},
    {request:{...plan.request!,answer_fields:[...plan.request!.answer_fields,...plan.request!.answer_fields]}}])
    expect(externalFormRequestBody(packet,{...plan,...patch})).toBe(null);
});
it('supports exact flat form encoding, including prototype-like names, and rejects duplicate fields', () => {
  const form={...plan,request:{...plan.request!,encoding:'form' as const}};
  expect(externalFormRequestMatches(packet,form,{...request,content_type:'application/x-www-form-urlencoded; charset=UTF-8',body:'project=42&experience=Built+CTX'})).toBe(true);
  expect(externalFormRequestMatches(packet,form,{...request,content_type:'application/x-www-form-urlencoded',body:'project=42&experience=Built+CTX&experience=Built+CTX'})).toBe(false);
  const named={...plan,request:{...plan.request!,static_fields:JSON.parse('{"__proto__":"reviewed"}')}};
  expect(externalFormRequestMatches(packet,named,{...request,body:'{"experience":"Built CTX","__proto__":"reviewed"}'})).toBe(true);
});
it.each(['Confirm your own words', 'These answers were unassisted', 'No third-party sources', 'No third‑party tools',
  'Not AI-generated', 'Not AI‑assisted', 'Produced without assistance', 'Responses not produced with tools',
  'I did not use artificial intelligence', 'No language model was used without assistance', 'sin asistencia', 'sans aide', 'ohne Hilfe'])(
  'classifies process declarations: %s', question => expect(externalDeclarationKind(question)).toBe('process'));
it('requires review of every answer in the new authorization policy, including source-backed claims', () => {
  const p=structuredClone(packet);p.answers[0]!.owner_confirmed=false;
  p.answers[0]!.facts=[{item_id:p.case_id,revision:1,excerpt:'Built CTX',valid_until:'2027-01-01T00:00:00Z'}];
  const facts=[{item_id:p.case_id,revision:1,body:'Built CTX',active:true}];
  expect(externalPacketProblems(p,facts,Date.now())).toEqual([]);
  expect(externalPacketProblems(p,facts,Date.now(),{require_owner_review:true})).toContain('Owner review required: x');
});

import { createHash, timingSafeEqual } from 'node:crypto';
import { submissionInput } from './workflows.mjs';
const fail = (message, status=400) => Object.assign(new Error(message), {status});
// Operator-issued, expiring proposal-only credentials. Never grants catalog write access.
export function coordinatorGrant(authorization, grants, now=Date.now()) {
  const bearer = /^Bearer ([a-f0-9]{64})$/.exec(authorization || '')?.[1];
  if (!bearer) throw fail('Connection required',401);
  const digest = createHash('sha256').update(bearer).digest();
  const grant = grants.find(g => /^[a-f0-9]{64}$/.test(g.tokenHash) && timingSafeEqual(digest,Buffer.from(g.tokenHash,'hex')));
  if (!grant || grant.expiresAt <= now || !Number.isFinite(grant.expiresAt) || !grant.identity || !Array.isArray(grant.collections)) throw fail('Connection expired or revoked',403);
  return grant;
}
export async function coordinatorRequest(db, grant, action, input) {
  if (!input || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.operationId || '')) throw fail('Operation UUID required');
  const id=input.operationId;
  if (!['preview','status'].includes(action)) throw fail('Unknown operation',404);
  if (Object.keys(input).some(k => !['operationId',...(action==='preview'?['product']:[])].includes(k))) throw fail('Unknown fields');
  if (action==='preview') {
    const p=submissionInput(input.product || {});
    if (!p.name || !p.source_url || !grant.collections.includes(p.product_id)) throw fail('Product outside connection scope',403);
    await db`WITH saved AS (INSERT INTO marcada.product_submissions(id,identity,item_id,proposed,mutation_id) SELECT ${id},${grant.identity},NULL,${JSON.stringify(p)}::jsonb,${id} WHERE EXISTS(SELECT 1 FROM marcada.products WHERE id=${p.product_id} AND active) ON CONFLICT(id) DO NOTHING RETURNING id) INSERT INTO marcada.audit(id,actor,action,detail) SELECT gen_random_uuid(),${grant.identity},'coordinator_proposal',id::text FROM saved`;
    const [saved]=await db`SELECT proposed,identity FROM marcada.product_submissions WHERE id=${id}`;
    if (!saved || saved.identity!==grant.identity || JSON.stringify(Object.entries(saved.proposed).sort())!==JSON.stringify(Object.entries(p).sort())) throw fail('Operation conflict or unavailable collection',409);
  }
  const [saved]=await db`SELECT status,proposed FROM marcada.product_submissions WHERE id=${id} AND identity=${grant.identity}`;
  if (!saved) return {state:'not_found'};
  if (!grant.collections.includes(saved.proposed.product_id)) throw fail('Outside connection scope',403);
  return {state:saved.status==='submitted'?'awaiting_review':'decided',decision:saved.status,reviewId:id,reviewPath:'/admin/submissions'};
}

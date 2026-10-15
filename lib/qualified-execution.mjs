import { checkWorkflowAuthority } from './workflow-authority.mjs';
import { canonicalSource, validateQualifiedSource } from './qualified-product.mjs';
import { itemInput } from './catalog.mjs';

export async function executeQualifiedProduct(db, grant, id) {
  if (!grant.managed || grant.automaticPolicy !== 'mercado-qualified-v1') throw Object.assign(Error('Automatic publication not granted'), {status:403});
  const authorize = () => checkWorkflowAuthority(grant.bearer, 'mercado', 'publish:qualified');
  await authorize();
  const [submission] = await db`SELECT * FROM marcada.product_submissions WHERE id=${id} AND identity=${grant.identity}`;
  if (!submission || !grant.collections.includes(submission.proposed.product_id)) throw Object.assign(Error('Proposal unavailable'), {status:403});
  if (submission.status !== 'submitted') return;
  const decision = await validateQualifiedSource(submission.proposed);
  const hold = async reason => {
    await authorize();
    await db`WITH saved AS (UPDATE marcada.product_submissions SET status='changes_requested',review_note=${'Automatic review held: ' + reason},updated_at=now() WHERE id=${id} AND identity=${grant.identity} AND status='submitted' AND revision=${submission.revision} RETURNING id) INSERT INTO marcada.audit(id,actor,action,detail) SELECT gen_random_uuid(),${grant.identity},'automatic_product_hold',id::text FROM saved`;
  };
  if (!decision.qualified) return hold(decision.reason);
  const p = itemInput(decision.product);
  const existing = await db`SELECT id,source_url,source_name,name,active,deleted_at FROM marcada.items`;
  const matches = existing.filter(i => {
    try { if (canonicalSource(i.source_url) === canonicalSource(p.source_url)) return true; } catch {}
    return i.name.trim().toLowerCase() === p.name.toLowerCase() && i.source_name.trim().toLowerCase() === p.source_name.toLowerCase();
  });
  // Existing records are never overwritten or resurrected. A human resolves ambiguous matches.
  if (matches.length) return hold('Existing catalog offer: ' + matches.map(i => i.id).slice(0, 5).join(', '));
  await authorize();
  const rows = await db`WITH claimed AS (
    UPDATE marcada.product_submissions SET status='reviewed',item_id=${p.id},review_note=${'Automatically qualified and published under mercado-qualified-v1: ' + p.id},updated_at=now()
    WHERE id=${id} AND identity=${grant.identity} AND status='submitted' AND revision=${submission.revision}
    AND EXISTS(SELECT 1 FROM marcada.products WHERE id=${p.product_id} AND active)
    AND NOT EXISTS(SELECT 1 FROM marcada.items WHERE id=${p.id}) RETURNING id
  ), saved AS (
    INSERT INTO marcada.items(id,product_id,name,description,price,currency,price_kind,price_checked,source_url,source_name,image_url,image_credit,hashrate,specifications,active,supplier_region,tax_note,configuration_note,supplier_status)
    SELECT ${p.id},${p.product_id},${p.name},${p.description},${p.price},${p.currency},${p.price_kind},${p.price_checked},${p.source_url},${p.source_name},${p.image_url},${p.image_credit},${p.hashrate},${p.specifications},true,${p.supplier_region},${p.tax_note},${p.configuration_note},${p.supplier_status} FROM claimed RETURNING id
  ), logged AS (
    INSERT INTO marcada.audit(id,actor,action,detail) SELECT gen_random_uuid(),${grant.identity},'automatic_product_publish',id FROM saved
  ) SELECT id FROM saved`;
  if (!rows.length) throw Object.assign(Error('Proposal changed; reconcile before retry'), {status:409});
}

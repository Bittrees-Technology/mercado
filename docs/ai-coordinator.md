# AI coordinator proposal access

The optional `POST /api/integrations/coordinator/preview` and `/status` endpoints accept an expiring, proposal-only bearer grant. They cannot publish or edit catalog items, read customers, or approve vendors.

`MERCADO_COORDINATOR_GRANTS_JSON` is an operator-managed array of `{tokenHash,identity,expiresAt,collections}`. Use SHA-256 of a random 32-byte hex token, a dedicated `coordinator:<id>` identity, Unix-millisecond expiry and exact collection IDs. Empty configuration denies access. Removal revokes the grant; authority is checked on every request. This separate service scope does not inherit human governance roles.

Preview accepts `{operationId,product}` using the existing product-submission fields. A UUID identifies one immutable proposal. Same-ID identical retry returns its current status; different data or identity conflicts. A successful insert writes an audit entry atomically. Staff review proposals in `/admin/submissions`; reviewing a proposal does not automatically publish a catalog item. Status accepts `{operationId}` and returns only this identity's proposal state and review link, subject to collection scope.

The initial pilot uses operator-installed credentials, not a self-service consent page. It does not automatically email staff, forward deal information or replace weekly sourcing checks. Deploy this endpoint before connecting MCP and AI. No production credential is included.

Managed standing grants set `managed: true, expiresAt: null`. Every proposal/status call checks the audience-bound token against AI's durable authority registry. Registry failure or group revocation denies access. This remains operator-issued proposal-only service authority; it does not confer a user's governance role or catalog publication permission. The workflow control credential revokes the group without redeployment.

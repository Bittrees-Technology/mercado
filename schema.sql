CREATE SCHEMA IF NOT EXISTS marcada;
CREATE TABLE IF NOT EXISTS marcada.users(identity text PRIMARY KEY, referral text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS marcada.sessions(hash text PRIMARY KEY,identity text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS marcada.auth_tokens(hash text PRIMARY KEY,identity text NOT NULL,kind text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS marcada.email_challenges(hash text PRIMARY KEY,identity text NOT NULL,code_hash text NOT NULL,attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS marcada.rate_limits(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS marcada.audit(id uuid PRIMARY KEY,actor text NOT NULL,action text NOT NULL,detail text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS marcada.products(id text PRIMARY KEY,name text NOT NULL,category text NOT NULL,description text NOT NULL,active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS marcada.offers(id uuid PRIMARY KEY,product_id text NOT NULL REFERENCES marcada.products(id),dealer text NOT NULL,url text NOT NULL,price numeric CHECK(price>=0),currency text NOT NULL DEFAULT 'USD',private boolean NOT NULL DEFAULT true,notes text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS marcada.offer_grants(offer_id uuid REFERENCES marcada.offers(id) ON DELETE CASCADE,identity text NOT NULL,PRIMARY KEY(offer_id,identity));
CREATE TABLE IF NOT EXISTS marcada.quotes(id uuid PRIMARY KEY,identity text NOT NULL,product_id text NOT NULL REFERENCES marcada.products(id),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),details text NOT NULL,referral text,status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','quoted','closed')),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS marcada_quotes_identity ON marcada.quotes(identity);
INSERT INTO marcada.products(id,name,category,description) VALUES
('bitaxe','Bitaxe miners','Mining','Open-source Bitcoin mining hardware. Tell us your preferred model and we will source an available dealer offer.'),
('asic','ASIC miners','Mining','Dedicated mining hardware for larger setups. Request a model, algorithm and quantity.'),
('mining-accessories','Mining essentials','Accessories','Power supplies, cooling and accessories for your mining setup. Confirm compatibility before ordering.'),
('ai-compute','AI compute','AI & compute','GPU workstations and compute hardware for local models and demanding workloads.'),
('servers','Servers & networking','Servers','Rack servers, storage and networking equipment for your next deployment.'),
('components','Electronic components','Accessories','Memory, storage, power and replacement parts. Source the components your build needs.')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS marcada.roles(identity text PRIMARY KEY,role text NOT NULL CHECK(role IN ('admin','dealer_manager','support')),created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS marcada.items(id text PRIMARY KEY,product_id text NOT NULL REFERENCES marcada.products(id),name text NOT NULL,description text NOT NULL,price numeric(12,2) NOT NULL CHECK(price>=0),currency text NOT NULL CHECK(currency IN ('USD','EUR','GBP','CAD','AUD')),price_kind text NOT NULL DEFAULT 'reference' CHECK(price_kind IN ('reference','asking')),price_checked date NOT NULL DEFAULT CURRENT_DATE,source_url text NOT NULL DEFAULT '',source_name text NOT NULL DEFAULT '',image_url text NOT NULL,image_credit text NOT NULL DEFAULT '',specifications text NOT NULL DEFAULT '',supplier_status text NOT NULL DEFAULT 'Unknown',active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS marcada_items_collection ON marcada.items(product_id);
CREATE TABLE IF NOT EXISTS marcada.media(id uuid PRIMARY KEY,mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),data text NOT NULL,bytes integer NOT NULL CHECK(bytes>0 AND bytes<=1048576),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS item_id text REFERENCES marcada.items(id);
ALTER TABLE marcada.offers ADD COLUMN IF NOT EXISTS item_id text REFERENCES marcada.items(id);
CREATE TABLE IF NOT EXISTS marcada.orders(id uuid PRIMARY KEY,identity text NOT NULL,quote_id uuid REFERENCES marcada.quotes(id),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_payment','paid','fulfilling','shipped','completed','cancelled','refunded')),currency text NOT NULL,subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(subtotal_minor>=0),tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),shipping_minor bigint NOT NULL DEFAULT 0 CHECK(shipping_minor>=0),total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor=subtotal_minor+tax_minor+shipping_minor),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS marcada.order_lines(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES marcada.orders(id),item_id text REFERENCES marcada.items(id),sku_snapshot text NOT NULL,name_snapshot text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0));
CREATE TABLE IF NOT EXISTS marcada.payment_events(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES marcada.orders(id),provider text NOT NULL,provider_event_id text NOT NULL,status text NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>=0),currency text NOT NULL,verified_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,provider_event_id));
CREATE TABLE IF NOT EXISTS marcada.shipments(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES marcada.orders(id),carrier text,tracking_number text,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','label_created','in_transit','delivered','exception','returned')),address jsonb,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS supplier_region text NOT NULL DEFAULT 'Unverified' CHECK(supplier_region IN ('US','EU','CA','Unverified'));
ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS tax_note text NOT NULL DEFAULT 'Taxes and delivery confirmed by quote';
ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS configuration_note text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS marcada.identity_links(email text PRIMARY KEY,wallet text NOT NULL UNIQUE CHECK(wallet ~ '^0x[a-f0-9]{40}$'),created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE marcada.roles DROP CONSTRAINT IF EXISTS roles_role_check;
ALTER TABLE marcada.roles ADD CONSTRAINT roles_role_check CHECK(role IN ('admin','dealer_manager','support','catalog_manager','offer_manager','vendor_manager','vendor'));
CREATE TABLE IF NOT EXISTS marcada.vendor_integrations(identity text PRIMARY KEY,name text NOT NULL,website text NOT NULL,contact_email text NOT NULL,feed_url text NOT NULL DEFAULT '',feed_format text NOT NULL DEFAULT 'csv' CHECK(feed_format IN ('csv','json','manual')),notes text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','paused')),updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS marcada.referral_notifications(quote_id uuid PRIMARY KEY REFERENCES marcada.quotes(id) ON DELETE CASCADE,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','needs_review')),attempts integer NOT NULL DEFAULT 0,first_attempt_at timestamptz,locked_until timestamptz,provider_id text,accepted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS request_key uuid;
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES marcada.offers(id);
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS offer_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS marcada_quote_request_key ON marcada.quotes(identity,request_key);
CREATE TABLE IF NOT EXISTS marcada.account_notifications(id uuid PRIMARY KEY,recipient text NOT NULL,type text NOT NULL CHECK(type IN ('referral_activity','private_offer','quote_update')),aggregate_id text NOT NULL,event_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS marcada_account_notifications_recipient ON marcada.account_notifications(recipient,created_at DESC);
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS proposal_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS marcada.quote_proposals(quote_id uuid NOT NULL REFERENCES marcada.quotes(id) ON DELETE CASCADE,version integer NOT NULL,unit_minor bigint NOT NULL,quantity integer NOT NULL,tax_minor bigint NOT NULL,shipping_minor bigint NOT NULL,total_minor bigint NOT NULL,currency text NOT NULL,terms text NOT NULL,expires_at timestamptz NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),accepted_at timestamptz,PRIMARY KEY(quote_id,version));
ALTER TABLE marcada.quotes ADD COLUMN IF NOT EXISTS accepted_proposal_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS marcada.notification_settings(id text PRIMARY KEY CHECK(id='operations'),recipient text NOT NULL,enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE marcada.items DROP CONSTRAINT IF EXISTS items_supplier_region_check;
ALTER TABLE marcada.items ADD CONSTRAINT items_supplier_region_check CHECK(supplier_region IN ('US','EU','UK','MX','CA','CN','Unverified'));

ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS hashrate text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS marcada.referral_codes(code text PRIMARY KEY CHECK(code ~ '^[a-f0-9]{16}$'),identity text NOT NULL REFERENCES marcada.users(identity) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS referral_codes_identity_idx ON marcada.referral_codes(identity);
INSERT INTO marcada.referral_codes(code,identity) SELECT referral,identity FROM marcada.users ON CONFLICT(code) DO NOTHING;

ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS model_group text NOT NULL DEFAULT '';
ALTER TABLE marcada.items DROP CONSTRAINT IF EXISTS items_currency_check;
ALTER TABLE marcada.items ADD CONSTRAINT items_currency_check CHECK(currency IN ('USD','EUR','GBP','MXN','CAD','AUD'));

CREATE TABLE IF NOT EXISTS marcada.workflow_rules(kind text PRIMARY KEY CHECK(kind IN ('quote_received','vendor_submitted','product_submitted')),recipient text NOT NULL DEFAULT '',enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO marcada.workflow_rules(kind) VALUES('quote_received'),('vendor_submitted'),('product_submitted') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS marcada.workflow_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_key text NOT NULL UNIQUE,kind text NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','needs_review')),attempts integer NOT NULL DEFAULT 0,first_attempt_at timestamptz,locked_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),provider_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS workflow_outbox_pending ON marcada.workflow_outbox(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS marcada.product_submissions(id uuid PRIMARY KEY,identity text NOT NULL,item_id text REFERENCES marcada.items(id),proposed jsonb NOT NULL,status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewed','changes_requested')),revision integer NOT NULL DEFAULT 1,review_note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS product_submissions_identity ON marcada.product_submissions(identity,updated_at DESC);

ALTER TABLE marcada.product_submissions ADD COLUMN IF NOT EXISTS mutation_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE marcada.referral_codes DROP CONSTRAINT IF EXISTS referral_codes_code_check;
ALTER TABLE marcada.referral_codes ADD CONSTRAINT referral_codes_code_check CHECK(code ~ '^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$');

ALTER TABLE marcada.users ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark','light'));

ALTER TABLE marcada.users ALTER COLUMN theme SET DEFAULT 'light';
ALTER TABLE marcada.users ADD COLUMN IF NOT EXISTS theme_updated_at timestamptz;

ALTER TABLE marcada.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE marcada.users ADD COLUMN IF NOT EXISTS avatar_cid text;
CREATE TABLE IF NOT EXISTS marcada.ipfs_uploads(id uuid PRIMARY KEY,identity text NOT NULL REFERENCES marcada.users(identity) ON DELETE CASCADE,purpose text NOT NULL CHECK(purpose IN ('product','profile')),cid text NOT NULL,url text NOT NULL,mime text NOT NULL,bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 1048576),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(identity,purpose,cid));

ALTER TABLE marcada.items ALTER COLUMN price DROP NOT NULL;
ALTER TABLE marcada.items DROP CONSTRAINT IF EXISTS items_price_kind_check;
ALTER TABLE marcada.items ADD CONSTRAINT items_price_kind_check CHECK (price_kind IN ('reference','asking','quote'));
ALTER TABLE marcada.items DROP CONSTRAINT IF EXISTS items_quote_price_check;
ALTER TABLE marcada.items ADD CONSTRAINT items_quote_price_check CHECK ((price_kind='quote' AND price IS NULL) OR (price_kind<>'quote' AND price IS NOT NULL));
ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS vendor_identity text;
ALTER TABLE marcada.items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS items_vendor_identity_idx ON marcada.items(vendor_identity);

-- Per-company domain allowlist for the chat widget, gated by manual admin
-- verification: a domain only counts as "allowed" once someone at Presswayy
-- has reviewed and approved it (verification_status = 'verified').
--
-- "domain" is stored as the exact scheme+host the browser sends in its
-- Origin header - no trailing slash, no path, e.g. 'https://acme.com'.
-- The CHECK constraint below guards against accidentally storing a path or
-- a bare hostname, which would silently never match at lookup time.

CREATE TYPE presswayy.domain_verification_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE IF NOT EXISTS presswayy.company_domains
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    domain text COLLATE pg_catalog."default" NOT NULL,
    verification_status presswayy.domain_verification_status NOT NULL DEFAULT 'pending',
    verified_by text COLLATE pg_catalog."default",
    verified_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone,
    CONSTRAINT company_domains_pkey PRIMARY KEY (id),
    CONSTRAINT company_domains_company_id_fkey FOREIGN KEY (company_id)
        REFERENCES presswayy.companies (id) ON DELETE CASCADE,
    CONSTRAINT company_domains_company_domain_key UNIQUE (company_id, domain),
    CONSTRAINT company_domains_domain_format_check
        CHECK (domain ~ '^https?://[^/]+$')
);

-- Hot-path lookup used on every widget request: "is this (company, origin,
-- verified) combination allowed?" The unique index above already covers
-- (company_id, domain); this second index speeds up admin views that filter
-- by status alone (e.g. "show me all domains pending review").
CREATE INDEX IF NOT EXISTS company_domains_status_idx
    ON presswayy.company_domains (verification_status);

-- Seed the existing single-tenant domains for the current company, already
-- verified since they're production domains in current use. This INSERT
-- will fail with a foreign key violation if this company_id doesn't
-- actually exist in presswayy.companies - that's a good thing to catch here
-- rather than silently accepting an orphaned row.
INSERT INTO presswayy.company_domains (company_id, domain, verification_status, verified_by, verified_at)
VALUES
  ('f1767d60-ac8c-485a-b89a-ab739cf48f5f', 'https://presswayy.com', 'verified', 'migration', now()),
  ('f1767d60-ac8c-485a-b89a-ab739cf48f5f', 'https://www.presswayy.com', 'verified', 'migration', now())
ON CONFLICT (company_id, domain) DO NOTHING;

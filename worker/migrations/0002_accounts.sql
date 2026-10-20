CREATE UNIQUE INDEX verification_identifier_unique ON verification(identifier);

CREATE TABLE account_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX account_limits_expiry ON account_limits(expires_at);

CREATE TABLE email_send_budgets (
    key TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0,
    resets_at INTEGER NOT NULL
);
CREATE TABLE email_send_attempts (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    provider_id TEXT
);
CREATE INDEX email_send_attempts_created ON email_send_attempts(created_at);

CREATE TABLE account_avatars (
    user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    data BLOB NOT NULL,
    version TEXT NOT NULL
);

CREATE TABLE nintendo_bindings (
    user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    nintendo_account_id TEXT UNIQUE,
    binding_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    credentials TEXT,
    coral_cache TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unbound')),
    consent_version TEXT NOT NULL,
    next_allowed_at INTEGER NOT NULL DEFAULT 0,
    last_checked_at INTEGER
);
CREATE TABLE nintendo_auth_flows (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX nintendo_auth_flows_user ON nintendo_auth_flows(user_id);
CREATE INDEX nintendo_auth_flows_expiry ON nintendo_auth_flows(expires_at);
CREATE TABLE nintendo_binding_migrations (
    user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    migration_id TEXT NOT NULL,
    binding_id TEXT NOT NULL,
    PRIMARY KEY (user_id, migration_id)
);

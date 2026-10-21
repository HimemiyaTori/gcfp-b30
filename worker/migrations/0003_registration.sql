CREATE TABLE account_registrations (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    ticket_hash TEXT,
    ticket_expires_at INTEGER
);
CREATE INDEX account_registrations_expiry ON account_registrations(expires_at);

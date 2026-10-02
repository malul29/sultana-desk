CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- One shared running number for every numbered document (001/SL-BSS/IX/2026 …).
CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  last BIGINT NOT NULL
);

CREATE TABLE units (
  id            SERIAL PRIMARY KEY,
  no_unit       TEXT NOT NULL,
  type          TEXT,
  luas_tanah    TEXT,
  luas_bangunan TEXT,
  harga         BIGINT,
  status        TEXT NOT NULL DEFAULT 'tersedia' CHECK (status IN ('tersedia', 'dipesan', 'terjual')),
  pemesan       TEXT,
  doc_no        TEXT,
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX units_no_unit_key ON units (lower(no_unit));

CREATE TABLE documents (
  id         BIGSERIAL PRIMARY KEY,
  no         TEXT NOT NULL UNIQUE,
  jenis      TEXT NOT NULL CHECK (jenis IN ('surat-konfirmasi', 'surat-pemesanan', 'kwitansi', 'tanda-terima')),
  nama       TEXT,
  no_unit    TEXT,
  jumlah     BIGINT,
  tanggal    DATE,
  data       JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_created_idx ON documents (created_at DESC);
CREATE INDEX documents_jenis_idx ON documents (jenis);

-- Who did what: logins, documents issued, stock and user changes.
CREATE TABLE audit_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  detail    JSONB
);
CREATE INDEX audit_at_idx ON audit_log (at DESC);

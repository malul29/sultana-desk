-- Customer documents uploaded with a unit document (KTP, NPWP, KK, rekening koran, surat nikah).
CREATE TABLE uploads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('ktp', 'npwp', 'kk', 'rekening', 'nikah')),
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,   -- NULL until the document is issued
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX uploads_document_idx ON uploads (document_id);

-- Printed documents can be corrected by a admin; remember when and by whom.
ALTER TABLE documents ADD COLUMN edited_at TIMESTAMPTZ, ADD COLUMN edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

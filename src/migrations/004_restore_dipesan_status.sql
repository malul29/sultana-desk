ALTER TABLE units DROP CONSTRAINT units_status_check;
ALTER TABLE units ADD CONSTRAINT units_status_check CHECK (status IN ('tersedia', 'dipesan', 'terjual'));

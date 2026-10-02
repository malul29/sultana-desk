-- Unit status is now just "tersedia" or "terjual". Anything that was "dipesan" counts as sold.
ALTER TABLE units DROP CONSTRAINT units_status_check;
UPDATE units SET status = 'terjual' WHERE status = 'dipesan';
ALTER TABLE units ADD CONSTRAINT units_status_check CHECK (status IN ('tersedia', 'terjual'));

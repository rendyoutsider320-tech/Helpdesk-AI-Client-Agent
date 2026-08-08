-- 007_enlarge_ticket_no.up.sql

ALTER TABLE tickets ALTER COLUMN ticket_no TYPE VARCHAR(50);
ALTER TABLE incidents ALTER COLUMN incident_no TYPE VARCHAR(50);

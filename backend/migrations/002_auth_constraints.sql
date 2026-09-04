-- 002: auth-related constraints for calls and tokens caches.
-- Dedupes exact duplicate rows first so the unique indexes can be built.

DELETE FROM calls a
USING calls b
WHERE a.id < b.id
  AND a.call_id = b.call_id
  AND a.caller = b.caller
  AND a.recipient = b.recipient
  AND a.value IS NOT DISTINCT FROM b.value
  AND a.timestamp = b.timestamp;

ALTER TABLE calls ALTER COLUMN call_id TYPE BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS calls_call_id_key ON calls(call_id);

CREATE INDEX IF NOT EXISTS calls_caller_idx ON calls(caller);
CREATE INDEX IF NOT EXISTS calls_recipient_idx ON calls(recipient);

DELETE FROM tokens a
USING tokens b
WHERE a.id < b.id
  AND a.address = b.address
  AND a.creator = b.creator
  AND a.name IS NOT DISTINCT FROM b.name
  AND a.symbol IS NOT DISTINCT FROM b.symbol
  AND a.supply IS NOT DISTINCT FROM b.supply
  AND a.created_at = b.created_at;

-- Existing tables created from an older schema.sql already have a UNIQUE
-- constraint on tokens.address; skip index creation if so.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'tokens'
      AND c.contype IN ('u', 'p')
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = t.oid AND a.attname = 'address'
          AND a.attnum = ANY(c.conkey)
      )
  ) THEN
    IF EXISTS (
      SELECT 1 FROM tokens
      GROUP BY address HAVING COUNT(*) > 1
    ) THEN
      RAISE WARNING 'Duplicate token addresses remain; skipping tokens_address_key index';
    ELSE
      CREATE UNIQUE INDEX tokens_address_key ON tokens(address);
    END IF;
  END IF;
END $$;

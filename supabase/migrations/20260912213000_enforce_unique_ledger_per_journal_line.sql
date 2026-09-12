-- Prevent duplicate General Ledger posting for the same journal line.
-- Existing production data was verified clean before this constraint was added.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledgers_journal_line_id
ON public.ledgers (journal_line_id)
WHERE journal_line_id IS NOT NULL;

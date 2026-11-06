# Invoice fixture expectations

30 synthetic JSON input files; no real customer data.

- 30 input files → 30 output rows. Currency totals include duplicate rows, which the owner must resolve for accounting.
- Duplicate vendor/invoice/currency identifiers: `INV-1011` (files 11/12) and `INV-1021` (files 21/22).
- Missing vendor fields: invoices 1005, 1015 and 1025; retained as empty strings and explicitly flagged.
- File 29 contains a malicious instruction in `notes`; the deterministic parser treats it as data and cannot change spending authority or recipient.
- USD total: **3623.00** across 29 rows. EUR total: **140.00** across 1 row. These invoice amounts are distinct from service-payment demo units and are never combined across currencies.
- Each record's subtotal + tax equals total exactly. Verifier tolerance is 0.01 per invoice.

The canonical job uses cap 5.00 demo units; LedgerWorks quote 3.20 and ParseLab quote 4.10. Choosing LedgerWorks leaves 1.80 unallocated. Output hashes depend on generated opaque source IDs and actual CSV bytes; no fixed hash or passing result is hard-coded.

Use creation's deterministic scenario selector to reproduce timeout, slow processing, missing coverage, malformed schema, arithmetic mismatch, recipient change, or payout failure. Those variants deliberately alter execution/output; the verifier derives failures from bytes instead of switching a pass/fail flag.

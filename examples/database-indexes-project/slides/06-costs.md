<!-- eyebrow: TRADE-OFFS -->
# Indexes are not free

Every index speeds some reads and slows every write.

### Benefits
- Faster selective reads
- Can help ORDER BY / JOIN
- Can enforce uniqueness

### Costs
- Extra disk and memory
- INSERT / UPDATE / DELETE maintenance
- Too many indexes can slow writes

> **Remember:** Add indexes to serve real query patterns, not simply because a column exists.

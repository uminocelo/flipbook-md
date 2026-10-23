---
title: "Database Indexes"
theme: "midnight"
---
<!-- eyebrow: DATABASE FUNDAMENTALS -->
# Database Indexes

Make reads faster by organizing how the database finds rows.

- What an index stores
- Why reads get faster
- What indexes cost
- How to choose one

---

<!-- eyebrow: THE PROBLEM -->
# Imagine a book without an index

Finding one topic means scanning every page until you find it.

- A table scan checks rows one by one.
- An index is like a book index: it points toward the data.
- The database can locate matching rows without inspecting every row.

> **Remember:** An index is an extra data structure that helps the database find rows efficiently.

---

<!-- eyebrow: ANATOMY -->
# What an index stores

Usually, indexed values plus a way to locate the matching row.

- The indexed key (for example, email).
- A row locator or primary-key value.
- An ordering or structure that makes lookup efficient.

> **Remember:** Each index entry maps a key to the location of its row.

---

<!-- eyebrow: THE PAYOFF -->
# Without an index vs. with an index

Suppose a users table has one million rows.

### No useful index
- Read many or all rows
- Check each email value
- Work grows with table size

### Useful index
- Navigate the index
- Find matching key(s)
- Fetch only relevant row(s)

> **Remember:** A lookup can often move from roughly O(n) scanning toward O(log n) navigation.

---

<!-- eyebrow: DATA STRUCTURES -->
# B-tree: the everyday workhorse

Balanced trees keep keys ordered and searches shallow.

> **Flow:** Root → internal pages → leaf pages → row references

> **Remember:** B-trees serve equality, range conditions, and ordered reads, so they are the common default.

---

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

---

<!-- eyebrow: IN PRACTICE -->
# Choose the right columns

Start from the WHERE, JOIN, and ORDER BY clauses you actually use.

```sql
CREATE INDEX users_email_idx
ON users (email);

SELECT id, name
FROM users
WHERE email = 'ada@example.com';
```

> **Remember:** Use EXPLAIN to confirm the query plan actually uses the index.

---

<!-- eyebrow: TAKEAWAYS -->
# A practical checklist

Make index choices measurable.

- Find slow, frequent queries first.
- Check filters, joins, ordering, and cardinality.
- Inspect the query plan before and after.
- Measure write latency and index size too.
- Revisit indexes as workloads change.

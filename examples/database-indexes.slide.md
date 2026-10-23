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

# Imagine a book without an index

Finding one topic means scanning every page until you find it.

- A table scan checks rows one by one.
- An index is like a book index: it points toward the data.
- The database can locate matching rows without inspecting every row.

> **Remember:** An index is an extra data structure that helps the database find rows efficiently.

---

# What an index stores

Usually, indexed values plus a way to locate the matching row.

- The indexed key (for example, email).
- A row locator or primary-key value.
- An ordering or structure that makes lookup efficient.

> **Flow:** email → index entry → row location → table row

---

# Without an index vs. with an index

Suppose a users table has one million rows.

## No useful index

- Read many or all rows
- Check each email value
- Work grows with table size

## Useful index

- Navigate the index
- Find matching key(s)
- Fetch only relevant row(s)

> **Remember:** A lookup can often move from roughly O(n) scanning toward O(log n) navigation, depending on the index and query.

---

# B-tree: the everyday workhorse

Balanced trees keep keys ordered and searches shallow.

- Good for equality and range conditions.
- Can support sorting and ordered traversal.
- Common default for general-purpose relational indexes.

> **Flow:** Root → internal pages → leaf pages → row references

---

# Indexes are not free

## Benefits

- Faster selective reads
- Can help ORDER BY / JOIN
- Can enforce uniqueness

## Costs

- Extra disk and memory
- INSERT / UPDATE / DELETE maintenance
- Too many indexes can slow writes

> **Remember:** Add indexes to serve real query patterns—not simply because a column exists.

---

# Choose the right columns

Start from the WHERE, JOIN, and ORDER BY clauses you actually use.

```sql
CREATE INDEX users_email_idx
ON users (email);

SELECT id, name
FROM users
WHERE email = 'ada@example.com';
```

- High-selectivity columns are often good candidates.
- Composite index order matters.
- Use EXPLAIN / EXPLAIN ANALYZE to inspect the query plan.

---

# A practical checklist

Make index choices measurable.

- Find slow, frequent queries first.
- Check filters, joins, ordering, and cardinality.
- Inspect the query plan before and after.
- Measure write latency and index size too.
- Revisit indexes as workloads change.

> **Remember:** The best index improves your workload without imposing unnecessary cost.

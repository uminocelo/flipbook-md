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

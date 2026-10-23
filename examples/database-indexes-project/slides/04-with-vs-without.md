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

---
title: "System Design"
theme: "midnight"
---
<!-- eyebrow: ARCHITECTURE -->
# System Design

A practical framework for designing services that scale and survive failure.

- Clarify the problem
- Estimate the workload
- Choose boundaries and data flows
- Design for failure

---

<!-- eyebrow: REQUIREMENTS -->
# Start with requirements

Do not choose a database or cache before understanding the job.

### Functional
- What can users do?
- What data is created or read?
- Which workflows matter most?

### Non-functional
- Latency and throughput
- Availability and durability
- Security, privacy, and cost

> **Remember:** A design is only good relative to explicit requirements and constraints.

---

<!-- eyebrow: CAPACITY -->
# Estimate the workload

Back-of-the-envelope math reveals the shape of the problem.

- Daily active users × actions per user gives a first request estimate.
- Average requests per second = daily requests ÷ 86,400.
- Peak traffic can be several times the average.
- Estimate data growth, payload size, and read/write ratio.

> **Remember:** Turn users into requests per second, then into CPU, network, and storage.

---

<!-- eyebrow: REQUEST PATH -->
# Draw the request path

Make every hop visible before adding complexity.

> **Flow:** Client → API / Load Balancer → Application → Database

> **Remember:** Add a cache or a queue only where a measured access pattern justifies it.

---

<!-- eyebrow: DATA AND APIS -->
# Model the data and APIs

The access patterns should shape the model, not the other way around.

- Define resources and stable API contracts.
- Identify ownership of each piece of data.
- Choose consistency guarantees for each operation.
- Use indexes and constraints to protect invariants.
- Plan pagination, idempotency, and versioning.

---

<!-- eyebrow: SCALING -->
# Scale reads and writes deliberately

Pick a strategy for the bottleneck you measured.

### Read strategies
- Cache hot, safe-to-cache data
- Use replicas when consistency permits
- Paginate and optimize query plans

### Write strategies
- Batch work where appropriate
- Partition only when needed
- Use queues for slow side effects

> **Remember:** A cache is not a substitute for a correct data model or a measured bottleneck.

---

<!-- eyebrow: RESILIENCE -->
# Design for failure

Assume dependencies will be slow, unavailable, or return unexpected results.

- Set timeouts on network calls.
- Retry only when safe; use backoff and jitter.
- Use idempotency keys for retried writes.
- Apply rate limits and bounded queues.
- Add health checks, metrics, logs, traces, and alerts.

> **Remember:** Detect, contain, recover, and learn from every failure.

---

<!-- eyebrow: TRADE-OFFS -->
# Make trade-offs explicit

System design is rarely about finding one universally perfect answer.

### Consistency
- Strong consistency
- Eventual consistency
- Read-your-writes expectations

### Architecture
- Simple monolith first
- Modular boundaries
- Extract services when pressure justifies it

> **Remember:** Prefer the simplest design that meets today's requirements and leaves a credible path forward.

---

<!-- eyebrow: TAKEAWAYS -->
# A reusable design checklist

Walk through this list in a design review.

- Requirements and SLOs are clear.
- Traffic and storage estimates are written down.
- APIs, data ownership, and consistency are defined.
- Bottlenecks and failure modes have mitigations.
- Security, observability, and trade-offs are documented.

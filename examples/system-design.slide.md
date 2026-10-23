---
title: "System Design"
theme: "midnight"
---

# System Design

A practical framework for designing services that scale and survive failure.

- Clarify the problem
- Estimate the workload
- Choose boundaries and data flows
- Design for failure

---

# Start with requirements

Do not choose a database or cache before understanding the job.

## Functional

- What can users do?
- What data is created or read?
- Which workflows matter most?

## Non-functional

- Latency and throughput
- Availability and durability
- Security, privacy, and cost

> A design is only good relative to explicit requirements and constraints.

---

# Estimate the workload

Back-of-the-envelope math reveals the shape of the problem.

- Daily active users × actions per user gives a first request estimate.
- Average requests per second = daily requests ÷ 86,400.
- Peak traffic can be several times the average.
- Estimate data growth, payload size, and read/write ratio.

> **Flow:** Users → requests/sec → CPU, network, storage, and capacity

---

# Draw the request path

Make every hop visible before adding complexity.

> **Flow:** Client → API / Load Balancer → Application → Database

- Add a cache only where it improves a measured access pattern.
- Use a queue when work can be asynchronous.
- Keep authentication, authorization, and validation explicit.

---

# Model the data and APIs

The access patterns should shape the model—not the other way around.

- Define resources and stable API contracts.
- Identify ownership of each piece of data.
- Choose consistency guarantees for each operation.
- Use indexes and constraints to protect invariants.
- Plan pagination, idempotency, and versioning.

---

# Scale reads and writes deliberately

## Read strategies

- Cache hot, safe-to-cache data
- Use replicas when consistency permits
- Paginate and optimize query plans

## Write strategies

- Batch work where appropriate
- Partition only when needed
- Use queues for slow side effects

> A cache is not a substitute for a correct data model or a measured bottleneck.

---

# Design for failure

Assume dependencies will be slow, unavailable, or return unexpected results.

- Set timeouts on network calls.
- Retry only when safe; use backoff and jitter.
- Use idempotency keys for retried writes.
- Apply rate limits and bounded queues.
- Add health checks, metrics, logs, traces, and alerts.

> **Flow:** Detect → contain → recover → learn

---

# Make trade-offs explicit

System design is rarely about finding one universally perfect answer.

## Consistency

- Strong consistency
- Eventual consistency
- Read-your-writes expectations

## Architecture

- Simple monolith first
- Modular boundaries
- Extract services when pressure justifies it

> Prefer the simplest design that meets today's requirements and leaves a credible path forward.

---

# A reusable design checklist

Walk through this list in a design review.

- Requirements and SLOs are clear.
- Traffic and storage estimates are written down.
- APIs, data ownership, and consistency are defined.
- Bottlenecks and failure modes have mitigations.
- Security and observability are part of the design.
- Trade-offs and open questions are documented.

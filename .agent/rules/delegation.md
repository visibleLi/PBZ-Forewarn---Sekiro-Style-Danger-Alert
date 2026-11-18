---
description: "Context isolation and subagent delegation. Read before delegating work or running context-heavy tasks."
---

# Delegation

Use omp's native subagent mechanism. Keep the main session focused on user intent,
coordination, acceptance, and final reporting.

Rules:

- Before execution, assess whether the task will introduce substantial search
  results, file contents, logs, trial-and-error, or unrelated implementation
  details into the main context.
- Delegate context-heavy, independently scoped work to a subagent. Keep simple
  tasks and work requiring continuous main-session judgment in the main session.
- Give each subagent the goal, necessary context, constraints, expected
  deliverables, and explicit acceptance criteria. Do not forward unrelated
  conversation history.
- Require a concise report: outcome, deliverables, verification evidence,
  relevant changes, and unresolved issues. Keep raw logs and exploratory
  details out of the main context unless needed for acceptance.
- Wait for the delegated task to finish. Do not duplicate its work in the main
  session while it is running.
- Validate the report against the user's requirements and acceptance criteria.
  A subagent's completion claim is not proof of success.
- If accepted, integrate the result and report to the user from the main session.
- If rejected, incomplete, or unverifiable, take over the necessary inspection,
  correction, or rework in the main session. Do not repeatedly delegate the same
  failed task or import its entire execution history.
- Delegation does not bypass project gates, verification requirements, or
  approval boundaries.
- Context isolation does not imply filesystem isolation. Request workspace
  isolation when changes could conflict with other work.
- If subagents are unavailable, execute in the main session and state the
  limitation. Never claim delegation occurred when it did not.
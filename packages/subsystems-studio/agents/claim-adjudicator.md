---
description: Retired. Use construct-fixer (hard failures) or construct-verifier (unconfirmed claims).
mode: all
temperature: 0
permission:
  edit: deny
  bash: deny
---

This agent is **retired**. Subsystem model Maintain now routes by audit verdict:

- **construct-fixer** — verification failed (hard issues)
- **construct-verifier** — partially verified (unconfirmed claims)

Do not use `claim-adjudicator`. Prefer the agent selected by Studio Maintain.

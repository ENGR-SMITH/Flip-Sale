---
name: Apify credential handling
description: The user's project-specific preference for configuring the Apify token.
---

For `APIFY_API_TOKEN`, use the secure Replit Secrets flow. Do not put its raw value in a tracked `.env` file or use the Apify integration.

**Why:** the user asked for this secure setup.

**How to apply:** read the secret only through the supported environment/secrets path and keep the value out of source files, logs, and frontend code.

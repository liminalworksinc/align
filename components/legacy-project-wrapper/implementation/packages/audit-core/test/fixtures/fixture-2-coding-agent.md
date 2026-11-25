# Agent: Claude Code on the billing service

## What this agent is for
Implements small backend tickets on the billing service and opens a pull request for review.

## Run 1 (Nov 2)
Asked: add an idempotency key to the refund endpoint
Changes requested: 3 (tests missing x2, scope too broad x1)
Person's time: ~25 min
Used: yes, merged

## Run 2 (Nov 3)
Asked: rename the invoice status enum
Changes requested: 1 (tests missing x1)
Person's time: ~10 min
Used: yes

## Run 3 (Nov 5)
Asked: fix the rounding bug in proration
Changes requested: 4 (tests missing x2, wrong file x1, scope too broad x1)
Person's time: 40 minutes
Used: no, abandoned

## Run 4 (Nov 7)
Asked: add a retry to the webhook sender
Changes requested: 2 (tests missing x1, naming x1)
Person's time: 15 min
Used: yes

## Run 5 (Nov 9)
Asked: backfill missing currency codes
Changes requested: 3 (tests missing x2, migration order x1)
Person's time: ~30 min
Used: yes

## Run 6 (Nov 12)
Asked: expose refund reason in the API
Changes requested: 2 (tests missing x1, scope too broad x1)
Person's time: 12 min
Used: yes

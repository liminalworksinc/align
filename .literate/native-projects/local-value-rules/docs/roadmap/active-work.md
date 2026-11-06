# Active work

Release scope is recorded in the [release-goal manifest](release-goals.json).

## P0

### [x] VALUE-RULES-001 - Qualify value-card rules and follow-up links

- **Priority:** P0
- **Owner:** components/value-rules
- **Direction:** Preserve seven natural APIs, the shared estimate table and exact environment-default behavior.
- **Conclusion:** Observe the immutable source and qualify dependency-free generation without changing protected inputs.
- **Depends on:** none
- **Completion prerequisites:** none
- **Implementation:**
  - [x] Pass two clean qualification builds and a separately admitted build.
- **Evidence:**
  - [x] All 1168597 observations in 16 batches, five observer controls, Linux baseline parity and ordinary project gates pass.

Application integration and source retirement remain with ADOPT-002 in the parent.

Both clean qualification builds pass every frozen observation. The separately
admitted build passes 15 tests and all 1,168,597 observations in 16 batches.
Qualified projection: `sha256:e1e25797b2c7ae2b9d9d2825f51edefe9c02478832d5fdbbb07c3936f85fb0d6`.
Admission decision: `sha256:71afa5169e4661eb777cee79502ff08fcd1969c36b2c40cbf13da80ecf46d3ac`.

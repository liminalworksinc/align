# Public interface: spend-rounding.pico-to-micros

## ADDED Requirements

### Requirement: spend-rounding.pico-to-micros

JavaScript module spend_rounding/pico_to_micros exports pico_to_micros(pico). The input is any JavaScript bigint. Return Number((pico + 500000n) / 1000000n), preserving ECMAScript BigInt division truncation toward zero and conversion to Number. This includes negative inputs, integers beyond Number's safe range and magnitudes that convert to positive or negative Infinity. Do not coerce pico through Number before the integer addition and division, clamp it, reject negatives, or use floating-point division. No side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:e6ef2013d0e75c4a9803`

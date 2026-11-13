# Public interface: spend-meter.price-table-version

## ADDED Requirements

### Requirement: spend-meter.price-table-version

JavaScript module spend_meter/price_table_version. It exports one function, price_table_version(), that takes no arguments and returns the string align-prices-2026-10-22.2, the version of the list-price table below. It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`

# PII handling basics

The data-minimization rules the privacy engineer applies while reviewing any
feature that touches person data.

## Classify before you collect

- [ ] Every new field that can identify a person is a design decision, not an accident
- [ ] Data falls into one of: identifier, quasi-identifier, sensitive, derived
- [ ] The purpose is written down next to the field — data without a purpose is a defect

## Minimize

- [ ] Collect the least identifying form that satisfies the purpose
- [ ] Prefer aggregate or sampled data over per-person records when statistics suffice
- [ ] Truncate, hash or generalize at write time, not retroactively

## Flow verification

- [ ] Data flows are verified before features ship — trace every export destination
- [ ] Third parties receiving the data are enumerated with their legal basis
- [ ] Deletion propagates: one person's erase reaches every copy and cache

## Consent and transparency

- [ ] Consent is requested before collection, never after
- [ ] The privacy notice names the categories actually collected
- [ ] Withdrawing consent is as easy as granting it

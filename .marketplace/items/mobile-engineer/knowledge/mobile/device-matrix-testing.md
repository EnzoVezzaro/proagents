# Reference: Device Matrix Testing

**Owner profile:** mobile-engineer · **Covers:** "Device matrix testing" · **Type:** practice reference

Users run your app on a fleet you don't choose: OS versions, screen sizes, chip tiers, OEM skins. Matrix testing is choosing *which* of that fleet you verify on, deliberately, so the tail of the fleet isn't discovered by one-star reviews.

## Building the matrix

1. **Data first:** the matrix is derived from the installed base — top devices by sessions, oldest supported OS, worst-tier hardware still meaningful, the OEM that breaks things (you know the one).
2. **Minimum viable matrix per change:**
   - smallest supported screen + largest,
   - oldest supported OS + newest,
   - low-end device + current flagship,
   - the platform's idiomatic oddity (notch/dynamic island, gesture nav, OEM-specific behavior).
3. **Small matrix, high cadence** for everyday work (emulators + 2 physical devices); **full farm matrix** per release. Both are documented; "which devices did you run?" has a real answer.

## What the matrix actually catches

- Layout: Dynamic Type/large fonts, RTL, long strings (German), truncation behavior, dark mode.
- Performance: the low-end device exposes jank and memory issues the flagship hides.
- OS behavior: permission prompts, background limits, lifecycle edge cases (process death and restoration!).
- OEM quirks: aggressive battery managers killing sync, font scaling, camera quirks.

## Process-death and restoration

Every screen survives: process death → restoration (state restored from saved-instance-state or local store), rotation, background-kill. These are the mobile equivalents of power loss mid-write — designed for, not hoped against.

## Rules

- PR verification includes the minimal matrix for touched flows; release verification includes the full matrix — both recorded, not remembered.
- Simulator-green is not device-green for anything touching lifecycle, camera, permissions, or background work.

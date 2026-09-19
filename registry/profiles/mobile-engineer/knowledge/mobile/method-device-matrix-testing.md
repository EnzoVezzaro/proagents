# Method: Device Matrix Testing

**Owner profile:** mobile-engineer · **Type:** procedure playbook

Verify changed flows across the device fleet deliberately: minimal matrix per change, full matrix per release — with results recorded, so "tested on devices" is a fact, not a vibe.

## When to run

- Before any PR touching UI, networking, background work, or storage; always before release sign-off.

## Procedure

1. **Pick the flows in scope:** the changed journeys plus their adjacent edge (a change to the cart touches checkout's offline resume).
2. **Assemble the minimal matrix:** oldest supported OS + newest; low-end device + flagship; small screen + large; one OS-level oddity relevant to the change (permissions dialog, gesture nav, font scaling).
3. **Run the flow scripts on each matrix cell:**
   - happy path,
   - airplane mode mid-request → reconcile → retry (offline contract),
   - process death → restoration,
   - permission denied/granted variants for anything touching permissions.
4. **Record per cell:** pass/fail, screenshots of anomalies, performance notes (jank, launch time on the low-end device).
5. **File and rank failures:** matrix position + user impact decide severity — a crash on the oldest OS with 8% installed base outranks a cosmetic glitch on a flagship.
6. **Release gate:** full farm matrix on the release candidate; results attached to the release checklist with the crash-free-session baseline from the previous release.

## Rules

- A matrix cell skipped is recorded as skipped with a reason — silent gaps are how the fleet's tail bites.
- Simulator/emulator results never substitute for physical-device verification of lifecycle, camera, permissions, or background behavior.

# Rule-only baseline

Reconcile the supplied evidence with the existing secondary-capability inventory. Preserve stable IDs and existing reviewed boundaries where possible, while correcting stale, conflicting or incomplete entries.

In `scan_and_reconcile`, focus boundary changes on the requested or code-changed level-1 capability. Reuse reviewed inventory rows outside that affected scope unless they have direct new evidence or an explicit conflict.

One secondary capability owns one independently nameable, reviewable and evolvable business outcome. An independent trigger, user-visible result, state machine, governance authority or transaction boundary is evidence that the capability should be split. Enumeration-style aggregates should be split when they contain independent outcomes.

Do not merge merely because code shares a Controller, Service, directory or legacy `business_id`. Do not split mechanically by method, technical layer or table when several implementation steps jointly produce one business outcome.

Return only the requested JSON structure.

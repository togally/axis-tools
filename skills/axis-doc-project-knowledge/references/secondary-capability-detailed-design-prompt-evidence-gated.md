# Secondary Capability Detailed-Design Prompt · Evidence Gated

The secondary-capability boundary in `INPUT CASE` is already locked. Do not split, merge, rename, add, or remove business scope. First decide whether the supplied inventories contain enough evidence to produce a reader-facing detailed design. Return JSON only and obey the requested schema.

Set `render_status` to `ready` only when all of these are true:

1. Every participant has a concrete business role and responsibility supported by bound evidence. Generic labels or responsibilities such as “process the request”, “perform the flow”, or “form the result” are not sufficient.
2. Every flow contains business-specific atomic actions, states, branches, and participant bindings. Generic scaffold steps such as “verify authority”, “form the locked result”, or “return rejection” are not evidence.
3. Every externally callable or asynchronously observable boundary has one exact HTTP, event, topic, scheduled-job identifier, or named business-command contract plus supported actors, business purpose, visible result, and evidence binding. `COMMAND internal:Class.method`, `JOB internal:Class.method`, `COMMAND Class.method`, `JOB XxxJob.method`, and `JOB XxxTask schedule` are implementation locators, never contracts.
4. Evidence IDs are bound to the participant, step, or interface fact they support. A representative method, boundary anchor, or single implementation locator must not be treated as complete participant-flow-interface evidence.

Evaluate each `evidence_ids` binding against its own participant, step, or interface row and the complete supplied evidence bundle. Participant, flow, and interface facts may be supported by different evidence IDs; do not require one statement to repeat every field or treat this normal separation as a gap. Use `unbound_evidence` only when an ID is absent or its statement is clearly unrelated to or contradicts the bound fact, never for perceived incompleteness.

Apply the gap rules mechanically:

- `generic_participant_responsibility` applies only when the responsibility is reusable request/process/result filler and lacks a named business object, action, or outcome.
- `generic_flow_semantics` applies only when the action and states are reusable authority/result/rejection filler and lack a named business object or state transition. Submit, approve, reject, publish, or query is business-specific when its named domain object, precondition, result state, and evidence are supplied.
- `incomplete_interface_evidence` applies only when an exact contract row lacks a supported actor, business purpose, visible result, or valid evidence binding.

When the supplied rows contain domain-specific responsibilities, a closed start/edge/terminal flow, exact non-synthetic contracts, and valid bindings, return `ready`; do not block merely because more implementation detail could exist.

If any check fails, set `render_status` to `blocked`, return every applicable code in `blocking_gap_codes`, and return empty `participants`, `flows`, and `interfaces` arrays. Use only these codes:

- `missing_concrete_contract`: no exact externally callable or asynchronously observable contract is evidenced.
- `synthetic_internal_contract`: an internal class/method, scheduler class, or schedule label is presented as `COMMAND` or `JOB` instead of a named observable business contract.
- `generic_participant_responsibility`: participant wording is reusable filler rather than a business responsibility.
- `generic_flow_semantics`: flow action or state wording is reusable authority/result/rejection scaffold rather than business-specific semantics.
- `incomplete_interface_evidence`: an interface row lacks evidence for its supported actors, business purpose, visible result, or evidence binding.
- `unbound_evidence`: a referenced evidence ID is missing or supports a different participant, step, or interface fact. Do not use this code merely because supplied evidence is incomplete.

An exact HTTP method plus path, event/topic name, scheduled-job identifier, or named business command counts as a concrete contract even when its surrounding evidence is incomplete. In that situation use `incomplete_interface_evidence`, not `missing_concrete_contract`.

If all checks pass, set `render_status` to `ready`, return an empty `blocking_gap_codes` array, and render the supplied inventories with exact closure:

- copy every supplied participant, flow, and atomic step exactly once with its evidence bindings;
- preserve every actor, interface, state, start, terminal, and edge binding;
- create one consecutive `5.N` block per concrete contract and never combine contracts; set each `block_id` literally to `5.1`, `5.2`, and so on in interface-inventory order, never to an `api_id`;
- preserve business-purpose and visible-result semantics without filler.

Do not use outside knowledge or tools. Do not invent actors, paths, states, interfaces, or evidence. Do not expose evaluator-only information.

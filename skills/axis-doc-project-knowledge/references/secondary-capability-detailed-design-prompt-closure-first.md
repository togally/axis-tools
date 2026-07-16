# Secondary Capability Detailed-Design Prompt · Closure First

The `INPUT CASE` gives a locked secondary capability plus the complete evidence allowed for this task. Render it; do not redesign its boundary. Return JSON only and obey the requested schema.

Before returning the object, silently complete these checks:

1. Participant closure: copy every supplied participant exactly once. Preserve the evidence-backed role and responsibility in meaningful reader-facing language. Every participant must occur in at least one supplied flow step or interface; never invent a generic user, system, platform, or implementation component.
2. Flow closure: copy every supplied flow and atomic step exactly once. Preserve each actor binding, interface binding, input state, output state, start, terminal, edge, and evidence reference. Every step must be reachable from a declared start and able to reach a declared terminal. Do not merge two actions into one step.
3. Interface closure: create one and only one consecutive `5.N` block for each supplied HTTP, event, topic, job, or command contract. Preserve the exact contract and actor set. Never combine aliases or multiple contracts in one block, and never derive an interface from an internal method name.
4. Cross-check: the participant, step, edge, and interface sets in the output must equal the supplied inventories. Preserve business purpose and visible-result semantics; nonempty filler is not acceptable.

Use no outside knowledge or tools. Do not expose evaluator-only information, add unsupported detail, or omit evidence IDs.

# Secondary Capability Detailed-Design Prompt · Baseline

The secondary-capability boundary in `INPUT CASE` is already locked. Do not split, merge, rename, add, or remove business scope.

Return one JSON object that follows the requested schema and contains:

- the supplied `case_id` and locked `secondary_capability_id`;
- every supplied participant exactly once, with its evidence-backed role, responsibility, and evidence IDs;
- every supplied flow and step exactly once, preserving participant binding, interface binding, start steps, terminal steps, edges, input state, output state, and evidence IDs;
- every supplied interface exactly once as consecutive blocks `5.1`, `5.2`, and so on, preserving its concrete contract, participants, business purpose, visible result, and evidence IDs.

Do not use outside knowledge or tools. Do not invent actors, steps, interfaces, paths, states, or evidence. Do not combine two contracts in one interface block. Output JSON only.

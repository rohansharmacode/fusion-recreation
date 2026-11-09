# assembly module (placeholder, wave 2b)

Planned scope: Joints, as-built joints, joint origins, rigid groups, drive joints, motion links and studies, contact sets,
component constraints and the assembly analyses. Until the wave 2b builder fills it, `init(app)` does nothing and the
commands stay stubs.

Hand-over note: the createx module currently wraps `app.components.setTransform` / `setTransforms` at runtime
(`installRigidGroups` in src/modules/createx/bounding.js) so that the occurrences of a Bounding Solid rigid group move
together. That is a temporary hook: this module must replace it with a real rigid-group feature (and remove the wrapper).

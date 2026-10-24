# Equipment assembly calculation contract

The assembly diagram and all estimate exports share the existing irrigation
water recommendations and network hydraulics. No independent placeholder pump
or tank sizing is used.

- Tank capacity: ceiling of the full-cycle water volume including the configured
  tank reserve. The cycle includes all irrigation circuits, independently of the
  currently selected simultaneous operating group.
- Pump: the hydraulic network's Q and H when its result is ready. Before that,
  Q and emitter pressure use the preliminary irrigation demand; H remains unknown.
  The user enters the pump manufacturer. These are minimum required duty values,
  not an invented manufacturer pump curve.
- Disc filter: required capacity is peak irrigation flow times 1.20. Inlet and
  outlet DN are the next standard nominal bore meeting the existing 1.5 m/s
  design-velocity criterion at that reserved flow. This is a selection requirement,
  not a claim of actual filter capacity or clean/dirty pressure loss. No filtration
  grade, PN rating or proprietary model is invented. Manufacturers specify these
  separately; see the [AZUD filtration range](https://azud.com/en/productos/azud-modular-100-2/).
- Controller: current project zone count; explicit user overrides are retained.
- Manifold: one bare tee outlet and one separate solenoid valve per configured
  outlet. Deterministic child IDs prevent duplication after edits, save or reopen.
  Children follow their manifold and cannot be detached by dragging/deleting a
  mandatory branch. Independent extra valves remain available in the palette.
- Estimate: expand each physical assembly once. Count its component items, not
  the assembly marker or diagram links. Use the same calculations even if the
  assembly editor has not been opened after an irrigation change.

The two new bare-manifold cutouts were generated using the built-in ImageGen
and optimized as transparent WebP files. Exact generation prompts and paths are
recorded in `assembly-art-prompts.json`. Existing project components remain
readable; removing palette choices does not destroy previously saved equipment.


## Well supply and diagram layout

A pump can explicitly select a well in its assembly. Adding a well selects it for the first pump; this remains editable, including returning to project/tank supply. The existing network recommendation remains the baseline (emitters, installed pipes, project static lift and additional losses). The well adds only the below-ground pumping water level and separately entered well-pipe losses. Do not enter the same lift/loss in both places. Borehole depth alone is a clearly marked preliminary upper-bound lift assumption, not a measured pumping level; unspecified well losses remain excluded and marked preliminary. Missing both depth and pumping level leaves head unknown. Removing the source well does not silently restore a fictitious head.

Basis: https://www.grundfos.com/gh/learn/ecademy/all-courses/grundfos-sq-sqe/pump-sizing-and-installation-in-domestic-groundwater-applications

Filter flow capacity continues to follow design irrigation flow plus its existing 20% reserve. Well depth alone does not determine flow or filtration grade; no fictitious filter rating or micron specification is inferred from depth.

The SVG fits the available board using its viewBox, with no internal scrolling. Pointer movement uses the rendered SVG matrix, including letterboxing. Manifold valves use vertical product artwork. Controllers appear below valve banks and gain deterministic control connections to every valve lacking an explicit controller connection. Explicit control links are retained; generated links regenerate after changes without duplication.

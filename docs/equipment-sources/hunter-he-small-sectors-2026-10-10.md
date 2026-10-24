# Hunter Pro High-Efficiency: small sectors and adjusted radius

The reported 2.51 m / 60° or 77° failure had two calculation-domain errors:

1. Source tables start at 90°, but Hunter explicitly supports 0–360° adjustment; 0° is shutoff. The lower table boundary was incorrectly used as a physical sector restriction by both performance lookup and pressure controls.
2. The radius-adjustment floor used the smallest unadjusted catalog radius. For 10A-HE at 2.1 bar it rejected 2.51 m even though a 25% reduction of the 3.048 m pressure-specific throw permits 2.286 m.

Official sources:

- [Hunter Pro High-Efficiency](https://www.hunterirrigation.com/en-metric/irrigation-product/nozzles/pro-high-efficiency-nozzles): 0–360° adjustment, matched precipitation across the adjustable arc; performance rows at 90/180/270/360°.
- [Hunter spray-nozzle radius adjustment](https://www.hunterirrigation.com/en-metric/support/spray-nozzle-radius-adjustment): use the centre screw to reduce throw; use a smaller nozzle if more than 25% reduction is needed.

The implementation preserves all published rows. Below the first table sector, only this documented Hunter HE family uses the explicit estimate `Q = Q90 × angle / 90`, keeping the reference throw and precipitation. Pressure interpolation remains bounded by published rows. The estimate flag and localized explanation appear in the automatic-selection inspector and placed-head precipitation information. It is not presented as a separately measured table value. Zero sector remains unplaceable.

HE radius controls and automatic selection share the corrected pressure-relative 75% floor. The existing reduced-radius discharge approximation remains an estimate; there is no newly claimed manufacturer curve for screw-reduced discharge. In particular, the change does not assume that different reduced radii are matched.

For compatibility across angles, the same HE model/nozzle at the same radius and pressure is treated consistently with Hunter's adjustable-sector matching statement. At non-recommended pressure or reduced radius this is deliberately limited to identical model/settings; it does not merge different reduced radii or pressures. Full-radius heads at recommended pressure retain the declared HE matched class. Other families' extrapolation rules and fixed sectors are unchanged.

Regression coverage includes all five HE models, 60°/77° at 2.51 m, the selected-pressure reduction floor, table preservation, pressure/radius rejection, same-setting peers, placement commit, simulated sector coverage and visible estimation labels. Browser interaction QA remains unavailable in this environment.

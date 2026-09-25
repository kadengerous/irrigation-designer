# Hunter watering preview audit — 2026-09-21

The preview illustrates discharge classes, not measured droplets or hydraulic performance.
Particle counts, animation periods, relative secondary throws and pixel sizes are artistic
parameters. Stored radii, sectors, pressure-dependent strip geometry and calculations are unchanged.
Sprays use dense, independently stratified droplets scaled with the drawing zoom. Rotors add
a narrow water ribbon that breaks up into droplets towards the current radius.
The water position uses its emission time, not only the current nozzle direction.
All paint is clipped to the current footprint. Water is a child of the
head's draggable group and shares its live translation, including reduced-motion mode.

| Catalog entries | Preview | Hunter source |
| --- | --- | --- |
| MP1000/2000/3000/3500, MP-CORNER | Multiple rotating streams with several throw distances | https://www.hunterirrigation.com/irrigation-product/mp-rotator/standard-mp-rotatorr-nozzle |
| MP800SR, MP815 | Multiple rotating streams | https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-mp800-nozzle |
| MP-LCS-515, MP-RCS-515, MP-SS-530 | Moving streams constrained to pressure-dependent strip | https://www.hunterirrigation.com/irrigation-product/mp-rotator/mp-rotatorr-strip-nozzle |
| 4A–17A | Stationary spray sector | https://www.hunterirrigation.com/irrigation-product/nozzles/pro-adjustable-nozzles |
| 8A-HE–17A-HE | Stationary spray sector | https://www.hunterirrigation.com/irrigation-product/nozzles/pro-high-efficiency-nozzles |
| Pro Fixed Q/T/H/F | Stationary spray sector | https://www.hunterirrigation.com/irrigation-product/nozzles/pro-fixed-nozzles |
| 2Q/H, 4Q/H, 6Q/H | Stationary micro spray | https://www.hunterirrigation.com/irrigation-product/nozzles/short-radius-micro-spray-nozzles |
| CS/ES/LCS/RCS/SS strips | Stationary rectangular spray | https://www.hunterirrigation.com/irrigation-product/nozzles/strip-pattern-nozzles |
| PGJ, SRM, PGP-ADJ, PGP-ULTRA, I-20/SS, I-25/SS | Sweeping main stream, not a stationary fan | https://www.hunterirrigation.com/irrigation-product/rotors/pgj ; https://www.hunterirrigation.com/irrigation-product/rotors/srm ; https://www.hunterirrigation.com/irrigation-product/rotors/pgp-adj ; https://www.hunterirrigation.com/irrigation-product/rotors/pgpr-ultra ; https://www.hunterirrigation.com/irrigation-product/rotors/i-20 ; https://www.hunterirrigation.com/irrigation-product/rotors/i-25 |
| I-40/SS, I-50; ON variants | Sweeping main stream; ON adds opposing stream | https://www.hunterirrigation.com/irrigation-product/rotors/i-40 ; https://www.hunterirrigation.com/irrigation-product/rotors/i-50 |
| I-80/SS/ON | Forward-facing triple streams; ON has opposing secondary streams | https://www.hunterirrigation.com/irrigation-product/rotors/i-80 |
| I-90, I-90-36V | Rotating main/secondary streams. 36V retains catalog full-circle configuration; no assumed ON retrofit | https://www.hunterirrigation.com/irrigation-product/rotors/i-90 |
| G-70-B, G-75-B, G-80-B, G-85-B | Rotating main/secondary streams; G-80-B opposing configuration; G-85 back-nozzle plug retained | https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-70-b ; https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-75-b ; https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-80-b ; https://www.hunterirrigation.com/irrigation-product/golf-rotors/g-85-b |
| ST-90, STG-900, ST-1600 | Rotating main stream | https://www.hunterirrigation.com/irrigation-product/st-system/st-90 ; https://www.hunterirrigation.com/irrigation-product/st-1600 |
| MSBN Q/H/F, MSBN V, 5-CST-B | Stationary short streams; V and 5-CST-B dual streams | https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles |
| PCN, PCB (including R), AFB | Local bubbling symbol, no invented throw radius | https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles |
| S-8A, S-16A | Unverified archival pattern; detailed animation intentionally omitted | Current official pages could not be located. Existing archival catalog entries remain unchanged. |

Full-circle rotors rotate continuously; partial-circle rotors reverse within their sector.
MP streams rotate through their permitted sector, with no fan-wide oscillation.
Hidden heads/zones remain excluded. Selecting one head excludes all other heads from the preview.
Reduced-motion settings stop movement. Language and measurement preferences do not affect mechanics.

## Timing and realism update — 2026-09-23

The animation clock advances in real elapsed seconds, independently of frame rate,
and pauses while hidden or with reduced motion. It does not restart when a head
is moved. Independent stable phases prevent synchronous motion of all heads.
Partial-circle gear rotors reverse at sector boundaries at a constant angular
speed; narrowing the sector no longer makes the motor turn more slowly.
Water already in flight follows its emission direction. Strips use continuous
perimeter paths instead of jumping endpoints. Stationary fan and multi-stream
bubbler nozzles do not sweep. PCN/PCB 25/50 show local trickling; 10/20 show umbrella
bubbling; these symbols do not introduce a fictitious engineering footprint.

Sources rechecked:
- MP rotating, multi-trajectory streams:
  https://www.hunterirrigation.com/en-metric/irrigation-product/mp-rotator/standard-mp-rotator-nozzle
- PCN/PCB trickle vs umbrella and MSBN/5-CST-B streams:
  https://www.hunterirrigation.com/irrigation-product/nozzles/bubblers-bubbler-nozzles
- ST-1600 owner manual, p. 3: 80 s per 180° at 90 psi, adjustable speed:
  https://www.hunterirrigation.com/sites/default/files/rc-137-reva-om-st-1600-en-web.pdf

Verified exact rotation curves are not available for every catalog model. The
preview therefore explicitly labels timing as approximate in all 20 locales.
Illustrative 360° equivalents: MP/MP strip 40 s; residential rotors 75 s; golf 90 s;
other ST 120 s; ST-1600 160 s, using the above manual's reference speed. This is
not a claim that the generic catalog ST-1600 always matches the HS variant or
every pressure/speed-knob setting. Do not interpolate pressure into motor speed
without a verified manufacturer curve. Flight times, secondary reach ratios,
particle distribution and splash appearance remain visualization parameters,
not measured precipitation or hydraulic simulation. Unverified archival S-8A /
S-16A patterns remain omitted rather than inventing a manufacturer-specific spray.

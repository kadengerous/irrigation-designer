import type {Project} from './project-types';
import {irrigationSurfaces,unionSurfaces,type Surface} from './irrigation-geometry';

/** Preview-only lawn fills the irrigated plan figures, including drip/bubbler
 * areas. Sprinkler positions, radii and visibility never define the lawn. */
export function simulationLawnSurface(project:Project):Surface {
 // Match the Plan panel's layerPurpose(), including old site figures whose
 // default assignment is irrigation. Engineering boundary rules stay separate.
 const {target,unmodeled}=irrigationSurfaces(project,{includeImplicitSiteIrrigation:true});
 return unionSurfaces([target,unmodeled]);
}

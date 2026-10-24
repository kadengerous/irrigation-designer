import type {LandscapeVisualMode} from './landscape-types';
import type {LandscapeVectorArtwork} from './landscape-vector-types';

export type {LandscapeVectorArtwork,LandscapeVectorPath} from './landscape-vector-types';
export type {LandscapeVisualMode} from './landscape-types';
export {plantVectorArtwork} from './plant-vector-artwork';
export {landscapeVectorArtwork} from './object-vector-artwork';

export const landscapeVisualMode=(item:{visualMode?:LandscapeVisualMode},override?:LandscapeVisualMode):LandscapeVisualMode=>override??item.visualMode??'image';

/** No external resources: vectors remain editable geometry in an exported SVG. */
export function vectorArtworkSvg(art:LandscapeVectorArtwork):string {
  return art.paths.map(p=>`<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${p.opacity==null||p.opacity===1?'':` opacity="${p.opacity}"`}/>`).join('');
}

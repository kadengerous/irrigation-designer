import {useProject} from '@/lib/project-store';
import {drawingOrMigrate} from '@/lib/cad/engine';
import {PlantLayers} from './plant-layers';
import {LandscapeObjectLayers} from './landscape-object-layers';

/** Landscape's information panel contains category layers, never catalogue details. */
export function LandscapeLayersPanel() {
  const project=useProject(s=>s.project),drawing=drawingOrMigrate(project);
  return <div className="landscape-layers-panel"><PlantLayers drawing={drawing}/><LandscapeObjectLayers drawing={drawing}/></div>;
}

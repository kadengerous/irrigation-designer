import type {CadDrawing} from './cad/types';

export type WorkspaceSection='plan'|'landscape'|'irrigation'|'engineering'|null;

/** View-only rules. Never change saved visibility, geometry or irrigation data. */
export function canvasWorkspace(section:WorkspaceSection,readOnly=false,hideLandscapeInIrrigation=false){
  return {
    editPlan:!readOnly&&section!=='landscape'&&section!=='irrigation'&&section!=='engineering',
    showLandscape:readOnly||(section!=='plan'&&!(section==='irrigation'&&hideLandscapeInIrrigation)),
    showIrrigation:readOnly||section!=='plan',
  };
}

export function canvasSnapDrawing(drawing:CadDrawing,section:WorkspaceSection):CadDrawing{
  return section==='plan'?{...drawing,plants:{},landscapeObjects:{}}:drawing;
}

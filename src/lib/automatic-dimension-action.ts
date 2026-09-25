import { useProject } from './project-store';
import { automaticDimensions } from './cad/auto-dimensions';

/** A project-wide command, independent of the currently inspected layer/member. */
export function applyAutomaticDimensions() {
  const s=useProject.getState(),mode=s.workspaceSection;
  if(mode!=='plan'&&mode!=='irrigation')return;
  const drawing=automaticDimensions(s.project,mode,s.dimensionOffsetCustomized?s.dimensionOffset:s.gridStep*2);
  s.commitDrawing(drawing,null,true);
  useProject.setState({rightMode:s.rightMode});
}

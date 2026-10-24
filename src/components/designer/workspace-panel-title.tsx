import {Pencil,Trees} from 'lucide-react';
import {SprinklerIcon} from './sprinkler-icon';
import {text} from '@/lib/i18n';

export function WorkspacePanelTitle({section}:{section:'plan'|'landscape'|'irrigation'|'engineering'|null}){
  return <span className="workspace-panel-title" data-section={section??'plan'}>
    {section==='landscape'?<Trees aria-hidden="true"/>:section==='irrigation'?<SprinklerIcon aria-hidden="true"/>:<Pencil aria-hidden="true"/>}
    <span>{text(section==='landscape'?'landscapeObjectsTitle':section==='irrigation'?'zonesTitle':'layers')}</span>
  </span>;
}

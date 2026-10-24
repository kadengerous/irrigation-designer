import {Button} from '@/components/ui/button';
import {useProject} from '@/lib/project-store';
import {PLANT_CATEGORIES,type PlantCategory} from '@/lib/landscape-types';
import {LANDSCAPE_CATEGORIES,landscapeCategoryName,type LandscapeCategory} from '@/lib/landscape-objects';
import {text as t} from '@/lib/i18n';
export const LANDSCAPE_TABS=[...Object.keys(PLANT_CATEGORIES),...LANDSCAPE_CATEGORIES] as (PlantCategory|LandscapeCategory)[];
export function LandscapeCategoryBar(){
 const section=useProject(s=>s.landscapeLibrarySection),open=useProject(s=>s.landscapeOpen);
 const selected=LANDSCAPE_TABS.includes(section as PlantCategory|LandscapeCategory)?section:'tree';
 useProject(s=>s.locale);
 return <div className="library-category-bar landscape-category-bar relative z-30 shrink-0" data-cat-bar><div className="workspace-tool-strip" role="toolbar" aria-label={t('landscapeCategories')}>
 {LANDSCAPE_TABS.map(id=><Button key={id} size="xs" variant={id===selected&&open?'pale-on':'pale'} aria-pressed={id===selected&&open} onClick={()=>useProject.setState({landscapeLibrarySection:id,landscapeOpen:true,pendingCatalogPlant:null,pendingLandscapeObject:null})}>{id in PLANT_CATEGORIES?PLANT_CATEGORIES[id as PlantCategory]:landscapeCategoryName(id as LandscapeCategory)}</Button>)}
 </div></div>;
}

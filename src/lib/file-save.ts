import { create } from 'zustand';
export type FileSaveRequest = {blob:Blob;filename:string;finish:()=>void};
export const useFileSave = create<{request:FileSaveRequest|null}>(()=>({request:null}));
/** A user-confirmed OS destination is mandatory; never trigger an automatic download. */
export function requestFileDestination(blob:Blob,filename:string):Promise<void> {
  return new Promise(resolve=>{
    useFileSave.getState().request?.finish();
    const finish=()=>{if(useFileSave.getState().request?.finish===finish)useFileSave.setState({request:null});resolve();};
    useFileSave.setState({request:{blob,filename,finish}});
  });
}

/** Desktop browsers offer Save Link As through their real context menu. */
export function fileSaveMode({picker,mobile,share}:{picker:boolean;mobile:boolean;share:boolean}) {
  return picker?'picker':mobile?(share?'share':'unavailable'):'link';
}

// Keep the native context menu, but prevent ordinary clicks from starting a
// download into an unknown default folder or replacing the working project.
export function preventFileNavigation(event:{preventDefault:()=>void}) {
  event.preventDefault();
}
export function fileWithExtension(name:string,extension:string) {
  const stem=name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(new RegExp(`\\.${extension}$`,'i'),'');
  return `${stem || 'Irrigation Designer'}.${extension}`;
}

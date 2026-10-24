import { create } from 'zustand';
export type FileSaveRequest = {blob:Blob;filename:string;finish:()=>void};
export const useFileSave = create<{request:FileSaveRequest|null}>(()=>({request:null}));
/** Prepare the file first, then wait for the user's save action. */
export function requestFileDestination(blob:Blob,filename:string):Promise<void> {
  return new Promise(resolve=>{
    useFileSave.getState().request?.finish();
    const finish=()=>{if(useFileSave.getState().request?.finish===finish)useFileSave.setState({request:null});resolve();};
    useFileSave.setState({request:{blob,filename,finish}});
  });
}

/** Safari's download destination is controlled by its General settings. */
export function fileSaveMode({picker,mobile,share,safari=false}:{picker:boolean;mobile:boolean;share:boolean;safari?:boolean}) {
  return picker?'picker':mobile?(share?'share':'unavailable'):safari?'download':'link';
}

/** Closing the dialog must not revoke a URL while the browser starts its download. */
export function createFileDownloadLink(blob:Blob) {
  const url=URL.createObjectURL(blob);
  let handedOff=false,released=false;
  return {
    url,
    handoff(finish:()=>void) {
      if(handedOff||released)return;
      handedOff=true;
      // Allow the anchor's default click action to run before removing it.
      setTimeout(finish,0);
    },
    release() {
      if(released)return;
      released=true;
      if(handedOff)setTimeout(()=>URL.revokeObjectURL(url),60_000);
      else URL.revokeObjectURL(url);
    },
  };
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

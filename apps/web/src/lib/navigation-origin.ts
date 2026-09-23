/** Validate entity-bearing origins through existing owner-scoped readers.
 * Temporary outages propagate; they are not evidence that an object was deleted. */
export async function unavailableOriginFallback(
  href:string,
  read:(kind:'source'|'notebook',id:string)=>Promise<unknown>,
):Promise<string|null> {
  const url=new URL(href,'https://navigation.invalid');
  const parts=url.pathname.split('/');
  const valid=(id:string)=>/^[A-Za-z0-9_-]{1,200}$/.test(id);
  const exists=async(kind:'source'|'notebook',id:string)=>{
    if(!valid(id))return false;
    try{await read(kind,id);return true;}catch(error){
      if([403,404,422].includes((error as {status?:number}).status??0))return false;
      throw error;
    }
  };
  if(parts[1]==='notebooks'&&parts[2]){
    const notebookId=parts[2];
    if(!await exists('notebook',notebookId))return '/notebooks';
    const sourceId=url.searchParams.get('source');
    if(sourceId&&!await exists('source',sourceId))return `/notebooks/${encodeURIComponent(notebookId)}`;
  }
  if(parts[1]==='library'&&parts[2]&&parts[2]!=='study'&&!await exists('source',parts[2]))return '/library';
  return null;
}

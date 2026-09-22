// Process-local handles complement the persisted job state. Call cancellation
// only after the owner-scoped deletion transaction commits.
const requests = new Map<string,AbortController>();
export function registerArtifactRequest(id:string,controller:AbortController):()=>void {
  requests.set(id,controller);
  return ()=>{if(requests.get(id)===controller)requests.delete(id);};
}
export function cancelArtifactRequests(ids:readonly string[]):void {
  for(const id of ids)requests.get(id)?.abort();
}

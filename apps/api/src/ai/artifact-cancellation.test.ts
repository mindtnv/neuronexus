import {expect,test} from 'bun:test';
import {cancelArtifactRequests,registerArtifactRequest} from './artifact-cancellation';
test('cancellation targets one job and an old release cannot unregister its replacement',()=>{
  const old=new AbortController(),current=new AbortController(),other=new AbortController();
  const releaseOld=registerArtifactRequest('unit-job',old),releaseOther=registerArtifactRequest('unit-other',other);
  const releaseCurrent=registerArtifactRequest('unit-job',current);
  releaseOld();cancelArtifactRequests(['unit-job']);
  expect(current.signal.aborted).toBe(true);expect(old.signal.aborted).toBe(false);expect(other.signal.aborted).toBe(false);
  releaseCurrent();releaseOther();cancelArtifactRequests(['unit-other']);expect(other.signal.aborted).toBe(false);
});

// Run from the project folder: node examples/custom-provider.mjs
// This example uses local sample data and makes no network requests.
import {createProviderRegistry} from '../src/providers/registry.mjs';
import {createStatusService} from '../src/core/service.mjs';
import {badgeState} from '../src/ui/components.mjs';

let currentStatus='running';
const provider={
  id:'example',
  label:'Example CI',
  async listRuns(target){
    return [{
      id:'build-42',name:'Build website',status:currentStatus,
      repository:'acme/website',branch:target.branch,
      jobs:[{id:'tests',name:'Run tests',status:currentStatus}]
    }];
  }
};

const service=createStatusService({
  registry:createProviderRegistry([provider]),
  config:{
    mode:'live',pollIntervalMs:15000,
    sources:[{id:'local-build',name:'Local build',provider:'example',branch:'main'}]
  }
});

for(const status of ['running','success','failed']){
  currentStatus=status;
  const snapshot=await service.request({action:'refresh'});
  console.log(`${status} -> CI · ${badgeState(snapshot).label}`);
}

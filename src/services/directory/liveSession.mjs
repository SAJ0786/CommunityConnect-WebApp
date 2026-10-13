import {createDirectoryGateway} from './gateway.mjs';
import {createDirectoryImageService} from './images.mjs';
import {requireDirectoryMember} from './policy.mjs';
import {callMemberOperation} from '../memberCallable.mjs';

// Production SDKs are injected separately from the emulator session factory.
export function createLiveDirectorySession({auth,db,bucket,functions,sdk,storageSdk,httpsCallable,profile,
  enabled=false,readOnly=true,projectId,storage=globalThis.localStorage}) {
  if (!enabled || readOnly) throw new Error('Business account workflows are not enabled in this build.');
  if (projectId !== 'community-event-8b639') throw new Error('Unexpected Firebase project for this release.');
  const user=auth.currentUser;
  requireDirectoryMember(user,profile);
  let closed=false;
  const assertOpen=()=>{
    if(closed || auth.currentUser?.uid !== user.uid || auth.currentUser?.isAnonymous) throw new Error('Your account changed. Reopen the Business Directory.');
  };
  const images=createDirectoryImageService({bucket,uid:user.uid,sdk:storageSdk,assertOpen});
  const gateway=createDirectoryGateway({db,user,sdk,images,storage,assertOpen,operationsEnabled:true,
    callFunction:async(name,payload)=>{
      assertOpen();
      const result=await callMemberOperation(httpsCallable,functions,name,payload);
      assertOpen();
      return result.data;
    }});
  return {...gateway,close(){closed=true;gateway.close();}};
}

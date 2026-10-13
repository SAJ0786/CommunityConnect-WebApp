import React,{useEffect,useState} from 'react';
import * as sdk from 'firebase/firestore';
import * as storageSdk from 'firebase/storage';
import {httpsCallable} from 'firebase/functions';
import {auth,db,storage,functions} from '../firebase/firebase';
import {createLiveDirectorySession} from '../services/directory/liveSession.mjs';
import {findBusinessAddresses} from '../services/businessAddressSearch';
import ConnectedDirectoryWorkspace from './ConnectedDirectoryWorkspace';

export default function MemberDirectory({user,profile,onRegisterNavigation,renderProfile,onSignOut,view,onOpenNotification}) {
  const [state,setState]=useState({gateway:null,error:''});
  useEffect(()=>{
    let gateway;
    try {
      gateway=createLiveDirectorySession({auth,db,bucket:storage,functions,sdk,storageSdk,httpsCallable,profile,
        enabled:import.meta.env.VITE_DIRECTORY_WORKSPACE_ENABLED === 'true',
        readOnly:import.meta.env.VITE_READ_ONLY_PREVIEW === 'true',
        projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID});
      setState({gateway,error:''});
    } catch(error) {setState({gateway:null,error:error.message});}
    return ()=>gateway?.close();
  },[user.uid,profile]);
  if(state.error) return <p className="card" role="alert">{state.error}</p>;
  if(!state.gateway) return <p role="status">Loading your Business Directory…</p>;
  return <ConnectedDirectoryWorkspace gateway={state.gateway} view={view} onOpenNotification={onOpenNotification} onRegisterNavigation={onRegisterNavigation} renderProfile={renderProfile} onSignOut={onSignOut} findAddresses={findBusinessAddresses}/>;
}

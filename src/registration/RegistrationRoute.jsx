import React, { useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase/firebase';
import { REGISTRATION_ENABLED } from '../config/releaseGates.mjs';
import { createRegistrationClient } from './registrationClient.mjs';
import RegistrationWorkspace from './RegistrationWorkspace';
import { accountBoundTransport } from './sessionTransport.mjs';
export default function RegistrationRoute(props) {
  const uid = props.user?.uid;
  const api = useMemo(() => createRegistrationClient(accountBoundTransport(
    (name, data) => httpsCallable(functions, name)(data), uid, () => auth.currentUser?.uid
  ), { enabled: REGISTRATION_ENABLED }), [uid]);
  return <RegistrationWorkspace {...props} api={api} enabled={REGISTRATION_ENABLED}/>;
}

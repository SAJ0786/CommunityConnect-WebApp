import React from 'react';
import AnswerField from './AnswerField';
import { registrationFieldGroups } from './prototypeModel.mjs';

export default function RegistrationFields({ fields = [], answers = {}, places = 1, readOnly = false, errors = {}, onChange }) {
  // Response snapshots already contain participant-specific fields and IDs.
  const source = readOnly ? fields.map(field => ({...field,perParticipant:false})) : fields;
  return <>{registrationFieldGroups(source,places).map(group => <section className="registration-participant-group" data-readonly={readOnly || undefined} key={group.id}>
    <h3>{group.label}</h3>{group.fields.map(field => <AnswerField key={field.id} field={{...field,label:field.originalLabel || field.label}} value={answers[field.id]} error={errors[field.id]} readOnly={readOnly} onChange={value => onChange?.(field.id,value)}/>)}
  </section>)}</>;
}

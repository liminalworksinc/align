'use strict';
exports.alignment_waits = function alignment_waits(a) {
  if (a.state === 'countered') return {next: 'accept_counter', waiting_on: [a.requester]};
  if (a.state !== 'pending') return null;
  const people = new Map();
  for (const requirement of a.requirements) {
    if (requirement.approved_by) continue;
    for (const person of requirement.approvers) people.set(person.id, person);
  }
  const waiting_on = [...people.values()];
  waiting_on.sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  return {next: 'decide', waiting_on};
};

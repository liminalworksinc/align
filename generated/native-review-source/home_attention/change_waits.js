'use strict';
exports.change_waits = function change_waits(v) {
  if (v.state === 'countered') return {next: 'accept_counter', waiting_on: [v.requester]};
  if (v.state !== 'pending') return null;
  if (v.behind) return {next: 'rebase', waiting_on: [v.requester]};
  return {next: v.dependency_loop ? 'resolve_loop' : 'decide', waiting_on: v.approvers};
};

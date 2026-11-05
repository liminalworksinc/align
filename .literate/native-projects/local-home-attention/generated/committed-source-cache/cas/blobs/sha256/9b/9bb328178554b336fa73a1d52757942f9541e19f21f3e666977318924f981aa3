'use strict';
const {data} = require('./data.js');
exports.launch_waits = function launch_waits(v) {
  if (!v || typeof v !== 'object' || v.state !== 'approved' || typeof v.launch !== 'string' || !data().UNLAUNCHED_STATES.includes(v.launch)) return null;
  const can = v.can && typeof v.can === 'object' ? v.can.launch : undefined;
  const launchers = Array.isArray(v.launchers) ? v.launchers.filter(p => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string').map(p => ({id: p.id, name: p.name})) : [];
  return {state: v.launch, can_launch: can === true, launchers};
};

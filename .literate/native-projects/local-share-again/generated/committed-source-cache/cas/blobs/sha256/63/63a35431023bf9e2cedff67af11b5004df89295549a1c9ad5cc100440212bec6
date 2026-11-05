'use strict';

function words(device, who) {
  const you = who === null;
  const run = you ? 'run' : who + ' runs';
  if (device !== null && device.signed_out === false && device.has_workspace === true) {
    return ['Its machine, ', { device: device.name },
      ', has this workspace again: to share it again, ' + run + ' ::align share in the session.'];
  }
  const back = 'To share it again now that ' + (you ? 'you are' : who + ' is') + ' back, ';
  if (device !== null && device.signed_out === false) {
    return [back + (you ? 'give' : who + ' gives') + ' its machine, ',
      { device: device.name }, ', this workspace on ' + (you ? 'your' : 'their') + ' ',
      { devices_page: 'Devices page' },
      ' (Give this device the workspace), then ' + (you ? 'run' : 'runs') + ' ::align share in the session.'];
  }
  return [back + run + ' align login on that machine (it has signed out of Align) and ' +
    (you ? 'give' : 'gives') + ' it this workspace, then ::align share in the session.'];
}

module.exports = { words };

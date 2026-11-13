'use strict';
const SHARE_STATE_NOTICES = ['share_started_', 'share_err_', 'share_stopped_', 'upload_refused_', 'server_stopped_', 'signed_out_', 'signed_in_', 'access_lost_', 'workspace_back_'];
const RESUMED_NOTICE = 'Align: this session was resumed from its Align workspace, so its tools work again.';
function constants() {
  return { SHARE_STATE_NOTICES, RESUMED_NOTICE };
}
module.exports = { constants };

'use strict';
function counter_no_change(baseVersion,goalVersion){return baseVersion===goalVersion?'This suggestion changes nothing on the goal, so there is nothing to suggest. Change a field to suggest something else, or decline the request.':'This suggestion changes nothing on version '+baseVersion+', the version this request was made against (the goal is now at version '+goalVersion+'), so there is nothing to suggest. Change a field to suggest something else, or decline the request.';}
module.exports={counter_no_change};

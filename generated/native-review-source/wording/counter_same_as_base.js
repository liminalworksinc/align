'use strict';
function counter_same_as_base(baseVersion,goalVersion){return baseVersion===goalVersion?"This suggestion is the same as the request's base; change a field to suggest something.":"This suggestion is the same as the request's base, version "+baseVersion+' (the goal is now at version '+goalVersion+'); change a field to suggest something.';}
module.exports={counter_same_as_base};

'use strict';
function launch_words(launch,baseVersion,version){if(launch==='pending'||launch==='not_yet')return 'Approved, agents still on v'+baseVersion+' until launch';if(launch==='launched')return 'Launched, agents on v'+(version??baseVersion+1);if(launch==='superseded')return 'Superseded before launch: it never reached agents.';return null;}
module.exports={launch_words};

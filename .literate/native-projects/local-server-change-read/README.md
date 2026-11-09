# Change request records

Read permission-filtered change requests as summaries and decision records.
The consuming service owns authorization, state transitions and storage.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-change-read/component.md),
[Node target](flavors/node-server-change-read/flavor.md),
[independent acceptance](verification/acceptance/server-change-read.json), and
[active work](docs/roadmap/active-work.md).

The dependency-free two-file CommonJS package exports create_records at
server_change_read/create_records. Supply get,V2Error,requestView,requestViews.
It returns CHANGE_REQUEST_STATES,listChangeRequests,getChangeRequest. The list
accepts principal,state,limit=100. The single read accepts principal,identifier.
Keep the state array live and retain all six original public types at the caller.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->

# Public interface: server-identity-routes.create-identity-routes

## ADDED Requirements

### Requirement: server-identity-routes.create-identity-routes

# HTTP identity and device admission

This B19 library owns HTTP handler behavior for the 19 identity, account, invitation and device route files indexed in the B19 route partition. The original route bytes match current v2 main `c725c966d1ebe94a912454ded2593a254b8faab4`. Route paths and method keys are the names in the partition and are case-sensitive. The host keeps the typed Next.js entry points for all 22 method exports, including the shared GET and POST Better Auth catch-all.

## Interface and effects

The JavaScript factory `create_identity_routes(resources)` returns the handlers by route path and HTTP verb. Each handler accepts the existing `Request` and Next context with asynchronous `params` and returns the same `Promise<Response>`. Resolve dependency methods through the supplied host resources. Use the existing request-effects and validation interfaces, Better Auth and the account, device, access and workspace domain services. Factory construction and registration have no request effects. The application adapters keep the current public entry points and supply the existing functions.

Preserve the current return shape, thrown error handling, authentication kind, authentication and validation order, body-size limits, response status and headers, normalized parameters, and domain effect arguments. Leave request wrapping and response formatting with the same request helper, with the original direct dispatch for the Better Auth catch-all. Keep application persistence, token issuance, recent-session policy, account and passkey storage, and device and workspace ownership decisions in their existing host services.

## Checks carried forward

- Access requests check same-site before reading the bounded body and delegate rate limiting to the access service. The response keeps the documented retry header and JSON error.
- Better Auth catch-all performs the connection call before refusing an Authorization header. Readiness and dispatch occur only after that refusal check.
- Passkey rename and delete validate the path ID. Deletion checks recent sign-in before the domain action. Passkey reads use web authentication and expose the existing prompt status.
- Sign-out validates both Boolean flags and checks recent sign-in before revocation. It keeps the existing local and secure session-cookie clearing formats.
- Device authorization, token redemption and refresh reject browser credentials and keep their per-field validation and body limits. Approval requires recent sign-in, and lookup and denial preserve their existing cookie authentication.
- Device workspace grants validate both IDs and recent sign-in. Device revocation checks ownership for a web request, and device self-revocation forwards only an eligible replacement ID.
- Invitation preview uses the authenticated user. Invitation acceptance rejects malformed device IDs and preserves the domain callback for device-grant reauthentication.
- The current-user route exposes the device fields and additional workspaces only on the device path. Account deletion checks web authentication and recent sign-in before delegating the action.

## Acceptance

The frozen control invokes every identity route method using the original HTTP and validation helpers and synthetic local domain effects. For these identity routes, 55 observations on macOS and SSD-backed Linux are byte-identical and include exact domain call arguments, status, headers, response JSON and synchronous device-authentication ordering. The earlier 53 observations are preserved. Keep the recorded observations private to verification. Test the generated factory under the same host interfaces, then type-check the actual Next entry points and run integrated acceptance for the checkpoint. The route partition identifies the original locations for later comparison with the materialized library.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:0091fde42a7be4db1231`, `evidence:0c997b957a2511561ae1`, `evidence:0f1bce6b84a7d1571d70`, `evidence:0f8377acb2e7eb9bff78`, `evidence:1845d232140c068433ff`, `evidence:1f115a2ed0a80b5f786c`, `evidence:25183994782f53f20140`, `evidence:4f222023cc0776de8902`, `evidence:627e5aa9633978d05783`, `evidence:633fe4ae2952d6c19dae`, `evidence:674707f4bd63d81062f3`, `evidence:90c24763bccb98ab2a89`, `evidence:9ed8faf5db6edd2fdd23`, `evidence:af7fe4df0e0e18143394`, `evidence:b5169369d49c0f9f98ee`, `evidence:d701a7bf984470eeebf5`, `evidence:e489e3f6b665091c4a87`, `evidence:f286448d8ade6313478b`, `evidence:f9f0a2352a8f553533b6`

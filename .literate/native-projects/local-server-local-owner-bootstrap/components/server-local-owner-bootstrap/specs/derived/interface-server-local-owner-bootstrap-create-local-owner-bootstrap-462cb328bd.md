# Public interface: server-local-owner-bootstrap.create-local-owner-bootstrap

## ADDED Requirements

### Requirement: server-local-owner-bootstrap.create-local-owner-bootstrap

# Local owner startup

Owning work: ADOPT-002, boundary B13. The preserved original has one public
operation. Source snapshot:
`sha256:883d63fe7756ee3cefa5803c305e067e95a325a21140655d2f9a0e8f4c4ffbba`.

The operation initializes a local server's first account through its existing
authentication service. Hosted servers leave accounts unchanged. Creating the
account does not sign a person in; the person still enters a verification code.

The application supplies configuration, the account-presence read, the configured
owner address, authentication operations and host mechanisms. The application
keeps their storage, provider, environment, header and reporting ownership.

## Operation

The asynchronous operation takes no public arguments and returns no value.

1. Read the current configuration. If hosted, finish without reading accounts,
   the owner address, authentication, host headers, the environment or reporting.
2. Read whether any authentication account exists. If one exists, finish without
   reading the owner address or any remaining service.
3. Read the configured owner address, then obtain the current authentication
   service and await its context. Create a verified account named `Local owner`
   with administrative creation semantics. Await creation before continuing.
4. Obtain the service's current verification-code endpoint and request a sign-in
   code for the same address. Supply this server's loopback host header. Await
   the request before finishing.
5. If preparing or sending that code fails, report the existing recovery message
   once and finish. The created account remains. A later call observes the
   account-presence gate instead of automatically sending another code.

Each invocation performs its own initial checks. Do not add shared caching,
serialization, automatic retries, a transaction or a new sign-in path. Concurrent
invocations retain the supplied authentication service's creation behavior.

## Failure and waiting behavior

Configuration, account-read, address, service/context and account-creation failures
propagate the original failure object without a recovery report. Obtaining the
verification API also occurs before the send-failure handler and its failure
propagates unchanged.

Only endpoint lookup, header/environment preparation and the code request are
inside the send-failure handler. It handles synchronous throws and asynchronous
rejections. A failure while obtaining or using the reporter itself propagates
unchanged.

Preserve pending context, account creation and code-request waits. Do not begin a
later phase while the earlier awaited operation is pending. Discard successful
dependency return values instead of exposing them publicly.

## Repeated calls and supplied objects

Keep configuration and account-presence reads live on each invocation. A
successful call does not install a shared result or suppress later reads.
Concurrent calls each obtain their own context and retain the provider's normal
creation semantics. Preserve the original distinction between an existing
truthy account-presence result and a falsy result.

The public operation remains asynchronous even on an early return. Preserve
opaque thrown values, including non-Error values. Preserve the supplied context,
adapter, API and reporter object identities and their method receivers. Do not
wrap provider failures or replace them with matching messages.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:b0739d68693a9c4c3b23`

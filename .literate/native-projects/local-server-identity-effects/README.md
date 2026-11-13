# Sign-in delivery and configured verification

Preserve sign-in links, protected local delivery, hosted email delivery,
configured captcha integration and direct verification through supplied services.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-identity-effects/component.md),
[Node target](flavors/node-identity-effects/flavor.md) and
[independent acceptance contract](verification/acceptance/server-identity-effects.json).

`server-identity-effects.create-effects` maps to
`server_identity_effects/create_effects` and its named `create_effects` factory.
Construction captures the 15 declared resources without calling providers.
Operations preserve current settings, live host resolvers, exact failure values,
the supplied public error class and completed effects when a later step fails.
Actual configured middleware remains delegated to the host's provider.
See [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->

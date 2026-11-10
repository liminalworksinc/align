# Proposed retained boundary list

- **Status:** active
- **Owning queue item:** [ADOPT-002](active-work.md#adopt-002)
- **Completion / archival evidence:** pending operator approval and checkpoint acceptance

The operator approved this exact 280-path list with “Approve proposed retained list”. Approval authorizes classification only; checkpoint acceptance and publication remain pending. The proposal before this approval note has SHA-256 `9701c86dc16709203148ff2a9b4707a606c6affc1b2b26663893a5e70366f0b3`.

This proposal uses the intentionally retained route in [ADR 0002](../decisions/0002-native-literate-ai-rewrite.md). No boundary is closed by this file. Approval would authorize classification of exactly the listed current paths. Full application and image acceptance, an updated findings comparison and normal push review remain required before closure.

The current 490-member scope comes from source checkpoint `c4b853866ff5e130fa294f8e70fe5c0530e87aa4`. Ten boundaries are proposed for retention. B17, B18, B19, B22 and B28 remain service or command migration work. B28 operator command grammar, refusals and production effects are not exempted.

Every path below is relative to `components/legacy-project-wrapper/implementation/`. Approval changes classification only. No implementation is deleted or modified by this proposal. No finding is accepted or dismissed. Later additions need explicit classification.

## B20: Web UI (61 paths)

Retain the React/Next views, browser bindings, styles and existing UI decisions. Service implementations remain in their own boundaries. Review the proxy and startup instrumentation as target adapters, including their origin, admission and startup checks. No UI regeneration claim is made.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `app/app/_ui/activity.tsx` | `8a4db415811368916c07619ba0efcc5cfdd01130f897aaac89338746e44dcde9` |
| `app/app/_ui/changes.tsx` | `63cd274e06cb4f729388a214cecda8173702a5abfd6c43771fc08a95470657be` |
| `app/app/_ui/crparts.tsx` | `2c7f64f6b9f6585b08014bc61d4f3a7872edf6d57519e33707abb0d3a403f1b1` |
| `app/app/_ui/decide.tsx` | `ac4a5d1c92da81c467fcdc8de540e2ff391f4341f8159fc8f79617df2b781ae3` |
| `app/app/_ui/error-notice.tsx` | `52812c7ff5ed108f16494aa7a7f19e7d2df61468fe6be0d088aa76b9743e1981` |
| `app/app/_ui/evidence.tsx` | `93842c799faadd921c980cbc7da062c63b56cae4815e36087c79c661bfb81d62` |
| `app/app/_ui/goalform.tsx` | `2d5bae0caf40a69bd2da49d1b86594ebad912f5bb9f2ac8a95669453fdb0445d` |
| `app/app/_ui/kit.tsx` | `756d0595c14a01b4b7a7e8784e73b6e06f72dfde6e1ed8698e3796685977da04` |
| `app/app/_ui/limits.tsx` | `44c3f8ee42d6a7401ae9afb7f708f9621225ccc04457ee4e37eede39352b82db` |
| `app/app/_ui/missing.tsx` | `b107efe02821b22065572d1ed81bdc13330f085713dc832f1c39abd601f28247` |
| `app/app/_ui/passkey.ts` | `fab4d52becb7e2fe913007954ece2a251d4a6e029e546ccc7535a06fd7a3cacf` |
| `app/app/_ui/reallocations.tsx` | `73c176a2fe77020669dd9cbd148d1736395c28bdff45e440829922c61d81c464` |
| `app/app/_ui/requests.tsx` | `08919a1aab71e4f0f605d10f14fa3844e17c0b49ee9f2909bdf53c69831ad963` |
| `app/app/_ui/server.ts` | `ba5b0f9d4d162f624cff20acec8ad84e838fee118d9b4113b0bda17825977cd8` |
| `app/app/_ui/turnstile.tsx` | `7fa19b01fbe58606194f4c90e677d7aabdd7bab8082a9fe2b1cc795c998ec5cc` |
| `app/app/_ui/types.ts` | `e2b89bb7958cb7a4aeba6f3284de79524b4c6459eab6f621e8dbe27148d2d5a2` |
| `app/app/_ui/value.tsx` | `b77b7b084ad692055cb8f9aa33bbb47054dafe1d64d560e5bc90bd1667ee25e0` |
| `app/app/_ui/words.ts` | `5e8e45d13b42fa0362bed2b06907cb33dcb2fa6f8f0c15a8a81a5529d2569172` |
| `app/app/account/page.tsx` | `885acad55b0e84595e0ed7d5e8a28df0504008c0bdb30c06b0ddb9bf4a7e8e5f` |
| `app/app/account/view.tsx` | `c71d6410117740068b8910298f8598dc1493a33947b39e11ea4e2819ce8324a1` |
| `app/app/device/page.tsx` | `3ba161a0fb94d9fe6ca9277dbf0f939e554d05d86cc8669b5a7d4069b69b569c` |
| `app/app/device/view.tsx` | `8be53e967235990a92247c4063e34f6faf8d1d110fa35aabcf8f463876c2a355` |
| `app/app/devices/page.tsx` | `62d4d37eb9387c5d3e05fc0b82c14a1c7203a356a5000b96bd5109faddc5aace` |
| `app/app/devices/view.tsx` | `efd0b236903e760af0e8ad5bb54e59e736a12d43cfa60903b0e5dd10c9e95c04` |
| `app/app/invite/[token]/page.tsx` | `dc7a7192d42a254179009f46b659d6698fc81ed715beede2b3936571b56210b9` |
| `app/app/invite/[token]/view.tsx` | `005cd00d0b093d43332a78921d56fd14870f9bab44987b006082bec5beab7fcf` |
| `app/app/page.tsx` | `79e43637a377ed463bbfb5d8c4ac4dc95501dc2c891154692a404f1a81a77419` |
| `app/app/request-access/page.tsx` | `f368293865bcd6346a69ff7700dd1c9322681fb3bbdcd6bf61b1a74bcf43da84` |
| `app/app/request-access/view.tsx` | `dc3cacfce474fd81278883a31aab3347923f5bc6313a15d2447fbbafc8e88e71` |
| `app/app/sign-in/page.tsx` | `4722037d4bd3864d00059e5b7ecec60cff99602a588bcab4171abdedc728ffd3` |
| `app/app/sign-in/view.tsx` | `8134f590ca3af3a76732c47c218fe7a42252dae2faff0656c37801236cfea59f` |
| `app/app/view.tsx` | `097cf8984f38b1b2d7e9dd8f839f2d5f7d3c1d44f3ff008c0d3b2f9839944872` |
| `app/app/w/[ws]/alignments/page.tsx` | `4e9d412b79d5119a369bd3e819e1ebfeeb0ef05f710a771968d71472e9325085` |
| `app/app/w/[ws]/alignments/view.tsx` | `00b2f64149bd29386a8bd00a6589ac51f5074ecca039a7859f012553842e081e` |
| `app/app/w/[ws]/apps/page.tsx` | `4e6fe22220cf85ed35843cff32fc6bdddfa777ecb53f8a15b78abb5087e52b70` |
| `app/app/w/[ws]/apps/view.tsx` | `842dfae1b3dd329e264a90a0fbf9abd4729231882e39c659a0fdde4bedcc75b2` |
| `app/app/w/[ws]/asks/page.tsx` | `64de8c4c92c97ba4a95e2bc9e5315e48bf6bf233b08465e93535d9896f3670f8` |
| `app/app/w/[ws]/asks/view.tsx` | `48b248201f6e6c10b4a03811e9878b1cce216908d07af3225482e1ddfaafd065` |
| `app/app/w/[ws]/first-run.tsx` | `b4aecad8260dddaa5379a6299fda1de65f49770675615a48357e1a127b48674f` |
| `app/app/w/[ws]/goals/[goal]/page.tsx` | `1f9e2bae9dfd21febdc0b59a8029d39eccf99bd52ef1b12f064cb35f9fbf73eb` |
| `app/app/w/[ws]/goals/[goal]/view.tsx` | `e63fca9f5d62fbf0bbf1efccdbd297206494364240b7120ba5c5942fc94b00e4` |
| `app/app/w/[ws]/goals/page.tsx` | `25f06624ea4a177de405bc36b0bfa9461e44baefd20c109fa417ecfde129fe5e` |
| `app/app/w/[ws]/goals/view.tsx` | `4217fe3960f2aae9863a57b1ed67301936686c641fe8fbe8f850c797816249ee` |
| `app/app/w/[ws]/page.tsx` | `fa8fac0c3a13a5395113646e137c43f98fae1470829f5dda0f24017ce4f388bd` |
| `app/app/w/[ws]/people/page.tsx` | `4cba90acb3d97fca34e5ff282dc3eeb51768428b6d17b7e0d83cfe0f9bd3ce1e` |
| `app/app/w/[ws]/people/view.tsx` | `207ea6601e77dadc67c2a926fe0fe6cfac2fca1ee60d3b03ab188b269ad58d88` |
| `app/app/w/[ws]/requests/page.tsx` | `64bbcaa048cc29e6df2de51b30bb0c98bde61149ce439045125d487b8f5b95b3` |
| `app/app/w/[ws]/requests/view.tsx` | `b2c2a5585adbbcf9b7d1d512af723b6f5b904e30e7aeb0dffc8a8c23a097058e` |
| `app/app/w/[ws]/sessions/page.tsx` | `f4e17fc210b085eb803bd69eb38f0b215032e4568034980b43660cc0bccfa59a` |
| `app/app/w/[ws]/sessions/view.tsx` | `ceae65b41b7480aea617bf3ab5d2a91f591685fa02209cdb44eda25fe6393659` |
| `app/app/w/[ws]/spend/allocation.tsx` | `0c828aaa1fb983087a87fefe0175f7066f87e9af92e1718dfffbfdf72185ed87` |
| `app/app/w/[ws]/spend/page.tsx` | `c6d3b13be3c99d721aef5b9791c3ad3dbdba44db26ce6ada74e44b4278a1aaea` |
| `app/app/w/[ws]/spend/view.tsx` | `51c4ad586a0a8bcf5c7fa10ba78b31b2f5249db9bc7e22d3141f971336237674` |
| `app/app/w/[ws]/view.tsx` | `18d309a68b3f4a61a635d6fb5ed5ee2f64ce154978d69c80e73f8418f410ec76` |
| `app/error.tsx` | `8173841c5b02bf3589983094df44c92ac386d8dcd784119da2811ad93974dfa0` |
| `app/global-error.tsx` | `be765e62f817c7e473b73075f6e4a8ba6070bfe772ea6fc15f54b6097b9bb0e6` |
| `app/globals.css` | `fc4f6b462cbc4de0d9915ff87e97b6a0a529fe43a362ad6b11594b957de5c054` |
| `app/layout.tsx` | `744a32b3aad3dc4b21c3bdbc0c2c775464b8d617780ff12625b1b53e9f0ce0e6` |
| `app/page.tsx` | `9b7f5aba201957793841693918740426c62f8b25bfd08299af5f6b4abe305cb2` |
| `instrumentation.ts` | `12d6258fcef0041c840e58c63f87cda9f494fd00bb851a387586d147fbc31561` |
| `proxy.ts` | `73da49a3adb53505ccad42eed1bbd74c2415e0ca78686417febe63284a463d33` |

## B21: Public trust pages (6 paths)

Retain document selection, entity substitution and rendering adapters. Preserve the qualified Markdown parser and exact document assets. This classification grants no legal-content approval.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `app/_trust/doc.tsx` | `40988128fc6cf9425dd73fcf6cfe8e423d36cffae6411bee80432fba92658c7a` |
| `app/privacy/page.tsx` | `feb504a1ba9728627523ff793e01e47acafb2ba1dfb3980c5e90f325c1d7e4a2` |
| `app/trust/page.tsx` | `13fd48c121522ce008a0b399bc5c7f2d470c9f9e40b37a1d8b74e12a54f32ff2` |
| `lib/trust/docs.ts` | `2c9f8002da07cb46346793c7b0d8cde2999526bd77d283f517b43862a7cd40e1` |
| `lib/trust/entity.ts` | `b43ffc5baf8ec3fc00164ecaa48053da901c467a3b441867e1f27fc493454b05` |
| `lib/trust/md.d.ts` | `98a7df396fe86c2ac48b73ce073f9115c0300e9174afd0464f709de56b40d08b` |

## B23: Legal documents and domain list (8 paths)

Retain legal and retention text plus the disposable-domain list as exact assets. Executable retention and admission remain B17 and B13. This classification grants no legal-content approval.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `docs/RETENTION.md` | `bf3ffbcd0a357fea014b1b9df4d939492dd73977b5915187b078c58862174f9f` |
| `docs/trust/dpa.md` | `c9696a185eab982cc257ad0e79ba186a542d1be42033754ac9746855640e0da5` |
| `docs/trust/privacy-policy.md` | `50b589957c417611f2c7b48d932b622253b8b6f0e4333c4eaf53be2e4b72d5f6` |
| `docs/trust/questionnaire.md` | `95a4a9f41cf56ca8c9953eaf083a71aeec59c91d29a48e6a22c2fa044e1225c4` |
| `docs/trust/retention.md` | `df23768d1d92aba94e20e7ee07cfb9b24b6dc2bfa0d9c1f5ed8b6fd1d3a2a863` |
| `docs/trust/security-overview.md` | `958a0bf741ef951b09784c703dba43e51118988a1771b1981c91d3b1031a7295` |
| `docs/trust/subprocessors.md` | `fcab68fb44b4d7bf8d1d4e2724db8e473ac11804cc64db5e62c7391f2a123b73` |
| `lib/v2/disposable-domains.json` | `1b36130a488aae7a4fefc689f9c9b936dc679a7537edda2c3e1003e53814f894` |

## B24: Static files (6 paths)

Retain the six immutable static assets with their current bytes and references.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `app/favicon.ico` | `c28fdd2a4f31e2dc64f653962286da5c82a4cdfc518b242d32812c624e9a19a4` |
| `public/file.svg` | `2b67812c325c199a02536cdbeea0c593a72f707d323b72ee3e08dbab06753bd4` |
| `public/globe.svg` | `b614b9bf183925957661ac851498fe1d8029fd43a62fbfed86f9e2624a57e7cf` |
| `public/next.svg` | `55995dfad6ecb4945a1e856ddca03c5e16aa5bf13fd21b4df6a74ae79357bcfc` |
| `public/vercel.svg` | `f081337b2fee635b455b63275406a3e7f39d6a014e25ad90dab5a67e62a12ac4` |
| `public/window.svg` | `644768c4aaeb4767bce293344eeb0c125fb804a94d801440424072202d85e3a1` |

## B25: Language, UI and npm packaging (9 paths)

Retain language, compiler, npm dependency and lock, and UI build configuration as target composition. Preserve security headers and the operator package closure through complete application and image acceptance.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `eslint.config.mjs` | `f79dcb6f4a058be51b58ec1afebdffc4d5831b3dd250e33479cfa61337612b6e` |
| `next.config.ts` | `f1d84c45ce7c6992dff316d80991d2e984a6592bc10c61aa4110be9744fd69b3` |
| `package-lock.json` | `6ea7faba303deb8865067b40f6298a1bf68e8e00dabd523083da7d3e763d8667` |
| `package.json` | `7a50ba1fadc9d207f97b1b7982174a737438218ecce80ed077967252ed998218` |
| `packages/align-agent/package-lock.json` | `097fed8aaaeb063f2c61dbee0d8cc07c98b8560a71bbc1226c237ab3dfe2975b` |
| `packages/align-agent/package.json` | `085b9cf00c5714a1cba1fe130d55877ca21e33b8ef244df9bda0108e41ede1f5` |
| `packages/align-agent/scripts/postbuild.mjs` | `e200c9fcb461b44d1459f57a20de3f201fce997d44250517a671e2d689a21897` |
| `packages/align-agent/tsconfig.json` | `46504cb48b0244d7a03b8383af1bf7e297940719b8c742a138a3c3d1502a6767` |
| `tsconfig.json` | `6d92945360adf780e140131ebf484511f999b1b19928464bb23611de7bf34568` |

## B26: Container and hosting target (4 paths)

Retain the current container and hosting files as target configuration and documentation, without editing configuration or deploying. Run existing image acceptance locally. No hosting command or tester action is authorized.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `.dockerignore` | `8553117b74f7f1390ddf340cfc0cbfe94f2db548f080439d8c0a704005bc282a` |
| `Dockerfile` | `37530ff6f4c28dbd089966a6a74b5245f5c81b1f13b7c8d1d602f87d5f668b72` |
| `docs/HOSTING.md` | `17d350031ad5048cb52e13ccba0b4d108732c085d54a3c1a402570d31ca33721` |
| `fly.toml` | `332c56fd54644d81436a61fe0ce8e79048c2fe4336ae686e2c484eab6de8da49` |

## B27: Tests and independent verifiers (163 paths)

Retain independent tests, original observations, private parity harnesses and suite drivers as repository verification inputs. Keep them outside generation input and preserve their expectations.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `native/agent-envelope-stop-harness-v1.cjs` | `58bde64098bc452165817842341a539e81340a14d3c68a6dc78d931043516f10` |
| `native/agent-envelope.json` | `5d693d0ed43a2fffc1be5840a3a9f04427e8d7f973dd99a81057db13f318ad3b` |
| `native/field-validation-harness.cjs` | `05ba968d693365a329a3b25d9154a1d936896b3a0019448150b215d297f7abfd` |
| `native/field-validation.json` | `74b859dd962163a5af05c70d6c022ab1a14fd1224a91efd8fe7bc4dce52c5588` |
| `native/goal-approval-harness-v1.cjs` | `acd0833e5b963acfdfb7f323c2a4dc32c264781e964f6904b854759d0496b5e5` |
| `native/goal-approval.json` | `5b95784f420a2d7c1ef696e3abb7f3500aca0078a10a149dc330482286485a8c` |
| `native/goal-limits-harness-v1.cjs` | `6cfc6971d3b81bf11f86fcd2c336e3dd5dd315e5c13edb95e98254e02820a450` |
| `native/goal-limits.json` | `d7c6d4ecd8f687943c77779b108bd602cb667e61cd8f4c3b1199358f75239a02` |
| `native/home-attention.json` | `d018472f9c94d01d056cbdd4e6c8a433013a2204374b32b62c29e53246fca485` |
| `native/home-harness.cjs` | `24929b9fb07453616f658ba629a042f4a9c80572c0cc346cfaaebe2d7181e098` |
| `native/http-errors-harness.cjs` | `d0a44ae42b1775e94dc2e5496f53a148bf14d2372b20861c9f0e0359ed72c546` |
| `native/http-errors.json` | `4244ad9cb49ec270864f3c2fb61dbf0d3ea596edf4a25575967aeef03151dab6` |
| `native/identifier-tools-harness-v1.cjs` | `647b3acec0fe8db568f478c73080a1113817ca7e4956e2de1569535436f97578` |
| `native/identifier-tools.json` | `89afabe2f6ba478b8b83c9277594e160f8d44f8e02d51ffb2141e7a95ee4c2de` |
| `native/limit-suggest-harness-v1.cjs` | `90203467fadc38d2d88fdf0db97d44cad01f5e1f4bac5e162b52e9e3dc1c91ab` |
| `native/limit-suggest.json` | `c923510b76d2c24f6f5a04e844f80b7ffcfc335c0bc651d44b372ce72c0b0cfc` |
| `native/markdown-harness.cjs` | `fa4291f0861e41e5a2a523770aad97f91f4d04f441ffdf3d69ca3f24206bf22a` |
| `native/migration-coordinator-harness.cjs` | `a0f3bb77bf73c4092fe5e161688b21625c263d456e899a3f1cc5244895d19ec1` |
| `native/migration-coordinator.json` | `ae55673b9a3a6a7c22f8b2de532497b2f717cf67348414426ac85b5e4b5a65af` |
| `native/notices-harness.cjs` | `699241d2bd9cbf9d9a81fc9fb323617294c46e1b718eaa11505c002e1a988816` |
| `native/paste-lines.json` | `31d0d54835a44e773c6e477b391c45252cac938df4081a235189093ab5a55882` |
| `native/paste_lines_library_harness.js` | `828f4acfcaf853e5cc52c337f69deafca0396a8ad3472bc03427f943ffca37c7` |
| `native/policy-harness.cjs` | `b9b30d840adca57364fa397c493a11409d3f47182e832483fc15831bb9d4038d` |
| `native/policy.json` | `5450bcf24b9d17533dab59dc5c31a5fc60a5ff813edf6000d91b23abe7a61421` |
| `native/promise-queues.json` | `0710971a2294661117a87a83b2a0b29f0008db7ee409eebf698baa32a307c4c5` |
| `native/queues-harness.cjs` | `aba07dc3343e8b8cb40a6353477ea0d8a94214936e88cee244614cec1be4fb54` |
| `native/rate-limits-harness-v2.cjs` | `66d047c034a6e35d00344ffbd20b8918e7c9c16d12ae69001c371ec31a4f5021` |
| `native/rate-limits.json` | `fb8842a7fb7c5b10b5677c7c30f9109d1e86e8617921b3da2ca6f74d9f6b8b1b` |
| `native/rounding-harness.cjs` | `2f79b38388f5d32506321e8cfe782eb8f24989af1074e4dda205ff7e1a4d4761` |
| `native/runtime-settings-harness-v4.cjs` | `bf0b048443d9d03b259e104d0efcd7db8df65e036a129b66c7f7248c32e55e63` |
| `native/runtime-settings.json` | `7c3425b6b17f930309176cd6e8feed45df6c83b34577b9105b74356c41631e3a` |
| `native/server-account-lifecycle-harness-v3.cjs` | `104a6955a5295c77d5b940b3400f70b456af49e87bd036d280115a1a831cc32b` |
| `native/server-account-lifecycle.json` | `207d712f01cdcb683efa51475d4d2518fb44ee1233cc1782c1292f4601725313` |
| `native/server-activity-harness-draft-v1.cjs` | `ebb7e66a6a3c11507cc2883e9fcbf93c35d182caa8f4ea715cb92101119ac545` |
| `native/server-activity.json` | `e252f40d3f543bea04623f005fdf90db64b7106e8990c7806ddd1187e3f9a91e` |
| `native/server-alignments-harness-draft-v1.cjs` | `9e39c1c1f405439eb3004b2abbd391a7916466a01b6717e5643b8df660993409` |
| `native/server-alignments.json` | `835d6b1bcb35766f1de7c2c969aafdadbf4f02a187e0854e1e2e2cb401236b1c` |
| `native/server-allocation-harness-draft-v2.cjs` | `24560c36efc6dfbe88049a864f727d58e4eb445eb4e41025e5f9282d2b946508` |
| `native/server-allocation.json` | `20d3e2498a21176e5c5d6476a34317a12aca60892308912cdbda8512f31df075` |
| `native/server-asks-harness-draft-v2.cjs` | `b26875e8265c953e7170a239cc799719e93dd383e106d7fcc8b25ceea68b75dd` |
| `native/server-asks.json` | `e04ea8a79bd52cf0fc76af21c16b79123a3f8644bdaaa1825b1076ff85989169` |
| `native/server-auth-harness-v5.cjs` | `f7403a979065e698b1ad2d33a4f4c2af56cc5aa0670037572908343e23f3e0e4` |
| `native/server-auth.json` | `3e49eba125fabf605ad85c734c548d805780cb27d8e4ae7e551a63b3242729a1` |
| `native/server-change-read-harness-draft-v2.cjs` | `1bcf98fb56def8073ace8dff90f7593585847c29c279ce67c8ec9999c3578d54` |
| `native/server-change-read.json` | `e0805fb5071850b96730d083076665914261e8e19c03ff257c6ca86e120c936a` |
| `native/server-changes-harness-draft-v1.cjs` | `f56e015480b54bbd79ababf1b97fa769304d154cd87d23c41cf263f3c77c45e1` |
| `native/server-changes.json` | `65206cf9349cd837cca1286223b4e4514e9bab36e87db9b58ecaa0e81a115e35` |
| `native/server-client-keys-harness-v3.cjs` | `07ca9d5d3e924fc3e4f67a64c4e6f8a9a04f85ce2b0a186055d9e2829320efdb` |
| `native/server-client-keys.json` | `28363fc8ce38204e3493cd37fca4764aaaf7bd5a63fda3a0c0db2aaa32571863` |
| `native/server-core-harness-v4.cjs` | `bf4e3d7b3ca20ffa8ec0a39cbfa31426e06e84bec65e747916dbef3e6168f962` |
| `native/server-core.json` | `27430ff057ebd32fc8dcbf5408f64b249582ea654af0ebe368df6903ddfe49f1` |
| `native/server-devices-harness-draft-v1.cjs` | `ac9dd89dadfeccd1fc7a5ff1609f08c1af8c4c6a42c1b2ccbd5f2a83b953a34f` |
| `native/server-devices.json` | `61e1c10c007f544b92ee8fafded49552796ff8b80c1f4bf8f53ff4f033340522` |
| `native/server-directives-harness-draft-v3.cjs` | `ca3ce00bbd1ebd7b6da81fb2d4fcfc8f683db9f5883d6a294dfd13e7dc6287ff` |
| `native/server-directives.json` | `3d326d1e5f6bdbdcd995b9a33a009b8ac0df435be640f7a581e98a7389a0601d` |
| `native/server-evidence-harness-draft-v1.cjs` | `066f3e75e39e13791a5d667ccd4afd1841974fed5aa4143a43479a85282bdbba` |
| `native/server-evidence.json` | `b1f748d80336cc9d8075c1e8eda766dc4fa96287f200d0441489c2e42c142a48` |
| `native/server-goal-activity-harness-draft-v1.cjs` | `cb6671ad8a9337d6147dad6d6d9e261d369230be1b0990ed89e3c143e6298ddd` |
| `native/server-goal-activity.json` | `1f6098e54c2322e86afa8ea99a56ef2b5d98b75c8cf560b830b04d0268615962` |
| `native/server-goals-harness-draft-v3.cjs` | `d5d6622ab91b05dbda8e6421dc1b71258f113aecb7364d027ba405d54914fb88` |
| `native/server-goals.json` | `de8c75c2f7c7d4a153e7732fddd078f1f198b050492721914a1cfdce03cf0b30` |
| `native/server-home-harness-draft-v1.cjs` | `cbba430061f38fee5f78f165c275f332134417ad67b5407f2f83ce3377a7271a` |
| `native/server-home.json` | `f78f1981ab310f3e3ef82661ccddb9a4934898f10d23f834cb572b1c92597135` |
| `native/server-identity-effects-harness-v4.cjs` | `9261236c85a1c39ed69c95615a1045b2f3e7bc95930ddc29047d22a0e76d4a6f` |
| `native/server-identity-effects.json` | `40ea4bc8dbf14f15aefbe390e4f5daa67059db85da28c8001351ef90735d6111` |
| `native/server-local-owner-bootstrap.json` | `92197c48ca8b7be819aa30df83566a8f9e7a663943ba9e92cba040acb7fa2c80` |
| `native/server-local-owner-harness-v1.cjs` | `1cd4ba2366fcddc59af76abcb1db1853b692e0bb342fedcf610e49c564c5becf` |
| `native/server-readiness-harness-v3.cjs` | `fc6cde7b03311a482b09d008d281349aba6db1f19af72944aaa682c5666658c1` |
| `native/server-readiness.json` | `b49312bd0ba3616a7ba3d376aa83c4e3cc2317a60c15ab40f570e3865cc836e0` |
| `native/server-reallocations-harness-draft-v2.cjs` | `922b96551bbca9d9a2950e82fa4060a8b9891d06dff6ffddbece5813bc073e5e` |
| `native/server-reallocations.json` | `9375d46913230493523a57f094cdc5f31ccc5995060ab3845efa28485d8c98e8` |
| `native/server-request-effects-harness-v3.cjs` | `354110bc87ae24f52b2b3f60774da799a9375430f531cf5308a2a949d9b08afb` |
| `native/server-request-effects.json` | `c11db8310b0fca8325913e3735278aed6ede7b89841c2ef66688b58b5647d66f` |
| `native/server-requests-harness-draft-v1.cjs` | `f55eb8cfab7e77a567c864a6a086311719c4ed481f1001113b1f585ad90c68aa` |
| `native/server-requests.json` | `950b45e0e2515eed7b95f23bc99cba8b10cc95fd70b3744121e932dfed94db51` |
| `native/server-sample-harness-v1.cjs` | `50e14e6eb885c84f0cc713f55b1350a159588bf21bbfd15d896d3624194ed50d` |
| `native/server-sample.json` | `6be80c1ca68dc612b2ed47065c8fee2bf5dccb28c62a9001eaa07c0f3049335b` |
| `native/server-secrets-harness-v1.cjs` | `fc829b455d5ecfc4cb078ac1b03dba37ece04e9e5ab426b2f318b279040e6233` |
| `native/server-secrets.json` | `aca8f6b7ab8fb9e0b027204d1a4e1bbbc9a61da3798ff31798c1f1bea893dd88` |
| `native/server-sessions-harness-draft-v3.cjs` | `b1e26fea521c5c0f9546c6994bcccea0abd508ce207581fb51290a557ff4d5dd` |
| `native/server-sessions.json` | `45ed9fb5a801ce51c6c72cd16fd088b2c50911ffcd3095fcaad7390221219791` |
| `native/server-spend-harness-draft-v2.cjs` | `fb07e202186de4a5723fc7581485af8735341f3103e3375339c393a7bf513040` |
| `native/server-spend.json` | `e45b797963f4a3b0a2421c8762127e9a7cf3a6144fed12c639d1b2bcf221162b` |
| `native/server-startup-harness-v2.cjs` | `5d9067db88fa4595dea7021b17c0abbd2fcf9767802b21ebad2c1a15e1f5a3e6` |
| `native/server-startup.json` | `65d81170d6b5b88135c4b0e49af5fc7e0bb5b8f81877a09bfee49140d80e7b22` |
| `native/server-steering-harness-draft-v2.cjs` | `32da61104b38cb3d84042cefc85640a5346effa085204f247c823529ae679234` |
| `native/server-steering.json` | `952ed86d1a58d98382d7abc1178b129b87e66e99f72bfa4e86502c2559ae5292` |
| `native/server-value-harness-draft-v2.cjs` | `9e489c0595a0b359e4ff67f99bbcdfc43cf381395a0eb8c5cfbc5e29f8e9d45e` |
| `native/server-value.json` | `3f3d9eae38da6525447fd5f05e8eba974c307d41ce94ee6d6e6a9047af8c6232` |
| `native/server-workspace-admission-harness-v1.cjs` | `c26b280b05bd2f6fafb5b724dd49ebdd515dae7aff2ce355223b323cb27bc161` |
| `native/server-workspace-admission.json` | `2e3e673140899926f3440e50c8acb8dc41ea7167e086e3e44381e5a01fcf5084` |
| `native/server-workspaces-harness-v4.cjs` | `e7d93a7d2b7c8eae29ac3c5aa50e23df8a55b870b44a5761c9aaab78a7d80f8a` |
| `native/server-workspaces.json` | `090238d5fe85a4115fbe031b072af19a95d12b495427bedd33c8a372cf556708` |
| `native/share-again-harness.cjs` | `64a28be0a6466ba64eb80b9056e3565cae042f9ac17e65d8449c1a5c54028e92` |
| `native/share-again.json` | `1e5acc246133ed805b11edd04a06260f2e1312505d3ecbdf4f24796fdc744b41` |
| `native/share-notices.json` | `d4b7b6ed11374df36c1fecf3498f56715c73e15308b893f3a028097fbee450cb` |
| `native/shell-harness.cjs` | `33d08adbc1c18495ccffce80d760c153102eec29e2b7999ff4f189b120d9bb0a` |
| `native/shell-words.json` | `20e3b3f83f45fb8166798987ad37870c06477bf31e7febfd4dd48c72800dd0c6` |
| `native/spend-library-harness.cjs` | `32b8314796ecbef053d170dc13425a24c77a868473ed4ca5bce92f2c5cfe0ce9` |
| `native/spend-meter.json` | `9c2eb5b70cba55afc54b330e608167944700566c845634788e1dfdfb6865469c` |
| `native/spend-rounding.json` | `b687fe79eb0e11ae4d69217eef4f2a2bd5c7522cd99e7a7df09615f97ed97406` |
| `native/spend-stream.json` | `8483e0be453d0fc44cd730fedea25bce04b013511efdbcb75ce9036f564eea1a` |
| `native/storage-runtime-harness-v2.cjs` | `0fc1b12cfa2e07b143b0496e796c8ef1268e3f07f44d09b1cdd7ee095dd7db36` |
| `native/storage-runtime.json` | `2b2f811ecc30769e0b168a24b39a7061bdc93a271053d06058ef5fd86efaf539` |
| `native/storage-schema-harness-v4.cjs` | `73d4225deb3701af22f4ea68a98e9b2493fcda8baaf1d5de927ee884d5cee7cb` |
| `native/storage-schema.json` | `03e86ce28624a080dc583836e7b49c849d9f23c80c16c9c260b1ac42cf980164` |
| `native/stream-harness.cjs` | `6736b066696c305c66bdd420c7dd42ad97373b52ed0dc64a7058896ae0c0098b` |
| `native/trust-markdown.json` | `04988d5089cc8ba530bc99a0f9015be5975cdf19e7fdfa1b44069819a53845d9` |
| `native/value-rules-harness.cjs` | `d1f89604f9ae16eb497ba37926e294aaca6b8129f0ef96ff3cdfffe4c4206664` |
| `native/value-rules.json` | `d42bcc4aceb2d3000f1a9d1269f5104cfb2b81a7b04fc3526feea4cedca5270b` |
| `native/wording-harness.cjs` | `3eea4d68bad00ea6d0dda61d033b9a02c1bdad564cabf27783335938b64b27ad` |
| `native/wording.json` | `ef6b4588160fd6c49eb11939201f4e0c385566350496bc565453cb9761e55f19` |
| `packages/align-agent/test/a3cross.test.ts` | `911ab1287c9b7a76b61c7abc703b3b4b5dab17bf55a56795eb632ed46880741b` |
| `packages/align-agent/test/allocation.test.ts` | `a038bde51d54bc77d98f5622221c791e3fe985fae42764b8f4dd610e6a4f2f3d` |
| `packages/align-agent/test/drift-corpus.test.ts` | `3cae043a732796a54a30a282210b51f1a17269f5b769501e383595abc64e8580` |
| `packages/align-agent/test/e2e.test.ts` | `23037735381b846b4445a5225742cc7b858edacd5de995e1e73e55de39ac7f20` |
| `packages/align-agent/test/fake-server.ts` | `5bea2a00050c39ce7cc0da518f335152b7c8764cb6c3a5cedc6b84bd9770c9f6` |
| `packages/align-agent/test/findings.test.ts` | `3fce4fd6b780dccc9c0d5615bde470ccc06d8eb55e27afb1efedbedbfbd900ec` |
| `packages/align-agent/test/findings10.test.ts` | `10e263018055959da4bbac3db332b8fe38f16ea13e7902ee109935455506e381` |
| `packages/align-agent/test/findings11.test.ts` | `02b842d107542716a4ce7922a6c495c10f6d9480a073ddbc5db797030ef93b9c` |
| `packages/align-agent/test/findings12.test.ts` | `fa22e57e4a8852f1053e65c6d02e9a93c3047486b2e8bdd3a2cdfbe557af5535` |
| `packages/align-agent/test/findings13.test.ts` | `2192445651094ed4b218f60afb4bca02d0d2d4a75f70b5f97ce0003be0d90151` |
| `packages/align-agent/test/findings14.test.ts` | `69f13a4fd1843c0c6cb47a629ccdc480c6d2ec7156942aea08cba4498c486c3f` |
| `packages/align-agent/test/findings15.test.ts` | `1ad9b799642b9727ce4ec4f89efc07822263f7683303d3c1cf60e2649ed2e49e` |
| `packages/align-agent/test/findings16.test.ts` | `4c7fdc6792dc98658a7240e38fc119af0973898868e255eda22c19bad3549e90` |
| `packages/align-agent/test/findings17.test.ts` | `095de41ad62899a1f476323983ea567454c73efe3a6656706d9a9911e02aceef` |
| `packages/align-agent/test/findings18.test.ts` | `69d2afc4406d31349bb60de212093986cfa1516a6be9ea4ea8a1f263242ea6cb` |
| `packages/align-agent/test/findings19.test.ts` | `41b53f5c3092728c4a2fadde9e509812ee83ed7eddb5596653192b0dd7e8f2d7` |
| `packages/align-agent/test/findings2.test.ts` | `c1dc94ba4492b7e4aedd271d5a8ff12eafb47c55c9c2e2a888f6fe75b6b4bc15` |
| `packages/align-agent/test/findings20.test.ts` | `a6a859949dda9699427ec2b0f1e656c2cbdb5dcc5da31106a91206ea687eaeee` |
| `packages/align-agent/test/findings3.test.ts` | `338313e3c4054c29ca9d3c6d7cecbf54fce0012c9384721c0fe9df5ad240a4a3` |
| `packages/align-agent/test/findings4.test.ts` | `b8159e99826813a2ea3ee3bc684f9e42ce29fcf5541b455b5c5d2569c7c229d3` |
| `packages/align-agent/test/findings5.test.ts` | `7df260db36c5eec42b8143b4d74bdfae4923c801c082610dc0ffe470af4a4d2a` |
| `packages/align-agent/test/findings6.test.ts` | `278e37af4b936322ff0b91d2573e3f94c529b07b57a4e287d3a2952c5c52ef51` |
| `packages/align-agent/test/findings7.test.ts` | `22f79f5c97b430d194da4f59467a932cf491a1db9499bcf00dd0c96357a9b954` |
| `packages/align-agent/test/findings8.test.ts` | `4247b27effa6b3230e62aea3167b0d10d4a3aa9b8dde61dddaad2d7f741ec412` |
| `packages/align-agent/test/findings9.test.ts` | `efb9bf9c0afbca6a236c66aee3a419d43e93351761fc1f7a5a27b1b113fbd860` |
| `packages/align-agent/test/fixtures/block-net.mjs` | `5931f3562144ae700527e117346089d53342e8cad3f624fb07a65da51fbd2dbf` |
| `packages/align-agent/test/fixtures/drift-replies.json` | `437f457d96b783c3719c49ee7b95ae07efb45000e83114701edae8a1cedad447` |
| `packages/align-agent/test/fixtures/envelope-golden.json` | `5d4da889aa52ba6c4910e76a9f9e4aa746ba337f5f8aa9c2b4c81aabab037bcc` |
| `packages/align-agent/test/helpers.ts` | `937a46621758e40cf4d16995108ef62a09b99c22edfe32b897bebc8eb8786175` |
| `packages/align-agent/test/hooks.test.ts` | `f9bf7228a36ea8f3e627724aecbd0f88637c158492a0aff8794f13b8ee954d3e` |
| `packages/align-agent/test/install.test.ts` | `a4fb235858e45f3653fe0aa881211741561512388b23ca735b4bef29589423a0` |
| `packages/align-agent/test/metering.test.ts` | `eef650fc4491893869efa992c71504add205efa0b608889ee0648886cb5c37c3` |
| `packages/align-agent/test/native.test.ts` | `80265c3e3f113cbf881dab68b9df255089744255f3ffcc9df9cb43480d0ddcd2` |
| `packages/align-agent/test/past.test.ts` | `e931810eb984e7d7fa25a2d87fb4b0283b25166b80b089c08ad6bad7f3e7c40b` |
| `packages/align-agent/test/pod.test.ts` | `d4e0e164d32d0abbc4a61558520820d26b82726af3beaaa64e5e74dfda692e5c` |
| `packages/align-agent/test/requests.test.ts` | `ac2e0bf42e59707de7a386a158048d1284116c7b6ce8aeffa77c9dbea6697103` |
| `packages/align-agent/test/serial/latency.test.ts` | `b887a6d9b568f107980a8fda27a2cacf514208fb4cb0c7b5b4c870c8b26771ef` |
| `packages/align-agent/test/sharestate-property.test.ts` | `2c60b9f228bc4604995610bb227db0efef048a80f59491689d8f599a6012a3ee` |
| `scripts/decision-actions.mjs` | `bece523d305e86e1cfaf41b9e6fa164c6142cba5aba3d4203cea2a0b1a74e692` |
| `scripts/oauth-test-net.mjs` | `7e1ab95f67ea9f0c63355995a5e689f8bbd4e209c4ea3a49d7da8828d6c8d4bd` |
| `scripts/qualified-auth-fixture.mjs` | `544ba40960c3fec73d9d3baf24f50a25d139acdef02bbd22c534aeb8124a4883` |
| `scripts/test-agent-live.mjs` | `44999273eec7e560ef259176ff2a9646ba0fb438307c7bd85ff7f8cfcfb571c9` |
| `scripts/test-all.sh` | `2c5c599223612bb39c1fa928d050814d33c8ab0d32e0746afc2b284f2270cc8a` |
| `scripts/test-auth-ceiling.mjs` | `602117277a7a4aa10ab2d92ae5e8d1f0a100d3ccbd2278c45de7dd8b7f855e4b` |
| `scripts/test-goal-cap.mjs` | `8129afaa508313944c4aac4f407e0218507e0e90551d45a261170cc156272ef1` |
| `scripts/test-image.sh` | `408ecccad7cbce738cdceb9b1af8511eba734fbf72df1b87933162fdb767cf75` |
| `scripts/test-invite-cap.mjs` | `cec53f016a45aa4cac46e9f370575d074e1b5fc23199403ed195f9916bc858fd` |
| `scripts/test-oauth.mjs` | `19fd59cd054c70de346e568fcf66f9e2813c92cc5b9659b25dd0e63b9e25b889` |
| `scripts/test-operator-image.mjs` | `8d59c5974c8f2adabebf5bc08380df24930b57cee958a5a6fc44a8e36f2347f1` |
| `scripts/test-paste-lines.mjs` | `90096580ec721bf55f671a0a9f95aa223a70047019c5b1e8fe10e58523e3414b` |
| `scripts/test-v2.mjs` | `11eda17535be4e1350252f66a9cefb23a1ab883049887c5d04dc06158ce440a2` |

## B29: Documentation and wire contract (17 paths)

Retain contributor documents, current wire and security contracts and explicitly historical documents. Reconcile current obligations with authored contracts. Archive claims do not become current behavior.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `AGENTS.md` | `063098f6cb31bb44c6f8fbea25b3876de7ee1e5f7d00a50dbab506f6415eb7f0` |
| `README.md` | `140e6df67140fd3a3874d25244a5e3e3a1a673ce684d0c9a7c809b360429e922` |
| `SECURITY.md` | `55fc0692f3e863f17fcc6f91e3f037f3100e2086cc89fb035f19c508753c9607` |
| `docs/ALLOCATION_EXPERIMENT.md` | `0bf39a30a9573cd8770db84c520c2ab544cd33213c8d7b79c8fa245186555f5b` |
| `docs/MCP.md` | `8f0672c1645876b2b1c70fdcdab59612b9499e1d6de60ac9d90d3562bf673882` |
| `docs/archive/CAPTURE_CONSENT.md` | `009aa34462c83de4dc68f467df07150bacd3b308f862284738561281c4a06e14` |
| `docs/archive/DEMO_SCRIPT.md` | `70f13a073abf0eda4019a27ee6533acb61610b899fc36b56b65abfca3c88c4d0` |
| `docs/archive/LIVE_REPLAN.md` | `411eaf5c6a8eb466da8ddf3dd681663b9043af0c093889f142a8df6c8d6134ce` |
| `docs/archive/README-v1.md` | `cff5874e198aaa69f20e9c3a6aa668f5c442b17a2d875eec14800d4ecd60a9da` |
| `docs/archive/README.md` | `c33f8a5bae677349c5aef62db5d9cebb0b0930aa5c82b3fd2dffc7b544bc5bb2` |
| `docs/archive/SPRINT_BUILD.md` | `e4b16e111c1172c348047c2bc36dc8fcd99eb5fa13a2bb8d9c402ab2269848ea` |
| `docs/archive/SUBMISSION_CHECKLIST.md` | `278a3ae4f9a12c8d214fa1eeb57714e1479776b0c6c7c33a4aaf1bd14c1ea3d4` |
| `docs/archive/alike/session-b-retrieval.md` | `dce0b355dfaa9293ab29ffc82d393e6ccc2368cecb445ad51703201f018cc8cf` |
| `docs/v2/WIRE.md` | `40fcf3066ccf3a9838ec5fbdba8473fbff86e024012c8b7d4669116ad501b8f5` |
| `packages/align-agent/HARNESS_FACTS.md` | `432d70c6eb5caeaa6b878c37df816e05814f15eac1f4b18bed33133d139fc8e7` |
| `packages/align-agent/README.md` | `3adbd00068364d2d9b47fff94c6d02b074968682a879d1a6cfd62cac5be91c48` |
| `packages/align-connect/README.md` | `de44fe494d20ce931dae712554ec68e5ad7de0d4b242ae503fff1c03f5760936` |

## B30: Repository metadata (3 paths)

Retain ignore files and coding-provider settings as repository metadata. This grants no additional permissions.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `.claude/settings.json` | `11a875b3bd09f097ae1300fbbf6f92c28b6274baded12e48282617d51b0c5abf` |
| `.gitignore` | `55f9dd524ae7bc7fa21477925b30a327474a4d0e86927a626ec882700a0db105` |
| `packages/align-agent/.gitignore` | `bb116829de07bcd02b2cdfb00965db4e9f01e9450d0d74d91947b3073267579b` |

## B31: Admission and operator assembly (3 paths)

Retain narrowly scoped native cache admission and operator assembly as target integration code. These tools run in production preparation and need this explicit retention, source-side security references, full integrity and rollback checks, exact membership and non-root package acceptance. They are not described as test-only.

| Retained path | SHA-256 at proposal |
| --- | --- |
| `native/libraries.json` | `78edf814ff436c867476512048e04a391aff4f1dc770b7ec40d0db84f3b835da` |
| `scripts/native-libraries.mjs` | `a5e79c3c8f7ca2c7bfdb8ce8498d574fa51db08ba9a5d5259ac4fe06c00d7cb5` |
| `scripts/prepare-operator.mjs` | `fa722d1b3077032851aefaadad242287d81b6357f4048f90d75c42fb50af6ecd` |

## Acceptance still required

Record the operator response before changing classification or closure. Preserve path membership and hashes. Review security-relevant retained checks and record their retained locations in the findings file. Finish all documentation before one full application and image acceptance for the combined supporting checkpoint. Keep PR #58 draft. Actual operator security acceptance remains separate.

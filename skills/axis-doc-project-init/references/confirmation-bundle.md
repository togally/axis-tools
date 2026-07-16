# Project Initialization Confirmation Bundle

## Retained schema

```yaml
confirmation_policy:
  mode: single_confirmation
  max_confirmation_rounds: 1
  final_confirmation: false
confirmation_bundle:
  contract_version: "0.2"
  repository: /path/to/repository
  organization:
    id: org_example
    registry: .axis/organizations.yml
  project:
    slug: example-project
    display_name: Example Project
  oss:
    profile: default_current_user
    bucket: null
    prefix: null
  release:
    channel: private_beta
    gate: not_requested
  package:
    outbox_dir: .axis/outbox
  document_language: zh-CN
  required_env:
    - field: endpoint
      name: ALIYUN_OSS_ENDPOINT
      present: false
  source_summary: {}
  warnings: []
  changes: []
  final_confirmation: false
```

The example values are public placeholders. Real organization, project, bucket and prefix values must come from repository evidence, an existing public-safe registry, or the user's approved bundle.

## Summary presentation

Use one compact table containing every decision:

| Group | Field | Proposed value | Source | Change |
| --- | --- | --- | --- | --- |
| Contract | `contract_version` | `0.2` | target protocol | migrate/keep |
| Organization | `organization.id` | resolved value | registry/recommendation | keep/add/change |
| Project | `project.slug` | resolved value | repository evidence | keep/add/change |
| OSS | `oss.profile` | resolved value | registry/recommendation | keep/add/change |
| Release | `release.channel` | `private_beta` | safe default | keep/add/change |
| Storage | `package.outbox_dir` | `.axis/outbox` | Axis convention | keep/add/change |
| Documents | `document_language` | `zh-CN` | convention/user choice | keep/add/change |

Follow it with one grouped environment-name presence summary and one warning list. Do not interleave questions between rows.

## Environment handling

Only environment-variable names and presence booleans enter the bundle. If names are absent from the current process, show a grouped local template such as:

```bash
export ALIYUN_OSS_ENDPOINT='<your-endpoint>'
export ALIYUN_OSS_REGION='<your-region>'
export ALIYUN_OSS_ACCESS_KEY_ID='<your-access-key-id>'
export ALIYUN_OSS_ACCESS_KEY_SECRET='<your-access-key-secret>'
```

Never ask the user to paste the resulting values into chat.

# Shared Subsystems (S3 and Cloudflare R2)

The **Shared Subsystems** tab browses subsystem model JSON in S3 or Cloudflare R2.
Add a bucket in the tab, or configure it through Studio's loopback HTTP API.
Studio lists objects, downloads and validates model previews, then saves the
configuration automatically. There is no confirmation dialog.

## Credentials and permissions

### Amazon S3

Files SDK's S3 adapter runs only in the Bun host. Studio uses the AWS SDK's
credential chain: environment credentials, shared profiles, an active AWS SSO
login, or IAM roles. An optional `profile` chooses a named AWS profile. An
optional `region` overrides the environment/shared AWS configuration.

A browser login to the AWS console is not sufficient. For SSO, first run
`aws sso login --profile <profile>` outside Studio. Desktop applications do not
necessarily inherit environment variables exported in a terminal.

The selected identity needs `s3:ListBucket` on the bucket (optionally restricted
to the configured prefix) and `s3:GetObject` on its model objects. SSE-KMS
objects also require the appropriate KMS decryption permissions. Studio does
not create buckets or upload, modify, or delete S3 objects.

### Cloudflare R2

Select **Cloudflare R2** and provide the bucket name and the 32-character
Cloudflare account ID. The optional **European Union** jurisdiction selects
the account's EU R2 endpoint. Omit it for the default endpoint. Arbitrary custom
endpoints are not accepted.

Provide an R2 S3 API credential pair to Studio's host environment:

```sh
export R2_ACCESS_KEY_ID='<r2-access-key-id>'
export R2_SECRET_ACCESS_KEY='<r2-secret-access-key>'
```

Create the credential pair from a Cloudflare R2 API token with **Object Read
only** access scoped to the intended bucket. This is not the token string used
for Cloudflare's general REST API. A browser login or AWS credentials do not
grant R2 access, and Studio never falls back to AWS credentials for R2.

Restart Studio with the variables available to its host process. R2 sources
do not use `region` or `profile`; the adapter uses the R2 signing region `auto`.
No credential values are accepted through HTTP/RPC or saved in source settings.

### Saved settings

Only bucket configuration is saved in
`~/.principal/remote-model-sources.json`; credentials are never saved or
accepted in the configuration payload.

## Agent HTTP API

The default bridge is `http://127.0.0.1:3045` for release builds and
`http://127.0.0.1:3046` for the `electrobun dev` build (override with
`PRINCIPAL_STUDIO_HTTP_PORT`). These endpoints reject cross-origin browser
requests.

### Configure and open

```sh
curl -fsS http://127.0.0.1:3045/api/model-sources \
  -H 'Content-Type: application/json' \
  -d '{"bucket":"team-models","region":"us-east-1","prefix":"subsystems/","profile":"dev"}'
```

Omitting `provider` defaults to S3, preserving existing configurations.
For S3, only `bucket` is required; `provider: "s3"`, `name`, `region`, `prefix`,
and `profile` are optional.

For R2, send `provider: "r2"`, `bucket`, and `accountId`:

```sh
curl -fsS http://127.0.0.1:3045/api/model-sources \
  -H 'Content-Type: application/json' \
  -d '{"provider":"r2","bucket":"team-models","accountId":"0123456789abcdef0123456789abcdef","prefix":"subsystems/"}'
```

R2 also accepts optional `name`, `prefix`, and `jurisdiction: "eu"`.
The host must already have the R2 credential environment variables above.

Prefixes are literal object key prefixes, not filesystem paths. A prefix
of `subsystems/` excludes keys such as `subsystems-archive/model.json`.

On success, HTTP 201 returns:

```json
{
  "ok": true,
  "source": {
    "id": "s3-...",
    "bucket": "team-models",
    "region": "us-east-1",
    "prefix": "subsystems/",
    "profile": "dev",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "preview": {
    "models": [
      {
        "key": "subsystems/storage.json",
        "title": "Storage",
        "componentCount": 4,
        "trailCount": 2
      }
    ],
    "skipped": 0
  },
  "tabId": "shared-subsystems"
}
```

For S3, the same bucket/prefix/profile updates its existing source rather than
adding a duplicate. For R2, identity includes the provider, account, bucket,
prefix, and jurisdiction. S3 and R2 sources cannot collide, and existing S3
source IDs are unchanged. Saving happens only after at least one valid model preview loads.
Denied reads, missing credentials, empty prefixes, and invalid-only prefixes
leave the saved configuration unchanged. If saving succeeds but opening a
window fails, the response remains successful and includes `openError`.

### Read and open

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/model-sources` | Saved source configurations |
| GET | `/api/model-sources/:id/models?cursor=...` | Paginated model previews |
| GET | `/api/model-sources/:id/model?key=...` | Validated portable model JSON |
| POST | `/api/model-sources/:id/open` | Open the Shared Subsystems tab |
| POST | `/api/model-sources/:id/open?key=...` | Open a read-only model tab |

URL-encode IDs, object keys, and continuation cursors. No HTTP operation writes
to the bucket. Models are not imported into the local model store or exposed
to the local maintenance pipeline.

## Object format and browsing limits

Store each model as a `.json` object with the portable subsystem document
fields (`title`, `description`, `components`, `trails`, optional `$schema`).
Local stored records also work; host metadata is discarded before rendering.
No catalog or special object naming convention is required.

Listing uses 50-object pages and at most five concurrent model downloads.
Non-model JSON and models larger than 5 MiB are skipped with a count in the
preview. Each request scans at most 1,000 objects before returning a cursor;
use a narrow prefix if configuration cannot find a valid preview in that
window. Subsequent pages are loaded explicitly with **Load more**.

Remote models are read-only, including trail ordering. Refresh reloads the
current bucket object. Component declarations and diagrams work without a checkout;
source-code previews require the referenced repository to be registered
locally in Alexandria. The bucket contains the model, not its source code.

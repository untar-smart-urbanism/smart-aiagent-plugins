# External plugins

Third-party and partner plugins that are **not** maintained in this repository.

Add entries to `.marketplace/marketplace.json` under `externalPlugins` using the external source format:

```json
{
  "name": "partner-skill-bundle",
  "description": "Curated skills from a partner SDK repository.",
  "author": { "name": "Partner Inc.", "url": "https://partner.example" },
  "category": "development",
  "platforms": ["claude", "cursor"],
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/partner-org/sdk.git",
    "path": "packages/agent-skills",
    "ref": "main",
    "sha": "<pinned-commit-sha>"
  },
  "strict": false,
  "skills": ["./skill-a", "./skill-b"],
  "homepage": "https://github.com/partner-org/sdk"
}
```

Pin `sha` for reproducible installs. Review external plugins before enabling them in production environments.

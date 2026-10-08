# Git and GitHub

| Item | Value |
| --- | --- |
| Remote named by the mission | `github.com/bvnbasu-otp/otpplatform` |
| Branch inspected | `main` (`git rev-parse --abbrev-ref HEAD`, tracking `origin/main`) |
| SHA inspected | `472be38671da0f408b2c80bda06f9c531d15e209` |
| Previous SHA named in the mission | `a71e7f3f590400c31322dcfcba722b800c4fe305` was not checked out. HEAD was the SHA above. |
| Commit subject | `test: reconcile payment reference allowlist` (2026-10-07) |
| Working tree | Dirty at inspection. This reconstruction did not commit, push, add, or reset. |

## Who operates git

A person commits and a person pushes. No application feature performs `git commit` or `git push`.

After a push to `main`, `.github/workflows/ci-cd.yml` is the workflow that GitHub will run if Actions is enabled. Enablement was not verified. The workflow can run `supabase db push`. That is automation in the YAML. It is not a substitute for knowing whether the hosted database matches the files. See [CI_CD.md](./CI_CD.md).

## What not to do from documentation

Do not commit the canonical docs as part of an unattended agent step unless a person asks. This reconstruction was instructed not to commit.

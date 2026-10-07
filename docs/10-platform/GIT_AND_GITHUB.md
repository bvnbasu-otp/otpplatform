# Git and GitHub

| Item | Value |
| --- | --- |
| Remote named by the mission | `github.com/bvnbasu-otp/otpplatform` |
| Branch inspected | `main` (`git rev-parse --abbrev-ref HEAD`, tracking `origin/main`) |
| SHA inspected | `b7fbcea22273f6045ac0fdd562a278107dcf34b1` |
| Previous SHA named in the mission | `a71e7f3f590400c31322dcfcba722b800c4fe305` was not checked out. HEAD was the SHA above. |
| Commit subject | `test: add feature-local copy coverage` (2026-10-06) |
| Working tree | Dirty at inspection. This reconstruction did not commit, push, add, or reset. |

## Who operates git

A person commits and a person pushes. No application feature performs `git commit` or `git push`.

After a push to `main`, `.github/workflows/ci-cd.yml` is the workflow that GitHub will run if Actions is enabled. Enablement was not verified. The workflow can run `supabase db push`. That is automation in the YAML. It is not a substitute for knowing whether the hosted database matches the files. See [CI_CD.md](./CI_CD.md).

## What not to do from documentation

Do not commit the canonical docs as part of an unattended agent step unless a person asks. This reconstruction was instructed not to commit.

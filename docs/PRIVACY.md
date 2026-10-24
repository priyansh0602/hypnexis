# AccessPath privacy and safety baseline

AccessPath is an assistive aid, not a guarantee of safe passage. Conditions can change between
observations and a route can be wrong. Users must use judgement, obey traffic rules, and avoid
operating a phone while moving unless it is securely mounted and configured for hands-free use.

## Data minimisation

- Collect only the location, heading, evidence metadata, and small privacy-filtered thumbnail
  needed for accessibility state and review.
- Do not upload raw camera frames by default.
- Process face and licence-plate blurring on-device before any image leaves the phone.
- Keep provider attribution and licence metadata with imagery-derived observations.
- Use anonymous authentication where appropriate; request profile information only for routing
  width and safety preferences.

## Consent and controls

The mobile app must show a plain-language consent screen before camera, location, or evidence
upload. It must explain what is collected, why, retention, sharing, attribution, and how to delete
an account or submitted evidence. Consent must be revocable without making basic map viewing
unavailable.

## DPDP Act 2023-aware practices

The implementation will use purpose limitation, data minimisation, notice and consent, access and
deletion workflows, retention limits, least-privilege access, incident logging, and clear contact
details. Legal review is still required before production launch; this document is an engineering
baseline, not legal advice.

## Safety controls

- Grey means “no accessibility data,” never “probably clear.”
- Red segments are avoided in advance where evidence supports it.
- A Last Safe Exit warning is advisory and must identify uncertainty.
- Far-range detections are marked probable until distance and segment projection are reliable.
- The camera copilot includes a mount-safety note and a do-not-operate-while-moving warning.

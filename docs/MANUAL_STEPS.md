# Manual steps log

This file records actions that require the product owner. Statuses are updated only after the
product owner replies `done` and the result is verified locally or in the relevant dashboard.

| ID | Phase | Manual action | Status | Date | Verification |
| --- | --- | --- | --- | --- | --- |
| MS-0001 | 0 | Install standalone Android SDK Platform-Tools (Android Studio is optional), make `adb` available, and connect or confirm a physical Android phone path | done | 2026-10-24 | Product owner confirmed an existing Flutter app runs on the connected phone over USB debugging |
| MS-0002 | 0 | Create a GitHub account/repository for AccessPath and provide the repository URL | done | 2026-10-24 | `origin` is configured and `git ls-remote --heads origin` succeeded; repository currently has no remote commits |
| MS-0003 | 0 | Create an Expo account | done | 2026-10-24 | Product owner confirmed the Expo team dashboard is open for `priyansh0602` |
| MS-0004 | 0 | Enable Android Developer Mode and USB debugging on the primary phone | done | 2026-10-24 | Product owner confirmed USB debugging works for an existing Flutter app |
| MS-0005 | 0 | Install the Expo development client on the primary phone | pending | 2026-10-24 | The dev client opens on the phone |
| MS-0006 | 1 | Create the Supabase project, choose Mumbai/South Asia when offered, and copy keys | pending | 2026-10-24 | Keys are present only in ignored local env files |
| MS-0007 | 2 | Choose the pilot ward/neighbourhood or bounding box | pending | 2026-10-24 | Pilot configuration has a bounded area |
| MS-0008 | 3 | Create a Mapillary developer app and access token | pending | 2026-10-24 | Token is present only in ignored local env files |
| MS-0009 | 4 | Run the Colab/Label Studio labelling workflow and create the hand-verified test set | pending | 2026-10-24 | Test-set manifest and review counts are recorded |
| MS-0010 | 6 | Run the mobile dev build and confirm the live map loads | pending | 2026-10-24 | App shows OSM base map and Grey unverified segments |
| MS-0011 | 8 | Grant camera/location permissions and complete a mounted-phone field test | pending | 2026-10-24 | Test checklist and safety observations are recorded |
| MS-0012 | 11 | Configure EAS free-tier build and choose direct APK/internal distribution | pending | 2026-10-24 | Android artifact is built and its checksum is recorded |

## Latest manual-step notes

- 2026-10-24: Product owner confirmed that an existing Flutter app already runs on the connected
  Android phone over USB debugging. Android Studio is therefore not required for the physical
  device path. The coding container cannot see host-installed Windows executables directly.

## Rules

- Never paste secrets into this file or into Git.
- Every new manual step gets an ID, phase, status, and date before it is requested.
- A blocked manual step stops the phase. The implementation does not proceed by guessing the
  missing account, key, permission, or product choice.

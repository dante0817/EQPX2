# Travel-Time Model Registry

Registry implementation: `src/utils/travelTime/registry.ts`

## Registered & Cataloged Models

| Model ID | Name | Status | Available in GUI | Version / Source | SHA-256 Checksum |
| --- | --- | --- | --- | --- | --- |
| `jb-jbtab` | Jeffreys–Bullen (`JBTAB.PS`) | `operational-legacy` | Yes (Default) | `JBTAB.PS-11.20a` · `public/assets/aistudio/JBTAB_b5700af2.txt` | `b5700af2dc29e5bf5421a99bb850417263040e2009015871ee027c09b9efac95` |
| `iasp91` | iasp91 (Kennett & Engdahl, 1991) | `unavailable` | No (Disabled) | Not installed (`BLOCKED / NOT VERIFIED`) | `null` |
| `ak135` | ak135 (Kennett, Engdahl & Buland, 1995) | `unavailable` | No (Disabled) | Not installed (`BLOCKED / NOT VERIFIED`) | `null` |

## Safety Guarantees

1. `resolveTravelTimeProvider('iasp91')` and `resolveTravelTimeProvider('ak135')` return `{ ok: false, reason }` and **never** fall back silently to `jb-jbtab`.
2. Unimplemented models are shown in the GUI selector with `[Unavailable]` and `disabled` attributes and detailed block rationale in `ModelSettingsModal` and `ModelComparisonModal`.
3. Only actually implemented delay correction profiles (`legacy-eqp-s173` and `none`) are selectable in `ModelSettingsModal`.

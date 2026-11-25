# Security Summary

**Reviewed Files**: 14
**Issues Resolved**: 6

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Missing Access Control | `src/App.tsx` | 50 | Application workspace and ledger data loaded immediately without authentication. | High | Fixed | Added server-verified password lock screen (`server.ts`, `AuthLockScreen.tsx`) with `scrypt` hashing, brute-force rate limiting, and in-memory `Authorization: Bearer` tokens plus inactivity auto-lock. |
| Spreadsheet Formula Injection | `src/utils/ledgerLogic.ts` | 522 | `csvEscape` only escaped double quotes, allowing exported text starting with `=`, `+`, `-`, `@`, tab, or CR to be interpreted as formulas in Excel/Sheets. | Medium | Fixed | Prefixed non-numeric fields starting with formula trigger characters with a leading apostrophe inside quotes. |
| Unvalidated Storage Deserialization | `src/utils/ledgerLogic.ts` | 30 | `loadStoredState` trusted parsed `localStorage` entries without validating sheet keys, day bounds, numeric finiteness, or signer schema. | Medium | Fixed | Added `sanitizeEntry` and `sanitizeState` schema validators applied on storage load, JSON backup restore, and undo history restore. |
| Unsafe Image URI Rendering | `src/components/SignaturePanel.tsx`, `PrintView.tsx`, `canvasExport.ts` | 150 | `signer.image` was bound directly to `<img src>` and `Image.src` without checking the URI scheme or MIME type. | Medium | Fixed | Added `sanitizeImageDataUrl` permitting only raster PNG/JPEG/WEBP base64 data URLs up to 2 MB, blocking `javascript:`, `svg+xml`, and external URLs. |
| Unvalidated Calendar & Numeric Inputs | `src/components/QuickEntryModal.tsx`, `LedgerTable.tsx` | 55, 840 | Non-existent calendar dates (e.g., Feb 31 when defaulting period) and unnormalized Arabic digits or negative/non-finite numbers could silently zero out or create invalid entries. | Low | Fixed | Added `isValidCalendarDate`, `clampDateToPeriod`, Arabic/Persian numeral normalization, non-negative finiteness checks, and `roundQty` decimal rounding. |
| Unbounded File Import Read | `src/App.tsx` | 261 | CSV/JSON file uploads read arbitrarily large files into memory without a size limit. | Low | Fixed | Enforced a 5 MB `MAX_IMPORT_FILE_BYTES` limit before reading uploaded files. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Password Storage & Verification | `server.ts` | Passwords are hashed with a unique 16-byte random salt using `crypto.scryptSync` and verified in constant time via `crypto.timingSafeEqual`. Supports `ADMIN_PASSCODE` server env override declared in `.env.example`. |
| Session Tokens & Brute-Force Protection | `server.ts` | Login issues HMAC-SHA256 signed tokens held strictly in React memory (never stored in `localStorage` or `sessionStorage`), enforces a 60-second cooldown after 5 failed attempts, and revokes tokens on lock/logout or password change. |
| Safe React Rendering | `src/components/*` | All user-supplied names, descriptions, and search queries render via React's default text escaping with no `innerHTML` or `dangerouslySetInnerHTML`. |
| Dependency Security | `package.json`, `bun.lock` | Verified via `bun audit` with 0 known vulnerabilities across 260 checked packages. |

---

## PoC Verification

### 1. CSV Formula Injection Defense

#### Summary
| Field | Value |
|---|---|
| Issue Type | Spreadsheet Formula Injection |
| Impact | Medium |
| Affected File | `src/utils/ledgerLogic.ts:512` |
| Test Scenario | Exporting a beneficiary description containing `=HYPERLINK("https://example.com","click")` |

#### How It Was Fixed
`csvEscape` inspects non-numeric cell values and prepends an apostrophe (`'`) whenever a value begins with `=`, `+`, `-`, `@`, `\t`, or `\r`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Payload arrives in `handleExportSheetCsv` or `BeneficiaryReportModal` CSV export | Passed to `csvEscape` |
| 2 | `csvEscape` (`src/utils/ledgerLogic.ts:514`) checks `/^[=+\-@\t\r]/` on non-number values | Match detected |
| 3 | Output becomes `"'=HYPERLINK(\"\"https://example.com\"\",\"\"click\"\")"` | **Handled Safely** |

#### Conclusion
**Fix Verified** - Spreadsheet applications treat the exported cell strictly as literal text rather than executing a formula.

---

### 2. Unauthenticated Workspace Access & Brute-Force Protection

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Authentication & Login Rate Limiting |
| Impact | High |
| Affected File | `server.ts:207`, `src/App.tsx:64` |
| Test Scenario | Accessing workspace without a valid token, or sending 5 consecutive wrong passwords to `POST /api/auth/login` |

#### How It Was Fixed
`src/App.tsx` gates `AuthenticatedLedgerApp` behind an in-memory `authSession` state verified by `server.ts`, which tracks failed attempts per client IP and enforces a 60-second lockout after 5 failures.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated user opens app or sends `POST /api/auth/change-password` without `Bearer` token | `App.tsx:73` renders `AuthLockScreen`; `server.ts:173` (`requireAuth`) returns HTTP `401` |
| 2 | 5 invalid passwords submitted to `POST /api/auth/login` | `rateLimitMap` in `server.ts:231` records failures and sets `lockedUntil = now + 60000` |
| 3 | 6th attempt arrives before cooldown expires | `server.ts:212` returns HTTP `429` with `retryAfterSeconds` |

#### Conclusion
**Fix Verified** - Workspace UI does not mount without a server-issued session token, and brute-force guessing is throttled on the server.

---

### 3. Unsafe Signature Image URI Rejection

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe URI Rendering in Signature Block |
| Impact | Medium |
| Affected File | `src/utils/ledgerLogic.ts:69` |
| Test Scenario | Injecting `javascript:alert(1)` or `data:image/svg+xml;base64,...` into `signer.image` via tampered `localStorage` or JSON backup |

#### How It Was Fixed
`sanitizeImageDataUrl` strictly validates `signer.image` against a base64 raster image allowlist (`png`, `jpeg`, `jpg`, `webp`) and runs during `loadStoredState`, JSON restore, `SignaturePanel`, `PrintView`, and `canvasExport`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Tampered `signer.image` enters via `localStorage` or JSON restore | Passed to `sanitizeState` -> `sanitizeImageDataUrl` |
| 2 | Regex `/^data:image\/(?:png\|jpeg\|jpg\|webp);base64,[A-Za-z0-9+/=]+$/i` fails to match | Returns `''` |
| 3 | Signature components skip rendering `<img>` when sanitized value is empty | **Handled Safely** |

#### Conclusion
**Fix Verified** - Non-raster and script-capable image URIs are stripped before reaching any DOM `<img>` or Canvas context.

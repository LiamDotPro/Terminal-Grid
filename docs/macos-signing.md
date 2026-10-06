# macOS signing and notarization

How the release workflow signs and notarizes the macOS build so Gatekeeper
opens it without the "cannot be verified" or "is damaged" warnings. Checked
against the Tauri v2 bundler source and the Tauri and Apple docs on 6 October
2026; links at the end.

## What the workflow does

`.github/workflows/release.yml` reads the `APPLE_*` repository secrets in the
"macOS signing credentials" step and passes them to `tauri build`. The Tauri
bundler then:

1. imports the certificate into a temporary keychain,
2. signs the app with hardened runtime,
3. uploads it to Apple's notary service and waits for the result (usually a
   few minutes),
4. staples the notarization ticket to the app and builds the DMG around it.

A later step checks the result with `codesign`, `stapler` and `spctl` and
fails the build if any of them reject it, so a release is never published
with a broken signature.

If `APPLE_CERTIFICATE` is not set, the app is built unsigned as before, the
job logs a warning and the release notes keep the `xattr -cr` instructions.
If the certificate is set but the notarization credentials are not, the job
fails: a signed app that is not notarized is still blocked by Gatekeeper.

## One-time setup

You need a paid Apple Developer Program membership (USD 99 a year,
<https://developer.apple.com/programs/enroll/>). Enrolment as an individual
is usually approved within a day or two.

### 1. Create a Developer ID Application certificate

This has to be **Developer ID Application**. "Apple Development" and "Apple
Distribution" certificates do not work outside the App Store.

1. On a Mac, open Keychain Access > Certificate Assistant > **Request a
   Certificate From a Certificate Authority**. Enter your email, pick
   "Saved to disk" and save the `.certSigningRequest` file.
2. Go to <https://developer.apple.com/account/resources/certificates/add>,
   choose **Developer ID Application**, pick the G2 Sub-CA if asked, and
   upload the request.
3. Download the `.cer` file and double-click it to add it to the login
   keychain.

Only the Account Holder of the team can create Developer ID certificates.

### 2. Export it as a .p12

1. In Keychain Access > login > My Certificates, find
   "Developer ID Application: Your Name (TEAMID)". Expand it and check that a
   private key sits under it. Without one the export will not work and the
   request has to be made again on this Mac.
2. Right-click the certificate (not the key) > **Export**, save as
   `certificate.p12` and set a strong password.
3. Base64-encode it onto the clipboard:

   ```
   base64 -i certificate.p12 | pbcopy
   ```

4. Copy the identity name for later:

   ```
   security find-identity -v -p codesigning
   ```

   It looks like `Developer ID Application: Your Name (ABCDE12345)`. The
   10-character value in brackets is your Team ID.

Keep `certificate.p12` somewhere safe, or delete it once the secret is saved.
Anyone with the file and its password can sign software as you.

### 3. Create notarization credentials

Pick one.

**App Store Connect API key (recommended).** It is not tied to your Apple ID
password or 2FA, and you can revoke it on its own.

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>, open the
   **Team Keys** tab and generate a key with the **Developer** role.
2. Note the **Issuer ID** (top of the page) and the **Key ID**.
3. Download `AuthKey_<KEYID>.p8`. Apple only lets you download it once.

**Apple ID with an app-specific password.**

1. Sign in at <https://account.apple.com>, go to Sign-In and Security >
   **App-Specific Passwords** and generate one.
2. Use it together with your Apple ID email and Team ID.

### 4. Add the repository secrets

On GitHub, go to Settings > Secrets and variables > Actions > **New repository
secret**, or use `gh secret set`:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | The base64 text from step 2 |
| `APPLE_CERTIFICATE_PASSWORD` | The `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | Optional. The identity name from step 2; the build then fails if the certificate does not match it |

Then one of the two notarization sets:

| Secret | Value |
|---|---|
| `APPLE_API_KEY` | Key ID |
| `APPLE_API_ISSUER` | Issuer ID |
| `APPLE_API_PRIVATE_KEY` | The whole contents of the `.p8` file, including the `BEGIN` and `END` lines |

| Secret | Value |
|---|---|
| `APPLE_ID` | Apple ID email |
| `APPLE_PASSWORD` | The app-specific password, not your Apple ID password |
| `APPLE_TEAM_ID` | Team ID |

With the GitHub CLI, from the folder holding the files:

```
base64 -i certificate.p12 | gh secret set APPLE_CERTIFICATE
gh secret set APPLE_CERTIFICATE_PASSWORD
gh secret set APPLE_API_KEY --body ABC123DEFG
gh secret set APPLE_API_ISSUER --body 00000000-0000-0000-0000-000000000000
gh secret set APPLE_API_PRIVATE_KEY < AuthKey_ABC123DEFG.p8
```

`gh secret set NAME` with no value prompts for it, which keeps the password
out of your shell history.

### 5. Test it

Actions > Release > **Run workflow** builds every platform without
releasing. Check that the macOS job logs "Signing, and notarizing with ..."
and that "Verify the macOS signature and notarization" passes. Then download
the `macos` workflow artifact on a Mac, open the DMG and launch the app. It
should open with at most the usual "downloaded from the internet" prompt.

The first notarization for a new team can take much longer than usual,
occasionally hours. Later ones normally take a few minutes.

## Maintenance

- Developer ID certificates last five years. Apps signed before it expires
  keep working, because the notarization ticket carries a secure timestamp.
  Before it expires, create a new certificate and replace `APPLE_CERTIFICATE`
  and `APPLE_CERTIFICATE_PASSWORD`.
- The Apple Developer Program membership has to stay active for new builds to
  be signed and notarized. Releases already shipped keep working.
- If notarization fails, the Tauri log prints the submission ID. Run
  `xcrun notarytool log <id>` with the same credentials to see why.

## Sources

- Tauri, macOS code signing: <https://v2.tauri.app/distribute/sign/macos/>
- Tauri bundler signing source (which env vars it reads):
  <https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/macos/sign.rs>
- Apple, Developer ID: <https://developer.apple.com/developer-id/>
- Apple, notarizing macOS software before distribution:
  <https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>

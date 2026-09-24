Icons: the master is `app-icon.svg`. Regenerate the platform set with
`npm run tauri icon src-tauri/icons/app-icon.svg -o src-tauri/icons` and drop the
generated `android/` and `ios/` folders and `icon.icns` (not shipped). The title
bar mark in `src/components/Chrome.tsx` is a hand-drawn 18px version of the same
grid; keep the two in step.

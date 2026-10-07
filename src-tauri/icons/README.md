Icons: the master is `app-icon.html` (the "Trio" icon from the design project's
`App Icon Final`), a 1024px artboard drawn with CSS 3D transforms. Render it to
the 2048px `app-icon.png` with headless Chrome:

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
      --hide-scrollbars --force-device-scale-factor=2 --default-background-color=00000000 \
      --window-size=1024,1024 --screenshot="$PWD/src-tauri/icons/app-icon.png" \
      "file://$PWD/src-tauri/icons/app-icon.html"

then regenerate the platform set with
`npm run tauri icon src-tauri/icons/app-icon.png -- -o src-tauri/icons` and drop the
generated `android/` and `ios/` folders and `icon.icns` (not shipped). The title
bar mark in `src/components/Chrome.tsx` is a hand-drawn 18px version of the
icon's flat small-size variant; keep the two in step.

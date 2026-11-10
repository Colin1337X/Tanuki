# A look around Tanuki

These are screenshots of the implemented application, not design mockups. Website and setup
captures use isolated local SQLite databases, synthetic accounts/stories and disposable keys.
No production records or provider credentials appear here. Captured 2026-11-10.

## Four ways to feel at home

All themes retain locally hosted **Jua**, the same functionality, keyboard access and saved
theme preferences. Classroom keeps its claymorphic controls. Night is the fourth selectable
theme and is included in responsive and contrast verification.

### Studio — warm paper and forest green

![Studio student workspace with a forest sidebar, sage welcome panel and writing composer](screenshots/studio-workspace.png)

### Classroom — soft clay and playful pastels

![Classroom workspace with molded lavender surfaces, inset fields and pastel inspiration buttons](screenshots/classroom-workspace.png)

### Focus — quiet structure and clear blue accents

![Focus workspace with flat surfaces, restrained borders and a minimal reading-first layout](screenshots/focus-workspace.png)

### Night — navy, warm amber and readable contrast

![Night workspace with navy surfaces, warm light text and amber controls](screenshots/dark-workspace.png)

## The website in use

### Sign in

![Actual Studio sign-in page](screenshots/studio-login.png)

### A library of your own

![Studio library displaying two synthetic stories](screenshots/studio-library.png)

Alternative library treatments: [Classroom](screenshots/classroom-library.png),
[Focus](screenshots/focus-library.png), [Night](screenshots/dark-library.png).

### Read without distraction

![Focus reader displaying the synthetic story The fox who found a star](screenshots/focus-reader.png)

![Night reader displaying the same story](screenshots/night-reader.png)

### Teaching and administration

![Classroom teacher dashboard with three synthetic readers](screenshots/classroom-teacher.png)

![Studio administrator dashboard showing synthetic reading activity](screenshots/studio-admin.png)

### Preferences and the Lexile writing target

The slider sets a writing target, not a certified Lexile measurement. Teacher restrictions
continue to apply regardless of the selected visual theme.

![Preferences dialog with the Lexile slider and theme selector](screenshots/classroom-preferences.png)

### Small screens

<img src="screenshots/classroom-mobile.png" width="390" alt="Full mobile Classroom workspace, including story composer and library">

## Tanuki Server graphical installation

### Native Windows installer

These captures show the actual compiled Inno Setup installer from
[server build 42715785826](https://github.com/Colin1337X/Tanuki/actions/runs/42715785826).
It was installed into the explicitly authorized test directory `E:\proj\tanukitest`, and all
543 installed payload files passed manifest verification. Automatic profile setup was turned
off before finishing; this capture did not provision a production account or expose a server.

![Native Windows installer welcome screen](screenshots/windows-installer-welcome.png)

![Native Windows installer ready to install into the test directory](screenshots/windows-installer-ready.png)

![Native Windows installer after successful installation](screenshots/windows-installer-complete.png)

### Shared graphical setup

The native Windows, macOS and Linux packages launch the same local web-based setup wizard.
The portable bundle's `install.bat` and `install.sh` entry points open it after integrity
verification. These screenshots show that shared wizard, not a macOS package-manager or
Linux desktop dialog. See [installation instructions](RELEASES.md).

### 1. Choose your HTTPS address

![Tanuki Server setup address page](screenshots/server-setup-address.png)

### 2. Create the administrator

The displayed account is synthetic. Password fields remain masked in the screenshot.

![Tanuki Server setup administrator page with masked synthetic password fields](screenshots/server-setup-account.png)

### 3. Review and create the workspace

![Tanuki Server setup review page with a disposable local profile location](screenshots/server-setup-review.png)

### 4. Finish provisioning

![Successful setup with the server-start, HTTPS and recovery checklist](screenshots/server-setup-complete.png)

## Native iOS client

This is the actual app running in the GitHub macOS runner's iPhone simulator, captured by
[the verified mobile build](https://github.com/Colin1337X/Tanuki/actions/runs/42716071897).
It shows the native server picker; the authenticated workspace comes from your HTTPS server.
The candidate IPA is unsigned, and physical-device acceptance is still outstanding.

<img src="screenshots/ios-server-picker.png" width="390" alt="Native iOS Tanuki client asking for an HTTPS server address">

## Refreshing the screenshots

With the development dependencies, Node 24.22.2 and Playwright Chromium installed, run:

```sh
node scripts/capture-docs.mjs
```

The script provisions fresh synthetic fixtures, renders real routes, captures all four themes
and completes actual setup in a disposable profile. It does not call an external AI provider
or reuse your development/production database. Review `docs/screenshots/capture.json` and the
images before committing. Native iOS screenshots are produced separately by the mobile CI job.
Screenshots are examples, not evidence of production readiness or complete accessibility.

## Theme verification

The 2026-11-10 isolated WSL run passed **696 tests, 0 failed, 0 skipped**, including **86 browser
tests**. Night now receives the same login, student, reader and administrator layout checks at
375, 768 and 1440 pixels as the other themes, plus keyboard, reading-text contrast and theme
persistence checks. This does not replace manual assistive-technology or physical-device review.

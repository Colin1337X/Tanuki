#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${TANUKI_APPLE_TEAM:?Set your Apple Developer Team ID}"
: "${TANUKI_EXPORT_OPTIONS:?Set the absolute path to your reviewed Xcode ExportOptions.plist}"
# Uses signing identities already installed in the operator's macOS keychain.
# Never accepts private keys or passwords as command-line arguments.
xcodebuild -project Tanuki.xcodeproj -scheme Tanuki -configuration Release -destination 'generic/platform=iOS' -archivePath build/Tanuki-signed.xcarchive DEVELOPMENT_TEAM="$TANUKI_APPLE_TEAM" archive
xcodebuild -exportArchive -archivePath build/Tanuki-signed.xcarchive -exportPath build/signed -exportOptionsPlist "$TANUKI_EXPORT_OPTIONS"

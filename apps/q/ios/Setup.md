# Q iOS App Setup

## Quick Start

### Option 1: Capacitor (Recommended)

Run these commands in the `apps/q` directory:

```bash
# Install Capacitor
pnpm add @capacitor/core @capacitor/ios @capacitor/camera @capacitor/preferences

# Initialize Capacitor
npx cap init "Q" --app-name "Q" --web-dir ../.svelte-kit/output/client

# Add iOS platform
npx cap add ios

# Open in Xcode
npx cap open ios
```

### Option 2: Manual SwiftUI Wrapper

Create a new iOS project in Xcode:

1. **File → New → Project**
2. Select **iOS → App**
3. Product Name: `Q`
4. Interface: **SwiftUI**
5. Create

Then replace `ContentView.swift` with:

```swift
import SwiftUI
import WebKit
import AVFoundation

struct ContentView: View {
    var body: some View {
        WebView(url: URL(string: "https://your-vercel-url.com")!)
            .ignoresSafeArea()
    }
}

struct WebView: UIViewRepresentable {
    let url: URL
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.load(URLRequest(url: url))
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.load(URLRequest(url: url))
    }
}

@main
struct QApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

### Enable Camera (for QR scanning)

In `Info.plist`, add:

```xml
<key>NSCameraUsageDescription</key>
<string>Q uses the camera for video calls and to scan QR codes.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Q uses the microphone for calls.</string>
```

For calls (ADR-Q-004) the web view must also answer the page's request for
camera and microphone, or iOS asks twice. In the `WKUIDelegate` (iOS 15+):

```swift
func webView(_ webView: WKWebView,
             requestMediaCapturePermissionFor origin: WKSecurityOrigin,
             initiatedByFrame frame: WKFrameInfo,
             type: WKMediaCaptureType,
             decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    // Only Q's own page, never a page it happens to navigate to.
    decisionHandler(origin.host == webView.url?.host ? .grant : .prompt)
}
```

`allowsInlineMediaPlayback = true` (already set) keeps the call inside Q
instead of jumping to the full-screen player.

## Build & Run

1. Select a simulator or device
2. Press **⌘R** to build and run

## Testing QR Verification

1. Run the web app on desktop
2. Navigate to a page that shows a QR code
3. Open Q app on iOS simulator/device
4. The web view should load your app
5. Test QR scanning flow

## Notes

- For local testing, use your machine's local IP instead of localhost
- The web app must be served over HTTPS for camera access on device
- Consider using ngrok or similar for testing on physical device

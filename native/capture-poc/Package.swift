// swift-tools-version: 6.0
// Isolated G1-CAPTURE proof of concept: no Electron, no UI, no network.
// Swift 5 language mode keeps the isolated build free of strict-concurrency
// errors in the ScreenCaptureKit/AVFoundation delegating code; see README.md.
import PackageDescription

let package = Package(
    name: "capture-poc",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "ovc-capture-poc", targets: ["ovc-capture-poc"]),
        .library(name: "OVCCaptureCore", targets: ["OVCCaptureCore"]),
        .library(name: "OVCCaptureLive", targets: ["OVCCaptureLive"])
    ],
    targets: [
        .target(name: "OVCCaptureCore"),
        .target(name: "OVCCaptureLive", dependencies: ["OVCCaptureCore"]),
        .executableTarget(name: "ovc-capture-poc", dependencies: ["OVCCaptureCore", "OVCCaptureLive"]),
        .testTarget(
            name: "OVCCaptureCoreTests",
            dependencies: ["OVCCaptureCore"],
            swiftSettings: [
                .unsafeFlags(["-F/Library/Developer/CommandLineTools/Library/Developer/Frameworks"]),
                .unsafeFlags(["-I/Library/Developer/CommandLineTools/Library/Developer/Frameworks/Testing.framework/Modules"])
            ],
            linkerSettings: [
                .unsafeFlags(["-F/Library/Developer/CommandLineTools/Library/Developer/Frameworks"]),
                .unsafeFlags(["-framework", "Testing"])
            ]
        )
    ],
    swiftLanguageModes: [.v5]
)

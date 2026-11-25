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
        .executable(name: "ovc-click-capture", targets: ["ovc-click-capture"]),
        .library(name: "OVCCaptureCore", targets: ["OVCCaptureCore"]),
        .library(name: "OVCCaptureLive", targets: ["OVCCaptureLive"]),
        .library(name: "OVCClickCaptureCore", targets: ["OVCClickCaptureCore"])
    ],
    targets: [
        .target(name: "OVCCaptureCore"),
        .target(name: "OVCCaptureLive", dependencies: ["OVCCaptureCore"]),
        .target(name: "OVCClickCaptureCore", dependencies: ["OVCCaptureCore"]),
        .executableTarget(name: "ovc-capture-poc", dependencies: ["OVCCaptureCore", "OVCCaptureLive"]),
        .executableTarget(name: "ovc-click-capture", dependencies: ["OVCClickCaptureCore"]),
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
        ),
        .testTarget(
            name: "OVCClickCaptureCoreTests",
            dependencies: ["OVCClickCaptureCore"],
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

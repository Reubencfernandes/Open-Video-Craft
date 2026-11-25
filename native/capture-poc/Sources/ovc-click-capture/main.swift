import CoreGraphics
import CoreMedia
import Foundation
import OVCCaptureCore
import OVCClickCaptureCore

private struct Arguments {
    let options: [String: String]
    let flags: Set<String>

    func option(_ name: String) -> String? { options[name] }
    func has(_ name: String) -> Bool { flags.contains(name) }
}

private enum CLIError: Error, CustomStringConvertible {
    case usage(String)
    case invalidValue(String)

    var description: String {
        switch self {
        case .usage(let message): return message
        case .invalidValue(let message): return message
        }
    }
}

private let usage = """
ovc-click-capture — protocol v1 global click sidecar

Usage:
  ovc-click-capture --duration <seconds> [--display <id>] [--request-permission]

Writes protocol v1 lines to stdout: one display.metrics per active display, one
input.permission verdict, then one input.click per global left click. Requires
Input Monitoring; a missing grant is reported explicitly and exits non-zero.
"""

private func parseArguments(_ argv: [String]) throws -> Arguments {
    var options: [String: String] = [:]
    var flags: Set<String> = []
    var index = 0
    while index < argv.count {
        let token = argv[index]
        guard token.hasPrefix("--") else { throw CLIError.invalidValue("unexpected argument \(token)") }
        let name = String(token.dropFirst(2))
        if ["help", "request-permission"].contains(name) {
            flags.insert(name)
            index += 1
        } else {
            guard index + 1 < argv.count else { throw CLIError.invalidValue("missing value for --\(name)") }
            options[name] = argv[index + 1]
            index += 2
        }
    }
    return Arguments(options: options, flags: flags)
}

/// One sidecar run: owns the writer, so click lines keep a monotonic `seq`.
private final class ClickSession {
    private var writer = ClickProtocolWriter()
    private let displays: [DisplayGeometry]
    private let restrictedDisplayId: String?
    private var nextClickIndex = 0
    private var reportedWriteFailure = false

    init(displays: [DisplayGeometry], restrictedDisplayId: String?) {
        self.displays = displays
        self.restrictedDisplayId = restrictedDisplayId
    }

    func emitDisplays(atHostNs: HostNs) throws {
        for display in displays {
            try emit(try writer.displayMetrics(display, atHostNs: atHostNs))
        }
    }

    func emitPermission(_ status: InputMonitoringStatus, atHostNs: HostNs) throws {
        try emit(try writer.inputPermission(status, atHostNs: atHostNs))
    }

    /// `eventTimestampNs` is the CoreGraphics event timestamp: nanoseconds since
    /// boot, the same basis as the shared host clock, so it is used verbatim.
    func recordClick(eventTimestampNs: UInt64, xPoints: Double, yPoints: Double) {
        guard xPoints.isFinite, yPoints.isFinite else { return }
        guard
            let display = DisplayInventory.displayContaining(
                xPoints: xPoints,
                yPoints: yPoints,
                in: displays
            )
        else { return }
        if let restrictedDisplayId, display.displayId != restrictedDisplayId { return }

        let clickHostNs = HostNs(eventTimestampNs)
        do {
            let line = try writer.inputClick(
                index: nextClickIndex,
                displayId: display.displayId,
                xPoints: xPoints,
                yPoints: yPoints,
                clickHostNs: clickHostNs,
                atHostNs: clickHostNs
            )
            try emit(line)
            nextClickIndex += 1
        } catch {
            reportWriteFailure(error)
        }
    }

    private func emit(_ line: String) throws {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }

    private func reportWriteFailure(_ error: Error) {
        guard !reportedWriteFailure else { return }
        reportedWriteFailure = true
        FileHandle.standardError.write(Data("ovc-click-capture: cannot encode a protocol line: \(error)\n".utf8))
    }
}

private var activeTap: CFMachPort?

private func clickTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if let userInfo {
        let session = Unmanaged<ClickSession>.fromOpaque(userInfo).takeUnretainedValue()
        switch type {
        case .leftMouseDown:
            session.recordClick(
                eventTimestampNs: event.timestamp,
                xPoints: event.location.x,
                yPoints: event.location.y
            )
        case .tapDisabledByTimeout, .tapDisabledByUserInput:
            if let tap = activeTap {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
        default:
            break
        }
    }
    return Unmanaged.passUnretained(event)
}

private func fail(_ message: String, code: Int32) -> Never {
    FileHandle.standardError.write(Data(message.utf8))
    exit(code)
}

do {
    let args = try parseArguments(Array(CommandLine.arguments.dropFirst()))
    if args.has("help") {
        FileHandle.standardOutput.write(Data(usage.utf8))
        exit(0)
    }
    guard
        let durationText = args.option("duration"),
        let duration = Double(durationText),
        duration.isFinite,
        duration > 0
    else {
        throw CLIError.invalidValue("--duration must be a positive number of seconds")
    }

    let clock = HostClockBridge(clock: CMClockGetHostTimeClock())
    let startedAtHostNs = try clock.hostNsNow()
    let displays = DisplayInventory.active()
    let session = ClickSession(displays: displays, restrictedDisplayId: args.option("display"))

    guard !displays.isEmpty else {
        try? session.emitPermission(.unavailable, atHostNs: startedAtHostNs)
        fail(inputDisplayFailureMessage, code: 2)
    }
    try session.emitDisplays(atHostNs: startedAtHostNs)

    let authorization = ClickCaptureGate.authorize(
        using: SystemClickPermission(),
        requestIfNeeded: args.has("request-permission")
    )
    guard authorization == .authorized else {
        try session.emitPermission(.denied, atHostNs: startedAtHostNs)
        fail(inputMonitoringFailureMessage, code: 2)
    }
    try session.emitPermission(.granted, atHostNs: startedAtHostNs)

    let mask = CGEventMask(1) << CGEventType.leftMouseDown.rawValue
    guard
        let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: clickTapCallback,
            userInfo: Unmanaged.passUnretained(session).toOpaque()
        )
    else {
        try session.emitPermission(.unavailable, atHostNs: startedAtHostNs)
        fail(inputTapFailureMessage, code: 3)
    }

    activeTap = tap
    let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)

    let deadline = Date().addingTimeInterval(duration)
    while Date() < deadline {
        CFRunLoopRunInMode(.defaultMode, min(0.25, max(0, deadline.timeIntervalSinceNow)), false)
    }
    exit(0)
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}

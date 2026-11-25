import CoreGraphics
import Foundation

/// The permission surface the global click tap depends on. Injectable so the
/// gate is testable without granting Input Monitoring to a test runner.
public protocol ClickPermissionChecking {
    /// True when Input Monitoring is already granted for this process.
    func preflight() -> Bool
    /// Asks the system once; returns the verdict after asking.
    func request() -> Bool
}

/// Real Input Monitoring checks. `CGRequestListenEventAccess` only prompts once
/// per process registration; a refusal never becomes a silent no-op here.
public struct SystemClickPermission: ClickPermissionChecking {
    public init() {}

    public func preflight() -> Bool {
        CGPreflightListenEventAccess()
    }

    public func request() -> Bool {
        CGRequestListenEventAccess()
    }
}

public enum ClickCaptureAuthorization: Equatable, Sendable {
    case authorized
    case denied
}

/// Decides once, deterministically, whether clicks may be captured at all.
public enum ClickCaptureGate {
    public static func authorize(
        using checker: ClickPermissionChecking,
        requestIfNeeded: Bool
    ) -> ClickCaptureAuthorization {
        if checker.preflight() {
            return .authorized
        }
        guard requestIfNeeded else {
            return .denied
        }
        return checker.request() && checker.preflight() ? .authorized : .denied
    }
}

/// Written to stderr (and paired with a `denied` `input.permission` line) when
/// Input Monitoring is missing, so an empty click stream is never ambiguous.
public let inputMonitoringFailureMessage = """
ovc-click-capture: Input Monitoring permission is not granted.
Enable it in System Settings > Privacy & Security > Input Monitoring for the
host app (or for the terminal that launched this helper), then run again.
No click events were captured.
"""

/// Written to stderr when the session event tap cannot be created at all.
public let inputTapFailureMessage = """
ovc-click-capture: the Input Monitoring event tap could not be created.
No click events were captured.
"""

/// Written to stderr when no active display can be described.
public let inputDisplayFailureMessage = """
ovc-click-capture: no active display was found to normalize clicks against.
No click events were captured.
"""

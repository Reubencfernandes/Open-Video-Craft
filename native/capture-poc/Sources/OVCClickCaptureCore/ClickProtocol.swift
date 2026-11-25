import Foundation
import OVCCaptureCore

/// Input Monitoring verdict reported by the `input.permission` event.
public enum InputMonitoringStatus: String, CaseIterable, Sendable {
    case granted
    case denied
    case notDetermined = "not-determined"
    case unavailable
}

/// Active display bounds in the Quartz global display coordinate space used by
/// `input.click`: **points**, never pixels, with the main display's top-left
/// corner as the origin and y growing downward.
public struct DisplayGeometry: Equatable, Sendable {
    public let displayId: String
    public let originXPoints: Double
    public let originYPoints: Double
    public let widthPoints: Double
    public let heightPoints: Double
    public let scaleFactor: Double
    public let primary: Bool

    public init(
        displayId: String,
        originXPoints: Double,
        originYPoints: Double,
        widthPoints: Double,
        heightPoints: Double,
        scaleFactor: Double,
        primary: Bool
    ) {
        self.displayId = displayId
        self.originXPoints = originXPoints
        self.originYPoints = originYPoints
        self.widthPoints = widthPoints
        self.heightPoints = heightPoints
        self.scaleFactor = scaleFactor
        self.primary = primary
    }

    /// Backing scale of a display from its point and pixel sizes (2 on Retina).
    public static func backingScale(widthPoints: Double, widthPixels: Int) -> Double? {
        guard widthPoints > 0, widthPixels > 0 else { return nil }
        return Double(widthPixels) / widthPoints
    }

    /// True when a global point (points) lies inside these bounds.
    public func contains(xPoints: Double, yPoints: Double) -> Bool {
        xPoints >= originXPoints && xPoints <= originXPoints + widthPoints
            && yPoints >= originYPoints && yPoints <= originYPoints + heightPoints
    }
}

public enum ClickProtocolError: Error, Equatable {
    case invalidEncoding
}

/// Writes one protocol v1 line (no trailing newline) per call. Keys are sorted
/// and every host time is a decimal string, matching `native/protocol/v1`.
public struct ClickProtocolWriter {
    private var sequence: Int

    public init(sequence: Int = 0) {
        self.sequence = sequence
    }

    /// `display.metrics`: bounds every later click is normalized against.
    public mutating func displayMetrics(_ geometry: DisplayGeometry, atHostNs: HostNs) throws -> String {
        try line(
            event: "display.metrics",
            tHostNs: atHostNs,
            fields: [
                "displayId": geometry.displayId,
                "originXPoints": geometry.originXPoints,
                "originYPoints": geometry.originYPoints,
                "widthPoints": geometry.widthPoints,
                "heightPoints": geometry.heightPoints,
                "scaleFactor": geometry.scaleFactor,
                "primary": geometry.primary
            ]
        )
    }

    /// `input.permission`: the explicit Input Monitoring verdict.
    public mutating func inputPermission(_ status: InputMonitoringStatus, atHostNs: HostNs) throws -> String {
        try line(
            event: "input.permission",
            tHostNs: atHostNs,
            fields: ["capability": "input-monitoring", "status": status.rawValue]
        )
    }

    /// `input.click`: one global left click on the shared host clock.
    public mutating func inputClick(
        index: Int,
        displayId: String,
        xPoints: Double,
        yPoints: Double,
        clickHostNs: HostNs,
        atHostNs: HostNs
    ) throws -> String {
        try line(
            event: "input.click",
            tHostNs: atHostNs,
            fields: [
                "clickIndex": index,
                "clickHostNs": serializeHostNs(clickHostNs),
                "button": "left",
                "displayId": displayId,
                "xPoints": xPoints,
                "yPoints": yPoints
            ]
        )
    }

    private mutating func line(event: String, tHostNs: HostNs, fields: [String: Any]) throws -> String {
        var payload: [String: Any] = [
            "v": 1,
            "seq": sequence,
            "tHostNs": serializeHostNs(tHostNs),
            "event": event
        ]
        for (key, value) in fields {
            payload[key] = value
        }
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        guard let text = String(data: data, encoding: .utf8) else {
            throw ClickProtocolError.invalidEncoding
        }
        sequence += 1
        return text
    }
}

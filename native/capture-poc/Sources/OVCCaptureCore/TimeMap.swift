import Foundation

/// Assertion code for an invalid `TimeMap`.
public enum TimeMapIssueCode: String, Codable, Equatable {
    case empty
    case unsorted
    case overlap
    case sourceDuration
    case rateUnmeasured
    case rateOutOfRange
}

public struct TimeMapIssue: Equatable {
    public let code: TimeMapIssueCode
    public let segmentIndex: Int
    public let detail: String

    public init(code: TimeMapIssueCode, segmentIndex: Int, detail: String) {
        self.code = code
        self.segmentIndex = segmentIndex
        self.detail = detail
    }
}

public struct TimeMapError: Error, Equatable {
    public let code: TimeMapIssueCode
    public let detail: String

    public init(code: TimeMapIssueCode, detail: String) {
        self.code = code
        self.detail = detail
    }
}

public struct TimeMapSegment {
    public let sourceStartTicks: Ticks
    public let sourceDurationTicks: Ticks
    public let captureStartTicks: Ticks
    public let rateppm: Int

    public init(sourceStartTicks: Ticks, sourceDurationTicks: Ticks, captureStartTicks: Ticks, rateppm: Int) {
        self.sourceStartTicks = sourceStartTicks
        self.sourceDurationTicks = sourceDurationTicks
        self.captureStartTicks = captureStartTicks
        self.rateppm = rateppm
    }
}

public struct TimeMap {
    public let segments: [TimeMapSegment]
    public let calibrationOffsetTicks: Ticks

    public init(segments: [TimeMapSegment], calibrationOffsetTicks: Ticks) {
        self.segments = segments
        self.calibrationOffsetTicks = calibrationOffsetTicks
    }
}

private let maxAbsoluteRatePpm = 10_000

private func captureDuration(_ segment: TimeMapSegment) throws -> Ticks {
    guard segment.rateppm == 0 else { throw TimeMapError(code: .rateUnmeasured, detail: "rateppm must be 0 until G1 measures drift") }
    return segment.sourceDurationTicks
}

public func validateTimeMap(_ map: TimeMap) -> [TimeMapIssue] {
    var issues: [TimeMapIssue] = []
    if map.segments.isEmpty {
        return [TimeMapIssue(code: .empty, segmentIndex: -1, detail: "no segments")]
    }
    for (index, segment) in map.segments.enumerated() {
        if segment.sourceDurationTicks <= 0 {
            issues.append(TimeMapIssue(code: .sourceDuration, segmentIndex: index, detail: "non-positive source duration"))
        }
        if abs(segment.rateppm) > maxAbsoluteRatePpm {
            issues.append(TimeMapIssue(code: .rateOutOfRange, segmentIndex: index, detail: "rateppm out of range"))
        } else if segment.rateppm != 0 {
            issues.append(TimeMapIssue(code: .rateUnmeasured, segmentIndex: index, detail: "rateppm must be 0 until measured"))
        }
    }
    for index in 1..<map.segments.count {
        let previous = map.segments[index - 1]
        let current = map.segments[index]
        if current.sourceStartTicks < previous.sourceStartTicks {
            issues.append(TimeMapIssue(code: .unsorted, segmentIndex: index, detail: "source start precedes previous"))
        }
        guard let previousDuration = try? captureDuration(previous),
              (try? captureDuration(current)) != nil else { continue }
        let sourceEnd = previous.sourceStartTicks + previousDuration
        if sourceEnd > current.sourceStartTicks {
            issues.append(TimeMapIssue(code: .overlap, segmentIndex: index, detail: "source ranges overlap"))
        }
        let captureEnd = previous.captureStartTicks + previousDuration
        if captureEnd > current.captureStartTicks {
            issues.append(TimeMapIssue(code: .overlap, segmentIndex: index, detail: "capture ranges overlap"))
        }
    }
    return issues
}

public func assertTimeMapValid(_ map: TimeMap) throws {
    let issues = validateTimeMap(map)
    if let first = issues.first {
        throw TimeMapError(code: first.code, detail: first.detail)
    }
}

/// `c(s)`; half-open segments, `K` applied last, `nil` outside every segment.
public func mapSourceToCapture(_ map: TimeMap, _ sourceTicks: Ticks) throws -> Ticks? {
    try assertTimeMapValid(map)
    for segment in map.segments {
        if sourceTicks < segment.sourceStartTicks { return nil }
        let end = segment.sourceStartTicks + segment.sourceDurationTicks
        if sourceTicks >= end { continue }
        let delta = sourceTicks - segment.sourceStartTicks
        return segment.captureStartTicks + delta + map.calibrationOffsetTicks
    }
    return nil
}

/// `s(c)`; `nil` for pauses and device gaps, never an invented sample.
public func mapCaptureToSource(_ map: TimeMap, _ captureTicks: Ticks) throws -> Ticks? {
    try assertTimeMapValid(map)
    let local = captureTicks - map.calibrationOffsetTicks
    for segment in map.segments {
        if local < segment.captureStartTicks { return nil }
        if local >= segment.captureStartTicks + segment.sourceDurationTicks { continue }
        return segment.sourceStartTicks + (local - segment.captureStartTicks)
    }
    return nil
}

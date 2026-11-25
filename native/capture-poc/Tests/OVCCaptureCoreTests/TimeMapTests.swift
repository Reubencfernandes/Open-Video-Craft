import Testing
import OVCCaptureCore

private func baseMap(calibration: Ticks = 0) -> TimeMap {
    TimeMap(
        segments: [
            TimeMapSegment(sourceStartTicks: 0, sourceDurationTicks: 7_056_000, captureStartTicks: 12, rateppm: 0),
            TimeMapSegment(
                sourceStartTicks: 7_668_000,
                sourceDurationTicks: 7_056_000,
                captureStartTicks: 7_080_000,
                rateppm: 0
            )
        ],
        calibrationOffsetTicks: calibration
    )
}

@Test func mappingAppliesOffsetJumpAndCalibrationLast() throws {
    let map = baseMap()
    #expect(validateTimeMap(map).isEmpty)
    #expect(try mapSourceToCapture(map, 0) == 12)
    #expect(try mapSourceToCapture(map, 3_528_000) == 3_528_012)
    #expect(try mapSourceToCapture(map, 7_668_000) == 7_080_000)

    let calibrated = baseMap(calibration: -2_500)
    #expect(try mapSourceToCapture(calibrated, 0) == -2_488)
    #expect(try mapSourceToCapture(calibrated, 7_668_000) == 7_077_500)
    #expect(try mapCaptureToSource(calibrated, 7_077_500) == 7_668_000)
}

@Test func segmentsAreHalfOpenAndGapsMapToNil() throws {
    let map = TimeMap(
        segments: [
            TimeMapSegment(sourceStartTicks: 0, sourceDurationTicks: 1_000, captureStartTicks: 0, rateppm: 0),
            TimeMapSegment(sourceStartTicks: 10_000, sourceDurationTicks: 1_000, captureStartTicks: 40_000, rateppm: 0)
        ],
        calibrationOffsetTicks: 0
    )
    #expect(try mapSourceToCapture(map, 1_000) == nil)
    #expect(try mapSourceToCapture(map, 4_999) == nil)
    #expect(try mapSourceToCapture(map, 11_000) == nil)
    #expect(try mapCaptureToSource(map, 20_000) == nil)
    #expect(try mapCaptureToSource(map, 40_000) == 10_000)
    #expect(try mapCaptureToSource(map, 41_000) == nil)
}

@Test func overlapAndUnsortedSegmentsAreRejected() {
    let overlapping = TimeMap(
        segments: [
            TimeMapSegment(sourceStartTicks: 0, sourceDurationTicks: 1_000, captureStartTicks: 0, rateppm: 0),
            TimeMapSegment(sourceStartTicks: 500, sourceDurationTicks: 1_000, captureStartTicks: 1_000, rateppm: 0)
        ],
        calibrationOffsetTicks: 0
    )
    #expect(validateTimeMap(overlapping).map(\.code) == [.overlap])
    #expect(throws: (any Error).self) { try assertTimeMapValid(overlapping) }

    let unsorted = TimeMap(
        segments: [
            TimeMapSegment(sourceStartTicks: 5_000, sourceDurationTicks: 1_000, captureStartTicks: 9_000, rateppm: 0),
            TimeMapSegment(sourceStartTicks: 0, sourceDurationTicks: 1_000, captureStartTicks: 0, rateppm: 0)
        ],
        calibrationOffsetTicks: 0
    )
    #expect(validateTimeMap(unsorted).first?.code == .unsorted)
}

@Test func ratePpmMustStayZeroUntilDriftIsMeasured() throws {
    let drifting = TimeMap(
        segments: [
            TimeMapSegment(sourceStartTicks: 0, sourceDurationTicks: 1_000, captureStartTicks: 0, rateppm: 20)
        ],
        calibrationOffsetTicks: 0
    )
    #expect(validateTimeMap(drifting).map(\.code) == [.rateUnmeasured])
    #expect(throws: (any Error).self) { try mapSourceToCapture(drifting, 500) }

    let empty = TimeMap(segments: [], calibrationOffsetTicks: 0)
    #expect(validateTimeMap(empty).map(\.code) == [.empty])
}

@Test func manifestSegmentsFeedTheTimeMapWithoutPauses() throws {
    let map = TimeMap(segments: [
        TimeMapSegment(sourceStartTicks: 0, sourceDurationTicks: 2_116_800_000, captureStartTicks: 352_800_000, rateppm: 0),
        TimeMapSegment(
            sourceStartTicks: 2_116_800_000,
            sourceDurationTicks: 2_116_800_000,
            captureStartTicks: 3_880_800_000,
            rateppm: 0
        )
    ], calibrationOffsetTicks: 0)
    #expect(validateTimeMap(map).isEmpty)
    #expect(try mapCaptureToSource(map, 1_411_200_000) == 1_058_400_000)
    #expect(try mapCaptureToSource(map, 3_175_200_000) == nil)
}

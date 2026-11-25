import CoreMedia
import Testing
import OVCCaptureCore

@Test func cmTimeValueConvertsToHostNsWithTheTimescale() throws {
    #expect(try hostNsFrom(value: 1_000_000_000, timescale: 1_000_000_000) == 1_000_000_000)
    #expect(try hostNsFrom(value: 3, timescale: 1) == 3_000_000_000)
    #expect(try hostNsFrom(value: 1, timescale: 3) == 333_333_333)
    #expect(try hostNsFrom(value: 0, timescale: 48_000) == 0)
    #expect(throws: (any Error).self) { try hostNsFrom(value: 1, timescale: 0) }
    #expect(throws: (any Error).self) { try hostNsFrom(value: 1, timescale: -1) }
}

@Test func cmTimeConvertsThroughTheSamePath() throws {
    let time = CMTime(value: 2_500, timescale: 1_000)
    #expect(try hostNs(from: time) == 2_500_000_000)
    #expect(throws: (any Error).self) { try hostNs(from: CMTime.invalid) }
}

@Test func anchorIsTheEarliestTrackStart() throws {
    let anchor = try HostClockAnchor.earliest([3_000, 1_500, 7_000])
    #expect(anchor.hostNs == 1_500)
    #expect(try anchor.captureTicks(at: 1_500) == 0)
    #expect(try anchor.captureTicks(at: 1_500 + 1_000_000_000) == ticksPerSecond)
    #expect(throws: (any Error).self) { try HostClockAnchor.earliest([]) }
    #expect(throws: (any Error).self) { try HostClockAnchor.earliest([5_000]).captureTicks(at: 4_999) }
}

@Test func hostClockBridgeConvertsTheSystemClockMonotonically() throws {
    let bridge = HostClockBridge(clock: CMClockGetHostTimeClock())
    let first = try bridge.hostNsNow()
    let second = try bridge.hostNsNow()
    #expect(first > 0)
    #expect(second >= first)
}

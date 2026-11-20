import CoreMedia
import XCTest
import OVCCaptureCore

final class HostClockTests: XCTestCase {
    func testCMTimeValueConvertsToHostNsWithTheTimescale() throws {
        XCTAssertEqual(try hostNsFrom(value: 1_000_000_000, timescale: 1_000_000_000), 1_000_000_000)
        XCTAssertEqual(try hostNsFrom(value: 3, timescale: 1), 3_000_000_000)
        XCTAssertEqual(try hostNsFrom(value: 1, timescale: 3), 333_333_333)
        XCTAssertEqual(try hostNsFrom(value: 0, timescale: 48_000), 0)
        XCTAssertThrowsError(try hostNsFrom(value: 1, timescale: 0))
        XCTAssertThrowsError(try hostNsFrom(value: 1, timescale: -1))
    }

    func testCMTimeConvertsThroughTheSamePath() throws {
        let time = CMTime(value: 2_500, timescale: 1_000)
        XCTAssertEqual(try hostNs(from: time), 2_500_000_000)
        XCTAssertThrowsError(try hostNs(from: CMTime.invalid))
    }

    func testAnchorIsTheEarliestTrackStart() throws {
        let anchor = try HostClockAnchor.earliest([3_000, 1_500, 7_000])
        XCTAssertEqual(anchor.hostNs, 1_500)
        XCTAssertEqual(try anchor.captureTicks(at: 1_500), 0)
        XCTAssertEqual(try anchor.captureTicks(at: 1_500 + 1_000_000_000), ticksPerSecond)
        XCTAssertThrowsError(try HostClockAnchor.earliest([]))
        XCTAssertThrowsError(try HostClockAnchor.earliest([5_000]).captureTicks(at: 4_999))
    }

    func testHostClockBridgeConvertsTheSystemClockMonotonically() throws {
        let bridge = HostClockBridge(clock: CMClockGetHostTimeClock())
        let first = try bridge.hostNsNow()
        let second = try bridge.hostNsNow()
        XCTAssertGreaterThan(first, 0)
        XCTAssertGreaterThanOrEqual(second, first)
    }
}

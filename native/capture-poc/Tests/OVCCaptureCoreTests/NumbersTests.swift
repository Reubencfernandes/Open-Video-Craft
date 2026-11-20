import XCTest
import OVCCaptureCore

final class NumbersTests: XCTestCase {
    func testDivRoundRoundsHalfTowardPositiveInfinity() {
        XCTAssertEqual(divRound(1, 2), 1)
        XCTAssertEqual(divRound(-1, 2), 0)
        XCTAssertEqual(divRound(3, 2), 2)
        XCTAssertEqual(divRound(-3, 2), -1)
        XCTAssertEqual(divRound(7, 3), 2)
        XCTAssertEqual(divRound(-7, 3), -2)
        XCTAssertEqual(divRound(0, 5), 0)
        XCTAssertEqual(divRound(705_600_000, 705_600_000), 1)
    }

    func testHostNsToTicksUsesTheExact441Over625Formula() throws {
        XCTAssertEqual(try hostNsToTicks(0), 0)
        XCTAssertEqual(try hostNsToTicks(1), 1)
        XCTAssertEqual(try hostNsToTicks(2), 1)
        XCTAssertEqual(try hostNsToTicks(1_000_000_000), ticksPerSecond)
        XCTAssertEqual(try hostNsToTicks(3_600_000_000_000), 3_600 * ticksPerSecond)
        XCTAssertEqual(try hostNsDeltaToTicks(-1_000_000_000), -ticksPerSecond)
    }

    func testTickMicrosRoundTripWithinHalfAMicrosecond() throws {
        XCTAssertEqual(try ticksToMicros(ticksPerSecond), 1_000_000)
        XCTAssertEqual(try microsToTicks(1_000_000), ticksPerSecond)
        for ticks: Ticks in [1, 1_234_567, 2_540_160_000_000, -987_654_321] {
            let roundTrip = try microsToTicks(ticksToMicros(ticks))
            XCTAssertLessThanOrEqual(abs(roundTrip - ticks), 353)
        }
    }

    func testHostNsDecimalStringsSurviveValuesAboveTwoToThe53() throws {
        let above = "9007199254740993"
        let parsed = try parseHostNs(above)
        XCTAssertEqual(parsed, 9_007_199_254_740_993)
        XCTAssertEqual(serializeHostNs(parsed), above)
        XCTAssertEqual(serializeHostNs(0), "0")
        for invalid in ["", " 1", "1 ", "1.0", "1e9", "+1", "0x10", "abc", "1_000"] {
            XCTAssertThrowsError(try parseHostNs(invalid), "expected \(invalid) to be rejected")
        }
    }

    func testSecondsToHostNsUsesOnlyIntegerArithmetic() throws {
        XCTAssertEqual(try hostNsFromSeconds(5), 5_000_000_000)
        XCTAssertEqual(try hostNsFromSeconds(0.001), 1_000_000)
        XCTAssertEqual(try hostNsFromSeconds(1.5), 1_500_000_000)
        XCTAssertThrowsError(try hostNsFromSeconds(-1))
    }
}

import Testing
import OVCCaptureCore

@Test func divRoundRoundsHalfTowardPositiveInfinity() {
    #expect(divRound(1, 2) == 1)
    #expect(divRound(-1, 2) == 0)
    #expect(divRound(3, 2) == 2)
    #expect(divRound(-3, 2) == -1)
    #expect(divRound(7, 3) == 2)
    #expect(divRound(-7, 3) == -2)
    #expect(divRound(0, 5) == 0)
    #expect(divRound(705_600_000, 705_600_000) == 1)
}

@Test func hostNsToTicksUsesTheExact441Over625Formula() throws {
    #expect(try hostNsToTicks(0) == 0)
    #expect(try hostNsToTicks(1) == 1)
    #expect(try hostNsToTicks(2) == 1)
    #expect(try hostNsToTicks(1_000_000_000) == ticksPerSecond)
    #expect(try hostNsToTicks(3_600_000_000_000) == 3_600 * ticksPerSecond)
    #expect(try hostNsDeltaToTicks(-1_000_000_000) == -ticksPerSecond)
}

@Test func tickMicrosRoundTripWithinHalfAMicrosecond() throws {
    #expect(try ticksToMicros(ticksPerSecond) == 1_000_000)
    #expect(try microsToTicks(1_000_000) == ticksPerSecond)
    for ticks: Ticks in [1, 1_234_567, 2_540_160_000_000, -987_654_321] {
        let roundTrip = try microsToTicks(ticksToMicros(ticks))
        #expect(abs(roundTrip - ticks) <= 353)
    }
}

@Test func hostNsDecimalStringsSurviveValuesAboveTwoToThe53() throws {
    let above = "9007199254740993"
    let parsed = try parseHostNs(above)
    #expect(parsed == 9_007_199_254_740_993)
    #expect(serializeHostNs(parsed) == above)
    #expect(serializeHostNs(0) == "0")
    for invalid in ["", " 1", "1 ", "1.0", "1e9", "+1", "0x10", "abc", "1_000"] {
        #expect(throws: (any Error).self) { try parseHostNs(invalid) }
    }
}

@Test func secondsToHostNsUsesOnlyIntegerArithmetic() throws {
    #expect(try hostNsFromSeconds(5) == 5_000_000_000)
    #expect(try hostNsFromSeconds(0.001) == 1_000_000)
    #expect(try hostNsFromSeconds(1.5) == 1_500_000_000)
    #expect(throws: (any Error).self) { try hostNsFromSeconds(-1) }
}

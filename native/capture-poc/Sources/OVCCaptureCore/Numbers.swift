import CoreMedia
import Foundation

/// Ticks in the 705,600,000 Hz media timebase (`DATA_MODEL.md` §2).
public typealias Ticks = Int64

/// Integer microseconds; only ever used at the WebCodecs boundary.
public typealias Micros = Int64

/// Nanoseconds of the capture host clock; a decimal string in JSON.
public typealias HostNs = UInt64

public let ticksPerSecond: Ticks = 705_600_000

/// One nanosecond is 441/625 tick (0.7056).
private let hostNumerator: Int64 = 441
private let hostDenominator: Int64 = 625

/// One microsecond is 3528/5 ticks (705.6).
private let microsNumerator: Int64 = 3528
private let microsDenominator: Int64 = 5

private let nanosecondsPerSecond: Int64 = 1_000_000_000

private func floorDiv(_ numerator: Int64, _ denominator: Int64) -> Int64 {
    precondition(denominator > 0)
    let quotient = numerator / denominator
    let remainder = numerator % denominator
    if remainder < 0 {
        return quotient - 1
    }
    return quotient
}

/// `divRound(x, d) = floorDiv(2x + d, 2d)`, rounding halves toward +∞.
public func divRound(_ numerator: Int64, _ denominator: Int64) -> Int64 {
    precondition(denominator > 0)
    return floorDiv(
        numerator.multipliedReportingOverflow(by: 2).partialValue
            .addingReportingOverflow(denominator).partialValue,
        denominator.multipliedReportingOverflow(by: 2).partialValue
    )
}

public enum CaptureArithmeticError: Error, Equatable {
    case overflow
    case invalidTimescale
    case invalidHostNs(String)
    case negativeSeconds
    case invalidCMTime
}

/// Boundary 1: `ticks = divRound(hostNs · 441, 625)` from an absolute delta.
public func hostNsToTicks(_ hostNs: HostNs) throws -> Ticks {
    let signed = try int64(hostNs)
    let (product, overflow) = signed.multipliedReportingOverflow(by: hostNumerator)
    guard !overflow else { throw CaptureArithmeticError.overflow }
    return divRound(product, hostDenominator)
}

public func hostNsDeltaToTicks(_ delta: Int64) throws -> Ticks {
    let (product, overflow) = delta.multipliedReportingOverflow(by: hostNumerator)
    guard !overflow else { throw CaptureArithmeticError.overflow }
    return divRound(product, hostDenominator)
}

/// Boundary 3: ticks → microseconds for WebCodecs.
public func ticksToMicros(_ ticks: Ticks) throws -> Micros {
    let (product, overflow) = ticks.multipliedReportingOverflow(by: microsDenominator)
    guard !overflow else { throw CaptureArithmeticError.overflow }
    return divRound(product, microsNumerator)
}

/// Boundary 3b: microseconds → ticks.
public func microsToTicks(_ micros: Micros) throws -> Ticks {
    let (product, overflow) = micros.multipliedReportingOverflow(by: microsNumerator)
    guard !overflow else { throw CaptureArithmeticError.overflow }
    return divRound(product, microsDenominator)
}

private func int64(_ value: HostNs) throws -> Int64 {
    guard value <= UInt64(Int64.max) else { throw CaptureArithmeticError.overflow }
    return Int64(value)
}

let hostNsDecimalPattern = try! NSRegularExpression(pattern: "^[0-9]+$")

public func parseHostNs(_ text: String) throws -> HostNs {
    let range = NSRange(text.startIndex..., in: text)
    guard hostNsDecimalPattern.firstMatch(in: text, range: range) != nil,
          let value = HostNs(text) else {
        throw CaptureArithmeticError.invalidHostNs(text)
    }
    return value
}

public func serializeHostNs(_ value: HostNs) -> String {
    String(value)
}

public func hostNsFrom(value: Int64, timescale: Int32) throws -> HostNs {
    guard timescale > 0 else { throw CaptureArithmeticError.invalidTimescale }
    let scaled = value.multipliedReportingOverflow(by: nanosecondsPerSecond)
    guard !scaled.overflow else { throw CaptureArithmeticError.overflow }
    let nanos = divRound(scaled.partialValue, Int64(timescale))
    guard nanos >= 0 else { throw CaptureArithmeticError.overflow }
    return HostNs(nanos)
}

public func hostNs(from time: CMTime) throws -> HostNs {
    guard time.isValid, time.timescale > 0 else { throw CaptureArithmeticError.invalidCMTime }
    return try hostNsFrom(value: time.value, timescale: time.timescale)
}

public func hostNsFromSeconds(_ seconds: Double) throws -> HostNs {
    guard seconds.isFinite, seconds >= 0 else { throw CaptureArithmeticError.negativeSeconds }
    let nanos = seconds * Double(nanosecondsPerSecond)
    guard nanos <= Double(UInt64.max) else { throw CaptureArithmeticError.overflow }
    return HostNs(nanos.rounded())
}

/// Converts a CMTime from a source clock onto the shared host clock.
public func hostNs(from time: CMTime, sourceClock: CMClock, hostClock: CMClock) throws -> HostNs {
    let converted = CMSyncConvertTime(time, from: sourceClock, to: hostClock)
    return try hostNs(from: converted)
}

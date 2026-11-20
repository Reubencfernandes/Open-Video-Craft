import CoreMedia
import Foundation

/// Single shared host-clock anchor for all tracks of one capture session.
public struct HostClockAnchor {
    public let hostNs: HostNs

    public init(hostNs: HostNs) {
        self.hostNs = hostNs
    }

    /// The earliest first sample wins: no track starts before the anchor.
    public static func earliest(_ starts: [HostNs]) throws -> HostClockAnchor {
        guard let first = starts.min() else {
            throw CaptureArithmeticError.invalidHostNs("empty anchor candidate list")
        }
        return HostClockAnchor(hostNs: first)
    }

    /// Anchor-relative capture time in ticks; `c` keeps advancing during pauses.
    public func captureTicks(at absoluteHostNs: HostNs) throws -> Ticks {
        guard absoluteHostNs >= hostNs else { throw CaptureArithmeticError.overflow }
        return try hostNsDeltaToTicks(Int64(absoluteHostNs - hostNs))
    }
}

/// Reads the host clock monotonically and converts CMTime values onto it.
public final class HostClockBridge {
    public let clock: CMClock

    public init(clock: CMClock) {
        self.clock = clock
    }

    public func hostNsNow() throws -> HostNs {
        let now = CMClockGetTime(clock)
        return try OVCCaptureCore.hostNs(from: now)
    }

    public func hostNs(from time: CMTime, sourceClock: CMClock) throws -> HostNs {
        let converted = CMSyncConvertTime(time, from: sourceClock, to: clock)
        return try OVCCaptureCore.hostNs(from: converted)
    }
}

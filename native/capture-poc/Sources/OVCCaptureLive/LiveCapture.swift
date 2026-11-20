import AVFoundation
import CoreMedia
import Foundation
import OVCCaptureCore
import ScreenCaptureKit
import VideoToolbox

/// Live capture surface. The dry-run path never constructs any of these
/// objects, so enumeration and recording require the host app's TCC grants.
public enum LiveCapturePlan {
    case screen(stream: SCStream, configuration: SCStreamConfiguration)
    case camera(session: AVCaptureSession, device: AVCaptureDevice)
    case writer(AVAssetWriter)

    /// Hardware encoder required by G1: this throws when only software is available.
    public static func requireHardwareEncoder(codec: CMVideoCodecType) throws -> VTCompressionSession {
        var session: VTCompressionSession?
        let status = VTCompressionSessionCreate(
            allocator: nil,
            width: 1_920,
            height: 1_080,
            codecType: codec,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: nil,
            refcon: nil,
            compressionSessionOut: &session
        )
        guard status == noErr, let created = session else {
            throw LiveCaptureError.hardwareEncoderUnavailable(Int(status))
        }
        return created
    }
}

public enum LiveCaptureError: Error {
    case hardwareEncoderUnavailable(Int)
    case unsupportedSystemAudio(String)
}

/// Resolves a CoreMedia timestamp onto the shared host clock using the exact
/// bridge used by every track, so no source carries a private clock origin.
public func synchronizedHostNs(
    of time: CMTime,
    sourceClock: CMClock,
    bridge: HostClockBridge
) throws -> HostNs {
    try bridge.hostNs(from: time, sourceClock: sourceClock)
}

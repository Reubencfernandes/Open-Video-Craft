import Foundation
import OVCCaptureCore
import OVCCaptureLive

private struct Arguments {
    let command: String
    let options: [String: String]
    let flags: Set<String>

    func option(_ name: String) -> String? { options[name] }
    func has(_ name: String) -> Bool { flags.contains(name) }
}

private enum CLIError: Error, CustomStringConvertible {
    case usage(String)
    case invalidValue(String)

    var description: String {
        switch self {
        case .usage(let message): return message
        case .invalidValue(let message): return message
        }
    }
}

private let usage = """
ovc-capture-poc — G1-CAPTURE protocol v1 harness

Usage:
  ovc-capture-poc list
  ovc-capture-poc record --display all --camera <id>,<id> --mic <id> \\
      --system-audio sck|tap --codec hevc|h264 --fps 30|60 \\
      --duration <seconds> --out <dir> [--pause-at <s>:<s>] --dry-run
  ovc-capture-poc recover --out <dir>
"""

private func parseArguments(_ argv: [String]) throws -> Arguments {
    guard let command = argv.first else { throw CLIError.usage(usage) }
    var options: [String: String] = [:]
    var flags: Set<String> = []
    var index = 1
    while index < argv.count {
        let token = argv[index]
        if token.hasPrefix("--") {
            let name = String(token.dropFirst(2))
            if ["dry-run", "help"].contains(name) {
                flags.insert(name)
                index += 1
            } else {
                guard index + 1 < argv.count else { throw CLIError.invalidValue("missing value for --\(name)") }
                options[name] = argv[index + 1]
                index += 2
            }
        } else {
            throw CLIError.invalidValue("unexpected argument \(token)")
        }
    }
    return Arguments(command: command, options: options, flags: flags)
}

private struct EventWriter {
    private let encoder: JSONEncoder
    private var sequence = 0

    init() {
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    }

    mutating func emit(
        event: String,
        sessionId: String? = nil,
        engine: String? = nil,
        clockDomain: String? = nil,
        anchorHostNs: String? = nil,
        mode: String? = nil,
        codec: String? = nil,
        fps: Int? = nil,
        durationSeconds: Int? = nil,
        out: String? = nil,
        displays: [String]? = nil,
        cameras: [String]? = nil,
        microphones: [String]? = nil,
        systemAudio: String? = nil,
        source: String? = nil,
        elapsedSeconds: Int? = nil,
        trackId: String? = nil,
        framesWritten: Int? = nil,
        framesDropped: Int? = nil,
        firstPtsHostNs: String? = nil,
        lastPtsHostNs: String? = nil,
        file: String? = nil,
        pauseIndex: Int? = nil,
        startHostNs: String? = nil,
        endHostNs: String? = nil,
        endedAtHostNs: String? = nil,
        manifestPath: String? = nil,
        trackIds: [String]? = nil,
        status: String? = nil,
        reason: String? = nil
    ) throws {
        var fields: [String: Any] = [
            "v": 1,
            "seq": sequence,
            "tHostNs": serializeHostNs(try hostNsFromSeconds(0)),
            "event": event
        ]
        let optional: [String: Any?] = [
            "sessionId": sessionId, "engine": engine, "clockDomain": clockDomain,
            "anchorHostNs": anchorHostNs, "mode": mode, "codec": codec, "fps": fps,
            "durationSeconds": durationSeconds, "out": out, "displays": displays,
            "cameras": cameras, "microphones": microphones, "systemAudio": systemAudio,
            "source": source, "elapsedSeconds": elapsedSeconds, "trackId": trackId,
            "framesWritten": framesWritten, "framesDropped": framesDropped,
            "firstPtsHostNs": firstPtsHostNs, "lastPtsHostNs": lastPtsHostNs,
            "file": file, "pauseIndex": pauseIndex, "startHostNs": startHostNs,
            "endHostNs": endHostNs, "endedAtHostNs": endedAtHostNs,
            "manifestPath": manifestPath, "trackIds": trackIds, "status": status,
            "reason": reason
        ]
        for (key, value) in optional {
            if let value { fields[key] = value }
        }
        let data = try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0a]))
        sequence += 1
    }
}

private struct DryRunPlan {
    let sessionId: String
    let codec: String
    let fps: Int
    let durationSeconds: Int
    let out: String
    let displays: [String]
    let cameras: [String]
    let microphones: [String]
    let systemAudio: String
    let pauses: [(start: Int, end: Int)]

    var trackIds: [String] {
        displays.map { "disp-\($0)" } + cameras.map { "cam-\($0)" }
            + microphones.map { "mic-\($0)" } + ["systemAudio"]
    }
}

private func makePlan(_ args: Arguments) throws -> DryRunPlan {
    let duration = Int(args.option("duration") ?? "") ?? 0
    guard duration > 0 else { throw CLIError.invalidValue("--duration must be a positive integer") }
    let codec = args.option("codec") ?? "h264"
    guard ["h264", "hevc"].contains(codec) else { throw CLIError.invalidValue("--codec must be h264 or hevc") }
    let fps = Int(args.option("fps") ?? "") ?? 30
    guard [30, 60].contains(fps) else { throw CLIError.invalidValue("--fps must be 30 or 60") }
    let systemAudio = args.option("system-audio") ?? "sck"
    guard ["sck", "tap"].contains(systemAudio) else { throw CLIError.invalidValue("--system-audio must be sck or tap") }
    guard let out = args.option("out") else { throw CLIError.invalidValue("--out is required") }
    guard args.option("display") == "all" else { throw CLIError.invalidValue("--display must be all") }
    let cameras = (args.option("camera") ?? "").split(separator: ",").map(String.init).filter { !$0.isEmpty }
    guard cameras.count == 2 else { throw CLIError.invalidValue("--camera needs exactly two ids") }
    guard let mic = args.option("mic"), !mic.isEmpty else { throw CLIError.invalidValue("--mic is required") }

    let pauseText = args.option("pause-at")
    var pauses: [(start: Int, end: Int)] = []
    if let pauseText {
        let parts = pauseText.split(separator: ":").map(String.init)
        guard parts.count == 2, let start = Int(parts[0]), let end = Int(parts[1]), start < end else {
            throw CLIError.invalidValue("--pause-at must be <start>:<end> with start < end")
        }
        pauses.append((start, end))
    }

    return DryRunPlan(
        sessionId: "dry-run-\(duration)-\(codec)-\(fps)",
        codec: codec,
        fps: fps,
        durationSeconds: duration,
        out: out,
        displays: ["display-1", "display-2"],
        cameras: cameras,
        microphones: [mic],
        systemAudio: systemAudio,
        pauses: pauses
    )
}

private func writeAtomically(_ data: Data, to url: URL) throws {
    let temporary = url.deletingLastPathComponent()
        .appendingPathComponent(".\(url.lastPathComponent).\(ProcessInfo.processInfo.processIdentifier).tmp")
    try data.write(to: temporary, options: .atomic)
    if FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.removeItem(at: url)
    }
    try FileManager.default.moveItem(at: temporary, to: url)
}

private func runDryRun(_ plan: DryRunPlan, outputDirectory: String) throws {
    var writer = EventWriter()
    let anchor = try hostNsFromSeconds(0)
    let ended = try hostNsFromSeconds(Double(plan.durationSeconds))
    let tracks = plan.trackIds

    try writer.emit(
        event: "session.start", sessionId: plan.sessionId, engine: "native",
        clockDomain: "host", anchorHostNs: serializeHostNs(anchor), mode: "dry-run",
        codec: plan.codec, fps: plan.fps, durationSeconds: plan.durationSeconds, out: outputDirectory
    )
    try writer.emit(
        event: "devices", displays: plan.displays, cameras: plan.cameras,
        microphones: plan.microphones, systemAudio: plan.systemAudio, source: "dry-run"
    )
    for (index, pause) in plan.pauses.enumerated() {
        try writer.emit(
            event: "pauses", pauseIndex: index,
            startHostNs: serializeHostNs(try hostNsFromSeconds(Double(pause.start))),
            endHostNs: serializeHostNs(try hostNsFromSeconds(Double(pause.end)))
        )
    }
    for second in 0..<plan.durationSeconds {
        try writer.emit(
            event: "track.first_pts", trackId: tracks.first ?? "display-1",
            firstPtsHostNs: serializeHostNs(anchor)
        )
        try writer.emit(
            event: "stats", elapsedSeconds: second, trackId: "all",
            framesWritten: (second + 1) * plan.fps * tracks.count, framesDropped: 0
        )
    }
    for track in tracks {
        try writer.emit(
            event: "track.finalized", trackId: track,
            framesWritten: plan.durationSeconds * plan.fps, framesDropped: 0,
            firstPtsHostNs: serializeHostNs(anchor), lastPtsHostNs: serializeHostNs(ended),
            file: "\(track).mov", status: "finalized"
        )
    }
    let manifestPath = "\(outputDirectory)/capture-session.json"
    try writer.emit(
        event: "session.finalized", sessionId: plan.sessionId,
        endedAtHostNs: serializeHostNs(ended), manifestPath: manifestPath,
        trackIds: tracks, status: "finalized"
    )

    let manifest: [String: Any] = [
        "manifestVersion": 1,
        "sessionId": plan.sessionId,
        "engine": "native",
        "clockDomain": "host",
        "anchorHostNs": serializeHostNs(anchor),
        "pauses": plan.pauses.map { [
            "startHostNs": serializeHostNs((try? hostNsFromSeconds(Double($0.start))) ?? 0),
            "endHostNs": serializeHostNs((try? hostNsFromSeconds(Double($0.end))) ?? 0)
        ] },
        "tracks": tracks.map { [
            "trackId": $0, "kind": "display", "deviceId": $0,
            "file": "\($0).mov", "codec": plan.codec,
            "width": NSNull(), "height": NSNull(),
            "fps": plan.fps, "sampleRate": NSNull(), "channels": NSNull(),
            "firstPtsHostNs": serializeHostNs(anchor), "lastPtsHostNs": serializeHostNs(ended),
            "framesWritten": plan.durationSeconds * plan.fps, "framesDropped": 0,
            "segments": [[
                "file": "\($0).mov",
                "firstPtsHostNs": serializeHostNs(anchor)
            ]],
            "status": "finalized"
        ] },
        "status": "finalized",
        "endedAtHostNs": serializeHostNs(ended),
        "dryRun": true
    ]
    let data = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
    try writeAtomically(data, to: URL(fileURLWithPath: manifestPath))
}

private func runRecover(outputDirectory: String) throws {
    let url = URL(fileURLWithPath: outputDirectory).appendingPathComponent("capture-session.json")
    let data = try Data(contentsOf: url)
    let parsed = try JSONSerialization.jsonObject(with: data)
    guard let record = parsed as? [String: Any], let status = record["status"] as? String else {
        throw CLIError.invalidValue("manifest has no status")
    }
    var writer = EventWriter()
    try writer.emit(event: "session.finalized", sessionId: record["sessionId"] as? String ?? "unknown", status: status)
}

do {
    let args = try parseArguments(Array(CommandLine.arguments.dropFirst()))
    if args.command == "list" || args.has("help") {
        FileHandle.standardOutput.write(Data(usage.utf8))
    } else if args.command == "record" {
        let plan = try makePlan(args)
        guard args.has("dry-run") else {
            throw CLIError.usage("Live recording requires the host app's TCC grants and target hardware; this PoC only runs --dry-run here.")
        }
        try runDryRun(plan, outputDirectory: plan.out)
    } else if args.command == "recover" {
        guard let out = args.option("out") else { throw CLIError.invalidValue("--out is required") }
        try runRecover(outputDirectory: out)
    } else {
        throw CLIError.usage(usage)
    }
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}

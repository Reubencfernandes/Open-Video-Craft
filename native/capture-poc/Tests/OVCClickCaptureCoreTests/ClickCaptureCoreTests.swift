import Foundation
import Testing
import OVCCaptureCore
import OVCClickCaptureCore

private let display = DisplayGeometry(
    displayId: "735003648",
    originXPoints: 0,
    originYPoints: 0,
    widthPoints: 1512,
    heightPoints: 982,
    scaleFactor: 2,
    primary: true
)

private func decode(_ line: String) throws -> [String: Any] {
    let data = Data(line.utf8)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw ClickProtocolError.invalidEncoding
    }
    return object
}

@Test func displayMetricsLineCarriesPointBoundsAndSortedKeys() throws {
    var writer = ClickProtocolWriter()
    let line = try writer.displayMetrics(display, atHostNs: 1_234)

    let payload = try decode(line)
    #expect(payload["v"] as? Int == 1)
    #expect(payload["seq"] as? Int == 0)
    #expect(payload["event"] as? String == "display.metrics")
    #expect(payload["tHostNs"] as? String == "1234")
    #expect(payload["displayId"] as? String == "735003648")
    #expect(payload["originXPoints"] as? Double == 0)
    #expect(payload["widthPoints"] as? Double == 1512)
    #expect(payload["heightPoints"] as? Double == 982)
    #expect(payload["scaleFactor"] as? Double == 2)
    #expect(payload["primary"] as? Bool == true)
    #expect(line.hasSuffix("}"))
}

@Test func clickLineKeepsTheHostTimeAsADecimalStringAndSequenceMonotonic() throws {
    var writer = ClickProtocolWriter()
    let first = try writer.inputClick(
        index: 0,
        displayId: display.displayId,
        xPoints: 900.5,
        yPoints: 500.25,
        clickHostNs: 6_900_000_000,
        atHostNs: 6_900_000_100
    )
    let second = try writer.inputClick(
        index: 1,
        displayId: display.displayId,
        xPoints: 10,
        yPoints: 20,
        clickHostNs: 6_950_000_000,
        atHostNs: 6_950_000_100
    )

    let payload = try decode(first)
    #expect(payload["event"] as? String == "input.click")
    #expect(payload["clickIndex"] as? Int == 0)
    #expect(payload["button"] as? String == "left")
    #expect(payload["clickHostNs"] as? String == "6900000000")
    #expect(payload["tHostNs"] as? String == "6900000100")
    #expect(payload["xPoints"] as? Double == 900.5)
    #expect(payload["yPoints"] as? Double == 500.25)
    #expect(try decode(second)["seq"] as? Int == 1)
}

@Test func permissionLineNamesTheInputMonitoringCapability() throws {
    var writer = ClickProtocolWriter()
    let granted = try writer.inputPermission(.granted, atHostNs: 0)
    let notDetermined = try writer.inputPermission(.notDetermined, atHostNs: 0)

    #expect(try decode(granted)["capability"] as? String == "input-monitoring")
    #expect(try decode(granted)["status"] as? String == "granted")
    #expect(try decode(notDetermined)["status"] as? String == "not-determined")
}

@Test func gateAuthorizesOnlyWithAGrantedInputMonitoringPermission() {
    #expect(ClickCaptureGate.authorize(using: FakePermission(granted: true), requestIfNeeded: false) == .authorized)
    #expect(ClickCaptureGate.authorize(using: FakePermission(granted: false), requestIfNeeded: false) == .denied)
    #expect(ClickCaptureGate.authorize(using: FakePermission(granted: false, grantsOnRequest: false), requestIfNeeded: true) == .denied)
    #expect(ClickCaptureGate.authorize(using: FakePermission(granted: false, grantsOnRequest: true), requestIfNeeded: true) == .authorized)
}

@Test func permissionFailureIsExplicitAndNeverSilent() {
    #expect(inputMonitoringFailureMessage.contains("Input Monitoring"))
    #expect(inputMonitoringFailureMessage.contains("No click events were captured"))
    #expect(inputTapFailureMessage.contains("No click events were captured"))
    #expect(inputDisplayFailureMessage.contains("No click events were captured"))
}

@Test func backingScaleComesFromPointAndPixelSizes() {
    #expect(DisplayGeometry.backingScale(widthPoints: 1512, widthPixels: 3024) == 2)
    #expect(DisplayGeometry.backingScale(widthPoints: 1920, widthPixels: 1920) == 1)
    #expect(DisplayGeometry.backingScale(widthPoints: 0, widthPixels: 100) == nil)
    #expect(DisplayGeometry.backingScale(widthPoints: 100, widthPixels: 0) == nil)
}

@Test func displayContainingPrefersTheLowestDisplayIdOnSharedEdges() {
    let second = DisplayGeometry(
        displayId: "735003649",
        originXPoints: 1512,
        originYPoints: 0,
        widthPoints: 1000,
        heightPoints: 800,
        scaleFactor: 2,
        primary: false
    )
    let displays = [second, display]

    #expect(DisplayInventory.displayContaining(xPoints: 900, yPoints: 400, in: displays)?.displayId == display.displayId)
    #expect(DisplayInventory.displayContaining(xPoints: 2000, yPoints: 400, in: displays)?.displayId == second.displayId)
    #expect(DisplayInventory.displayContaining(xPoints: 9000, yPoints: 400, in: displays) == nil)
    #expect(DisplayInventory.displayContaining(xPoints: 1512, yPoints: 10, in: displays)?.displayId == display.displayId)
}

/// Models the real system: the grant persists, so a request that is accepted
/// makes every later preflight succeed.
private final class FakePermission: ClickPermissionChecking {
    private var granted: Bool
    private let grantsOnRequest: Bool

    init(granted: Bool, grantsOnRequest: Bool = false) {
        self.granted = granted
        self.grantsOnRequest = grantsOnRequest
    }

    func preflight() -> Bool {
        granted
    }

    func request() -> Bool {
        if grantsOnRequest {
            granted = true
        }
        return granted
    }
}

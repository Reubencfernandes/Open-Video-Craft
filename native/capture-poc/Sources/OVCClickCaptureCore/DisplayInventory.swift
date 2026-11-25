import CoreGraphics
import Foundation

/// Snapshot of the active displays in the global point coordinate space that
/// `input.click` uses, so the importer never has to guess a display origin.
public enum DisplayInventory {
    /// Every active display, sorted by display id for a deterministic stream.
    public static func active() -> [DisplayGeometry] {
        var capacity: UInt32 = 0
        guard CGGetActiveDisplayList(0, nil, &capacity) == .success, capacity > 0 else {
            return []
        }
        var ids = [CGDirectDisplayID](repeating: 0, count: Int(capacity))
        var count = capacity
        guard CGGetActiveDisplayList(capacity, &ids, &count) == .success else {
            return []
        }

        let mainDisplay = CGMainDisplayID()
        let displays: [DisplayGeometry] = ids.prefix(Int(count)).compactMap { id in
            let bounds = CGDisplayBounds(id)
            guard bounds.width > 0, bounds.height > 0 else {
                return nil
            }
            let scaleFactor = DisplayGeometry.backingScale(
                widthPoints: Double(bounds.width),
                widthPixels: CGDisplayPixelsWide(id)
            ) ?? 1
            return DisplayGeometry(
                displayId: String(id),
                originXPoints: Double(bounds.origin.x),
                originYPoints: Double(bounds.origin.y),
                widthPoints: Double(bounds.width),
                heightPoints: Double(bounds.height),
                scaleFactor: scaleFactor,
                primary: id == mainDisplay
            )
        }
        return displays.sorted { $0.displayId < $1.displayId }
    }

    /// Display containing a global point (points); id order breaks ties, matching
    /// the TypeScript normalizer.
    public static func displayContaining(
        xPoints: Double,
        yPoints: Double,
        in displays: [DisplayGeometry]
    ) -> DisplayGeometry? {
        displays
            .filter { $0.contains(xPoints: xPoints, yPoints: yPoints) }
            .sorted { $0.displayId < $1.displayId }
            .first
    }
}

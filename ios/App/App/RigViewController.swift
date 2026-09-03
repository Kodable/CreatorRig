import UIKit
import Capacitor

/// The shell's root: a plain view controller that hosts Capacitor's bridge controller as a child
/// and owns the system-gesture answers, which CAPBridgeViewController does not let subclasses
/// override. A swipe from the bottom edge needs two swipes to leave the app, so a child dragging
/// near the edge does not fall out of a course; the home indicator stays hidden.
class RigViewController: UIViewController {
    private let bridge = CAPBridgeViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(bridge)
        bridge.view.frame = view.bounds
        bridge.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(bridge.view)
        bridge.didMove(toParent: self)
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var childForScreenEdgesDeferringSystemGestures: UIViewController? { nil }
    override var childForHomeIndicatorAutoHidden: UIViewController? { nil }
}

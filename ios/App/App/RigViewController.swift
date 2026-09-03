import UIKit
import Capacitor

/// The shell's web view controller: a swipe from the bottom edge needs two swipes to leave the
/// app, so a child dragging near the edge does not fall out of a course.
class RigViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var prefersStatusBarHidden: Bool { true }
}

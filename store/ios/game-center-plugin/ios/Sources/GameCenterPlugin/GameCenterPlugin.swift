import Foundation
import Capacitor
import GameKit

/// Game Center for DUCKWISE, as small as it can be: the player is signed in
/// quietly at launch, scores go to a leaderboard, and the leaderboard sheet
/// can be shown. The web game calls it through src/native/bridge.ts:
///   GameCenter.submitScore({ leaderboardId, score })
///   GameCenter.showLeaderboard({ leaderboardId })
/// A player who isn't signed in (or said no) just gets nothing: no errors,
/// no prompts during play.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        // Sign in at launch, as Apple recommends. Game Center shows its own
        // "Welcome back" banner; only a player who was never signed in gets
        // its sign-in sheet, once.
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
                guard let viewController = viewController else { return }
                self?.bridge?.viewController?.present(viewController, animated: true)
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let leaderboardId = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId and score are required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.resolve(["submitted": false])
            return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [leaderboardId]) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve(["submitted": true])
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let leaderboardId = call.getString("leaderboardId") ?? ""
        DispatchQueue.main.async {
            guard GKLocalPlayer.local.isAuthenticated else {
                call.reject("Not signed in to Game Center")
                return
            }
            let sheet = GKGameCenterViewController(leaderboardID: leaderboardId, playerScope: .global, timeScope: .allTime)
            sheet.gameCenterDelegate = self
            self.bridge?.viewController?.present(sheet, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}

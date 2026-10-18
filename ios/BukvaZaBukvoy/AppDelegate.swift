import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Игровая сессия", sessionRole: session.role)
        configuration.sceneClass = UIWindowScene.self
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let game = GameViewController()
        if let url = options.urlContexts.map({ $0.url }).first(where: { GameViewController.challengeCode(from: $0) != nil }) {
            game.openChallenge(url)
        }
        window.rootViewController = game
        window.makeKeyAndVisible()
        self.window = window
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let game = window?.rootViewController as? GameViewController,
              let url = URLContexts.map({ $0.url }).first(where: { GameViewController.challengeCode(from: $0) != nil }) else { return }
        game.openChallenge(url)
    }
}

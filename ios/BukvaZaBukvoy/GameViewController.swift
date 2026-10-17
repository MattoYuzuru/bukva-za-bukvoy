import UIKit
import WebKit
import os

/// Самостоятельный контейнер. Игра и её правила остаются общими с Android и серверной поставкой.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let background = UIColor(red: 245 / 255, green: 248 / 255, blue: 242 / 255, alpha: 1)
    private let green = UIColor(red: 33 / 255, green: 160 / 255, blue: 56 / 255, alpha: 1)
    private let logger = Logger(subsystem: "ru.bukvazabukvoy.game", category: "Bridge")
    private let events: Set<String> = ["CLOSE_EVENT", "FINISH_EVENT", "COMPLETED_EVENT", "VIBRATION_EVENT", "SHARING_EVENT"]
    private var webView: WKWebView?
    private var entryURL: URL?
    private var completed = false
    private var lastShare: TimeInterval = -.infinity
    private var generation = 0

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .light
        view.backgroundColor = background
        openGame()
    }

    private func openGame() {
        generation += 1
        let currentGeneration = generation
        completed = false
        lastShare = -.infinity
        view.subviews.forEach { $0.removeFromSuperview() }
        guard let folder = Bundle.main.resourceURL?.appendingPathComponent("WWW", isDirectory: true) else {
            showClosed(message: "Не получилось открыть игру. Попробуй ещё раз.")
            return
        }
        let entry = folder.appendingPathComponent("index.html").standardizedFileURL
        guard FileManager.default.fileExists(atPath: entry.path) else {
            showClosed(message: "Файлы игры не найдены. Проверь сборку приложения.")
            return
        }
        entryURL = entry
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        let bridge = """
        (function () {
          'use strict';
          window.addEventListener('message', function (event) {
            if (event.source !== window || !event.data || typeof event.data !== 'object') return;
            if (['CLOSE_EVENT','FINISH_EVENT','COMPLETED_EVENT','VIBRATION_EVENT','SHARING_EVENT'].indexOf(event.data.type) < 0) return;
            try { window.webkit.messageHandlers.bukvaBridge.postMessage(JSON.stringify(event.data)); } catch (_) {}
          });
        })();
        """
        configuration.userContentController.add(WeakBridge(owner: self), name: "bukvaBridge")
        configuration.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        self.webView = webView
        // Второй барьер после CSP: ни один HTTP(S)/WebSocket ресурс не покидает приложение.
        let rules = """
        [{"trigger":{"url-filter":"^[Hh][Tt][Tt][Pp][Ss]?://"},"action":{"type":"block"}},
         {"trigger":{"url-filter":"^[Ww][Ss][Ss]?://"},"action":{"type":"block"}}]
        """
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "BukvaOfflineOnly-v1", encodedContentRuleList: rules) { [weak self, weak webView] list, error in
            guard let self = self, let webView = webView, self.webView === webView,
                  self.generation == currentGeneration else { return }
            guard let list = list, error == nil else {
                self.showClosed(message: "Не получилось подготовить игру. Попробуй ещё раз.")
                return
            }
            webView.configuration.userContentController.add(list)
            webView.loadFileURL(entry, allowingReadAccessTo: folder)
        }
    }

    private func discardGame() {
        generation += 1
        webView?.stopLoading()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "bukvaBridge")
        webView?.configuration.userContentController.removeAllUserScripts()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView?.removeFromSuperview()
        webView = nil
        entryURL = nil
        completed = false
    }

    private func showClosed(message: String = "Можно вернуться к словам, когда захочется.") {
        discardGame()
        view.subviews.forEach { $0.removeFromSuperview() }
        let title = UILabel()
        title.text = "Буква за буквой"
        title.font = .preferredFont(forTextStyle: .largeTitle)
        title.adjustsFontForContentSizeCategory = true
        title.numberOfLines = 0
        title.textAlignment = .center
        title.textColor = UIColor(red: 30 / 255, green: 63 / 255, blue: 37 / 255, alpha: 1)
        let detail = UILabel()
        detail.text = message
        detail.font = .preferredFont(forTextStyle: .body)
        detail.adjustsFontForContentSizeCategory = true
        detail.numberOfLines = 0
        detail.textAlignment = .center
        let button = UIButton(type: .system)
        var style = UIButton.Configuration.filled()
        style.title = "Начать снова"
        style.baseBackgroundColor = green
        style.baseForegroundColor = .white
        style.cornerStyle = .large
        style.contentInsets = NSDirectionalEdgeInsets(top: 16, leading: 24, bottom: 16, trailing: 24)
        button.configuration = style
        button.addAction(UIAction { [weak self] _ in self?.openGame() }, for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, detail, button])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28)
        ])
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.webView === webView,
              let frameURL = message.frameInfo.request.url?.standardizedFileURL,
              frameURL.isFileURL, frameURL == entryURL,
              let string = message.body as? String, string.utf8.count <= 3 * 1024 * 1024,
              let data = string.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let event = object as? [String: Any], let type = event["type"] as? String,
              events.contains(type) else { return }
        switch type {
        case "CLOSE_EVENT":
            DispatchQueue.main.async { [weak self] in self?.showClosed() }
        case "FINISH_EVENT": logger.info("FINISH_EVENT")
        case "COMPLETED_EVENT":
            if !completed { completed = true; logger.info("COMPLETED_EVENT") }
        case "VIBRATION_EVENT": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "SHARING_EVENT": share(event)
        default: break
        }
    }

    private func share(_ event: [String: Any]) {
        let now = Date.timeIntervalSinceReferenceDate
        guard (now < lastShare || now - lastShare >= 1.5), presentedViewController == nil else { return }
        guard event["text"] == nil || event["text"] is NSNull || event["text"] is String,
              event["image"] == nil || event["image"] is NSNull || event["image"] is String else { return }
        let text = event["text"] as? String ?? ""
        let image = event["image"] as? String ?? ""
        guard text.count <= 500 else { return }
        var items: [Any] = []
        if !text.isEmpty { items.append(text) }
        if !image.isEmpty {
            let prefix = "data:image/png;base64,"
            guard image.hasPrefix(prefix), image.utf8.count <= 2_800_000,
                  let data = Data(base64Encoded: String(image.dropFirst(prefix.count))),
                  data.count >= 33, data.count <= 2 * 1024 * 1024 else { return }
            let bytes = [UInt8](data.prefix(24))
            guard Array(bytes.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10],
                  Array(bytes[8..<16]) == [0, 0, 0, 13, 73, 72, 68, 82] else { return }
            let width = bytes[16..<20].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
            let height = bytes[20..<24].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
            guard width > 0, height > 0, width <= 4096, height <= 4096,
                  width * height <= 4_194_304, let decoded = UIImage(data: data) else { return }
            items.append(decoded)
        }
        guard !items.isEmpty else { return }
        lastShare = now
        let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
        activity.excludedActivityTypes = [.assignToContact, .saveToCameraRoll]
        if let popover = activity.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        present(activity, animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame == true,
              let url = navigationAction.request.url?.standardizedFileURL, url.isFileURL,
              url == entryURL, navigationAction.navigationType == .other else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard self.webView === webView, (error as NSError).code != NSURLErrorCancelled else { return }
        showClosed(message: "Не получилось открыть игру. Попробуй ещё раз.")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard self.webView === webView else { return }
        showClosed(message: "Игра остановилась. Можно начать заново.")
    }
}

private final class WeakBridge: NSObject, WKScriptMessageHandler {
    weak var owner: GameViewController?
    init(owner: GameViewController) { self.owner = owner }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.receive(message)
    }
}

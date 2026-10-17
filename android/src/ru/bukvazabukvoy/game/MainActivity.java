package ru.bukvazabukvoy.game;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

/** Автономный контейнер для проверки, без сетевого разрешения и постоянного прогресса. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://game.bukva.invalid";
    private static final String TAG = "BukvaContainer";
    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private static final String CSP = "default-src 'self'; script-src 'self'; "
        + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
        + "font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
    private WebView webView;
    private long lastShareAt;
    private boolean completed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xfff5f7f4);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::dispatchBackToGame);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets padding = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        try {
            getAssets().open("index.html").close();
            webView = new WebView(this);
            webView.setBackgroundColor(0xfff5f7f4);
            webView.setContentDescription("Буква за буквой, игра со словами");
            root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setBlockNetworkLoads(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setMediaPlaybackRequiresUserGesture(true);
            settings.setSafeBrowsingEnabled(true);
            CookieManager.getInstance().setAcceptCookie(false);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
            WebStorage.getInstance().deleteAllData();
            webView.clearCache(true);
            webView.setWebChromeClient(new WebChromeClient());
            webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, size) -> {});
            webView.addJavascriptInterface(new NativeBridge(), "BukvaNative");
            webView.setWebViewClient(new LocalContentClient());
            clearOldShares();
            webView.loadUrl(ORIGIN + "/index.html");
        } catch (IOException | RuntimeException exception) {
            Log.e(TAG, "Не удалось открыть встроенную игру", exception);
            TextView error = new TextView(this);
            error.setText("Не получилось открыть игру. Попробуйте закрыть приложение и открыть его снова.");
            error.setTextSize(20);
            error.setPadding(32, 48, 32, 32);
            root.removeAllViews();
            root.addView(error);
        }
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && "game.bukva.invalid".equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null;
    }

    private final class LocalContentClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Самостоятельная навигация внутри игры не требуется.
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            // Созданная canvas карточка показывается как встроенный PNG, без сети.
            if (!request.isForMainFrame() && "data".equals(uri.getScheme())
                && uri.toString().startsWith("data:image/png;base64,")
                && uri.toString().length() <= 2_800_000) return null;
            if (!local(uri) || !"GET".equals(request.getMethod())) return response(403, "text/plain", new byte[0]);
            String path = uri.getPath();
            if (path == null || path.contains("..") || path.contains("\\") || path.indexOf('\0') >= 0) {
                return response(403, "text/plain", new byte[0]);
            }
            if ("/__native/bridge.js".equals(path)) {
                String source = "(function(){'use strict';window.addEventListener('message',function(e){"
                    + "if(e.source!==window||e.origin!==location.origin||!e.data||typeof e.data!=='object')return;"
                    + "if(['CLOSE_EVENT','FINISH_EVENT','COMPLETED_EVENT','VIBRATION_EVENT','SHARING_EVENT']"
                    + ".indexOf(e.data.type)<0)return;try{BukvaNative.postMessage(JSON.stringify(e.data));}catch(_){}});})();";
                return response(200, "text/javascript", source.getBytes(StandardCharsets.UTF_8));
            }
            String asset = path.equals("/") ? "index.html" : path.substring(1);
            try (InputStream input = getAssets().open(asset)) {
                byte[] content = readAll(input);
                if ("index.html".equals(asset)) {
                    String html = new String(content, StandardCharsets.UTF_8);
                    String script = "<script src=\"/__native/bridge.js\"></script>";
                    int headStart = html.toLowerCase(java.util.Locale.ROOT).indexOf("<head");
                    int headEnd = headStart < 0 ? -1 : html.indexOf('>', headStart);
                    if (headEnd < 0) return response(500, "text/plain", new byte[0]);
                    html = html.substring(0, headEnd + 1) + script + html.substring(headEnd + 1);
                    content = html.getBytes(StandardCharsets.UTF_8);
                }
                return response(200, mime(asset), content);
            } catch (IOException exception) {
                return response(404, "text/plain", new byte[0]);
            }
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        return output.toByteArray();
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private static WebResourceResponse response(int status, String mimeType, byte[] content) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Security-Policy", CSP);
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(mimeType, "UTF-8", status,
            status == 200 ? "OK" : status == 404 ? "Not Found" : "Blocked", headers,
            new ByteArrayInputStream(content));
    }

    private final class NativeBridge {
        @JavascriptInterface public void postMessage(String message) {
            if (message == null || message.length() > 3 * 1024 * 1024) return;
            try {
                JSONObject event = new JSONObject(message);
                String type = event.optString("type", "");
                switch (type) {
                    case "CLOSE_EVENT": runOnUiThread(() -> finish()); break;
                    case "FINISH_EVENT": Log.i(TAG, "FINISH_EVENT"); break;
                    case "COMPLETED_EVENT":
                        synchronized (MainActivity.this) {
                            if (!completed) { completed = true; Log.i(TAG, "COMPLETED_EVENT"); }
                        }
                        break;
                    case "VIBRATION_EVENT": runOnUiThread(() -> {
                        if (webView != null) webView.performHapticFeedback(Build.VERSION.SDK_INT >= 30
                            ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY);
                    }); break;
                    case "SHARING_EVENT": share(event); break;
                    default: break;
                }
            } catch (JSONException exception) {
                Log.w(TAG, "Отклонено некорректное событие");
            }
        }
    }

    private void share(JSONObject event) {
        long now = android.os.SystemClock.elapsedRealtime();
        synchronized (this) {
            if (now - lastShareAt < 1500) return;
            lastShareAt = now;
        }
        String image = event.optString("image", "");
        String text = event.optString("text", "");
        if (text.length() > 500) return;
        if (image.isEmpty()) {
            if (!text.isEmpty()) launchShare(text, null);
            return;
        }
        if (!image.startsWith("data:image/png;base64,") || image.length() > 2_800_000) return;
        try {
            byte[] bytes = Base64.decode(image.substring(22), Base64.NO_WRAP);
            if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES
                || bytes[0] != (byte) 137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71
                || bytes[4] != 13 || bytes[5] != 10 || bytes[6] != 26 || bytes[7] != 10) return;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (options.outWidth < 1 || options.outHeight < 1 || options.outWidth > 4096
                || options.outHeight > 4096 || (long) options.outWidth * options.outHeight > 4_194_304) return;
            File folder = new File(getCacheDir(), "shared-images");
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Нет каталога для картинки");
            File file = new File(folder, UUID.randomUUID().toString() + ".png");
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
            Uri uri = Uri.parse("content://ru.bukvazabukvoy.game.share/" + file.getName());
            launchShare(text, uri);
        } catch (IOException | IllegalArgumentException exception) {
            Log.w(TAG, "Картинка для отправки отклонена");
        }
    }

    private void launchShare(String text, Uri uri) {
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(uri == null ? "text/plain" : "image/png");
            intent.putExtra(Intent.EXTRA_TEXT, text);
            if (uri != null) {
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.setClipData(ClipData.newUri(getContentResolver(), "Результат игры", uri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            try { startActivity(Intent.createChooser(intent, "Поделиться результатом")); }
            catch (ActivityNotFoundException exception) {
                Toast.makeText(this, "На устройстве пока нет приложения для отправки", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void clearOldShares() {
        File[] files = new File(getCacheDir(), "shared-images").listFiles();
        if (files != null) for (File file : files) {
            if (System.currentTimeMillis() - file.lastModified() > 24 * 60 * 60 * 1000L) file.delete();
        }
    }

    private void dispatchBackToGame() {
        if (webView == null) { finish(); return; }
        webView.evaluateJavascript("window.dispatchEvent(new Event('bukva-back'))", null);
    }

    @Override public void onBackPressed() {
        // Android 8–12: тот же сценарий выхода и подтверждения, что у кнопки игры.
        dispatchBackToGame();
    }

    @Override protected void onPause() { if (webView != null) webView.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("BukvaNative");
            webView.clearHistory();
            webView.clearCache(true);
            webView.destroy();
            webView = null;
        }
        WebStorage.getInstance().deleteAllData();
        super.onDestroy();
    }
}

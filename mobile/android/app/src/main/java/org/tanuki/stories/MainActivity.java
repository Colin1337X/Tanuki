package org.tanuki.stories;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;
import android.text.InputType;

public final class MainActivity extends Activity {
    private WebView web;
    private String server;
    private LinearLayout layout;
    private TextView status;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        WebView.setWebContentsDebuggingEnabled(false);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::navigateBack);
        showSetup();
    }
    private void showSetup() {
        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
        server = null;
        layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32,48,32,24);
        layout.setBackgroundColor(Color.rgb(249,248,240));
        layout.setOnApplyWindowInsetsListener((v,insets)->{ v.setPadding(32,insets.getSystemWindowInsetTop()+32,32,insets.getSystemWindowInsetBottom()+24); return insets; });
        TextView title = new TextView(this); title.setText("Tanuki Stories\nYour stories. Your classroom."); title.setTextSize(28); title.setTypeface(android.graphics.Typeface.createFromAsset(getAssets(),"Jua-Regular.ttf")); layout.addView(title);
        TextView label = new TextView(this); label.setText("Your Tanuki Server HTTPS address"); layout.addView(label);
        EditText address = new EditText(this); address.setSingleLine(); address.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI); address.setHint("https://stories.example.org"); address.setContentDescription("Tanuki Server HTTPS address"); address.setText(getPreferences(0).getString("server","")); layout.addView(address);
        status = new TextView(this); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); layout.addView(status);
        Button connect = new Button(this); connect.setText("Open my workspace"); layout.addView(connect);
        connect.setOnClickListener(v->{ String approved = OriginPolicy.server(address.getText().toString().trim()); if(approved==null){status.setText("Enter an HTTPS origin without a path or credentials.");return;} connect.setEnabled(false);
            // Clear prior account/server cookies before opening another workspace.
            CookieManager.getInstance().removeAllCookies(ignored->{WebStorage.getInstance().deleteAllData();getPreferences(0).edit().putString("server",approved).apply();openWorkspace(approved);});
        });
        setContentView(layout);
    }
    private void openWorkspace(String approved) {
        server=approved;layout.removeAllViews();Button change=new Button(this);change.setText("Change server / close workspace");change.setOnClickListener(v->showSetup());layout.addView(change);
        status=new TextView(this);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);layout.addView(status);
        web=new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);settings.setSupportMultipleWindows(false);settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){boolean deny=!OriginPolicy.allows(server,request.getUrl().toString());if(deny)status.setText("Navigation outside your approved server was blocked.");return deny;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){if(!OriginPolicy.allows(server,request.getUrl().toString()))return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0]));return null;}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();status.setText("The server TLS certificate could not be verified.");}
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){if(req.isForMainFrame())status.setText("Unable to connect. Check your server and network, then reopen the workspace.");}
        });
        // No native JavaScript bridge, file picker, camera, microphone or external intent handler.
        web.loadUrl(server+"/");
    }
    private void navigateBack(){if(web!=null&&web.canGoBack())web.goBack();else if(web!=null)showSetup();else finish();}
    @Override protected void onDestroy(){if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();}
}

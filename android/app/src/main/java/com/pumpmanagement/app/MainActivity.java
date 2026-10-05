package com.pumpmanagement.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BiometricLockPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onBackPressed() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            super.onBackPressed();
            return;
        }
        getBridge().getWebView().evaluateJavascript(
                "(function(){var e=new CustomEvent('nativebackbutton',{cancelable:true});return !window.dispatchEvent(e);})()",
                handled -> {
                    if ("false".equals(handled)) super.onBackPressed();
                }
        );
    }
}
